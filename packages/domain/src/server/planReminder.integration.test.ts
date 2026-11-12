import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, businessMemberships, businesses, createDatabaseClient, defaultAgentIdOf, numberTrials, outboxMessages, partners, phoneNumbers, platformKeyBusinesses, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { createBusiness } from "./tenancy";
import { advanceOnboardingStage } from "./onboarding";
import { planReminderDedupeKey, planReminderDueAt, queuePlanReminderEmail, schedulePlanReminderInTransaction } from "./planReminder";

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

/** A direct cloud business on Meet your agent, its trial running on its number, nobody paying yet: the plans come next. */
async function trialAtMeet(tx: DatabaseTransaction, options: { timezone?: string } = {}) {
  const userId = randomUUID();
  const email = `${randomUUID()}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner", preferredLocale: "fr" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: `Acme ${randomUUID()}`, timezone: options.timezone ?? "UTC", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "meet", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
  const [number] = await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: `+1438${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`, carrier: "twilio", status: "active", voiceEnabled: true, smsEnabled: true }).returning({ id: phoneNumbers.id, e164: phoneNumbers.e164 });
  await tx.insert(numberTrials).values({ businessId, userId, status: "active", phoneNumberId: number!.id, startedAt: new Date(), endsAt: new Date(Date.now() + 14 * 86_400_000) });
  return { userId, businessId, email, e164: number!.e164 };
}

async function advance(tx: DatabaseTransaction, input: { userId: string; businessId: string }) {
  await tx.execute(sql`set local role lobbystack_app`);
  try {
    return await advanceOnboardingStage({ db: tx as unknown as Database }, { ...input, to: "complete" });
  } finally {
    await tx.execute(sql`reset role`);
  }
}

async function reminderJobs(tx: DatabaseTransaction, businessId: string) {
  return await tx.select({ dedupeKey: outboxMessages.dedupeKey, availableAt: outboxMessages.availableAt }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "onboarding.sendPlanReminder")));
}

async function reminderEmails(tx: DatabaseTransaction, businessId: string) {
  return (await tx.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "email.send"))))
    .filter((row) => (row.payload as { template?: string }).template === "plan_reminder");
}

// The owner resolver trusts only the worker's login identity, so switch session_user rather than the current role.
async function runAsWorker(tx: DatabaseTransaction, businessId: string) {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return (await queuePlanReminderEmail({ db: tx as unknown as Database }, { businessId })).status;
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

async function pay(tx: DatabaseTransaction, businessId: string) {
  await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "active" }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState: "active" } });
}

describe.skipIf(!testUrl)("plan reminder against dedicated PostgreSQL roles", () => {
  it("schedules one reminder when the business reaches the plans, due by the timing rule in its time zone", async () => {
    await rollbackTest(async (tx) => {
      const workspace = await trialAtMeet(tx, { timezone: "America/Toronto" });
      const before = new Date();
      expect(await advance(tx, workspace)).toBe("choose_plan");
      const after = new Date();
      const jobs = await reminderJobs(tx, workspace.businessId);
      expect(jobs.map((job) => job.dedupeKey)).toEqual([planReminderDedupeKey(workspace.businessId)]);
      const due = jobs[0]!.availableAt.getTime();
      expect(due).toBeGreaterThanOrEqual(planReminderDueAt(before, "America/Toronto").getTime());
      expect(due).toBeLessThanOrEqual(planReminderDueAt(after, "America/Toronto").getTime());
      expect(due).toBeGreaterThanOrEqual(before.getTime() + 60 * 60_000);
      // Scheduling again, as a retried move would, adds nothing.
      await schedulePlanReminderInTransaction(tx, workspace.businessId, new Date());
      expect(await reminderJobs(tx, workspace.businessId)).toHaveLength(1);
      // Nothing goes out when the job is scheduled.
      expect(await reminderEmails(tx, workspace.businessId)).toEqual([]);
    });
  });

  it("sends the reminder to the owner, in their language, when the business is still on the plans", async () => {
    await rollbackTest(async (tx) => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      expect(await runAsWorker(tx, workspace.businessId)).toBe("queued");
      const emails = await reminderEmails(tx, workspace.businessId);
      expect(emails).toHaveLength(1);
      expect(emails[0]!.dedupeKey).toBe(`onboarding-plan-reminder:${workspace.businessId}:email`);
      expect(emails[0]!.payload).toMatchObject({
        template: "plan_reminder",
        to: workspace.email,
        variables: { locale: "fr", firstName: "Sam", number: workspace.e164, url: expect.stringMatching(/\/onboarding\/plan$/) },
        brand: { kind: "host" },
        replyTo: null,
      });
      // The template writes the subject, with the number formatted.
      expect(emails[0]!.payload).not.toHaveProperty("subject");
    });
  });

  it("sends it only once", async () => {
    await rollbackTest(async (tx) => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      expect(await runAsWorker(tx, workspace.businessId)).toBe("queued");
      expect(await runAsWorker(tx, workspace.businessId)).toBe("queued");
      expect(await reminderEmails(tx, workspace.businessId)).toHaveLength(1);
      expect(await reminderJobs(tx, workspace.businessId)).toHaveLength(1);
    });
  });

  it("sends nothing to an owner who chose Free before it was due", async () => {
    await rollbackTest(async (tx) => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      expect(await advance(tx, workspace)).toBe("complete");
      expect(await runAsWorker(tx, workspace.businessId)).toBe("skipped");
      expect(await reminderEmails(tx, workspace.businessId)).toEqual([]);
    });
  });

  it("sends nothing to an owner who paid for a plan before it was due, even before onboarding finished", async () => {
    await rollbackTest(async (tx) => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      // The checkout's subscription synced, and the owner hasn't come back to the return page yet.
      await pay(tx, workspace.businessId);
      expect(await runAsWorker(tx, workspace.businessId)).toBe("skipped");
      expect(await advance(tx, workspace)).toBe("complete");
      expect(await runAsWorker(tx, workspace.businessId)).toBe("skipped");
      expect(await reminderEmails(tx, workspace.businessId)).toEqual([]);
    });
  });

  it("sends nothing once the trial is no longer active", async () => {
    await rollbackTest(async (tx) => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      await tx.update(numberTrials).set({ status: "ended" }).where(eq(numberTrials.businessId, workspace.businessId));
      expect(await runAsWorker(tx, workspace.businessId)).toBe("skipped");
      expect(await reminderEmails(tx, workspace.businessId)).toEqual([]);
    });
  });

  it("never schedules or sends it for a partner's business", async () => {
    await rollbackTest(async (tx) => {
      // A direct business can't join a partner later, so this one starts as the partner's.
      const userId = randomUUID();
      const email = `${userId}@example.invalid`;
      await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
      const [partner] = await tx.insert(partners).values({ name: "Acme Reception", slug: `acme-${randomUUID().slice(0, 8)}` }).returning({ id: partners.id });
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: `harbor-${businessId.slice(0, 8)}`, name: "Harbor Dental", timezone: "UTC", businessType: "dental", partnerId: partner!.id, partnerAccessLevel: "full", onboardingStage: "meet" });
      await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
      const [number] = await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: "+14388070286", carrier: "twilio", status: "active", voiceEnabled: true, smsEnabled: true }).returning({ id: phoneNumbers.id });
      await tx.insert(numberTrials).values({ businessId, userId, status: "active", phoneNumberId: number!.id, startedAt: new Date(), endsAt: new Date(Date.now() + 14 * 86_400_000) });
      expect(await advance(tx, { userId, businessId })).toBe("complete");
      // Even put on the plans by hand, it gets neither the job nor the email.
      await tx.update(businesses).set({ onboardingStage: "choose_plan" }).where(eq(businesses.id, businessId));
      await schedulePlanReminderInTransaction(tx, businessId, new Date());
      expect(await reminderJobs(tx, businessId)).toEqual([]);
      expect(await runAsWorker(tx, businessId)).toBe("skipped");
      expect(await reminderEmails(tx, businessId)).toEqual([]);
    });
  });

  it("never schedules or sends it for a self-hosted business or one a platform key onboarded", async () => {
    await rollbackTest(async (tx) => {
      const selfHosted = await trialAtMeet(tx);
      await tx.update(businesses).set({ deploymentMode: "self_hosted_standard", onboardingStage: "choose_plan" }).where(eq(businesses.id, selfHosted.businessId));
      const keyed = await trialAtMeet(tx);
      await tx.insert(platformKeyBusinesses).values({ businessId: keyed.businessId, groupId: "acme" });
      expect(await advance(tx, keyed)).toBe("choose_plan");
      for (const { businessId } of [selfHosted, keyed]) {
        await schedulePlanReminderInTransaction(tx, businessId, new Date());
        expect(await reminderJobs(tx, businessId)).toEqual([]);
        expect(await runAsWorker(tx, businessId)).toBe("skipped");
        expect(await reminderEmails(tx, businessId)).toEqual([]);
      }
    });
  });
});
