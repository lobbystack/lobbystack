import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, createDatabaseClient, firstRealConversations, onboardingNumberClaimEvents, outboxMessages, phoneNumbers, users, type Database, type DatabaseTransaction, defaultAgentIdOf } from "@lobbystack/db";
import { createBusiness } from "./tenancy";
import { advanceOnboardingStage, queueWelcomeEmail } from "./onboarding";

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
