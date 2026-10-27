import { describe, expect, it } from "vitest";

import type { DatabaseTransaction } from "@lobbystack/db";

import { scheduledSubscriptionEndInTransaction } from "./billing";

/** A transaction whose selects return the account's subscription, then that subscription's newest Polar snapshot, if any. */
function newestSnapshot(payload?: Record<string, unknown>, subscriptionId: string | null = "sub_plan"): DatabaseTransaction {
  const chain = (rows: unknown[]): unknown => new Proxy(function () {}, {
    get(_target, property) {
      if (property === "then") return (resolve: (value: unknown) => unknown) => resolve(rows);
      return () => chain(rows);
    },
  });
  const selects: unknown[][] = [[{ subscriptionId }], payload ? [{ payload }] : []];
  return { select: () => chain(selects.shift() ?? []) } as unknown as DatabaseTransaction;
}

describe("scheduledSubscriptionEndInTransaction", () => {
  it("reads when a plan canceled at the end of its period ends", async () => {
    await expect(scheduledSubscriptionEndInTransaction(newestSnapshot({ status: "active", cancel_at_period_end: true, ends_at: "2026-11-12T00:00:00Z", current_period_end: "2026-11-12T00:00:00Z" }), "business")).resolves.toBe("2026-11-12T00:00:00Z");
  });

  it("falls back to the period end when the snapshot names no end", async () => {
    await expect(scheduledSubscriptionEndInTransaction(newestSnapshot({ status: "trialing", cancel_at_period_end: true, ends_at: null, current_period_end: "2026-11-12T00:00:00Z" }), "business")).resolves.toBe("2026-11-12T00:00:00Z");
  });

  it.each([
    ["a renewing plan", { status: "active", cancel_at_period_end: false, current_period_end: "2026-11-12T00:00:00Z" }],
    ["a plan that already ended", { status: "canceled", cancel_at_period_end: true, ends_at: "2026-10-01T00:00:00Z" }],
    ["no Polar snapshot", undefined],
  ])("has no end date for %s", async (_label, payload) => {
    await expect(scheduledSubscriptionEndInTransaction(newestSnapshot(payload), "business")).resolves.toBeNull();
  });

  it("has no end date when the account follows no subscription, whatever the customer's other subscriptions say", async () => {
    await expect(scheduledSubscriptionEndInTransaction(newestSnapshot({ status: "active", cancel_at_period_end: true, ends_at: "2026-11-12T00:00:00Z" }, null), "business")).resolves.toBeNull();
  });
});
