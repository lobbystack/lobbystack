import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordAffiliateCommissionInTransaction: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./affiliates", () => ({ recordAffiliateCommissionInTransaction: mocks.recordAffiliateCommissionInTransaction }));
vi.mock("./productEvents", () => ({ recordProductEventInTransaction: vi.fn() }));

import { billingAccounts, billingTransactions } from "@lobbystack/db";

import { createBillingCheckoutRequestInTransaction, endManagedPlanInTransaction, orderRefundedCents, reconcileBillingProviderEvent, setManagedPlanInTransaction } from "./billing";
import { recordProductEventInTransaction } from "./productEvents";

type Write = { table: unknown; values?: Record<string, unknown>; set?: Record<string, unknown> };

/** Reconciles one stored event and returns what the transaction wrote, by table. */
async function reconcile(eventType: string, payload: Record<string, unknown>, existing?: Record<string, unknown>) {
  const writes: Write[] = [];
  // Selects in order: the provider event, then the existing account, if any.
  const selects: unknown[][] = [[{ id: "evt_1", providerEventId: "polar_1", eventType, status: "pending", payload, createdAt: new Date() }], existing ? [existing] : []];
  const chain = (resolved: unknown[], write?: Write): unknown => new Proxy(function () {}, {
    get(_target, property) {
      if (property === "then") return (resolve: (value: unknown) => unknown) => resolve(resolved);
      return (argument: Record<string, unknown>) => {
        if (write && property === "values") write.values = argument;
        if (write && property === "onConflictDoUpdate") write.set = argument.set as Record<string, unknown>;
        return chain(resolved, write);
      };
    },
  });
  const tx = {
    execute: () => chain([]),
    select: () => chain(selects.shift() ?? []),
    insert: (table: unknown) => { const write: Write = { table }; writes.push(write); return chain([{ id: "txn_1" }], write); },
    update: () => chain([]),
  };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _input: unknown, run: (tx: unknown) => Promise<unknown>) => await run(tx));
  await reconcileBillingProviderEvent({ db: {} as never }, { businessId: "biz_1", providerEventId: "evt_1" });
  return { account: writes.find(write => write.table === billingAccounts), transaction: writes.find(write => write.table === billingTransactions) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordAffiliateCommissionInTransaction.mockResolvedValue(null);
});

describe("orderRefundedCents", () => {
  it("adds the refunded tax to the refunded amount", () => {
    expect(orderRefundedCents({ refunded_amount: 48_000, refunded_tax_amount: 4_800 }, {})).toBe(52_800);
  });

  it("prefers the nested order and falls back to the payload", () => {
    expect(orderRefundedCents({ refundedAmount: 100 }, { refundedAmount: 999, refunded_tax_amount: 10 })).toBe(110);
  });

  it("is zero when nothing was refunded", () => {
    expect(orderRefundedCents({}, {})).toBe(0);
  });
});

describe("reconciling a Polar order", () => {
  // $960 plus $96 tax, as the webhook route stores an order with no nested subscription.
  const order = { billingKey: "business:biz_1", id: "order_1", total_amount: 105_600, currency: "usd", created_at: "2026-09-01T00:00:00.000Z" };

  it("stores what a partial refund returned and pays commission on the rest", async () => {
    const { transaction } = await reconcile("order.refunded", { ...order, status: "partially_refunded", refunded_amount: 48_000, refunded_tax_amount: 4_800 });

    expect(transaction?.values).toMatchObject({ kind: "order", status: "partially_refunded", amountCents: 105_600, refundedAmountCents: 52_800 });
    expect(mocks.recordAffiliateCommissionInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "partially_refunded", amountCents: 52_800 }));
  });

  it("stores the whole amount for a full refund", async () => {
    const { transaction } = await reconcile("order.refunded", { ...order, status: "refunded", refunded_amount: 96_000, refunded_tax_amount: 9_600 });

    expect(transaction?.values).toMatchObject({ status: "refunded", amountCents: 105_600, refundedAmountCents: 105_600 });
  });

  it("leaves the subscription state alone when the order has no subscription", async () => {
    const { account } = await reconcile("order.paid", { ...order, status: "paid" });

    expect(account?.values).not.toHaveProperty("subscriptionState");
    expect(account?.set).not.toHaveProperty("subscriptionState");
  });

  it("still takes the state from a subscription event's status", async () => {
    const { account } = await reconcile("subscription.updated", { billingKey: "business:biz_1", status: "past_due" });

    expect(account?.values).toMatchObject({ subscriptionState: "past_due" });
  });
});

describe("reconciling Polar events for a managed plan", () => {
  const managed = { billingKey: "business:biz_1", customerId: null, subscriptionId: null, plan: "enterprise", subscriptionState: "active", billingInterval: null, source: "managed" };

  it("keeps the plan the operator set when Polar reports an older subscription ending", async () => {
    const { account } = await reconcile("subscription.canceled", { billingKey: "business:biz_1", subscriptionId: "sub_old", plan: "starter", status: "canceled" }, managed);

    for (const write of [account?.values, account?.set]) {
      expect(write).not.toHaveProperty("plan");
      expect(write).not.toHaveProperty("subscriptionState");
      expect(write).not.toHaveProperty("source");
    }
  });

  it("lets a live Polar subscription take over, so Polar bills the business from then on", async () => {
    const { account } = await reconcile("subscription.active", { billingKey: "business:biz_1", subscriptionId: "sub_new", plan: "pro", status: "active", billingInterval: "monthly" }, managed);

    expect(account?.set).toMatchObject({ source: "polar", plan: "pro", subscriptionState: "active", billingInterval: "monthly", subscriptionId: "sub_new" });
  });

  it("leaves accounts that Polar already bills as they were", async () => {
    const { account } = await reconcile("subscription.active", { billingKey: "business:biz_1", plan: "pro", status: "active" }, { ...managed, plan: "starter", source: "polar" });

    expect(account?.set).toMatchObject({ plan: "pro", subscriptionState: "active" });
    expect(account?.set).not.toHaveProperty("source");
  });
});

describe("Polar taking over a managed plan", () => {
  const managed = { billingKey: "business:biz_1", customerId: null, subscriptionId: null, plan: "enterprise", subscriptionState: "active", billingInterval: null, source: "managed" };

  it("keeps the managed plan for a live subscription to a product this deployment doesn't map to a plan", async () => {
    const { account } = await reconcile("subscription.active", { billingKey: "business:biz_1", subscriptionId: "sub_other", status: "active" }, managed);

    expect(account?.set).not.toHaveProperty("plan");
    expect(account?.set).not.toHaveProperty("subscriptionState");
    expect(account?.set).not.toHaveProperty("source");
  });

  it("takes over from an order that carries a live Pro subscription, and records the subscription's start", async () => {
    const { account } = await reconcile("order.paid", { billingKey: "business:biz_1", id: "order_1", total_amount: 4_900, currency: "usd", created_at: "2026-10-01T00:00:00.000Z", status: "paid", plan: "pro", subscriptionState: "active", billingInterval: "monthly" }, managed);

    expect(account?.set).toMatchObject({ source: "polar", plan: "pro", subscriptionState: "active" });
    expect(recordProductEventInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "billing.subscription_started", properties: expect.objectContaining({ plan: "pro", previousPlan: "enterprise" }) }));
  });

  it("hands an ended managed plan's account to Polar when Polar next sets its plan", async () => {
    const { account } = await reconcile("subscription.active", { billingKey: "business:biz_1", plan: "starter", status: "active" }, { ...managed, subscriptionState: "canceled" });

    expect(account?.set).toMatchObject({ source: "polar", plan: "starter", subscriptionState: "active" });
  });
});

describe("managed plan writes", () => {
  /** A transaction whose selects return these rows and that records inserts and updates. */
  function transaction(selected: Record<string, unknown>[]) {
    const writes: Array<{ kind: "insert" | "update"; values?: Record<string, unknown>; set?: Record<string, unknown> }> = [];
    const chain = (resolved: unknown[], write?: (typeof writes)[number]): unknown => new Proxy(function () {}, {
      get(_target, property) {
        if (property === "then") return (resolve: (value: unknown) => unknown) => resolve(resolved);
        return (argument: Record<string, unknown>) => {
          if (write && property === "values") write.values = argument;
          if (write && property === "set") write.set = argument;
          if (write && property === "onConflictDoUpdate") write.set = argument.set as Record<string, unknown>;
          return chain(resolved, write);
        };
      },
    });
    const tx = {
      execute: () => chain([]),
      select: () => chain(selected),
      insert: () => { const write = { kind: "insert" as const }; writes.push(write); return chain([{ id: "row_1" }], write); },
      update: () => { const write = { kind: "update" as const }; writes.push(write); return chain([{ id: "acct_1" }], write); },
    };
    return { tx: tx as never, writes };
  }

  it("clears a spending cap left from an earlier plan, which would leave calls nothing to reserve", async () => {
    const { tx, writes } = transaction([{ source: "polar", plan: "starter", subscriptionState: "canceled", overageSpendingCapCents: 500 }]);
    expect(await setManagedPlanInTransaction(tx, { businessId: "biz_1" })).toBe("set");
    expect(writes[0]?.set).toMatchObject({ source: "managed", plan: "enterprise", subscriptionState: "active", overageSpendingCapCents: null });
  });

  it("refuses a business with any live Polar subscription, even one for an unmapped product", async () => {
    const { tx, writes } = transaction([{ source: "polar", plan: null, subscriptionState: "active", overageSpendingCapCents: null }]);
    expect(await setManagedPlanInTransaction(tx, { businessId: "biz_1" })).toBe("paid_through_polar");
    expect(writes).toEqual([]);
  });

  it("keeps the managed source and plan when the plan ends, so the finance export shows the period", async () => {
    const { tx, writes } = transaction([]);
    expect(await endManagedPlanInTransaction(tx, { businessId: "biz_1" })).toBe(true);
    expect(writes[0]?.set).toMatchObject({ subscriptionState: "canceled", currentPeriodEnd: expect.any(Date) });
    expect(writes[0]?.set).not.toHaveProperty("source");
    expect(writes[0]?.set).not.toHaveProperty("plan");
  });

  it("sells no Polar plan to a managed business, from the dashboard or the API", async () => {
    const { tx, writes } = transaction([{ source: "managed", subscriptionState: "active" }]);
    await expect(createBillingCheckoutRequestInTransaction(tx, { userId: "user_1", businessId: "biz_1", target: "pro", billingInterval: "monthly" })).rejects.toMatchObject({ status: 409 });
    expect(writes).toEqual([]);
  });
});
