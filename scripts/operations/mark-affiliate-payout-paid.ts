import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { affiliatePayoutItems, createDatabaseClient, withDispatcherTransaction } from "@lobbystack/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { markAffiliatePayoutItemPaid } from "../../packages/domain/src/server/affiliates";

/**
 * Records that one affiliate payout item was paid, after the money went out
 * (for example on PayPal). Its commissions become paid and the affiliate's
 * balance moves from pending to paid. Only a "ready" item can be marked, and
 * only while its amount still equals --amount-cents, the amount you sent.
 * Dry-run is the default; pass --apply to change anything.
 */

const optionsSchema = z.object({
  payoutItemId: z.guid(),
  amountCents: z.coerce.number().int().positive(),
  reference: z.string().trim().min(1).max(200),
  apply: z.boolean().default(false),
});

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { "payout-item-id": { type: "string" }, "amount-cents": { type: "string" }, reference: { type: "string" }, apply: { type: "boolean" } } });
  const options = optionsSchema.parse({ payoutItemId: values["payout-item-id"], amountCents: values["amount-cents"], reference: values.reference, apply: values.apply ?? false });

  const database = createDatabaseClient("lobbystack_dispatcher");
  try {
    const item = await withDispatcherTransaction(database.db, async (tx) =>
      (await tx.select({ status: affiliatePayoutItems.status, amountCents: affiliatePayoutItems.amountCents, currency: affiliatePayoutItems.currency }).from(affiliatePayoutItems).where(eq(affiliatePayoutItems.id, options.payoutItemId)).limit(1))[0]);
    if (!item) throw new Error("No payout item has that id.");
    console.log(JSON.stringify({ payoutItemId: options.payoutItemId, ...item, sentAmountCents: options.amountCents, reference: options.reference, apply: options.apply }));
    if (item.amountCents !== options.amountCents) throw new Error(`The payout item holds ${item.amountCents} cents and you sent ${options.amountCents}, so nothing changed.`);
    if (!options.apply) return;

    const paid = await markAffiliatePayoutItemPaid({ db: database.db }, { payoutItemId: options.payoutItemId, expectedAmountCents: options.amountCents, externalReference: options.reference });
    if (!paid) throw new Error("That payout item is not ready, or its amount changed since this script read it, so nothing changed.");
    console.log(JSON.stringify({ payoutItemId: options.payoutItemId, paid: true }));
  } finally {
    await database.pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
