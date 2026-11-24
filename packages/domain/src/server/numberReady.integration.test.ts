import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { businesses, businessNotifications, createDatabaseClient, onboardingNumberClaimEvents, outboxMessages, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { completeNumberProvisioning } from "./phoneNumbers";
import { createBusiness } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Reliability integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

/** Runs as the worker, as the number job does. The recipients function trusts session_user, so this switches it. */
async function asWorker<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

/** A Serbian business on the number step with a claim the worker is buying; providerOrderId when the carrier made it wait. */
async function businessBuyingNumber(tx: DatabaseTransaction, providerOrderId: string | null) {
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Milica Owner", emailVerified: true, preferredLocale: "sr" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Delux", timezone: "Europe/Belgrade", businessType: "barbershop" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "attribution", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
  const e164 = `+38121${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
  const [claim] = await tx.insert(onboardingNumberClaimEvents).values({ businessId, userId, requestedE164: e164, selectionContext: { countryCode: "RS", kind: "local", city: "Novi Sad", sms: false }, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "provisioning", providerOrderId }).returning({ id: onboardingNumberClaimEvents.id });
  return { userId, email, businessId, claimId: claim!.id, e164 };
}

async function readyEmails(tx: DatabaseTransaction, businessId: string) {
  const rows = await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "email.send")));
  return rows.map((row) => row.payload as { template: string; to: string; variables: Record<string, string>; brand: unknown }).filter((payload) => payload.template === "number_ready");
}

describe.skipIf(!client)("a number the carrier took days to activate", () => {
  it("tells the owner in the bell and by email, in their language, once it answers calls", async () => {
    await rollbackTest(async (tx) => {
      const { email, businessId, claimId, e164 } = await businessBuyingNumber(tx, "order-123");
      const digits = e164.slice(1);
      await asWorker(tx, async (db) => await completeNumberProvisioning({ db }, { businessId, claimId, carrier: "zadarma", e164, providerPhoneId: digits, voiceUrl: `sip:${digits}@sip.example.test` }));

      const emails = await readyEmails(tx, businessId);
      expect(emails).toEqual([{ template: "number_ready", to: email, variables: expect.objectContaining({ locale: "sr", firstName: "Milica", businessName: "Delux", number: e164, url: expect.stringMatching(/\/agents\/primary\/channels\/phone$/) }), brand: { kind: "business", businessId }, replyTo: null }]);
      const bell = await tx.select({ kind: businessNotifications.kind, params: businessNotifications.params }).from(businessNotifications).where(and(eq(businessNotifications.businessId, businessId), eq(businessNotifications.kind, "number_ready")));
      expect(bell).toEqual([{ kind: "number_ready", params: { number: e164 } }]);
    });
  });

  it("sends nothing for a number bought at once, which the owner watched arrive", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, claimId, e164 } = await businessBuyingNumber(tx, null);
      const digits = e164.slice(1);
      await asWorker(tx, async (db) => await completeNumberProvisioning({ db }, { businessId, claimId, carrier: "zadarma", e164, providerPhoneId: digits, voiceUrl: `sip:${digits}@sip.example.test` }));

      expect(await readyEmails(tx, businessId)).toEqual([]);
      expect(await tx.select({ id: businessNotifications.id }).from(businessNotifications).where(and(eq(businessNotifications.businessId, businessId), eq(businessNotifications.kind, "number_ready")))).toEqual([]);
    });
  });
});
