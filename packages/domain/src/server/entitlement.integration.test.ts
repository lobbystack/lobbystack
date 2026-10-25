import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, billingUsageEvents, businesses, createDatabaseClient, onboardingPhoneVerifications, phoneNumbers, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { hasLiveEntitlement, type Entitlement } from "@lobbystack/shared";

import { getWebVoiceBillingAllowance, getWidgetChatAllowance, reserveWebVoiceUsageInTransaction, reserveWidgetChatUsageInTransaction } from "./billing";
import { loadEntitlement } from "./entitlement";
import { reserveApiNumberClaimInTransaction, reserveOnboardingNumberClaim, reserveReplacementNumberClaim, searchBusinessNumberInventory, type NumberOffer } from "./phoneNumbers";
import { createBusiness } from "./tenancy";
import { getVoiceSecondsLeftInTransaction, periodKeyFor, reserveUsageInTransaction } from "./usage";

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

const claimTokenSecret = "entitlement-test-secret";

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

// Security-definer functions trust session_user, so switch it rather than the current role.
async function as<T>(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker", run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local session authorization ${role}`));
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

/** Runs one step as the worker inside a savepoint, so a refusal leaves the test's transaction usable. */
async function asWorker<T>(tx: DatabaseTransaction, businessId: string, run: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await as(tx, "lobbystack_worker", async (db) => await withBusinessTransaction(db, { businessId, actorType: "worker" }, run));
}

/** A random Toronto number, so tests running at once never share one. */
function testNumber(): string {
  return `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
}

type Account = { source?: string; plan: string | null; subscriptionState: string | null; overageSpendingCapCents?: number | null };
type PlanCase = { deploymentMode: "cloud" | "self_hosted_standard"; account: Account | null };

/** Puts the business on a plan the way the database stores one: its deployment mode and its billing account. */
async function setPlan(tx: DatabaseTransaction, businessId: string, plan: PlanCase): Promise<void> {
  await tx.update(businesses).set({ deploymentMode: plan.deploymentMode }).where(eq(businesses.id, businessId));
  await tx.delete(billingAccounts).where(eq(billingAccounts.businessId, businessId));
  if (plan.account) await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, ...plan.account });
}

/** An owner's new business on the number step, with a mobile verified in Canada so a free business gets a trial. */
async function numberStepBusiness(tx: DatabaseTransaction, input: { withNumber?: boolean } = {}) {
  const userId = randomUUID();
  const phone = testNumber();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Owner", phone, phoneVerifiedAt: new Date() });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: `Entitlement ${randomUUID()}`, timezone: "America/Toronto", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: input.withNumber ? "complete" : "phone_number" }).where(eq(businesses.id, businessId));
  await tx.insert(onboardingPhoneVerifications).values({ businessId, userId, phoneE164: phone, countryCode: "CA", status: "approved", approvedAt: new Date(), expiresAt: new Date(Date.now() + 600_000), requestFingerprint: "test" });
  const [number] = input.withNumber ? await tx.insert(phoneNumbers).values({ businessId, e164: testNumber(), status: "active" }).returning({ id: phoneNumbers.id }) : [];
  return { userId, businessId, phone, phoneNumberId: number?.id ?? null };
}

const free: Entitlement = {
  live: false,
  source: "plan",
  allowance: { voiceSeconds: 1_800, chats: 5, alertSms: 10, outboundAttempts: 2 },
  overage: { enabled: false, currency: "USD", rates: { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 }, capMinor: null },
  poolPartnerId: null,
  includedNumbers: 0,
};
const starter = (capMinor: number | null): Entitlement => ({
  live: true,
  source: "plan",
  allowance: { voiceSeconds: 9_000, chats: 50, alertSms: 50, outboundAttempts: 20 },
  overage: { enabled: true, currency: "USD", rates: { voiceMinute: 20, chat: 0, alertSms: 2, outboundAttempt: 2 }, capMinor },
  poolPartnerId: null,
  includedNumbers: 1,
});
const pro = (capMinor: number | null): Entitlement => ({
  live: true,
  source: "plan",
  allowance: { voiceSeconds: 30_000, chats: 200, alertSms: 200, outboundAttempts: 100 },
  overage: { enabled: true, currency: "USD", rates: { voiceMinute: 18, chat: 0, alertSms: 2, outboundAttempt: 2 }, capMinor },
  poolPartnerId: null,
  includedNumbers: 1,
});
const unlimitedAllowance = { voiceSeconds: null, chats: null, alertSms: null, outboundAttempts: null };
const noRates = { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 };
const enterprise: Entitlement = { live: true, source: "plan", allowance: unlimitedAllowance, overage: { enabled: true, currency: "USD", rates: noRates, capMinor: null }, poolPartnerId: null, includedNumbers: null };
const selfHosted: Entitlement = { live: false, source: "unlimited", allowance: unlimitedAllowance, overage: { enabled: false, currency: "USD", rates: noRates, capMinor: null }, poolPartnerId: null, includedNumbers: null };

const cloud = (account: Account | null): PlanCase => ({ deploymentMode: "cloud", account });
const directPlans: Array<[label: string, plan: PlanCase, expected: Entitlement]> = [
  ["Free with no billing account", cloud(null), free],
  ["Free", cloud({ plan: "free_cloud", subscriptionState: "active" }), free],
  ["Starter with a cap", cloud({ plan: "starter", subscriptionState: "active", overageSpendingCapCents: 2_500 }), starter(2_500)],
  ["Starter on a trial", cloud({ plan: "starter", subscriptionState: "trialing" }), starter(null)],
  ["Pro past due", cloud({ plan: "pro", subscriptionState: "past_due" }), pro(null)],
  ["Pro canceled", cloud({ plan: "pro", subscriptionState: "canceled" }), free],
  ["Starter revoked", cloud({ plan: "starter", subscriptionState: "revoked" }), free],
  ["Enterprise through Polar", cloud({ plan: "enterprise", subscriptionState: "active" }), enterprise],
  ["Enterprise on a managed plan", cloud({ source: "managed", plan: "enterprise", subscriptionState: "active" }), enterprise],
  ["an ended managed plan", cloud({ source: "managed", plan: "enterprise", subscriptionState: "canceled" }), free],
  ["a product no plan maps to", cloud({ plan: null, subscriptionState: "active" }), free],
  ["self-hosted", { deploymentMode: "self_hosted_standard", account: null }, selfHosted],
  ["self-hosted with its own billing account", { deploymentMode: "self_hosted_standard", account: { plan: "self_hosted_standard", subscriptionState: "active" } }, selfHosted],
  // live follows the billing account whatever the deployment mode, as the paid-plan check did. The SQL only asks it of cloud businesses.
  ["self-hosted with a live Starter account", { deploymentMode: "self_hosted_standard", account: { plan: "starter", subscriptionState: "active" } }, { ...selfHosted, live: true }],
];

describe.skipIf(!testUrl)("direct plan entitlements against dedicated PostgreSQL roles", () => {
  it.each(directPlans)("gives %s today's allowance, overage terms and included numbers", async (_label, plan, expected) => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await numberStepBusiness(tx);
      await setPlan(tx, businessId, plan);
      // The worker meters usage and the dashboard reads billing as the operator, each through row-level security.
      expect(await asWorker(tx, businessId, async (inner) => await loadEntitlement(inner, businessId))).toEqual(expected);
      expect(await as(tx, "lobbystack_app", async (db) => await withBusinessTransaction(db, { userId, businessId, actorType: "operator" }, async (inner) => await loadEntitlement(inner, businessId)))).toEqual(expected);
      expect(hasLiveEntitlement(plan.account)).toBe(expected.live);
      const [row] = (await tx.execute<{ live: boolean }>(sql`select app.has_live_entitlement(${businessId}::uuid) as live`)).rows;
      expect(row?.live).toBe(expected.live);
    });
  });

  it("answers live the same in TypeScript and in the number-claim SQL for every plan and subscription state", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await numberStepBusiness(tx);
      const answers: Array<{ plan: string | null; state: string | null; ts: boolean; loaded: boolean; sql: boolean | undefined }> = [];
      for (const plan of [null, "free_cloud", "starter", "pro", "enterprise", "self_host", "self_hosted_standard", "legacy_plan"]) {
        for (const state of [null, "active", "trialing", "past_due", "canceled", "revoked", "incomplete", "unpaid"]) {
          await setPlan(tx, businessId, cloud({ plan, subscriptionState: state }));
          const loaded = (await asWorker(tx, businessId, async (inner) => await loadEntitlement(inner, businessId))).live;
          const [row] = (await tx.execute<{ live: boolean }>(sql`select app.has_live_entitlement(${businessId}::uuid) as live`)).rows;
          answers.push({ plan, state, ts: hasLiveEntitlement({ plan, subscriptionState: state }), loaded, sql: row?.live });
        }
      }
      // The rule the paid-plan check applied: Starter, Pro or Enterprise on an active, trialing or past-due subscription.
      for (const answer of answers) {
        const paid = ["starter", "pro", "enterprise"].includes(answer.plan ?? "") && ["active", "trialing", "past_due"].includes(answer.state ?? "");
        expect(answer, `${answer.plan} ${answer.state}`).toEqual({ ...answer, ts: paid, loaded: paid, sql: paid });
      }
      await setPlan(tx, businessId, cloud(null));
      expect((await tx.execute<{ live: boolean }>(sql`select app.has_live_entitlement(${businessId}::uuid) as live`)).rows[0]?.live).toBe(false);
    });
  });
});

// The plans the number rules tell apart, and what each claim answers on them.
const numberPlans: Array<{ label: string; plan: PlanCase; trialOffered: boolean; dedicated: "allowed" | "dedicated_number_requires_paid_plan"; trial: "allowed" | "trial_not_needed" | "trial_not_available" }> = [
  { label: "Free", plan: cloud(null), trialOffered: true, dedicated: "dedicated_number_requires_paid_plan", trial: "allowed" },
  { label: "Starter", plan: cloud({ plan: "starter", subscriptionState: "active" }), trialOffered: false, dedicated: "allowed", trial: "trial_not_needed" },
  { label: "Pro past due", plan: cloud({ plan: "pro", subscriptionState: "past_due" }), trialOffered: false, dedicated: "allowed", trial: "trial_not_needed" },
  { label: "Enterprise on a managed plan", plan: cloud({ source: "managed", plan: "enterprise", subscriptionState: "active" }), trialOffered: false, dedicated: "allowed", trial: "trial_not_needed" },
  { label: "a canceled Pro plan", plan: cloud({ plan: "pro", subscriptionState: "canceled" }), trialOffered: true, dedicated: "dedicated_number_requires_paid_plan", trial: "allowed" },
  { label: "self-hosted", plan: { deploymentMode: "self_hosted_standard", account: null }, trialOffered: false, dedicated: "allowed", trial: "trial_not_available" },
  // trial_not_available comes before trial_not_needed.
  { label: "self-hosted with a live paid plan", plan: { deploymentMode: "self_hosted_standard", account: { plan: "starter", subscriptionState: "active" } }, trialOffered: false, dedicated: "allowed", trial: "trial_not_available" },
];
const starterPlan = cloud({ plan: "starter", subscriptionState: "active" });
const inventory = { listAvailablePhoneNumbers: async () => [{ phoneE164: testNumber(), countryCode: "CA", capabilities: { sms: true, voice: true } }] };

/** "allowed", or the refusal's code. */
async function outcome(attempt: Promise<unknown>): Promise<string> {
  return await attempt.then(() => "allowed", (error: { code?: string }) => error.code ?? String(error));
}

describe.skipIf(!testUrl)("number rules per direct plan against dedicated PostgreSQL roles", () => {
  it.each(numberPlans)("offers and claims numbers on $label as before", async ({ plan, trialOffered, dedicated, trial }) => {
    // Searching on the plan decides between a dedicated number and a free trial.
    await rollbackTest(async (tx) => {
      const owner = await numberStepBusiness(tx);
      await setPlan(tx, owner.businessId, plan);
      const search = await as(tx, "lobbystack_app", async (db) => await searchBusinessNumberInventory({ db }, { ...owner, claimTokenSecret }, inventory));
      expect(search.trial).toBe(trialOffered);
    });
    // A dedicated number picked on Starter, claimed once the business is on this plan.
    await rollbackTest(async (tx) => {
      const owner = await numberStepBusiness(tx);
      await setPlan(tx, owner.businessId, starterPlan);
      const { numbers } = await as(tx, "lobbystack_app", async (db) => await searchBusinessNumberInventory({ db }, { ...owner, claimTokenSecret }, inventory));
      await setPlan(tx, owner.businessId, plan);
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(reserveOnboardingNumberClaim({ db }, { ...owner, claimToken: numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() })))).toBe(dedicated);
    });
    // A trial number picked on Free, claimed once the business is on this plan.
    await rollbackTest(async (tx) => {
      const owner = await numberStepBusiness(tx);
      const { numbers } = await as(tx, "lobbystack_app", async (db) => await searchBusinessNumberInventory({ db }, { ...owner, claimTokenSecret }, inventory));
      await setPlan(tx, owner.businessId, plan);
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(reserveOnboardingNumberClaim({ db }, { ...owner, claimToken: numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() })))).toBe(trial);
    });
    // A replacement for the business's number: searching needs the plan, and so does claiming.
    await rollbackTest(async (tx) => {
      const owner = await numberStepBusiness(tx, { withNumber: true });
      await setPlan(tx, owner.businessId, plan);
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(searchBusinessNumberInventory({ db }, { ...owner, purpose: "replacement", claimTokenSecret }, inventory)))).toBe(dedicated);
      await setPlan(tx, owner.businessId, starterPlan);
      const { numbers } = await as(tx, "lobbystack_app", async (db) => await searchBusinessNumberInventory({ db }, { ...owner, purpose: "replacement", claimTokenSecret }, inventory));
      await setPlan(tx, owner.businessId, plan);
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(reserveReplacementNumberClaim({ db }, { ...owner, claimToken: numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() })))).toBe(dedicated);
    });
  });

  it.each(numberPlans)("answers API number claims on $label as before", async ({ plan, dedicated, trial }) => {
    await rollbackTest(async (tx) => {
      // One business per claim, since a reserved claim holds off the next one.
      const forTrial = await numberStepBusiness(tx);
      const forDedicated = await numberStepBusiness(tx);
      const withNumber = await numberStepBusiness(tx, { withNumber: true });
      for (const business of [forTrial, forDedicated, withNumber]) await setPlan(tx, business.businessId, plan);
      const offer = (business: typeof forTrial, purpose: NumberOffer["purpose"], trialNumber: boolean): NumberOffer => ({
        v: 1, purpose, businessId: business.businessId, userId: business.userId, e164: testNumber(), countryCode: "CA", kind: "local", capabilities: { sms: false, voice: true },
        selection: { countryCode: "CA", kind: "local", ...(trialNumber ? { trial: true, verifiedPhone: business.phone } : {}) }, exp: Date.now() + 60_000,
      });
      const claim = async (business: typeof forTrial, numberOffer: NumberOffer) => await outcome(asWorker(tx, business.businessId, async (inner) => await reserveApiNumberClaimInTransaction(inner, { businessId: business.businessId, userId: business.userId, offer: numberOffer, claimToken: randomUUID(), replacingPhoneNumberId: numberOffer.purpose === "replacement" ? business.phoneNumberId : null, quotaByBusiness: true, requestKey: randomUUID() })));
      expect(await claim(forTrial, offer(forTrial, "onboarding", true))).toBe(trial);
      expect(await claim(forDedicated, offer(forDedicated, "onboarding", false))).toBe(dedicated);
      expect(await claim(withNumber, offer(withNumber, "replacement", false))).toBe(dedicated);
    });
  });
});

/** Seeds usage this month, as the plan it was used on recorded it. */
async function seedUsage(tx: DatabaseTransaction, businessId: string, plan: string, usageKind: string, quantity: number, count = 1): Promise<void> {
  await tx.insert(billingUsageEvents).values(Array.from({ length: count }, () => ({ businessId, periodKey: periodKeyFor(), sourceKey: `${usageKind}:${randomUUID()}`, usageKind, quantity, isFinal: true, planAtRecordTime: plan, syncStatus: "skipped" })));
}

describe.skipIf(!testUrl)("usage limits per direct plan against dedicated PostgreSQL roles", () => {
  it("holds Free to its allowance, with no overage", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await numberStepBusiness(tx);
      // A canceled Pro plan meters as Free.
      await setPlan(tx, businessId, cloud({ plan: "pro", subscriptionState: "canceled" }));
      await seedUsage(tx, businessId, "free_cloud", "alert_sms_segments", 9);
      await seedUsage(tx, businessId, "free_cloud", "chat_ai_tokens", 1, 4);
      await seedUsage(tx, businessId, "free_cloud", "outbound_call_attempts", 1, 2);
      await asWorker(tx, businessId, async (inner) => {
        expect((await getVoiceSecondsLeftInTransaction(inner, { businessId })).seconds).toBe(1_800);
        expect(await reserveUsageInTransaction(inner, { businessId, usageKind: "voice_seconds", sourceKey: `voice:${randomUUID()}` })).toMatchObject({ allowed: true, quantity: 300, syncNeeded: false, plan: "free_cloud" });
        expect(await reserveUsageInTransaction(inner, { businessId, usageKind: "alert_sms_segments", sourceKey: `sms:${randomUUID()}`, quantity: 1 })).toMatchObject({ allowed: true, syncNeeded: false });
        expect(await reserveUsageInTransaction(inner, { businessId, usageKind: "alert_sms_segments", sourceKey: `sms:${randomUUID()}`, quantity: 1 })).toMatchObject({ allowed: false, errorCode: "alert_sms_limit_reached" });
        expect(await reserveUsageInTransaction(inner, { businessId, usageKind: "outbound_call_attempts", sourceKey: `outbound:${randomUUID()}`, quantity: 1 })).toMatchObject({ allowed: false, errorCode: "outbound_call_attempt_limit_reached" });
        expect(await reserveWidgetChatUsageInTransaction(inner, { businessId, conversationId: randomUUID() })).toEqual({ allowed: true, errorCode: null, plan: "free_cloud" });
        expect(await reserveWidgetChatUsageInTransaction(inner, { businessId, conversationId: randomUUID() })).toEqual({ allowed: false, errorCode: "chat_ai_limit_reached", plan: "free_cloud" });
      });
      await as(tx, "lobbystack_worker", async (db) => expect(await getWidgetChatAllowance({ db }, { businessId })).toEqual({ allowed: false, errorCode: "chat_ai_limit_reached", plan: "free_cloud" }));
    });
  });

  it("lets Starter and Pro go past the allowance at their rates, up to the cap, and syncs them to Polar", async () => {
    await rollbackTest(async (tx) => {
      const starterBusiness = (await numberStepBusiness(tx)).businessId;
      // $10 pays for 3,000 more seconds at 20 cents a minute, or 500 alert texts at 2 cents each.
      await setPlan(tx, starterBusiness, cloud({ plan: "starter", subscriptionState: "active", overageSpendingCapCents: 1_000 }));
      await seedUsage(tx, starterBusiness, "starter", "chat_ai_tokens", 1, 50);
      await asWorker(tx, starterBusiness, async (inner) => {
        expect((await getVoiceSecondsLeftInTransaction(inner, { businessId: starterBusiness })).seconds).toBe(12_000);
        expect(await reserveUsageInTransaction(inner, { businessId: starterBusiness, usageKind: "alert_sms_segments", sourceKey: `sms:${randomUUID()}`, quantity: 550 })).toMatchObject({ allowed: true, syncNeeded: true, plan: "starter" });
        expect(await reserveUsageInTransaction(inner, { businessId: starterBusiness, usageKind: "alert_sms_segments", sourceKey: `sms:${randomUUID()}`, quantity: 1 })).toMatchObject({ allowed: false, errorCode: "alert_sms_limit_reached" });
        // Spend at the cap leaves the included seconds and no more, and a chat past the 50 included still goes through.
        expect((await getVoiceSecondsLeftInTransaction(inner, { businessId: starterBusiness })).seconds).toBe(9_000);
        expect(await reserveWidgetChatUsageInTransaction(inner, { businessId: starterBusiness, conversationId: randomUUID() })).toEqual({ allowed: true, errorCode: null, plan: "starter" });
      });

      const proBusiness = (await numberStepBusiness(tx)).businessId;
      // $1.80 pays for 600 more seconds at 18 cents a minute.
      await setPlan(tx, proBusiness, cloud({ plan: "pro", subscriptionState: "past_due", overageSpendingCapCents: 180 }));
      await asWorker(tx, proBusiness, async (inner) => {
        expect((await getVoiceSecondsLeftInTransaction(inner, { businessId: proBusiness })).seconds).toBe(30_600);
        expect(await reserveUsageInTransaction(inner, { businessId: proBusiness, usageKind: "outbound_call_attempts", sourceKey: `outbound:${randomUUID()}`, quantity: 101 })).toMatchObject({ allowed: true, syncNeeded: true, plan: "pro" });
      });
    });
  });

  it("gives Enterprise and self-hosted businesses no limit, reserves browser calls only on Enterprise, and syncs neither", async () => {
    await rollbackTest(async (tx) => {
      const enterpriseBusiness = (await numberStepBusiness(tx)).businessId;
      await setPlan(tx, enterpriseBusiness, cloud({ source: "managed", plan: "enterprise", subscriptionState: "active" }));
      const selfHostedBusiness = (await numberStepBusiness(tx)).businessId;
      await setPlan(tx, selfHostedBusiness, { deploymentMode: "self_hosted_standard", account: null });
      const callIds = { [enterpriseBusiness]: randomUUID(), [selfHostedBusiness]: randomUUID() };
      for (const [businessId, plan] of [[enterpriseBusiness, "enterprise"], [selfHostedBusiness, "self_host"]] as const) {
        await asWorker(tx, businessId, async (inner) => {
          expect((await getVoiceSecondsLeftInTransaction(inner, { businessId })).seconds).toBe(Number.POSITIVE_INFINITY);
          // A phone call on an unlimited plan reserves nothing.
          expect(await reserveUsageInTransaction(inner, { businessId, usageKind: "voice_seconds", sourceKey: `voice:${randomUUID()}` })).toEqual({ allowed: true, errorCode: null, syncNeeded: false, periodKey: periodKeyFor(), plan });
          expect(await reserveUsageInTransaction(inner, { businessId, usageKind: "alert_sms_segments", sourceKey: `sms:${randomUUID()}`, quantity: 1_000 })).toMatchObject({ allowed: true, syncNeeded: false, plan });
          expect(await reserveWebVoiceUsageInTransaction(inner, { businessId, callId: callIds[businessId]! })).toEqual({ allowed: true, errorCode: null, maxDurationMs: 300_000, plan });
        });
        await as(tx, "lobbystack_worker", async (db) => expect(await getWebVoiceBillingAllowance({ db }, { businessId })).toEqual({ allowed: true, errorCode: null, maxDurationMs: 300_000, plan }));
      }
      const browserCall = async (businessId: string) => await tx.select({ quantity: billingUsageEvents.quantity, syncStatus: billingUsageEvents.syncStatus }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.sourceKey, `voice:${callIds[businessId]}`)));
      expect(await browserCall(enterpriseBusiness)).toEqual([{ quantity: 300, syncStatus: "skipped" }]);
      expect(await browserCall(selfHostedBusiness)).toEqual([]);
    });
  });
});
