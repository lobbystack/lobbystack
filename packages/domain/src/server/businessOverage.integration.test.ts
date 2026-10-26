import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, billingAccounts, billingUsageEvents, businesses, businessMemberships, createDatabaseClient, partnerBillingAccounts, partnerMembers, partnerPackages, partners, partnerStripeAccounts, partnerUsageMonths, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";
import { partnerTierCatalog, type PartnerTierSlug } from "@lobbystack/shared";

import { getWebVoiceBillingAllowance, getWidgetChatAllowance, reserveWidgetChatUsageInTransaction } from "./billing";
import { loadEntitlement } from "./entitlement";
import { setPartnerBusinessOverage, type PartnerBusinessOverageInput } from "./packageBilling";
import { setPartnerPoolOverage } from "./partnerBilling";
import { listPartnerBusinesses, releaseBusiness, type PartnerMemberActor } from "./partners";
import { correctUsageInTransaction, readAllowanceUsageInTransaction, readUsageStatusInTransaction, readVoiceSecondsLeftInTransaction, reserveUsageInTransaction } from "./usage";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Business overage integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

// The Polar products a host sells tiers with. With all six set, the deployment bills tiers and pools have limits.
const TIER_PRODUCTS = Object.fromEntries(["STARTER", "GROWTH", "SCALE"].flatMap((tier) => ["MONTHLY", "ANNUAL"].map((interval) => [`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier.toLowerCase()}_${interval.toLowerCase()}`])));

function sellTiers(): void {
  for (const [name, value] of Object.entries(TIER_PRODUCTS)) vi.stubEnv(name, value);
}

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  // Partner features read these to turn Stripe Connect on; the fake stands in for Stripe itself.
  vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "sk_test_overage");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_overage");
  for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
});
afterEach(() => { vi.unstubAllEnvs(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

/** Runs one step as the worker role, as calls, chats and the worker do. Security-definer functions trust session_user, so this switches it. */
async function asWorkerRole<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

/** The same, inside the business's RLS context. */
async function asWorker<T>(tx: DatabaseTransaction, businessId: string, run: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await asWorkerRole(tx, async (db) => await withBusinessTransaction(db, { businessId, actorType: "worker" }, run));
}

/** Runs one step as the app's own session, as the admin does. */
async function asApp<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_app`);
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

type Seeded = {
  partnerId: string;
  owner: PartnerMemberActor;
  admin: PartnerMemberActor;
  member: PartnerMemberActor;
  /** Billed outside LobbyStack. */
  harbor: string;
  /** On the Front desk package, whose subscription pays. */
  cedar: string;
  packageId: string;
};

/**
 * A partner with an owner, an admin and a member, made as the migrator. Its
 * connected Stripe account is Canadian, and its Front desk package sells 10
 * minutes and 3 chats a month in CAD. Harbor is billed outside LobbyStack,
 * and Cedar pays for Front desk. With a tier, the partner pays for it through
 * Polar, with pool overage on and no cap unless it says otherwise.
 */
async function seedPartner(db: DatabaseTransaction, input: { tier?: PartnerTierSlug; poolOverage?: { enabled: boolean; capCents: number | null } } = {}): Promise<Seeded> {
  const partnerId = randomUUID();
  const [ownerId, adminId, memberId] = [randomUUID(), randomUUID(), randomUUID()];
  await db.insert(users).values([ownerId, adminId, memberId].map((id) => ({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid`, name: "Overage Person", emailVerified: true })));
  await db.insert(partners).values({ id: partnerId, name: "Overage Reception", slug: `overage-${partnerId.slice(0, 8)}` });
  await db.insert(partnerMembers).values([{ partnerId, userId: ownerId, role: "owner" }, { partnerId, userId: adminId, role: "admin" }, { partnerId, userId: memberId, role: "member" }]);
  const [harbor, cedar] = [randomUUID(), randomUUID()];
  await db.insert(businesses).values([harbor, cedar].map((id) => ({ id, slug: `overage-${id}`, name: id === harbor ? "Harbor Dental" : "Cedar Clinic", timezone: "America/Toronto", businessType: "test", deploymentMode: "cloud", onboardingStage: "complete", partnerId })));
  const accountId = `acct_${partnerId.slice(0, 8)}`;
  await db.insert(partnerStripeAccounts).values({ partnerId, stripeAccountId: accountId, currency: "CAD", chargesEnabled: true, detailsSubmitted: true });
  const [front] = await db.insert(partnerPackages).values({ partnerId, name: "Front desk", currency: "CAD", monthlyPriceMinor: 4_900, voiceMinutes: 10, chats: 3, stripeAccountId: accountId, stripeProductId: "prod_front", stripePriceId: "price_front" }).returning({ id: partnerPackages.id });
  await db.insert(billingAccounts).values({ businessId: cedar, billingKey: `business:${cedar}`, packageId: front!.id, stripeAccountId: accountId, stripeCustomerId: "cus_cedar", stripeSubscriptionId: "sub_cedar", stripeSubscriptionState: "active" });
  if (input.tier) {
    const terms = partnerTierCatalog[input.tier];
    await db.insert(partnerBillingAccounts).values({
      partnerId,
      billingKey: `partner:${partnerId}`,
      ...(input.tier === "free" ? {} : { customerId: "cus_pool", subscriptionId: "sub_pool", subscriptionState: "active", billingInterval: "monthly" as const }),
      tier: input.tier,
      poolVoiceSeconds: terms.poolVoiceSeconds,
      poolChats: terms.poolChats,
      includedNumbers: terms.includedNumbers,
      poolOverageEnabled: input.poolOverage?.enabled ?? true,
      poolOverageCapCents: input.poolOverage?.capCents ?? null,
    });
  }
  const actor = (userId: string, role: "owner" | "admin" | "member"): PartnerMemberActor => ({ kind: "member", partnerId, userId, role });
  return { partnerId, owner: actor(ownerId, "owner"), admin: actor(adminId, "admin"), member: actor(memberId, "member"), harbor, cedar, packageId: front!.id };
}

const stripe = new FakeStripeConnect();

/** Sets a business's overage from the console, as the app does for an owner or admin. */
async function setOverage(tx: DatabaseTransaction, actor: PartnerMemberActor | { kind: "key"; partnerId: string; platformKeyId: string }, input: PartnerBusinessOverageInput, context: { stripeConnect?: FakeStripeConnect } = { stripeConnect: stripe }) {
  return await asApp(tx, async (db) => await setPartnerBusinessOverage({ db, ...context }, actor, input));
}

/** A finished call of this many seconds, recorded the way a call's end corrects its reservation. */
async function finishedCall(tx: DatabaseTransaction, businessId: string, seconds: number): Promise<string> {
  const sourceKey = `voice:${randomUUID()}`;
  await asWorker(tx, businessId, async (inner) => await correctUsageInTransaction(inner, { businessId, sourceKey, usageKind: "voice_seconds", quantity: seconds }));
  return sourceKey;
}

/** A phone call's first reservation, as the live webhook makes it before it answers. */
async function phoneCall(tx: DatabaseTransaction, businessId: string, callId = randomUUID()) {
  return { sourceKey: `voice:${callId}`, ...await asWorker(tx, businessId, async (inner) => await reserveUsageInTransaction(inner, { businessId, usageKind: "voice_seconds", sourceKey: `voice:${callId}` })) };
}

/** The call's end, at this many seconds. */
async function endCall(tx: DatabaseTransaction, businessId: string, sourceKey: string, seconds: number): Promise<void> {
  await asWorker(tx, businessId, async (inner) => await correctUsageInTransaction(inner, { businessId, sourceKey, usageKind: "voice_seconds", quantity: seconds }));
}

async function websiteChat(tx: DatabaseTransaction, businessId: string) {
  return await asWorker(tx, businessId, async (inner) => await reserveWidgetChatUsageInTransaction(inner, { businessId, conversationId: randomUUID() }));
}

async function chatOffered(tx: DatabaseTransaction, businessId: string) {
  return await asWorkerRole(tx, async (db) => await getWidgetChatAllowance({ db }, { businessId }));
}

async function secondsLeft(tx: DatabaseTransaction, businessId: string): Promise<number> {
  return (await asWorker(tx, businessId, async (inner) => await readVoiceSecondsLeftInTransaction(inner, { businessId }))).seconds;
}

async function entitlementOf(tx: DatabaseTransaction, businessId: string) {
  return await asWorker(tx, businessId, async (inner) => await loadEntitlement(inner, businessId));
}

async function usageEvent(tx: DatabaseTransaction, businessId: string, sourceKey: string) {
  const [event] = await tx.select({ quantity: billingUsageEvents.quantity, isFinal: billingUsageEvents.isFinal, termsAtRecordTime: billingUsageEvents.termsAtRecordTime, businessOverageQuantity: billingUsageEvents.businessOverageQuantity, businessOverageMinor: billingUsageEvents.businessOverageMinor, poolOverageQuantity: billingUsageEvents.poolOverageQuantity, poolOverageCents: billingUsageEvents.poolOverageCents })
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.sourceKey, sourceKey)));
  return event;
}

async function lastChat(tx: DatabaseTransaction, businessId: string) {
  const rows = await tx.select({ businessOverageQuantity: billingUsageEvents.businessOverageQuantity, businessOverageMinor: billingUsageEvents.businessOverageMinor, termsAtRecordTime: billingUsageEvents.termsAtRecordTime, createdAt: billingUsageEvents.createdAt })
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.usageKind, "chat_ai_tokens")));
  return rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
}

// Front desk's overage in these tests: 30 cents a minute, which is half a cent a second, and 10 cents a chat.
const FRONT_DESK_OVERAGE = { enabled: true, voiceMinuteRateMinor: 30, chatRateMinor: 10 };

describe.skipIf(!client)("a business's overage on its package", () => {
  it("lets a business on a package go past its allowance up to its cap, then falls back as an exhausted pool does", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx);
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 400 });
      expect((await entitlementOf(tx, acme.cedar)).overage).toEqual({ enabled: true, currency: "CAD", rates: { voiceMinute: 30, chat: 10, alertSms: 0, outboundAttempt: 0 }, capMinor: 400 });

      // Cedar's 10 minutes are used up. The cap's 400 cents still pay for 800 seconds.
      const included = await finishedCall(tx, acme.cedar, 600);
      expect(await usageEvent(tx, acme.cedar, included)).toMatchObject({ businessOverageQuantity: 0, businessOverageMinor: 0 });
      expect(await secondsLeft(tx, acme.cedar)).toBe(800);

      // Its 3 chats cost nothing, and the 4th costs 10 cents.
      for (let index = 0; index < 3; index++) expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
      expect(await lastChat(tx, acme.cedar)).toMatchObject({ businessOverageQuantity: 0, businessOverageMinor: 0 });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
      const priced = await lastChat(tx, acme.cedar);
      expect(priced).toMatchObject({ businessOverageQuantity: 1, businessOverageMinor: 10 });
      // The chat records the terms in force when it happened.
      expect(priced!.termsAtRecordTime).toMatchObject({ source: "package", allowance: { voiceSeconds: 600, chats: 3 }, overage: { enabled: true, currency: "CAD", rates: { voiceMinute: 30, chat: 10 }, capMinor: 400 } });

      // A call past the allowance reserves a slice, and records its overage when it ends.
      const first = await phoneCall(tx, acme.cedar);
      expect(first).toMatchObject({ allowed: true, quantity: 300 });
      expect(await usageEvent(tx, acme.cedar, first.sourceKey)).toMatchObject({ isFinal: false, businessOverageQuantity: null });
      await endCall(tx, acme.cedar, first.sourceKey, 600);
      expect(await usageEvent(tx, acme.cedar, first.sourceKey)).toMatchObject({ isFinal: true, businessOverageQuantity: 600, businessOverageMinor: 300 });

      // 310 cents are spent, so the next call gets the 180 seconds the last 90 pay for, and holds them while it runs.
      const second = await phoneCall(tx, acme.cedar);
      expect(second).toMatchObject({ allowed: true, quantity: 180 });

      // At the cap, calls forward and chat shows its message.
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await asWorkerRole(tx, async (db) => await getWebVoiceBillingAllowance({ db }, { businessId: acme.cedar }))).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await chatOffered(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await asWorker(tx, acme.cedar, async (inner) => await readAllowanceUsageInTransaction(inner, { businessId: acme.cedar }))).toMatchObject({ voiceSeconds: { used: 1_380, included: 600, blocked: true }, chats: { used: 4, included: 3, blocked: true } });

      // The open call ends at a minute, which gives back what it held past that: a chat fits under the cap again.
      await endCall(tx, acme.cedar, second.sourceKey, 60);
      expect(await usageEvent(tx, acme.cedar, second.sourceKey)).toMatchObject({ businessOverageQuantity: 60, businessOverageMinor: 30 });
      expect(await chatOffered(tx, acme.cedar)).toMatchObject({ allowed: true });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
    });
  });

  it("keeps sending alert texts and transfers once its spend is past the cap, since a package doesn't sell them", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx);
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 400 });
      const alertText = async () => await asWorker(tx, acme.cedar, async (inner) => await reserveUsageInTransaction(inner, { businessId: acme.cedar, usageKind: "alert_sms_segments", sourceKey: `sms:${randomUUID()}`, quantity: 1 }));
      const transfer = async () => await asWorker(tx, acme.cedar, async (inner) => await reserveUsageInTransaction(inner, { businessId: acme.cedar, usageKind: "outbound_call_attempts", sourceKey: `outbound_call:${randomUUID()}`, quantity: 1 }));
      const status = async () => await asWorker(tx, acme.cedar, async (inner) => await readUsageStatusInTransaction(inner, { businessId: acme.cedar }));

      // 300 of the 400 cents are spent, so the next call holds the 200 seconds the last 100 pay for.
      await finishedCall(tx, acme.cedar, 600);
      await finishedCall(tx, acme.cedar, 600);
      const last = await phoneCall(tx, acme.cedar);
      expect(last).toMatchObject({ allowed: true, quantity: 200 });
      // The provider's final count runs a second past that, which takes the spend past the cap.
      await endCall(tx, acme.cedar, last.sourceKey, 201);
      expect(await status()).toMatchObject({ overageSpendCents: 401, overageSpendingCapReached: true, voiceBlocked: true, alertSmsBlocked: false, outboundCallAttemptsBlocked: false });
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await alertText()).toMatchObject({ allowed: true });
      expect(await transfer()).toMatchObject({ allowed: true });

      // The partner lowers the cap below what Cedar already spent: still only minutes and chats stop.
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 200 });
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await alertText()).toMatchObject({ allowed: true });
      expect(await transfer()).toMatchObject({ allowed: true });
      expect(await status()).toMatchObject({ alertSmsBlocked: false, outboundCallAttemptsBlocked: false });
    });
  });

  it("keeps metering a business whose uncapped overage costs more than the month's spend column holds", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx);
      // The highest rate the console takes, with no cap: 30 minutes past the allowance cost about 3 billion cents.
      await setOverage(tx, acme.admin, { businessId: acme.cedar, enabled: true, voiceMinuteRateMinor: 99_999_999, chatRateMinor: 0, capMinor: null });
      await finishedCall(tx, acme.cedar, 600);
      const costly = await finishedCall(tx, acme.cedar, 1_800);
      expect(await usageEvent(tx, acme.cedar, costly)).toMatchObject({ businessOverageQuantity: 1_800, businessOverageMinor: 2_999_999_970 });
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: true });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
    });
  });

  it("stops at the allowance with overage off, and keeps the rates and cap for when it's on again", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx);
      // Overage starts off, so Front desk's minutes and chats are all Cedar gets.
      expect((await entitlementOf(tx, acme.cedar)).overage).toEqual({ enabled: false, currency: "CAD", rates: { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 }, capMinor: null });
      await setOverage(tx, acme.owner, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 400 });
      const off = await setOverage(tx, acme.owner, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, enabled: false, capMinor: 400 });
      expect(off).toEqual({ kind: "package", packageId: acme.packageId, packageName: "Front desk", status: "active", overage: { enabled: false, currency: "CAD", voiceMinuteRateMinor: 30, chatRateMinor: 10, capMinor: 400 } });
      expect((await entitlementOf(tx, acme.cedar)).overage).toMatchObject({ enabled: false, rates: { voiceMinute: 0, chat: 0 }, capMinor: null });

      await finishedCall(tx, acme.cedar, 600);
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      for (let index = 0; index < 3; index++) expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
      expect(await chatOffered(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });

      // Turned on again with no cap, nothing but the pool stops it, and nothing limits the pool without tier billing.
      await setOverage(tx, acme.owner, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: null });
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: true, quantity: 300 });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
    });
  });

  it("gives a business whose subscription stopped paying no overage, whatever the partner set", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx);
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: null });
      await tx.update(billingAccounts).set({ stripeSubscriptionState: "canceled" }).where(eq(billingAccounts.businessId, acme.cedar));
      expect(await entitlementOf(tx, acme.cedar)).toMatchObject({ live: false, allowance: { voiceSeconds: 0, chats: 0 }, overage: { enabled: false, capMinor: null } });
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
    });
  });

  it("draws on the business's overage and the partner's pool at once, and falls back when either runs out", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      // Starter's pool: 15,000 seconds and 1,000 chats, then 20 cents a minute with no cap.
      const acme = await seedPartner(tx, { tier: "starter" });
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: null });
      await finishedCall(tx, acme.harbor, 14_000);
      await finishedCall(tx, acme.cedar, 600);

      // One call goes past Cedar's allowance and past the pool: Cedar owes its partner for 600 seconds, and the partner owes the host for 200.
      const call = await phoneCall(tx, acme.cedar);
      expect(call).toMatchObject({ allowed: true, quantity: 300 });
      await endCall(tx, acme.cedar, call.sourceKey, 600);
      const event = await usageEvent(tx, acme.cedar, call.sourceKey);
      expect(event).toMatchObject({ businessOverageQuantity: 600, businessOverageMinor: 300, poolOverageQuantity: 200 });
      expect(event!.poolOverageCents).toBeCloseTo(200 / 3, 6);
      expect(event!.termsAtRecordTime).toMatchObject({ source: "package", overage: { enabled: true, currency: "CAD", rates: { voiceMinute: 30, chat: 10 } }, pool: { partnerId: acme.partnerId, tier: "starter", voiceSeconds: 15_000 } });

      // With pool overage off, the pool is spent, so Cedar falls back however much overage it may still have.
      await asApp(tx, async (db) => await setPartnerPoolOverage({ db }, acme.owner, { enabled: false, capCents: null }));
      expect(await secondsLeft(tx, acme.cedar)).toBe(0);
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      await tx.update(partnerUsageMonths).set({ chatsUsed: 1_000 }).where(eq(partnerUsageMonths.partnerId, acme.partnerId));
      expect(await chatOffered(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });

      // With pool overage back on, the pool has room again, and Cedar's own cap of the 300 cents it spent stops it instead.
      await asApp(tx, async (db) => await setPartnerPoolOverage({ db }, acme.owner, { enabled: true, capCents: null }));
      expect(await phoneCall(tx, acme.harbor)).toMatchObject({ allowed: true, quantity: 300 });
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 300 });
      expect(await phoneCall(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      for (let index = 0; index < 3; index++) expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: true });
      expect(await websiteChat(tx, acme.cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await websiteChat(tx, acme.harbor)).toMatchObject({ allowed: true });
    });
  });

  it("prices usage by the terms it recorded, so new rates don't reprice the month or a call already running", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx);
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 600 });
      await finishedCall(tx, acme.cedar, 600);
      const ended = await phoneCall(tx, acme.cedar);
      await endCall(tx, acme.cedar, ended.sourceKey, 600);
      const running = await phoneCall(tx, acme.cedar);
      expect(running).toMatchObject({ allowed: true, quantity: 300 });

      // At 60 cents a minute, the 300 cents spent and the 150 the running call holds leave 150 seconds, not none.
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, voiceMinuteRateMinor: 60, capMinor: 600 });
      expect(await secondsLeft(tx, acme.cedar)).toBe(150);
      await endCall(tx, acme.cedar, running.sourceKey, 300);
      const event = await usageEvent(tx, acme.cedar, running.sourceKey);
      expect(event).toMatchObject({ businessOverageQuantity: 300, businessOverageMinor: 150 });
      expect(event!.termsAtRecordTime).toMatchObject({ overage: { rates: { voiceMinute: 30 }, capMinor: 600 } });
      // A call that starts now records, and pays, the new rate.
      const next = await phoneCall(tx, acme.cedar);
      expect(next).toMatchObject({ allowed: true, quantity: 150 });
      await endCall(tx, acme.cedar, next.sourceKey, 120);
      expect(await usageEvent(tx, acme.cedar, next.sourceKey)).toMatchObject({ businessOverageQuantity: 120, businessOverageMinor: 120 });
    });
  });

  it("lets only the partner's owners and admins set it, on a business that pays for a package, and records each change", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx);
      const other = await seedPartner(tx);
      const saved = await setOverage(tx, acme.admin, { businessId: acme.cedar, enabled: true, voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: 5_000 });
      const overage = { enabled: true, currency: "CAD", voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: 5_000 };
      expect(saved).toEqual({ kind: "package", packageId: acme.packageId, packageName: "Front desk", status: "active", overage });
      // Owners and admins see it on the Businesses page; members see no billing at all.
      const listed = await asApp(tx, async (db) => await listPartnerBusinesses({ db, stripeConnect: stripe }, acme.admin));
      expect(listed.find((business) => business.businessId === acme.cedar)?.billing).toEqual(saved);
      expect(listed.find((business) => business.businessId === acme.harbor)?.billing).toEqual({ kind: "outside" });
      expect((await asApp(tx, async (db) => await listPartnerBusinesses({ db, stripeConnect: stripe }, acme.member))).every((business) => business.billing === null)).toBe(true);

      const audit = await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, acme.cedar), eq(auditLogs.eventType, "partner.business_overage_changed")));
      expect(audit).toEqual([{ actorUserId: acme.admin.userId, payload: { partnerId: acme.partnerId, currency: "CAD", enabled: true, voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: 5_000 } }]);
      // Saving the same terms again changes nothing, so the audit log has nothing new.
      await setOverage(tx, acme.owner, { businessId: acme.cedar, enabled: true, voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: 5_000 });
      expect(await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, acme.cedar), eq(auditLogs.eventType, "partner.business_overage_changed")))).toHaveLength(1);

      const input = { businessId: acme.cedar, enabled: false, voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: null };
      expect(await refusal(setOverage(tx, acme.member, input))).toMatchObject({ status: 403 });
      expect(await refusal(setOverage(tx, { kind: "key", partnerId: acme.partnerId, platformKeyId: randomUUID() }, input))).toMatchObject({ status: 403 });
      // Another partner's admin can't reach the business, and a business billed outside LobbyStack has nothing to bill overage on.
      expect(await refusal(setOverage(tx, other.admin, input))).toMatchObject({ status: 404, code: "business_not_found" });
      expect(await refusal(setOverage(tx, acme.admin, { ...input, businessId: acme.harbor }))).toMatchObject({ status: 409, code: "billed_outside" });
      expect(await refusal(setOverage(tx, acme.admin, input, {}))).toMatchObject({ status: 409, code: "stripe_not_configured" });
      for (const rate of [-1, 2.5, "25", 100_000_000, null]) {
        expect(await refusal(setOverage(tx, acme.admin, { ...input, voiceMinuteRateMinor: rate }))).toMatchObject({ status: 400, code: "invalid_overage_rate" });
      }
      for (const capMinor of [-1, 0.5, "5000", 100_000_000]) {
        expect(await refusal(setOverage(tx, acme.admin, { ...input, capMinor }))).toMatchObject({ status: 400, code: "invalid_overage_cap" });
      }
      expect(await refusal(setOverage(tx, acme.admin, { ...input, enabled: "yes" }))).toMatchObject({ status: 400, code: "invalid_overage" });
      expect((await entitlementOf(tx, acme.cedar)).overage).toMatchObject({ enabled: true, rates: { voiceMinute: 25, chat: 5 }, capMinor: 5_000 });
    });
  });

  it("keeps the business's own team from changing its overage, and drops it when the business leaves its partner", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx);
      const ownerId = randomUUID();
      await tx.insert(users).values({ id: ownerId, email: `${ownerId}@example.invalid`, normalizedEmail: `${ownerId}@example.invalid`, name: "Cedar Owner", emailVerified: true });
      await tx.insert(businessMemberships).values({ businessId: acme.cedar, userId: ownerId, role: "business_owner" });
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 400 });

      // The business's owner passes the billing account's RLS policy, but can't raise their own cap or turn overage on.
      for (const change of [{ overageCapMinor: 100_000 }, { overageVoiceMinuteRateMinor: 0 }, { overageEnabled: false }]) {
        const write = asApp(tx, async (db) => await withBusinessTransaction(db, { userId: ownerId, businessId: acme.cedar, actorType: "operator" }, async (inner) => await inner.update(billingAccounts).set(change).where(eq(billingAccounts.businessId, acme.cedar))));
        expect(await refusal(write)).toMatchObject({ code: "42501", message: "package_billing_locked" });
      }

      // Terms set in another currency than the package's don't hold: the partner sets them again in the package's.
      await tx.update(billingAccounts).set({ overageCurrency: "USD" }).where(eq(billingAccounts.businessId, acme.cedar));
      expect((await entitlementOf(tx, acme.cedar)).overage).toMatchObject({ enabled: false, currency: "CAD", capMinor: null });
      const listed = await asApp(tx, async (db) => await listPartnerBusinesses({ db, stripeConnect: stripe }, acme.owner));
      expect(listed.find((business) => business.businessId === acme.cedar)?.billing).toMatchObject({ overage: { enabled: false, currency: "CAD", voiceMinuteRateMinor: 0, chatRateMinor: 0, capMinor: null } });
      await setOverage(tx, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 400 });

      // Released to its owner, the business is direct: it pays the host, and keeps none of its partner's overage.
      await tx.update(billingAccounts).set({ stripeSubscriptionState: "canceled" }).where(eq(billingAccounts.businessId, acme.cedar));
      await asApp(tx, async (db) => await releaseBusiness({ db, stripeConnect: stripe }, acme.admin, { businessId: acme.cedar }));
      const [account] = await tx.select({ overageEnabled: billingAccounts.overageEnabled, overageCurrency: billingAccounts.overageCurrency, overageVoiceMinuteRateMinor: billingAccounts.overageVoiceMinuteRateMinor, overageChatRateMinor: billingAccounts.overageChatRateMinor, overageCapMinor: billingAccounts.overageCapMinor }).from(billingAccounts).where(eq(billingAccounts.businessId, acme.cedar));
      expect(account).toEqual({ overageEnabled: false, overageCurrency: null, overageVoiceMinuteRateMinor: 0, overageChatRateMinor: 0, overageCapMinor: null });
      expect(await entitlementOf(tx, acme.cedar)).toMatchObject({ source: "plan", allowance: { voiceSeconds: 1_800 }, overage: { enabled: false, currency: "USD" } });
    });
  });
});
