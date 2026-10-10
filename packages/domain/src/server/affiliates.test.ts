import { expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), withDispatcherTransaction: mocks.transaction }));
import { markAffiliatePayoutItemPaid } from "./affiliates";

it("marks a payout item paid only while it still holds the amount that was sent", async () => {
  let condition: SQL | undefined;
  const tx = { update: () => ({ set: () => ({ where: (where: SQL) => { condition = where; return { returning: async () => [] }; } }) }) };
  mocks.transaction.mockImplementation(async (_db, run) => run(tx));
  await expect(markAffiliatePayoutItemPaid({ db: {} as never }, { payoutItemId: "item", expectedAmountCents: 9_000 })).resolves.toBe(false);
  expect(new PgDialect().sqlToQuery(condition!)).toMatchObject({ sql: '("affiliate_payout_items"."id" = $1 and "affiliate_payout_items"."status" = $2 and "affiliate_payout_items"."amount_cents" = $3)', params: ["item", "ready", 9_000] });
});
