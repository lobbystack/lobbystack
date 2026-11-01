import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { CHECK_IN_ANSWERS, checkInTokenVariable } from "@lobbystack/shared";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, calls, createDatabaseClient, firstRealConversations, outboxMessages, sessions, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { readCheckInToken } from "./checkIn";
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
async function queueAsWorker(tx: DatabaseTransaction, businessId: string, from = sender) {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  const queued = await queueOnboardingFollowupEmail({ db: tx as unknown as Database }, { businessId, sender: from });
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
    });
  });

  it("queues one email, with a signed link per answer, to an owner with no real conversation", async () => {
    await rollbackTest(async tx => {
      const { businessId, email } = await completedWorkspace(tx);
      expect(await queueAsWorker(tx, businessId)).toBe(true);
      expect(await queueAsWorker(tx, businessId)).toBe(true);
      const emails = await followupEmails(tx, businessId);
      expect(emails).toHaveLength(1);
      expect(emails[0]!.payload).toMatchObject({
        template: "onboarding_followup",
        to: email,
        from: sender.from,
        subject: expect.stringContaining("n'a pas encore eu de vraie conversation"),
        variables: { locale: "fr", firstName: "Sam", senderName: "Raphael" },
        // The host's own email. It has the founder's sender, so replies reach the founder.
        brand: { kind: "host" },
        replyTo: null,
      });
      const variables = emails[0]!.payload.variables as Record<string, string>;
      for (const answer of CHECK_IN_ANSWERS) expect(readCheckInToken(variables[checkInTokenVariable(answer)]!)).toEqual({ businessId, answer });
    });
  });

  it("still emails an owner who signed in again and made a test call", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await completedWorkspace(tx);
      const later = new Date(Date.now() - 60 * 60_000);
      await tx.insert(sessions).values({ token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86_400_000), createdAt: later });
      await tx.insert(calls).values({ businessId, providerCallId: randomUUID(), transport: "web_voice", startedAt: later });
      expect(await queueAsWorker(tx, businessId)).toBe(true);
    });
  });

  it("skips a business that had a real conversation", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx);
      await tx.insert(firstRealConversations).values({ businessId, channel: "voice" });
      expect(await queueAsWorker(tx, businessId)).toBe(false);
      expect(await followupEmails(tx, businessId)).toHaveLength(0);
    });
  });

  it("answers only for the business bound to the worker transaction", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx);
      const other = await completedWorkspace(tx);
      const resolve = async () => (await tx.execute(sql`select email from app.resolve_onboarding_followup_recipient(${businessId}::uuid)`)).rows;
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
      expect(await queueAsWorker(tx, businessId)).toBe(false);
      expect(await followupEmails(tx, businessId)).toHaveLength(0);
    });
  });
});
