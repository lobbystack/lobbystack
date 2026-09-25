import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, calls, createDatabaseClient, outboxMessages, sessions, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { createBusiness } from "./tenancy";
import { ONBOARDING_FOLLOWUP_DELAY_MS, queueOnboardingFollowupEmail, submitOnboardingAttribution } from "./onboarding";

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

const sender = { from: "Raphael from LobbyStack <raphael@lobbystack.test>", name: "Raphael" };

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

async function completedWorkspace(tx: DatabaseTransaction, email = `${randomUUID()}@example.invalid`) {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner", preferredLocale: "fr" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: `Acme ${randomUUID()}`, timezone: "UTC", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
  return { userId, businessId, email };
}

// The resolver trusts only the worker's login identity, so switch session_user rather than the current role.
async function queueAsWorker(tx: DatabaseTransaction, businessId: string, completedAt: Date, from = sender) {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  const queued = await queueOnboardingFollowupEmail({ db: tx as unknown as Database }, { businessId, completedAt, sender: from });
  await tx.execute(sql`reset session authorization`);
  return queued;
}

async function followupEmails(tx: DatabaseTransaction, businessId: string) {
  return await tx.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "email.send")));
}

describe.skipIf(!testUrl)("onboarding follow-up email against dedicated PostgreSQL roles", () => {
  it("schedules the follow-up a day after onboarding completes, once", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await completedWorkspace(tx);
      await tx.update(businesses).set({ onboardingStage: "attribution" }).where(eq(businesses.id, businessId));
      await tx.execute(sql`set local role lobbystack_app`);
      const before = Date.now();
      await submitOnboardingAttribution({ db: tx as unknown as Database }, { userId, businessId, source: "google" });
      await submitOnboardingAttribution({ db: tx as unknown as Database }, { userId, businessId, source: "google" });
      await tx.execute(sql`reset role`);
      const scheduled = await tx.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "onboarding.sendFollowup")));
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]!.availableAt.getTime()).toBeGreaterThanOrEqual(before + ONBOARDING_FOLLOWUP_DELAY_MS - 1_000);
      expect(Date.parse(String(scheduled[0]!.payload.completedAt))).toBeGreaterThanOrEqual(before - 1_000);
    });
  });

  it("queues one email to an owner who has not come back", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId, email } = await completedWorkspace(tx);
      const completedAt = new Date(Date.now() - ONBOARDING_FOLLOWUP_DELAY_MS);
      // Activity inside the first hour trails the final onboarding step and does not count as a return.
      await tx.insert(sessions).values({ token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(completedAt.getTime() + 30 * 60_000), updatedAt: new Date(completedAt.getTime() + 30 * 60_000) });
      await tx.insert(calls).values({ businessId, providerCallId: randomUUID(), transport: "web_voice", startedAt: new Date(completedAt.getTime() + 30 * 60_000) });
      expect(await queueAsWorker(tx, businessId, completedAt)).toBe(true);
      expect(await queueAsWorker(tx, businessId, completedAt)).toBe(true);
      const emails = await followupEmails(tx, businessId);
      expect(emails).toHaveLength(1);
      expect(emails[0]!.payload).toMatchObject({
        template: "onboarding_followup",
        to: email,
        from: sender.from,
        subject: "Qu'avez-vous pensé de LobbyStack ?",
        variables: { locale: "fr", firstName: "Sam", senderName: "Raphael" },
      });
    });
  });

  it("skips an owner who signed in again after onboarding", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await completedWorkspace(tx);
      const completedAt = new Date(Date.now() - ONBOARDING_FOLLOWUP_DELAY_MS);
      await tx.insert(sessions).values({ token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(completedAt.getTime() + 3 * 60 * 60_000) });
      expect(await queueAsWorker(tx, businessId, completedAt)).toBe(false);
      expect(await followupEmails(tx, businessId)).toHaveLength(0);
    });
  });

  it("skips a business that took a call after onboarding", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx);
      const completedAt = new Date(Date.now() - ONBOARDING_FOLLOWUP_DELAY_MS);
      await tx.insert(calls).values({ businessId, providerCallId: randomUUID(), transport: "voice", startedAt: new Date(completedAt.getTime() + 5 * 60 * 60_000) });
      expect(await queueAsWorker(tx, businessId, completedAt)).toBe(false);
      expect(await followupEmails(tx, businessId)).toHaveLength(0);
    });
  });

  it("answers only for the business bound to the worker transaction", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx);
      const other = await completedWorkspace(tx);
      const completedAt = new Date(Date.now() - ONBOARDING_FOLLOWUP_DELAY_MS).toISOString();
      const resolve = async () => (await tx.execute(sql`select email from app.resolve_onboarding_followup_recipient(${businessId}::uuid, ${completedAt}::timestamptz)`)).rows;
      await tx.execute(sql`set local session authorization lobbystack_worker`);
      expect(await resolve()).toHaveLength(0);
      await tx.execute(sql`select set_config('app.actor_type', 'worker', true), set_config('app.business_id', ${other.businessId}, true)`);
      expect(await resolve()).toHaveLength(0);
      await tx.execute(sql`select set_config('app.business_id', ${businessId}, true)`);
      expect(await resolve()).toHaveLength(1);
      await tx.execute(sql`reset session authorization`);
      expect(await resolve()).toHaveLength(0);
    });
  });

  it("skips owners on the sender's own email domain", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx, `${randomUUID()}@LobbyStack.test`);
      expect(await queueAsWorker(tx, businessId, new Date(Date.now() - ONBOARDING_FOLLOWUP_DELAY_MS))).toBe(false);
      expect(await followupEmails(tx, businessId)).toHaveLength(0);
    });
  });
});
