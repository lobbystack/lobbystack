import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createDatabaseClient, phoneNumbers, withBusinessTransaction } from "@lobbystack/db";
import { TwilioProvider } from "@lobbystack/providers/twilio/twilioProvider";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

/**
 * Moves one business's phone number onto GPT-Live.
 *
 * GPT-Live answers numbers that sit on the Twilio SIP trunk named by
 * TWILIO_SIP_TRUNK_SID. Dry-run is the default; pass --apply to change anything.
 */

const optionsSchema = z.object({
  businessId: z.string().uuid(),
  number: z.string().regex(/^\+\d{8,15}$/, "Use E.164, for example +15815020392."),
  apply: z.boolean().default(false),
});

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { "business-id": { type: "string" }, number: { type: "string" }, apply: { type: "boolean" } } });
  const options = optionsSchema.parse({ businessId: values["business-id"], number: values.number, apply: values.apply ?? false });
  const trunkSid = process.env.TWILIO_SIP_TRUNK_SID?.trim();
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!trunkSid || !accountSid || !authToken) throw new Error("TWILIO_SIP_TRUNK_SID, TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.");

  const database = createDatabaseClient("lobbystack_worker");
  try {
    const row = await withBusinessTransaction(database.db, { businessId: options.businessId, actorType: "worker" }, async (tx) =>
      (await tx.select({ id: phoneNumbers.id, providerPhoneId: phoneNumbers.providerPhoneId, voiceWebhookTargetUrl: phoneNumbers.voiceWebhookTargetUrl }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, options.businessId), eq(phoneNumbers.e164, options.number), eq(phoneNumbers.status, "active"))).limit(1))[0]);
    if (!row?.providerPhoneId) throw new Error("That business has no active number matching it.");
    console.log(JSON.stringify({ number: options.number, phoneNumberId: row.id, current: row.voiceWebhookTargetUrl, target: "GPT-Live", apply: options.apply }));
    if (!options.apply) return;

    const twilio = new TwilioProvider({ accountSid, authToken });
    await twilio.addNumberToSipTrunk({ trunkSid, providerPhoneId: row.providerPhoneId });
    await withBusinessTransaction(database.db, { businessId: options.businessId, actorType: "worker" }, async (tx) => {
      await tx.update(phoneNumbers).set({
        voiceWebhookTargetUrl: `sip-trunk:${trunkSid}`,
        voiceWebhookLastSyncedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(phoneNumbers.id, row.id));
    });
    console.log(JSON.stringify({ number: options.number, moved: "GPT-Live" }));
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
