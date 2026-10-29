import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createDatabaseClient, phoneNumbers, withBusinessTransaction } from "@lobbystack/db";
import { resolveRefusedCallForward } from "@lobbystack/domain";
import { createTelephony } from "@lobbystack/providers/telephony/registry";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

/**
 * Moves one business's phone number onto GPT-Live.
 *
 * GPT-Live answers numbers that sit on their carrier's SIP path: the Twilio
 * SIP trunk named by TWILIO_SIP_TRUNK_SID, or the Telnyx SIP connection named
 * by TELNYX_SIP_CONNECTION_ID. Dry-run is the default; pass --apply to change
 * anything.
 */

const optionsSchema = z.object({
  businessId: z.guid(),
  number: z.string().regex(/^\+\d{8,15}$/, "Use E.164, for example +15815020392."),
  apply: z.boolean().default(false),
});

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { "business-id": { type: "string" }, number: { type: "string" }, apply: { type: "boolean" } } });
  const options = optionsSchema.parse({ businessId: values["business-id"], number: values.number, apply: values.apply ?? false });
  const telephony = createTelephony(process.env);

  const database = createDatabaseClient("lobbystack_worker");
  try {
    const row = await withBusinessTransaction(database.db, { businessId: options.businessId, actorType: "worker" }, async (tx) =>
      (await tx.select({ id: phoneNumbers.id, providerPhoneId: phoneNumbers.providerPhoneId, carrier: phoneNumbers.carrier, voiceWebhookTargetUrl: phoneNumbers.voiceWebhookTargetUrl }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, options.businessId), eq(phoneNumbers.e164, options.number), eq(phoneNumbers.status, "active"))).limit(1))[0]);
    if (!row?.providerPhoneId) throw new Error("That business has no active number matching it.");
    const routing = telephony.forNumber(row.carrier)?.routing;
    if (!routing) throw new Error(`The number's carrier, ${row.carrier}, has no credentials on this machine.`);
    const missing = routing.missingSetup();
    if (missing) throw new Error(missing);
    console.log(JSON.stringify({ number: options.number, phoneNumberId: row.id, carrier: row.carrier, current: row.voiceWebhookTargetUrl, target: "GPT-Live", apply: options.apply }));
    if (!options.apply) return;

    // A carrier that stores the refused-call forward needs it on every route, or refused calls fail.
    const refusedCallsForwardTo = routing.forwardsRefusedCalls ? await resolveRefusedCallForward({ db: database.db }, { businessId: options.businessId, e164: options.number }) : undefined;
    const { target } = await routing.routeNumber({ providerPhoneId: row.providerPhoneId, mode: "receptionist", ...(refusedCallsForwardTo !== undefined ? { refusedCallsForwardTo } : {}) });
    await withBusinessTransaction(database.db, { businessId: options.businessId, actorType: "worker" }, async (tx) => {
      await tx.update(phoneNumbers).set({
        voiceWebhookTargetUrl: target,
        voiceWebhookLastSyncedAt: new Date(),
        ...(refusedCallsForwardTo !== undefined ? { refusedCallsForwardTo } : {}),
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
