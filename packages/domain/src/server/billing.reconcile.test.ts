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

import { orderRefundedCents, reconcileBillingProviderEvent } from "./billing";

type Write = { table: unknown; values?: Record<string, unknown>; set?: Record<string, unknown> };

/** Reconciles one stored event and returns what the transaction wrote, by table. */
async function reconcile(eventType: string, payload: Record<string, unknown>) {
  const writes: Write[] = [];
  // Selects in order: the provider event, then the existing account (none).
  const selects: unknown[][] = [[{ id: "evt_1", providerEventId: "polar_1", eventType, status: "pending", payload, createdAt: new Date() }], []];
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
