import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, businessMemberships, businesses, createDatabaseClient, enqueueOutbox, firstRealConversations, numberTrials, onboardingNumberClaimEvents, outboxMessages, partners, phoneNumbers, users, type Database, type DatabaseTransaction, defaultAgentIdOf } from "@lobbystack/db";
import { createBusiness } from "./tenancy";
import { advanceOnboardingStage, queueWelcomeEmail, welcomeEmailDedupeKey } from "./onboarding";

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

async function completedWorkspace(tx: DatabaseTransaction, options: { goal?: string } = {}) {
  const userId = randomUUID();
  const email = `${randomUUID()}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner", preferredLocale: "fr" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: `Acme ${randomUUID()}`, timezone: "UTC", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "complete", ...(options.goal ? { onboardingGoal: options.goal } : {}) }).where(eq(businesses.id, businessId));
  return { userId, businessId, email };
}

// The resolver trusts only the worker's login identity, so switch session_user rather than the current role.
async function queueAsWorker(tx: DatabaseTransaction, businessId: string, now?: Date) {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  const result = await queueWelcomeEmail({ db: tx as unknown as Database }, { businessId, ...(now ? { now } : {}) });
  await tx.execute(sql`reset session authorization`);
  return result.status;
}

async function welcomeEmails(tx: DatabaseTransaction, businessId: string) {
  return await tx.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "email.send")));
}

async function welcomeJobs(tx: DatabaseTransaction, businessId: string) {
  return await tx.select({ dedupeKey: outboxMessages.dedupeKey }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "onboarding.sendWelcome")));
}

/** Runs every scheduled welcome job as the worker would, and returns the welcome emails queued. */
async function sentWelcomes(tx: DatabaseTransaction, businessId: string) {
  for (const _job of await welcomeJobs(tx, businessId)) await queueAsWorker(tx, businessId);
  return (await welcomeEmails(tx, businessId)).filter((row) => (row.payload as { template?: string }).template === "welcome");
}

async function advance(tx: DatabaseTransaction, input: { userId: string; businessId: string }) {
  await tx.execute(sql`set local role lobbystack_app`);
  try {
    return await advanceOnboardingStage({ db: tx as unknown as Database }, { ...input, to: "complete" });
  } finally {
    await tx.execute(sql`reset role`);
  }
}

/** A direct cloud business on Meet your agent with a number trial nobody pays for yet, so the plans come next. */
async function trialAtMeet(tx: DatabaseTransaction) {
  const workspace = await completedWorkspace(tx);
  await tx.update(businesses).set({ onboardingStage: "meet", deploymentMode: "cloud" }).where(eq(businesses.id, workspace.businessId));
  await tx.insert(numberTrials).values({ businessId: workspace.businessId, userId: workspace.userId, status: "active", startedAt: new Date(), endsAt: new Date(Date.now() + 14 * 86_400_000) });
  return workspace;
}

describe.skipIf(!testUrl)("welcome email against dedicated PostgreSQL roles", () => {
  it("schedules the welcome when onboarding completes, once, and no founder's check-in", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await completedWorkspace(tx);
      await tx.update(businesses).set({ onboardingStage: "meet" }).where(eq(businesses.id, businessId));
      await tx.execute(sql`set local role lobbystack_app`);
      const before = Date.now();
      await advanceOnboardingStage({ db: tx as unknown as Database }, { userId, businessId, to: "complete" });
      await advanceOnboardingStage({ db: tx as unknown as Database }, { userId, businessId, to: "complete" });
      await tx.execute(sql`reset role`);
      const topics = await tx.select({ topic: outboxMessages.topic, availableAt: outboxMessages.availableAt }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), sql`${outboxMessages.topic} like 'onboarding.%'`));
      expect(topics.map((row) => row.topic)).toEqual(["onboarding.sendWelcome"]);
      expect(Math.abs(topics[0]!.availableAt.getTime() - before)).toBeLessThan(60_000);
      expect(await sentWelcomes(tx, businessId)).toHaveLength(1);
    });
  });

  it("waits for the plans: going from Meet your agent to them schedules nothing yet", async () => {
    await rollbackTest(async tx => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      expect(await welcomeJobs(tx, workspace.businessId)).toEqual([]);
      expect(await sentWelcomes(tx, workspace.businessId)).toEqual([]);
    });
  });

  it("sends one welcome when the owner picks Free on the plans", async () => {
    await rollbackTest(async tx => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      expect(await advance(tx, workspace)).toBe("complete");
      expect(await advance(tx, workspace)).toBe("complete");
      expect(await welcomeJobs(tx, workspace.businessId)).toEqual([{ dedupeKey: welcomeEmailDedupeKey(workspace.businessId) }]);
      expect(await sentWelcomes(tx, workspace.businessId)).toHaveLength(1);
    });
  });

  it("sends one welcome when the owner pays for a plan on the plans", async () => {
    await rollbackTest(async tx => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      // The checkout's subscription syncs, then its return page finishes onboarding.
      await tx.insert(billingAccounts).values({ businessId: workspace.businessId, billingKey: `business:${workspace.businessId}`, plan: "starter", subscriptionState: "active" }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState: "active" } });
      expect(await advance(tx, workspace)).toBe("complete");
      expect(await sentWelcomes(tx, workspace.businessId)).toHaveLength(1);
    });
  });

  it("isn't blocked by the job an earlier release scheduled on the way to the plans, and still sends only one", async () => {
    await rollbackTest(async tx => {
      const workspace = await trialAtMeet(tx);
      expect(await advance(tx, workspace)).toBe("choose_plan");
      // The earlier release scheduled its job under the old key, and it skipped there.
      await enqueueOutbox(tx, { topic: "onboarding.sendWelcome", businessId: workspace.businessId, aggregateType: "business", aggregateId: workspace.businessId, dedupeKey: `onboarding-welcome:${workspace.businessId}`, availableAt: new Date(), payload: {} });
      expect(await queueAsWorker(tx, workspace.businessId)).toBe("skipped");
      expect(await advance(tx, workspace)).toBe("complete");
      // Both jobs run after completion, the old one late; the email's own key keeps it to one.
      expect(await welcomeJobs(tx, workspace.businessId)).toHaveLength(2);
      expect(await sentWelcomes(tx, workspace.businessId)).toHaveLength(1);
    });
  });

  it("never schedules the welcome for a partner's business", async () => {
    await rollbackTest(async tx => {
      // A direct business can't join a partner later, so this one starts as the partner's.
      const userId = randomUUID();
      const email = `${userId}@example.invalid`;
      await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
      const [partner] = await tx.insert(partners).values({ name: "Acme Reception", slug: `acme-${randomUUID().slice(0, 8)}` }).returning({ id: partners.id });
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: `harbor-${businessId.slice(0, 8)}`, name: "Harbor Dental", timezone: "UTC", businessType: "dental", partnerId: partner!.id, partnerAccessLevel: "full", onboardingStage: "meet" });
      await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
      expect(await advance(tx, { userId, businessId })).toBe("complete");
      expect(await welcomeJobs(tx, businessId)).toEqual([]);
      expect(await sentWelcomes(tx, businessId)).toEqual([]);
    });
  });

  it("queues one welcome in the owner's language, from LobbyStack, with a button to get a number", async () => {
    await rollbackTest(async tx => {
      const { businessId, email } = await completedWorkspace(tx, { goal: "book_appointments" });
      expect(await queueAsWorker(tx, businessId)).toBe("queued");
      expect(await queueAsWorker(tx, businessId)).toBe("queued");
      const emails = await welcomeEmails(tx, businessId);
      expect(emails).toHaveLength(1);
      expect(emails[0]!.payload).toMatchObject({
        template: "welcome",
        to: email,
        subject: "Bienvenue chez LobbyStack, Sam",
        variables: { locale: "fr", firstName: "Sam", goal: "book_appointments", number: "", url: expect.stringMatching(/\/\?setup=phoneNumber$/) },
        brand: { kind: "host" },
        replyTo: null,
      });
      expect(emails[0]!.payload).not.toHaveProperty("from");
    });
  });

  it("names the number the owner took, so the button forwards their calls", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx);
      await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: "+14388070285", carrier: "twilio", status: "active", voiceEnabled: true, smsEnabled: true });
      expect(await queueAsWorker(tx, businessId)).toBe("queued");
      expect((await welcomeEmails(tx, businessId))[0]!.payload).toMatchObject({ variables: { number: "+14388070285", goal: "" } });
    });
  });

  it("waits for a number still being set up, then names it, and stops waiting after 15 minutes", async () => {
    await rollbackTest(async tx => {
      const { businessId, userId } = await completedWorkspace(tx);
      const reservedAt = new Date();
      await tx.insert(onboardingNumberClaimEvents).values({ businessId, userId, requestedE164: "+14388070285", selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "provisioning", reservedAt });
      expect(await queueAsWorker(tx, businessId)).toBe("waiting");
      expect(await welcomeEmails(tx, businessId)).toHaveLength(0);
      expect(await queueAsWorker(tx, businessId, new Date(reservedAt.getTime() + 16 * 60_000))).toBe("queued");
      expect((await welcomeEmails(tx, businessId))[0]!.payload).toMatchObject({ variables: { number: "" } });
    });
  });

  it("welcomes an owner whose agent already talked to a customer", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx);
      await tx.insert(firstRealConversations).values({ businessId, channel: "voice" });
      expect(await queueAsWorker(tx, businessId)).toBe("queued");
    });
  });

  it("answers only for the business bound to the worker transaction", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx);
      const other = await completedWorkspace(tx);
      const resolve = async () => (await tx.execute(sql`select email from app.resolve_onboarding_welcome_recipient(${businessId}::uuid)`)).rows;
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

  it("sends nothing to a business that hasn't finished onboarding", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await completedWorkspace(tx);
      await tx.update(businesses).set({ onboardingStage: "meet" }).where(eq(businesses.id, businessId));
      expect(await queueAsWorker(tx, businessId)).toBe("skipped");
      expect(await welcomeEmails(tx, businessId)).toHaveLength(0);
    });
  });
});
