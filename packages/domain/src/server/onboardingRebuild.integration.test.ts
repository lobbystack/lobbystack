import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agents, billingAccounts, businesses, calls, createDatabaseClient, defaultAgentOf, numberTrials, onboardingNumberClaimEvents, outboxMessages, transcripts, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID, defaultGreeting } from "@lobbystack/shared";
import { advanceOnboardingStage, getActiveOnboardingState, submitOnboardingAttribution } from "./onboarding";
import { HOST_BRAND_SCOPE } from "./businessAccess";
import { failNumberProvisioning, skipOnboardingNumber } from "./phoneNumbers";
import { applySiteLanguageInTransaction, createBusiness, updateBusinessInTransaction } from "./tenancy";

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

async function asRole<T>(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker", work: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local role ${role}`));
  try {
    return await work(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset role`);
  }
}

const asApp = <T,>(tx: DatabaseTransaction, work: (db: Database) => Promise<T>) => asRole(tx, "lobbystack_app", work);

async function workspace(tx: DatabaseTransaction, stage: string, input: { defaultLocale?: string; defaultLocaleGuessed?: boolean } = {}) {
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
  const { businessId } = await asApp(tx, (db) => createBusiness({ db }, { userId, name: `Acme ${userId}`, timezone: "UTC", businessType: "test", ...input }));
  await tx.update(businesses).set({ onboardingStage: stage }).where(eq(businesses.id, businessId));
  return { userId, businessId };
}

async function business(tx: DatabaseTransaction, businessId: string) {
  return (await tx.select({ stage: businesses.onboardingStage, locale: businesses.defaultLocale, chosen: businesses.defaultLocaleChosen, attribution: businesses.onboardingAttribution, lastTestChatAt: businesses.lastTestChatAt, planOfferDismissals: businesses.planOfferDismissals, name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)))[0]!;
}

async function testCall(tx: DatabaseTransaction, businessId: string, line: string | null) {
  const [call] = await tx.insert(calls).values({ businessId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, transport: "web_voice", widgetId: DASHBOARD_TEST_CALL_WIDGET_ID, status: "completed", startedAt: new Date(), mediaStartedAt: new Date(), endedAt: new Date() }).returning({ id: calls.id });
  if (line !== null) await tx.insert(transcripts).values({ businessId, callId: call!.id, sequence: 0, speaker: "receptionist", text: line, final: true });
}

const welcomes = async (tx: DatabaseTransaction, businessId: string) => await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(sql`${outboxMessages.businessId} = ${businessId}::uuid and ${outboxMessages.topic} = 'onboarding.sendWelcome'`);

describe.skipIf(!testUrl)("the onboarding rebuild against dedicated PostgreSQL roles", () => {
  it("resumes a direct owner parked on a removed step at the number, and moving on repairs the stored stage", async () => {
    await rollbackTest(async (tx) => {
      for (const stage of ["knowledge", "greeting", "test_call", "plan", "verify_phone"]) {
        const { userId, businessId } = await workspace(tx, stage);
        const state = await asApp(tx, (db) => getActiveOnboardingState(db, userId, HOST_BRAND_SCOPE));
        expect(state).toMatchObject({ businessId, stage: "phone_number" });
        // Moving from the repaired stage needs the stored value to change too.
        await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "phone_number" }));
        expect((await business(tx, businessId)).stage).toBe("phone_number");
      }
    });
  });

  it("lets an owner parked on a removed step go on without a number only from a country without numbers", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "test_call");
      await tx.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      await expect(asApp(tx, (db) => skipOnboardingNumber({ db }, { userId, businessId }))).rejects.toMatchObject({ status: 409, code: "number_required" });
      await expect(asApp(tx, (db) => skipOnboardingNumber({ db }, { userId, businessId, countryCode: "CA" }))).rejects.toMatchObject({ status: 409, code: "number_required" });
      await expect(asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "attribution" }))).rejects.toMatchObject({ status: 409, code: "number_required" });
      await asApp(tx, (db) => skipOnboardingNumber({ db }, { userId, businessId, countryCode: "FR" }));
      expect((await business(tx, businessId)).stage).toBe("attribution");
    });
  });

  it("keeps a direct cloud owner on the number while it's being bought, until the purchase succeeds or fails", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "phone_number_claiming");
      await tx.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      await expect(asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "attribution" }))).rejects.toMatchObject({ status: 409, code: "number_required" });
      // The country fallback works only from picking a number, not while one is being bought.
      await expect(asApp(tx, (db) => skipOnboardingNumber({ db }, { userId, businessId, countryCode: "FR" }))).rejects.toMatchObject({ status: 409 });
      expect((await business(tx, businessId)).stage).toBe("phone_number_claiming");
      // Asking for the number step again leaves the purchase where it is.
      expect(await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "phone_number" }))).toBe("phone_number_claiming");

      // A failed purchase goes back to picking one, where the country fallback still works.
      const [claim] = await tx.insert(onboardingNumberClaimEvents).values({ businessId, userId, status: "provisioning", requestedE164: "+15145550100", selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID() }).returning({ id: onboardingNumberClaimEvents.id });
      await asRole(tx, "lobbystack_worker", (db) => failNumberProvisioning({ db }, { businessId, claimId: claim!.id, unavailable: true }));
      expect((await business(tx, businessId)).stage).toBe("phone_number");
      await asApp(tx, (db) => skipOnboardingNumber({ db }, { userId, businessId, countryCode: "FR" }));
      expect((await business(tx, businessId)).stage).toBe("attribution");
    });
  });

  it("lets a self-hosted owner move on while a number is being bought", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "phone_number_claiming");
      await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, businessId));
      expect(await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "attribution" }))).toBe("attribution");
    });
  });

  it("shows the plans after Meet your agent to a trial nobody pays for yet, then finishes", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "meet");
      await tx.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      await tx.insert(numberTrials).values({ businessId, userId, status: "active", startedAt: new Date(), endsAt: new Date(Date.now() + 14 * 86_400_000) });
      expect(await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "complete" }))).toBe("choose_plan");
      expect((await business(tx, businessId)).stage).toBe("choose_plan");
      // Leaving Meet your agent sends the welcome, once.
      expect(await welcomes(tx, businessId)).toHaveLength(1);
      expect(await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "complete" }))).toBe("complete");
      expect(await welcomes(tx, businessId)).toHaveLength(1);
    });
  });

  it("finishes a business with no trial at Meet your agent, with no plans after it", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "meet");
      await tx.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      expect(await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "complete" }))).toBe("complete");
    });
  });

  it("goes from attribution to Meet your agent, and finishing schedules the welcome email once", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "attribution");
      await asApp(tx, (db) => submitOnboardingAttribution({ db }, { userId, businessId, source: "google" }));
      expect(await business(tx, businessId)).toMatchObject({ stage: "meet", attribution: "google" });
      expect(await welcomes(tx, businessId)).toEqual([]);
      await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "complete" }));
      expect((await business(tx, businessId)).stage).toBe("complete");
      expect(await welcomes(tx, businessId)).toHaveLength(1);
      await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "complete" }));
      expect(await welcomes(tx, businessId)).toHaveLength(1);
    });
  });

  it("refuses to finish before Meet your agent", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "attribution");
      await expect(asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "complete" }))).rejects.toThrow("Invalid onboarding transition");
    });
  });

  it("keeps a saved attribution and the stage when an owner comes back and skips", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "attribution");
      await asApp(tx, (db) => submitOnboardingAttribution({ db }, { userId, businessId, source: "google" }));
      await asApp(tx, (db) => submitOnboardingAttribution({ db }, { userId, businessId, source: null }));
      expect(await business(tx, businessId)).toMatchObject({ stage: "meet", attribution: "google" });
    });
  });

  it("refuses to move past attribution without an answer", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "attribution");
      await expect(asApp(tx, (db) => submitOnboardingAttribution({ db }, { userId, businessId, source: null }))).rejects.toMatchObject({ status: 400, code: "attribution_required" });
      await expect(asApp(tx, (db) => submitOnboardingAttribution({ db }, { userId, businessId, source: "  " }))).rejects.toMatchObject({ status: 400, code: "attribution_required" });
      await expect(asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "meet" }))).rejects.toMatchObject({ status: 400, code: "attribution_required" });
      expect((await business(tx, businessId)).stage).toBe("attribution");
    });
  });

  it("claims a number from Meet your agent without moving the stage", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspace(tx, "meet");
      await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, businessId));
      await tx.execute(sql`set local session authorization lobbystack_app`);
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true), set_config('app.business_id', ${businessId}, true)`);
      await tx.execute(sql`select app.reserve_onboarding_number_claim(${businessId}::uuid, ${userId}::uuid, '+15550100000', '{}'::jsonb, ${randomUUID()}, ${randomUUID()})`);
      await tx.execute(sql`reset session authorization`);
      expect((await business(tx, businessId)).stage).toBe("meet");
    });
  });

  it("replaces a guessed language with the site's as the worker, greeting included", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await workspace(tx, "verify_phone", { defaultLocale: "en", defaultLocaleGuessed: true });
      const { name } = await business(tx, businessId);
      expect(await asRole(tx, "lobbystack_worker", async () => {
        await tx.execute(sql`select set_config('app.business_id', ${businessId}, true), set_config('app.actor_type', 'worker', true)`);
        return await applySiteLanguageInTransaction(tx, { businessId, locale: "fr" });
      })).toBe(true);
      expect(await business(tx, businessId)).toMatchObject({ locale: "fr", chosen: false });
      expect((await tx.select({ greeting: agents.greeting }).from(agents).where(defaultAgentOf(businessId)))[0]?.greeting).toBe(defaultGreeting(name, "fr"));
    });
  });

  it("leaves a language the operator chose alone", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await workspace(tx, "verify_phone", { defaultLocale: "en", defaultLocaleGuessed: true });
      await updateBusinessInTransaction(tx, { businessId, defaultLocale: "es" });
      expect(await applySiteLanguageInTransaction(tx, { businessId, locale: "fr" })).toBe(false);
      expect(await business(tx, businessId)).toMatchObject({ locale: "es", chosen: true });
    });
  });

  it("leaves a finished business's language alone", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await workspace(tx, "complete", { defaultLocale: "en", defaultLocaleGuessed: true });
      expect(await applySiteLanguageInTransaction(tx, { businessId, locale: "fr" })).toBe(false);
    });
  });
});
