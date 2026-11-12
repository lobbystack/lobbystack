import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, createDatabaseClient, defaultAgentIdOf, numberTrials, outboxMessages, phoneNumbers, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { createBusiness } from "./tenancy";
import { advanceOnboardingStage, queueWelcomeEmail } from "./onboarding";
import { queuePlanReminderEmail } from "./planReminder";
import { marketingEmailRecipient, marketingEmailsSubscribed, marketingUnsubscribeToken, setMarketingEmailsSubscribed, setMarketingEmailsSubscribedWithToken } from "./marketingEmails";

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

async function person(tx: DatabaseTransaction) {
  const userId = randomUUID();
  const email = `${randomUUID()}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner", preferredLocale: "fr" });
  return { userId, email };
}

/** Runs `run` as the auth role, which the admin's unsubscribe link and account setting use. */
async function asAuth<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local role lobbystack_auth`);
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset role`);
  }
}

/** Runs `run` as the worker logs in, which is how it checks a marketing email as it sends it. */
async function asWorker<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

/** A direct cloud business on the plans, its trial running on its number: due a plan reminder. */
async function onThePlans(tx: DatabaseTransaction) {
  const owner = await person(tx);
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId: owner.userId, name: `Acme ${randomUUID()}`, timezone: "UTC", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "meet", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
  const [number] = await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: `+1555010${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`, carrier: "twilio", status: "active", voiceEnabled: true, smsEnabled: true }).returning({ id: phoneNumbers.id });
  await tx.insert(numberTrials).values({ businessId, userId: owner.userId, status: "active", phoneNumberId: number!.id, startedAt: new Date(), endsAt: new Date(Date.now() + 14 * 86_400_000) });
  await tx.execute(sql`set local role lobbystack_app`);
  try {
    expect(await advanceOnboardingStage({ db: tx as unknown as Database }, { userId: owner.userId, businessId, to: "complete" })).toBe("choose_plan");
  } finally {
    await tx.execute(sql`reset role`);
  }
  return { ...owner, businessId };
}

async function marketingEmails(tx: DatabaseTransaction, businessId: string, template: string) {
  return (await tx.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "email.send"))))
    .filter((row) => (row.payload as { template?: string }).template === template);
}

describe.skipIf(!testUrl)("marketing email opt-out against dedicated PostgreSQL roles", () => {
  it("turns marketing emails off and on for one person, keeping the first time they unsubscribed", async () => {
    await rollbackTest(async (tx) => {
      const { userId } = await person(tx);
      const other = await person(tx);
      expect(await asAuth(tx, (db) => marketingEmailsSubscribed(db, userId))).toBe(true);
      const first = new Date("2026-11-01T12:00:00Z");
      expect(await asAuth(tx, (db) => setMarketingEmailsSubscribed(db, { userId, subscribed: false, now: first }))).toEqual({ subscribed: false });
      expect(await asAuth(tx, (db) => setMarketingEmailsSubscribed(db, { userId, subscribed: false, now: new Date("2026-11-02T12:00:00Z") }))).toEqual({ subscribed: false });
      const [row] = await tx.select({ at: users.marketingEmailsUnsubscribedAt }).from(users).where(eq(users.id, userId));
      expect(row!.at).toEqual(first);
      expect(await asAuth(tx, (db) => marketingEmailsSubscribed(db, userId))).toBe(false);
      // Nobody else's choice moves.
      expect(await asAuth(tx, (db) => marketingEmailsSubscribed(db, other.userId))).toBe(true);
      expect(await asAuth(tx, (db) => setMarketingEmailsSubscribed(db, { userId, subscribed: true }))).toEqual({ subscribed: true });
      expect(await asAuth(tx, (db) => marketingEmailsSubscribed(db, userId))).toBe(true);
      // Someone who doesn't exist has no choice to save.
      expect(await asAuth(tx, (db) => setMarketingEmailsSubscribed(db, { userId: randomUUID(), subscribed: false }))).toBeNull();
    });
  });

  it("unsubscribes and resubscribes the person a signed link names, and nobody for a link that doesn't read", async () => {
    await rollbackTest(async (tx) => {
      const { userId, email } = await person(tx);
      const token = marketingUnsubscribeToken(userId);
      expect(await asAuth(tx, (db) => setMarketingEmailsSubscribedWithToken(db, { token, subscribed: false }))).toEqual({ subscribed: false });
      expect(await asWorker(tx, (db) => marketingEmailRecipient(db, email))).toEqual({ userId, unsubscribed: true });
      expect(await asAuth(tx, (db) => setMarketingEmailsSubscribedWithToken(db, { token, subscribed: true }))).toEqual({ subscribed: true });
      expect(await asWorker(tx, (db) => marketingEmailRecipient(db, email))).toEqual({ userId, unsubscribed: false });
      expect(await asAuth(tx, (db) => setMarketingEmailsSubscribedWithToken(db, { token: `${token}x`, subscribed: false }))).toBeNull();
      expect(await asAuth(tx, (db) => setMarketingEmailsSubscribedWithToken(db, { token: marketingUnsubscribeToken(randomUUID()), subscribed: false }))).toBeNull();
    });
  });

  it("lets the worker find the recipient by any spelling of their address, and nobody for an unknown one", async () => {
    await rollbackTest(async (tx) => {
      const { userId, email } = await person(tx);
      expect(await asWorker(tx, (db) => marketingEmailRecipient(db, ` ${email.toUpperCase()} `))).toEqual({ userId, unsubscribed: false });
      expect(await asWorker(tx, (db) => marketingEmailRecipient(db, "nobody@example.invalid"))).toBeNull();
    });
  });

  it("keeps the column away from the app role, which reads only the users columns it was granted", async () => {
    await rollbackTest(async (tx) => {
      const { userId } = await person(tx);
      await tx.execute(sql`set local role lobbystack_app`);
      // 42501: insufficient_privilege, which Drizzle wraps as the query's cause.
      await expect(tx.execute(sql`select marketing_emails_unsubscribed_at from public.users where id = ${userId}::uuid`)).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  });

  it("skips the welcome to an owner who unsubscribed, when it's queued and when one queued before goes out", async () => {
    await rollbackTest(async (tx) => {
      const owner = await person(tx);
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId: owner.userId, name: `Acme ${randomUUID()}`, timezone: "UTC", businessType: "test" });
      await tx.execute(sql`reset role`);
      await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
      // Queued while they still got marketing emails.
      expect((await asWorker(tx, (db) => queueWelcomeEmail({ db }, { businessId }))).status).toBe("queued");
      expect(await marketingEmails(tx, businessId, "welcome")).toHaveLength(1);
      await asAuth(tx, (db) => setMarketingEmailsSubscribed(db, { userId: owner.userId, subscribed: false }));
      // As the worker sends that email, it reads the opt-out and skips it.
      expect(await asWorker(tx, (db) => marketingEmailRecipient(db, owner.email))).toEqual({ userId: owner.userId, unsubscribed: true });
      // And a welcome due now isn't queued at all.
      await tx.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      expect((await asWorker(tx, (db) => queueWelcomeEmail({ db }, { businessId }))).status).toBe("skipped");
      expect(await marketingEmails(tx, businessId, "welcome")).toEqual([]);
    });
  });

  it("skips the plan reminder to an owner who unsubscribed, and sends it again once they resubscribe", async () => {
    await rollbackTest(async (tx) => {
      const owner = await onThePlans(tx);
      await asAuth(tx, (db) => setMarketingEmailsSubscribed(db, { userId: owner.userId, subscribed: false }));
      expect((await asWorker(tx, (db) => queuePlanReminderEmail({ db }, { businessId: owner.businessId }))).status).toBe("skipped");
      expect(await marketingEmails(tx, owner.businessId, "plan_reminder")).toEqual([]);
      expect(await asWorker(tx, (db) => marketingEmailRecipient(db, owner.email))).toEqual({ userId: owner.userId, unsubscribed: true });
      await asAuth(tx, (db) => setMarketingEmailsSubscribed(db, { userId: owner.userId, subscribed: true }));
      expect((await asWorker(tx, (db) => queuePlanReminderEmail({ db }, { businessId: owner.businessId }))).status).toBe("queued");
      expect(await marketingEmails(tx, owner.businessId, "plan_reminder")).toHaveLength(1);
    });
  });
});
