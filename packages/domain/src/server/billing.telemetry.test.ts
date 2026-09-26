import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordProductEventInTransaction: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEventInTransaction: mocks.recordProductEventInTransaction }));

import { detectSubscriptionStart, reconcileBillingProviderEvent } from "./billing";

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEventInTransaction.mockResolvedValue("event_1");
});

describe("detectSubscriptionStart", () => {
  it("reports a start when a free account becomes a live paid plan", () => {
    expect(detectSubscriptionStart(
      { plan: "free_cloud", subscriptionState: null },
      { plan: "starter", subscriptionState: "active", billingInterval: "monthly" },
    )).toEqual({ plan: "starter", billingInterval: "monthly", previousPlan: "free_cloud" });
  });

  it("reports a start for an account that has no billing row yet", () => {
    expect(detectSubscriptionStart(undefined, { plan: "pro", subscriptionState: "trialing", billingInterval: "annual" }))
      .toEqual({ plan: "pro", billingInterval: "annual", previousPlan: null });
  });

  it("stays silent for renewals of an account that already pays", () => {
    expect(detectSubscriptionStart(
      { plan: "starter", subscriptionState: "active" },
      { plan: "starter", subscriptionState: "active", billingInterval: "monthly" },
    )).toBeNull();
  });

  it("stays silent while a paid plan is not live yet", () => {
    expect(detectSubscriptionStart(
      { plan: "free_cloud", subscriptionState: null },
      { plan: "starter", subscriptionState: "incomplete", billingInterval: "monthly" },
    )).toBeNull();
  });

  it("stays silent when a paying account is downgraded to free", () => {
    expect(detectSubscriptionStart(
      { plan: "pro", subscriptionState: "active" },
      { plan: "free_cloud", subscriptionState: "canceled", billingInterval: null },
    )).toBeNull();
  });

  it("stays silent when a past_due account recovers, because it was already paying", () => {
    expect(detectSubscriptionStart(
      { plan: "starter", subscriptionState: "past_due" },
      { plan: "starter", subscriptionState: "active", billingInterval: "monthly" },
    )).toBeNull();
  });
});

/**
 * Drives the reconciling transaction far enough to reach the start it detects.
 * Stubbing the whole billing body would prove nothing about where the event is
 * written, and where it is written is the entire point.
 */
function transactionDouble(order: string[]) {
  const rows: Record<string, unknown>[][] = [
    [{ id: "evt_1", providerEventId: "polar_1", eventType: "subscription.active", status: "pending", payload: { billingKey: "business:biz_1", plan: "starter", status: "active", billingInterval: "monthly" }, createdAt: new Date() }],
  ];
  let selects = 0;
  const chain = (resolved: unknown[]): unknown => new Proxy(function () {} as unknown as Record<string | symbol, unknown>, {
    get(_target, property) {
      if (property === "then") return (resolve: (value: unknown) => unknown) => resolve(resolved);
      return () => chain(resolved);
    },
    apply: () => chain(resolved),
  });
  return {
    execute: () => chain([]),
    select: () => chain(rows[selects++] ?? []),
    insert: () => chain([{ id: "row_1" }]),
    update: () => { order.push("update"); return chain([]); },
  };
}

async function reconcileThroughTransaction(order: string[]) {
  const tx = transactionDouble(order);
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _input: unknown, run: (tx: unknown) => Promise<unknown>) => await run(tx));
  return { tx, result: reconcileBillingProviderEvent(context, { businessId: "biz_1", providerEventId: "evt_1" }) };
}

describe("subscription start telemetry", () => {
  it("writes the start on the reconciling transaction, not a later one", async () => {
    const order: string[] = [];
    mocks.recordProductEventInTransaction.mockImplementation(async () => { order.push("event"); return "event_1"; });
    const { tx, result } = await reconcileThroughTransaction(order);
    await result;

    expect(mocks.recordProductEventInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      name: "billing.subscription_started",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      actorType: "worker",
      properties: { plan: "starter", billingInterval: "monthly", previousPlan: null },
    }));
    // Recorded before the provider event is marked processed, so no commit can
    // retire the webhook while the start it produced is still unwritten.
    expect(order.indexOf("event")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("event")).toBeLessThan(order.lastIndexOf("update"));
  });

  it("fails the reconciliation when the start cannot be written, leaving the webhook to retry", async () => {
    const order: string[] = [];
    mocks.recordProductEventInTransaction.mockRejectedValue(new Error("product_events unavailable"));
    const { result } = await reconcileThroughTransaction(order);

    // Swallowing this would retire the provider event with the start lost, and
    // no later pass detects the same free-to-paid edge twice.
    await expect(result).rejects.toThrow("product_events unavailable");
    expect(order).not.toContain("update");
  });

  it("records nothing when the event reconciles without starting a subscription", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ reconciled: true, started: null });

    await expect(reconcileBillingProviderEvent(context, { businessId: "biz_1", providerEventId: "evt_2" })).resolves.toBe(true);

    expect(mocks.recordProductEventInTransaction).not.toHaveBeenCalled();
  });
});
