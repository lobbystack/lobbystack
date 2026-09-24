import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent }));

import { detectSubscriptionStart, reconcileBillingProviderEvent } from "./billing";

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
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

describe("subscription start telemetry", () => {
  it("records billing.subscription_started after the reconciling transaction commits", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({
      reconciled: true,
      started: { plan: "starter", billingInterval: "monthly", previousPlan: "free_cloud" },
    });

    await expect(reconcileBillingProviderEvent(context, { businessId: "biz_1", providerEventId: "evt_1" })).resolves.toBe(true);

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "billing.subscription_started",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      actorType: "worker",
      properties: { plan: "starter", billingInterval: "monthly", previousPlan: "free_cloud" },
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("records nothing when the event reconciles without starting a subscription", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ reconciled: true, started: null });

    await expect(reconcileBillingProviderEvent(context, { businessId: "biz_1", providerEventId: "evt_2" })).resolves.toBe(true);

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("keeps the reconciled payment when telemetry fails", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({
      reconciled: true,
      started: { plan: "pro", billingInterval: "annual", previousPlan: null },
    });
    mocks.recordProductEvent.mockRejectedValue(new Error("PostHog unavailable"));

    await expect(reconcileBillingProviderEvent(context, { businessId: "biz_1", providerEventId: "evt_3" })).resolves.toBe(true);
  });
});
