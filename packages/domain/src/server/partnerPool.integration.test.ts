import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingAccounts, billingUsageEvents, businesses, calls, createDatabaseClient, numberTrials, outboxMessages, partnerBillingAccounts, partnerDomains, partnerMembers, partnerPackages, partners, partnerStripeAccounts, partnerTierBilling, partnerUsageMonths, phoneNumbers, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { partnerTierCatalog, type PartnerTierSlug } from "@lobbystack/shared";

import { getWebVoiceBillingAllowance, getWidgetChatAllowance, loadPoolUsageEvent, reserveWebVoiceUsageInTransaction, reserveWidgetChatUsageInTransaction } from "./billing";
import { startLivePhoneCall } from "./liveCalls";
import { checkNumberTrialMinutes, markNumberTrialMinutesExhausted } from "./numberTrials";
import { getPartnerBilling, partnerHasBillingPage, setPartnerHostPool, setPartnerPoolOverage } from "./partnerBilling";
import { PARTNER_MAX_SIMULTANEOUS_CALLS } from "./partnerPool";
import { deletePartnerBusiness } from "./partners";
import { correctUsageInTransaction, enqueueUsageSyncInTransaction, extendPhoneReservationInTransaction, periodKeyFor, reserveUsageInTransaction } from "./usage";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner pool integration tests require a dedicated local test database.");
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
  vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
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

type Seeded = { partnerId: string; businessIds: string[]; ownerId: string; adminId: string };

/**
 * A partner on a tier, with its businesses billed outside LobbyStack and an
 * owner and an admin on its team, made as the migrator. A partner on a paid
 * tier pays through Polar's customer cus_pool.
 */
async function seedPartner(db: Database | DatabaseTransaction, input: { tier: PartnerTierSlug; businesses: number; overage?: { enabled: boolean; capCents: number | null } }): Promise<Seeded> {
  const partnerId = randomUUID();
  const [ownerId, adminId] = [randomUUID(), randomUUID()];
  await db.insert(users).values([ownerId, adminId].map((id) => ({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid`, name: "Pool Person", emailVerified: true })));
  await db.insert(partners).values({ id: partnerId, name: "Pool Reception", slug: `pool-${partnerId.slice(0, 8)}` });
  await db.insert(partnerMembers).values([{ partnerId, userId: ownerId, role: "owner" }, { partnerId, userId: adminId, role: "admin" }]);
  const businessIds = Array.from({ length: input.businesses }, () => randomUUID());
  await db.insert(businesses).values(businessIds.map((id) => ({ id, slug: `pool-${id}`, name: "Pool Clinic", timezone: "America/Toronto", businessType: "test", deploymentMode: "cloud", onboardingStage: "complete", partnerId })));
  const terms = partnerTierCatalog[input.tier];
  if (input.tier !== "free" || input.overage) {
    await db.insert(partnerBillingAccounts).values({
      partnerId,
      billingKey: `partner:${partnerId}`,
      ...(input.tier === "free" ? {} : { customerId: "cus_pool", subscriptionId: "sub_pool", subscriptionState: "active", billingInterval: "monthly" as const }),
      tier: input.tier,
      poolVoiceSeconds: terms.poolVoiceSeconds,
      poolChats: terms.poolChats,
      includedNumbers: terms.includedNumbers,
      poolOverageEnabled: input.overage?.enabled ?? true,
      poolOverageCapCents: input.overage?.capCents ?? null,
    });
  }
  return { partnerId, businessIds, ownerId, adminId };
}

/** A finished call of this many seconds, recorded the way a call's end corrects its reservation. */
async function finishedCall(tx: DatabaseTransaction, businessId: string, seconds: number): Promise<string> {
  const sourceKey = `voice:${randomUUID()}`;
  await asWorker(tx, businessId, async (inner) => await correctUsageInTransaction(inner, { businessId, sourceKey, usageKind: "voice_seconds", quantity: seconds }));
  return sourceKey;
}

/** A phone call's first reservation, as the live webhook makes it before it answers. */
async function phoneCall(tx: DatabaseTransaction, businessId: string, callId = randomUUID()) {
  return await asWorker(tx, businessId, async (inner) => await reserveUsageInTransaction(inner, { businessId, usageKind: "voice_seconds", sourceKey: `voice:${callId}` }));
}

async function websiteChat(tx: DatabaseTransaction, businessId: string) {
  return await asWorker(tx, businessId, async (inner) => await reserveWidgetChatUsageInTransaction(inner, { businessId, conversationId: randomUUID() }));
}

/** The pool's counts this month, read as the migrator. */
async function poolCounts(db: Database | DatabaseTransaction, partnerId: string) {
  const [month] = await db.select({ voiceSecondsUsed: partnerUsageMonths.voiceSecondsUsed, voiceSecondsFinal: partnerUsageMonths.voiceSecondsFinal, chatsUsed: partnerUsageMonths.chatsUsed, overageVoiceSeconds: partnerUsageMonths.overageVoiceSeconds, overageChats: partnerUsageMonths.overageChats, overageSpendCents: partnerUsageMonths.overageSpendCents })
    .from(partnerUsageMonths)
    .where(and(eq(partnerUsageMonths.partnerId, partnerId), eq(partnerUsageMonths.periodKey, periodKeyFor())));
  return month;
}

async function usageEvent(tx: DatabaseTransaction, businessId: string, sourceKey: string) {
  const [event] = await tx.select({ id: billingUsageEvents.id, quantity: billingUsageEvents.quantity, syncStatus: billingUsageEvents.syncStatus, poolPartnerId: billingUsageEvents.poolPartnerId, poolOverageQuantity: billingUsageEvents.poolOverageQuantity, poolOverageCents: billingUsageEvents.poolOverageCents, termsAtRecordTime: billingUsageEvents.termsAtRecordTime })
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.sourceKey, sourceKey)));
  return event;
}

describe.skipIf(!client)("a partner's pool", () => {
  it("grants the smaller of the business's own allowance and the pool's remainder, and refuses calls and chats once either runs out", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "sk_test_pool");
      vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_pool");
      // Free's pool: 1,800 seconds and 50 chats a month, with no overage.
      const acme = await seedPartner(tx, { tier: "free", businesses: 2 });
      const [harbor, cedar] = acme.businessIds as [string, string];
      // Cedar pays for a package of 10 minutes and 3 chats; Harbor is billed outside LobbyStack.
      await tx.insert(partnerStripeAccounts).values({ partnerId: acme.partnerId, stripeAccountId: "acct_pool", currency: "USD", chargesEnabled: true, detailsSubmitted: true });
      const [front] = await tx.insert(partnerPackages).values({ partnerId: acme.partnerId, name: "Front desk", currency: "USD", monthlyPriceMinor: 4_900, voiceMinutes: 10, chats: 3, stripeAccountId: "acct_pool", stripeProductId: "prod_front", stripePriceId: "price_front" }).returning({ id: partnerPackages.id });
      await tx.insert(billingAccounts).values({ businessId: cedar, billingKey: `business:${cedar}`, packageId: front!.id, stripeAccountId: "acct_pool", stripeSubscriptionState: "active" });

      // Harbor used 1,500 of the pool's seconds, so the pool has 300 left: less than Cedar's own 600.
      await finishedCall(tx, harbor, 1_500);
      expect(await phoneCall(tx, cedar)).toMatchObject({ allowed: true, quantity: 300 });
      // The pool is spoken for now, while Cedar still has 300 of its own seconds.
      expect(await phoneCall(tx, cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      // A browser call gets none either, before or at its reservation, so it never starts.
      expect(await asWorkerRole(tx, async (db) => await getWebVoiceBillingAllowance({ db }, { businessId: cedar }))).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await asWorker(tx, cedar, async (inner) => await reserveWebVoiceUsageInTransaction(inner, { businessId: cedar, callId: randomUUID() }))).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });

      // Chats: Cedar's own 3 run out first, and Harbor then takes the pool's chats up to its 50.
      for (let index = 0; index < 3; index++) expect(await websiteChat(tx, cedar)).toMatchObject({ allowed: true });
      expect(await websiteChat(tx, cedar)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      for (let index = 0; index < 47; index++) expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: true });
      expect(await asWorkerRole(tx, async (db) => await getWidgetChatAllowance({ db }, { businessId: harbor }))).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });

      expect(await poolCounts(tx, acme.partnerId)).toEqual({ voiceSecondsUsed: 1_800, voiceSecondsFinal: 1_500, chatsUsed: 50, overageVoiceSeconds: 0, overageChats: 0, overageSpendCents: 0 });
    });
  });

  it("tops up a call within the pool, counts its real seconds when it ends, and gives the seconds it didn't use back", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await seedPartner(tx, { tier: "free", businesses: 2 });
      const [harbor, cedar] = acme.businessIds as [string, string];
      await finishedCall(tx, cedar, 1_200);
      const callId = randomUUID();
      await tx.insert(calls).values({ id: callId, businessId: harbor, providerCallId: `CA${randomUUID()}`, transport: "sip", startedAt: new Date() });
      expect(await phoneCall(tx, harbor, callId)).toMatchObject({ allowed: true, quantity: 300 });
      // 300 seconds are left in the pool, and the top-up takes them all.
      expect(await asWorker(tx, harbor, async (inner) => await extendPhoneReservationInTransaction(inner, { businessId: harbor, callId }))).toBe(300);
      expect(await asWorker(tx, harbor, async (inner) => await extendPhoneReservationInTransaction(inner, { businessId: harbor, callId }))).toBe(0);
      expect(await poolCounts(tx, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 1_800, voiceSecondsFinal: 1_200 });
      // The call ends at 420 seconds, which frees 180 for Cedar.
      await asWorker(tx, harbor, async (inner) => await correctUsageInTransaction(inner, { businessId: harbor, sourceKey: `voice:${callId}`, usageKind: "voice_seconds", quantity: 420 }));
      expect(await poolCounts(tx, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 1_620, voiceSecondsFinal: 1_620, overageVoiceSeconds: 0 });
      expect(await phoneCall(tx, cedar)).toMatchObject({ allowed: true, quantity: 180 });
    });
  });

  it("caps a browser call at what the pool has left when the business itself has more", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await seedPartner(tx, { tier: "free", businesses: 2 });
      const [harbor, cedar] = acme.businessIds as [string, string];
      // Cedar used 1,680 of Free's 1,800 seconds. Harbor, billed outside LobbyStack, has no limit of its own.
      await finishedCall(tx, cedar, 1_680);
      expect(await asWorkerRole(tx, async (db) => await getWebVoiceBillingAllowance({ db }, { businessId: harbor }))).toMatchObject({ allowed: true, maxDurationMs: 120_000 });
      expect(await asWorker(tx, harbor, async (inner) => await reserveWebVoiceUsageInTransaction(inner, { businessId: harbor, callId: randomUUID() }))).toMatchObject({ allowed: true, maxDurationMs: 120_000 });
      expect(await poolCounts(tx, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 1_800, voiceSecondsFinal: 1_680 });
    });
  });

  it("keeps a phone call on the pool and the terms it started on when nothing limits the pool, even if its business leaves mid-call", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      // Starter, with overage on and no cap, as the partner never changed them.
      const acme = await seedPartner(tx, { tier: "starter", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      await finishedCall(tx, harbor, partnerTierCatalog.starter.poolVoiceSeconds);
      const callId = randomUUID();
      await tx.insert(calls).values({ id: callId, businessId: harbor, providerCallId: `CA${randomUUID()}`, transport: "sip", startedAt: new Date() });
      // The call reserves a slice, which names the pool and its terms, and the worker tops it up.
      expect(await phoneCall(tx, harbor, callId)).toMatchObject({ allowed: true, quantity: 300 });
      expect(await usageEvent(tx, harbor, `voice:${callId}`)).toMatchObject({ poolPartnerId: acme.partnerId, termsAtRecordTime: { pool: { tier: "starter", overage: { enabled: true, capCents: null } } } });
      expect(await asWorker(tx, harbor, async (inner) => await extendPhoneReservationInTransaction(inner, { businessId: harbor, callId }))).toBe(300);
      // Mid-call, the partner moves to Growth's lower minute rate and then releases the business.
      await tx.update(partnerBillingAccounts).set({ tier: "growth" }).where(eq(partnerBillingAccounts.partnerId, acme.partnerId));
      await tx.update(businesses).set({ partnerId: null }).where(eq(businesses.id, harbor));
      await asWorker(tx, harbor, async (inner) => await correctUsageInTransaction(inner, { businessId: harbor, sourceKey: `voice:${callId}`, usageKind: "voice_seconds", quantity: 120 }));
      // Its 120 seconds land past the partner's pool at Starter's 20 cents a minute, for the partner's Polar customer.
      expect(await usageEvent(tx, harbor, `voice:${callId}`)).toMatchObject({ quantity: 120, poolPartnerId: acme.partnerId, poolOverageQuantity: 120, poolOverageCents: 40, syncStatus: "pending" });
      expect(await poolCounts(tx, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 15_120, voiceSecondsFinal: 15_120, overageVoiceSeconds: 120, overageSpendCents: 40 });
    });
  });

  it("bills usage past the pool as overage by default, at the tier's rates and only the overage, and stops at the partner's cap", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      // Starter: 15,000 seconds and 1,000 chats, then 20 cents a minute and 2 cents a chat.
      const acme = await seedPartner(tx, { tier: "starter", businesses: 2 });
      const [harbor, cedar] = acme.businessIds as [string, string];
      // Within the pool, nothing syncs to Polar.
      const inside = await finishedCall(tx, harbor, 14_700);
      expect(await usageEvent(tx, harbor, inside)).toMatchObject({ poolPartnerId: acme.partnerId, poolOverageQuantity: 0, poolOverageCents: 0, syncStatus: "skipped" });
      // With no cap, nothing limits the pool past it, and a call still reserves a slice on it.
      const callId = randomUUID();
      expect(await phoneCall(tx, cedar, callId)).toMatchObject({ allowed: true, quantity: 300 });
      // The call ends at 900 seconds, 600 past the pool: $2.00 of overage, which syncs as the overage alone.
      const past = `voice:${callId}`;
      await asWorker(tx, cedar, async (inner) => await correctUsageInTransaction(inner, { businessId: cedar, sourceKey: past, usageKind: "voice_seconds", quantity: 900 }));
      const event = await usageEvent(tx, cedar, past);
      expect(event).toMatchObject({ quantity: 900, poolOverageQuantity: 600, poolOverageCents: 200, syncStatus: "pending" });
      await asWorker(tx, cedar, async (inner) => await enqueueUsageSyncInTransaction(inner, { businessId: cedar, usageEventId: event!.id }));
      expect(await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.aggregateId, event!.id))).toEqual([{ topic: "billing.syncUsage" }]);
      expect(await asWorkerRole(tx, async (db) => await loadPoolUsageEvent({ db }, { businessId: cedar, usageEventId: event!.id }))).toMatchObject({ partnerId: acme.partnerId, usageKind: "voice_seconds", isFinal: true, syncStatus: "pending", overageQuantity: 600, overageCents: 200, customerId: "cus_pool" });

      // The owner caps overage at $3: $1 more buys 300 seconds at 20 cents a minute.
      await asApp(tx, async (db) => expect(await setPartnerPoolOverage({ db }, { kind: "member", partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" }, { enabled: true, capCents: 300 })).toEqual({ enabled: true, capCents: 300, billed: true }));
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: true, quantity: 300 });
      // That open reservation counts against the cap until its call ends.
      expect(await phoneCall(tx, cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      // Chats past the pool cost 2 cents each against the same cap, so a cent left buys none.
      await tx.update(partnerUsageMonths).set({ chatsUsed: 1_000 }).where(eq(partnerUsageMonths.partnerId, acme.partnerId));
      expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      await asApp(tx, async (db) => await setPartnerPoolOverage({ db }, { kind: "member", partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" }, { enabled: true, capCents: 301 }));
      expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      await asApp(tx, async (db) => await setPartnerPoolOverage({ db }, { kind: "member", partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" }, { enabled: true, capCents: 302 }));
      expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: true });
      const [chat] = await tx.select({ id: billingUsageEvents.id, poolOverageCents: billingUsageEvents.poolOverageCents, syncStatus: billingUsageEvents.syncStatus }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, harbor), eq(billingUsageEvents.usageKind, "chat_ai_tokens")));
      expect(chat).toMatchObject({ poolOverageCents: 2, syncStatus: "pending" });
      // The chat's sync is queued with it, since no call's end queues one.
      expect(await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.aggregateId, chat!.id))).toEqual([{ topic: "billing.syncUsage" }]);
      expect(await poolCounts(tx, acme.partnerId)).toMatchObject({ overageVoiceSeconds: 600, overageChats: 1, overageSpendCents: 202 });
    });
  });

  it("stops at the pool with overage off, or on Free whatever the switch says, so calls forward and chat shows its message", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const growth = await seedPartner(tx, { tier: "growth", businesses: 1, overage: { enabled: false, capCents: null } });
      const [desk] = growth.businessIds as [string];
      await finishedCall(tx, desk, partnerTierCatalog.growth.poolVoiceSeconds - 60);
      expect(await phoneCall(tx, desk)).toMatchObject({ allowed: true, quantity: 60 });
      expect(await phoneCall(tx, desk)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      await tx.update(partnerUsageMonths).set({ chatsUsed: partnerTierCatalog.growth.poolChats }).where(eq(partnerUsageMonths.partnerId, growth.partnerId));
      expect(await websiteChat(tx, desk)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });

      // Free has no overage, even with the switch on.
      const free = await seedPartner(tx, { tier: "free", businesses: 1, overage: { enabled: true, capCents: null } });
      const [corner] = free.businessIds as [string];
      await finishedCall(tx, corner, 1_800);
      expect(await phoneCall(tx, corner)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      // A call that ran past the pool costs the partner nothing on Free.
      const over = await finishedCall(tx, corner, 30);
      expect(await usageEvent(tx, corner, over)).toMatchObject({ poolOverageQuantity: 0, poolOverageCents: 0, syncStatus: "skipped" });
    });
  });

  it("records on each event the terms in force when it happened", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await seedPartner(tx, { tier: "starter", businesses: 1, overage: { enabled: true, capCents: 5_000 } });
      const [harbor] = acme.businessIds as [string];
      const onStarter = await finishedCall(tx, harbor, 60);
      // The partner moves to Scale, and later usage records Scale's terms.
      const scale = partnerTierCatalog.scale;
      await tx.update(partnerBillingAccounts).set({ tier: "scale", poolVoiceSeconds: scale.poolVoiceSeconds, poolChats: scale.poolChats }).where(eq(partnerBillingAccounts.partnerId, acme.partnerId));
      const onScale = await finishedCall(tx, harbor, 60);
      const pool = (tier: PartnerTierSlug) => ({
        partnerId: acme.partnerId,
        tier,
        source: "tier",
        voiceSeconds: partnerTierCatalog[tier].poolVoiceSeconds,
        chats: partnerTierCatalog[tier].poolChats,
        overage: { enabled: true, capCents: 5_000, rates: { voiceMinute: partnerTierCatalog[tier].voiceOverageRatePerMinuteCents, chat: partnerTierCatalog[tier].chatOverageRatePerChatCents } },
      });
      expect((await usageEvent(tx, harbor, onStarter))!.termsAtRecordTime).toEqual({ source: "billed_outside", allowance: { voiceSeconds: null, chats: null, alertSms: null, outboundAttempts: null }, overage: { enabled: false, currency: "USD", rates: { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 }, capMinor: null }, pool: pool("starter") });
      expect((await usageEvent(tx, harbor, onScale))!.termsAtRecordTime).toMatchObject({ source: "billed_outside", pool: pool("scale") });
      // A call that ends after the tier changed is priced by the terms it was reserved under.
      await tx.update(partnerUsageMonths).set({ voiceSecondsUsed: scale.poolVoiceSeconds, voiceSecondsFinal: scale.poolVoiceSeconds }).where(eq(partnerUsageMonths.partnerId, acme.partnerId));
      const callId = randomUUID();
      expect(await phoneCall(tx, harbor, callId)).toMatchObject({ allowed: true, quantity: 300 });
      await tx.update(partnerBillingAccounts).set({ tier: "starter" }).where(eq(partnerBillingAccounts.partnerId, acme.partnerId));
      await asWorker(tx, harbor, async (inner) => await correctUsageInTransaction(inner, { businessId: harbor, sourceKey: `voice:${callId}`, usageKind: "voice_seconds", quantity: 120 }));
      // 120 seconds past Scale's pool, at Scale's 12 cents a minute.
      expect(await usageEvent(tx, harbor, `voice:${callId}`)).toMatchObject({ poolOverageQuantity: 120, poolOverageCents: 24 });
      // A direct business's usage records its plan's terms and no pool.
      const [direct] = await tx.insert(businesses).values({ slug: `direct-${randomUUID()}`, name: "Corner Shop", timezone: "America/Toronto", businessType: "test", deploymentMode: "cloud", onboardingStage: "complete" }).returning({ id: businesses.id });
      const directCall = await finishedCall(tx, direct!.id, 60);
      expect(await usageEvent(tx, direct!.id, directCall)).toMatchObject({ poolPartnerId: null, poolOverageCents: null, termsAtRecordTime: { source: "plan", allowance: { voiceSeconds: 1_800 }, pool: null } });
    });
  });

  it("counts usage without limiting it while the deployment bills no tiers, and keeps a released business's call on the pool it started on", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      await finishedCall(tx, harbor, 5_000);
      // Free's pool would be spent, but nothing limits a pool without tier billing. A phone call still reserves its slice on it.
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: true, quantity: 300 });
      const browserCall = randomUUID();
      expect(await asWorker(tx, harbor, async (inner) => await reserveWebVoiceUsageInTransaction(inner, { businessId: harbor, callId: browserCall }))).toMatchObject({ allowed: true, maxDurationMs: 300_000 });
      expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: true });
      expect(await poolCounts(tx, acme.partnerId)).toEqual({ voiceSecondsUsed: 5_600, voiceSecondsFinal: 5_000, chatsUsed: 1, overageVoiceSeconds: 0, overageChats: 0, overageSpendCents: 0 });

      // The partner releases the business mid-call: its end still counts in the partner's pool.
      await tx.update(businesses).set({ partnerId: null }).where(eq(businesses.id, harbor));
      await asWorker(tx, harbor, async (inner) => await correctUsageInTransaction(inner, { businessId: harbor, sourceKey: `voice:${browserCall}`, usageKind: "voice_seconds", quantity: 100 }));
      expect(await poolCounts(tx, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 5_400, voiceSecondsFinal: 5_100 });
      // Its usage after that draws on no pool.
      const later = await finishedCall(tx, harbor, 60);
      expect(await usageEvent(tx, harbor, later)).toMatchObject({ poolPartnerId: null });
      expect(await poolCounts(tx, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 5_400 });
    });
  });

  it("finishes a released business's call even after its old partner is gone", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      const browserCall = randomUUID();
      expect(await asWorker(tx, harbor, async (inner) => await reserveWebVoiceUsageInTransaction(inner, { businessId: harbor, callId: browserCall }))).toMatchObject({ allowed: true });
      await tx.update(businesses).set({ partnerId: null }).where(eq(businesses.id, harbor));
      await tx.delete(partners).where(eq(partners.id, acme.partnerId));
      await asWorker(tx, harbor, async (inner) => await correctUsageInTransaction(inner, { businessId: harbor, sourceKey: `voice:${browserCall}`, usageKind: "voice_seconds", quantity: 100 }));
      expect(await usageEvent(tx, harbor, `voice:${browserCall}`)).toMatchObject({ quantity: 100, poolPartnerId: acme.partnerId });
      expect(await poolCounts(tx, acme.partnerId)).toBeUndefined();
    });
  });

  it("lets only the worker inside the partner's businesses use the pool, and only the partner's owners change its overage", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await seedPartner(tx, { tier: "starter", businesses: 1 });
      const other = await seedPartner(tx, { tier: "starter", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      const [elsewhere] = other.businessIds as [string];
      const periodKey = periodKeyFor();
      // Another partner's business can't reach this pool, and the app role can't call the worker's functions at all.
      expect(await refusal(asWorker(tx, elsewhere, async (inner) => await inner.execute(sql`select * from app.lock_partner_pool(${acme.partnerId}::uuid, ${periodKey})`)))).toMatchObject({ code: "42501", message: "partner_pool_unavailable" });
      expect(await refusal(asWorker(tx, elsewhere, async (inner) => await inner.execute(sql`select app.record_partner_pool_usage(${acme.partnerId}::uuid, ${periodKey}, 1, 1, 0, 0, 0, 0)`)))).toMatchObject({ code: "42501" });
      expect((await asWorker(tx, elsewhere, async (inner) => await inner.execute(sql`select * from app.partner_pool_month(${acme.partnerId}::uuid, ${periodKey})`))).rows).toEqual([]);
      expect(await refusal(asApp(tx, async (db) => await withBusinessTransaction(db, { businessId: harbor, actorType: "worker" }, async (inner) => await inner.execute(sql`select * from app.lock_partner_pool(${acme.partnerId}::uuid, ${periodKey})`))))).toMatchObject({ code: "42501" });
      // Nobody reads or writes the counts directly.
      expect(await refusal(asWorker(tx, harbor, async (inner) => await inner.select().from(partnerUsageMonths)))).toMatchObject({ code: "42501" });

      // The partner's admin and another partner's owner can't change its overage, and neither can the app role for itself.
      const admin = { kind: "member" as const, partnerId: acme.partnerId, userId: acme.adminId, role: "admin" as const };
      expect(await asApp(tx, async (db) => await refusal(setPartnerPoolOverage({ db }, admin, { enabled: false, capCents: null })))).toMatchObject({ status: 403, code: "owner_only" });
      expect(await asApp(tx, async (db) => await refusal(setPartnerPoolOverage({ db }, { kind: "member", partnerId: acme.partnerId, userId: other.ownerId, role: "owner" }, { enabled: false, capCents: null })))).toMatchObject({ status: 403 });
      expect(await asApp(tx, async (db) => await refusal(withBusinessTransaction(db, { userId: acme.adminId, actorType: "operator" }, async (inner) => await inner.execute(sql`select app.set_partner_pool_overage(${acme.partnerId}::uuid, false, null)`))))).toMatchObject({ code: "42501", message: "owner_only" });
      const owner = { kind: "member" as const, partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" as const };
      for (const capCents of [-1, 1.5, "100", 2_147_483_648]) {
        expect(await asApp(tx, async (db) => await refusal(setPartnerPoolOverage({ db }, owner, { enabled: true, capCents })))).toMatchObject({ status: 400, code: "invalid_pool_overage" });
      }
      expect(await asApp(tx, async (db) => await refusal(setPartnerPoolOverage({ db }, owner, { enabled: "yes", capCents: null })))).toMatchObject({ status: 400, code: "invalid_pool_overage" });
      expect(await asApp(tx, async (db) => await refusal(setPartnerPoolOverage({ db }, { kind: "key", partnerId: acme.partnerId, platformKeyId: randomUUID() }, { enabled: false, capCents: null })))).toMatchObject({ status: 403 });
    });
  });

  it("shows the owners this month's pool use and the overage settings, which start on with no cap, on the Billing page", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      // A partner Polar never billed is on Free, with overage on and no cap that Free never bills.
      const acme = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      const owner = { kind: "member" as const, partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" as const };
      expect(await asApp(tx, async (db) => await getPartnerBilling({ db }, owner))).toMatchObject({ tier: "free", poolUsage: { periodKey: periodKeyFor(), voiceSecondsUsed: 0, chatsUsed: 0, overageSpendCents: 0 }, poolOverage: { enabled: true, capCents: null, billed: false } });
      await finishedCall(tx, harbor, 90);
      await websiteChat(tx, harbor);
      // Setting it gives the partner a billing account on Free.
      expect(await asApp(tx, async (db) => await setPartnerPoolOverage({ db }, owner, { enabled: false, capCents: 2_500 }))).toEqual({ enabled: false, capCents: 2_500, billed: false });
      expect(await tx.select({ tier: partnerBillingAccounts.tier, poolVoiceSeconds: partnerBillingAccounts.poolVoiceSeconds, poolChats: partnerBillingAccounts.poolChats }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, acme.partnerId))).toEqual([{ tier: "free", poolVoiceSeconds: 1_800, poolChats: 50 }]);
      expect(await asApp(tx, async (db) => await getPartnerBilling({ db }, owner))).toMatchObject({ poolUsage: { voiceSecondsUsed: 90, chatsUsed: 1, overageSpendCents: 0 }, poolOverage: { enabled: false, capCents: 2_500, billed: false } });
      // Without tier billing, the page has no pool to show and nothing to change.
      for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
      expect(await asApp(tx, async (db) => await getPartnerBilling({ db }, owner))).toMatchObject({ billed: false, poolUsage: null });
      expect(await asApp(tx, async (db) => await refusal(setPartnerPoolOverage({ db }, owner, { enabled: true, capCents: null })))).toMatchObject({ status: 409, code: "tier_billing_unavailable" });
    });
  });
});

describe.skipIf(!client)("alerts on a partner's pool", () => {
  type AlertEmail = { businessId: string | null; template: string; to: string; variables: Record<string, string>; brand: unknown; replyTo: unknown };

  /** The pool alert emails queued for the partner, as the worker will send them. */
  async function alertEmails(tx: DatabaseTransaction, partnerId: string): Promise<AlertEmail[]> {
    const rows = await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, partnerId), eq(outboxMessages.topic, "email.send")));
    return rows.map((row) => ({ businessId: row.businessId, ...(row.payload as Omit<AlertEmail, "businessId">) }));
  }

  /** Each alert queued, as kind and share, with how many people it went to. */
  async function alertsSent(tx: DatabaseTransaction, partnerId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const email of await alertEmails(tx, partnerId)) {
      const alert = `${email.variables.kind} ${email.variables.threshold}`;
      counts[alert] = (counts[alert] ?? 0) + 1;
    }
    return counts;
  }

  it("emails the partner's owners and admins once each at 80% and 100% of the pool's minutes and chats, under the host's brand", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
      // Starter: 250 minutes and 1,000 chats. A member works inside businesses and gets no alert.
      const acme = await seedPartner(tx, { tier: "starter", businesses: 2, overage: { enabled: true, capCents: 5_000 } });
      const [harbor, cedar] = acme.businessIds as [string, string];
      const memberId = randomUUID();
      await tx.insert(users).values({ id: memberId, email: `${memberId}@example.invalid`, normalizedEmail: `${memberId}@example.invalid`, name: "Pool Member", emailVerified: true });
      await tx.insert(partnerMembers).values({ partnerId: acme.partnerId, userId: memberId, role: "member" });
      await tx.update(users).set({ name: "Ana Owner", preferredLocale: "fr" }).where(eq(users.id, acme.ownerId));

      // 199 minutes is under 80%.
      await finishedCall(tx, harbor, 11_940);
      expect(await alertEmails(tx, acme.partnerId)).toEqual([]);
      // Cedar's call takes the businesses to 200 minutes: 80%.
      await finishedCall(tx, cedar, 60);
      const at80 = await alertEmails(tx, acme.partnerId);
      expect(at80.map((email) => email.to).sort()).toEqual([`${acme.adminId}@example.invalid`, `${acme.ownerId}@example.invalid`].sort());
      const toOwner = at80.find((email) => email.to === `${acme.ownerId}@example.invalid`)!;
      expect(toOwner).toMatchObject({
        businessId: cedar,
        template: "partner_pool_alert",
        brand: { kind: "host" },
        replyTo: null,
        variables: { locale: "fr", firstName: "Ana", partnerName: "Pool Reception", kind: "minutes", threshold: "80", used: "200", included: "250", overage: "on", url: `https://desk.example.test/partner/${acme.partnerId}/billing` },
      });
      // Each in their own language.
      expect(toOwner.variables.cap).toMatch(/^50,00/);
      expect(at80.find((email) => email.to === `${acme.adminId}@example.invalid`)!.variables).toMatchObject({ locale: "en", cap: "$50.00" });
      // More use under 100% sends nothing more.
      await finishedCall(tx, harbor, 600);
      expect(await alertsSent(tx, acme.partnerId)).toEqual({ "minutes 80": 2 });

      // The pool runs out, and use past it sends nothing more.
      await finishedCall(tx, harbor, 2_400);
      await finishedCall(tx, harbor, 120);
      expect(await alertsSent(tx, acme.partnerId)).toEqual({ "minutes 80": 2, "minutes 100": 2 });

      // Chats: 799 of 1,000, then the 800th.
      await tx.update(partnerUsageMonths).set({ chatsUsed: 799 }).where(eq(partnerUsageMonths.partnerId, acme.partnerId));
      expect(await websiteChat(tx, cedar)).toMatchObject({ allowed: true });
      const chats = (await alertEmails(tx, acme.partnerId)).filter((email) => email.variables.kind === "chats");
      expect(chats.map((email) => email.variables).find((variables) => variables.locale === "en")).toMatchObject({ threshold: "80", used: "800", included: "1,000" });
      expect(await alertsSent(tx, acme.partnerId)).toEqual({ "minutes 80": 2, "minutes 100": 2, "chats 80": 2 });

      // Deleting Cedar, whose usage queued two of the alerts, keeps them: they're for the partner's people.
      await asApp(tx, async (db) => await deletePartnerBusiness({ db }, { kind: "member", partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" }, { businessId: cedar }));
      expect(await alertsSent(tx, acme.partnerId)).toEqual({ "minutes 80": 2, "minutes 100": 2, "chats 80": 2 });
      expect((await alertEmails(tx, acme.partnerId)).filter((email) => email.businessId === null).map((email) => email.variables.kind).sort()).toEqual(["chats", "chats", "minutes", "minutes"]);
    });
  });

  it("emails at 80% and 100% of the overage cap, sends only the higher one when usage crosses both at once, and again for a new cap", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      // Starter's pool, then 20 cents a minute, capped at $5.
      const acme = await seedPartner(tx, { tier: "starter", businesses: 1, overage: { enabled: true, capCents: 500 } });
      const [harbor] = acme.businessIds as [string];
      await finishedCall(tx, harbor, 15_000);
      // 20 minutes past the pool cost $4, 80% of the cap.
      await finishedCall(tx, harbor, 1_200);
      expect(await alertsSent(tx, acme.partnerId)).toMatchObject({ "cap 80": 2 });
      const cap80 = (await alertEmails(tx, acme.partnerId)).find((email) => email.variables.kind === "cap")!;
      expect(cap80.variables).toMatchObject({ threshold: "80", used: "$4.00", included: "$5.00" });
      // 5 more minutes reach the cap.
      await finishedCall(tx, harbor, 300);
      expect(await alertsSent(tx, acme.partnerId)).toMatchObject({ "cap 80": 2, "cap 100": 2 });

      // The owner raises the cap to $6, which a minute and a half past it reaches at once: only the 100% alert goes out for it.
      const owner = { kind: "member" as const, partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" as const };
      await asApp(tx, async (db) => await setPartnerPoolOverage({ db }, owner, { enabled: true, capCents: 600 }));
      await finishedCall(tx, harbor, 300);
      expect(await alertsSent(tx, acme.partnerId)).toEqual({ "minutes 100": 2, "cap 80": 2, "cap 100": 4 });
      expect((await alertEmails(tx, acme.partnerId)).filter((email) => email.variables.kind === "cap" && email.variables.included === "$6.00").map((email) => email.variables.threshold)).toEqual(["100", "100"]);
    });
  });

  it("tells a partner on Free that its pool has no overage, and sends nothing while the deployment bills no tiers", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const free = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [corner] = free.businessIds as [string];
      await finishedCall(tx, corner, 1_800);
      // Free's 30 minutes ran out at once: the 100% alert, with nothing past the pool.
      expect(await alertsSent(tx, free.partnerId)).toEqual({ "minutes 100": 2 });
      expect((await alertEmails(tx, free.partnerId))[0]!.variables).toMatchObject({ included: "30", overage: "none", cap: "" });

      for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
      const unbilled = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [desk] = unbilled.businessIds as [string];
      await finishedCall(tx, desk, 5_000);
      expect(await alertEmails(tx, unbilled.partnerId)).toEqual([]);
    });
  });
});

describe.skipIf(!client)("a pool the host sets without tier billing", () => {
  /** The host sets the partner's pool, as `pnpm partner-pool:set` does on the app role. */
  async function hostSets(tx: DatabaseTransaction, input: Parameters<typeof setPartnerHostPool>[1]) {
    return await asApp(tx, async (db) => await setPartnerHostPool({ db }, input));
  }

  /** The pool alert emails queued for the partner. */
  async function alertVariables(tx: DatabaseTransaction, partnerId: string): Promise<Array<Record<string, string>>> {
    const rows = await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, partnerId), eq(outboxMessages.topic, "email.send")));
    return rows.map((row) => (row.payload as { variables: Record<string, string> }).variables);
  }

  it("stops the businesses at the pool the host set, with no overage, and leaves a kind it didn't set with no limit", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx, { tier: "free", businesses: 2 });
      const [harbor, cedar] = acme.businessIds as [string, string];
      const slug = `pool-${acme.partnerId.slice(0, 8)}`;
      expect(await hostSets(tx, { partner: slug, voiceMinutes: 10 })).toEqual({ partnerId: acme.partnerId, name: "Pool Reception", slug, pool: { voiceSeconds: 600, chats: null } });

      // Harbor used 500 of the pool's 600 seconds, so Cedar's call gets the last 100, and then the pool refuses calls of any kind.
      await finishedCall(tx, harbor, 500);
      expect(await phoneCall(tx, cedar)).toMatchObject({ allowed: true, quantity: 100 });
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await asWorkerRole(tx, async (db) => await getWebVoiceBillingAllowance({ db }, { businessId: cedar }))).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      // A call that ran past the pool costs the partner nothing: nothing prices overage without tier billing.
      const over = await finishedCall(tx, cedar, 120);
      expect(await usageEvent(tx, cedar, over)).toMatchObject({
        poolPartnerId: acme.partnerId,
        poolOverageQuantity: 0,
        poolOverageCents: 0,
        syncStatus: "skipped",
        termsAtRecordTime: { pool: { partnerId: acme.partnerId, tier: "free", source: "host", voiceSeconds: 600, chats: null, overage: { enabled: false, capCents: null, rates: { voiceMinute: 0, chat: 0 } } } },
      });

      // Chats have no limit, past Free's 50.
      for (let index = 0; index < 51; index++) expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: true });
      // The host limits chats too, and the minutes stay as they were.
      expect(await hostSets(tx, { partner: acme.partnerId, chats: 52 })).toMatchObject({ pool: { voiceSeconds: 600, chats: 52 } });
      expect(await websiteChat(tx, cedar)).toMatchObject({ allowed: true });
      expect(await asWorkerRole(tx, async (db) => await getWidgetChatAllowance({ db }, { businessId: harbor }))).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: false, errorCode: "chat_ai_limit_reached" });
      expect(await poolCounts(tx, acme.partnerId)).toMatchObject({ voiceSecondsFinal: 620, chatsUsed: 52, overageVoiceSeconds: 0, overageChats: 0, overageSpendCents: 0 });

      // Cleared, nothing limits the pool again.
      expect(await hostSets(tx, { partner: acme.partnerId, clear: true })).toMatchObject({ pool: { voiceSeconds: null, chats: null } });
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: true, quantity: 300 });
      expect(await websiteChat(tx, harbor)).toMatchObject({ allowed: true });
    });
  });

  it("gives way to the tier's pool while the deployment bills tiers", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      await hostSets(tx, { partner: acme.partnerId, voiceMinutes: 100, chats: 1_000 });
      // With tier products, the partner is on Free, whose 1,800 seconds run out first.
      sellTiers();
      await finishedCall(tx, harbor, 1_800);
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await asApp(tx, async (db) => await getPartnerBilling({ db }, { kind: "member", partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" }))).toMatchObject({ billed: true, pool: { voiceSeconds: 1_800, chats: 50 } });
      // Without them, the host's 6,000 seconds apply.
      for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: true, quantity: 300 });
    });
  });

  it("names the partner by its id, its slug or one of its domains, and refuses what it can't set", async () => {
    await rollbackTest(async (tx) => {
      // Other suites write the deployment's one tier billing row in transactions they roll back, behind this lock.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('test:partner_tier_billing', 0))`);
      const acme = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      await tx.insert(partnerDomains).values([
        { partnerId: acme.partnerId, hostname: `acme-${acme.partnerId}.portal.example.test`, kind: "subdomain", verifiedAt: new Date() },
        { partnerId: acme.partnerId, hostname: `desk-${acme.partnerId}.acme.example.test`, kind: "custom" },
      ]);
      // A subdomain names the partner. Its own domain does only once verified, since other partners may claim it until then.
      expect(await hostSets(tx, { partner: ` ACME-${acme.partnerId.toUpperCase()}.portal.example.test `, voiceMinutes: 0 })).toMatchObject({ partnerId: acme.partnerId, pool: { voiceSeconds: 0, chats: null } });
      expect(await refusal(hostSets(tx, { partner: `desk-${acme.partnerId}.acme.example.test`, chats: 5 }))).toMatchObject({ status: 404, code: "partner_not_found" });
      await tx.update(partnerDomains).set({ verifiedAt: new Date() }).where(and(eq(partnerDomains.partnerId, acme.partnerId), eq(partnerDomains.kind, "custom")));
      expect(await hostSets(tx, { partner: `desk-${acme.partnerId}.acme.example.test`, chats: 5 })).toMatchObject({ pool: { voiceSeconds: 0, chats: 5 } });
      expect(await refusal(hostSets(tx, { partner: "nobody-here", chats: 5 }))).toMatchObject({ status: 404, code: "partner_not_found" });
      expect(await refusal(hostSets(tx, { partner: randomUUID(), chats: 5 }))).toMatchObject({ status: 404, code: "partner_not_found" });
      // A pool of 0 minutes forwards every call.
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });

      for (const input of [{ voiceMinutes: -1 }, { voiceMinutes: 1.5 }, { voiceMinutes: "5" }, { voiceMinutes: 35_791_395 }, { chats: 2_147_483_648 }, {}, { clear: true, chats: 5 }]) {
        expect(await refusal(hostSets(tx, { partner: acme.partnerId, ...input }))).toMatchObject({ status: 400, code: "invalid_host_pool" });
      }
      // Only the host's own tooling sets the pool: not an owner on the console, and not the worker.
      expect(await refusal(asApp(tx, async (db) => await withBusinessTransaction(db, { userId: acme.ownerId, actorType: "operator" }, async (inner) => await inner.execute(sql`select app.set_partner_host_pool(${acme.partnerId}::uuid, null, null)`))))).toMatchObject({ code: "42501", message: "host_only" });
      expect(await refusal(asWorker(tx, harbor, async (inner) => await inner.execute(sql`select app.set_partner_host_pool(${acme.partnerId}::uuid, null, null)`)))).toMatchObject({ code: "42501" });
      expect(await refusal(asApp(tx, async (db) => await withBusinessTransaction(db, { userId: acme.ownerId, actorType: "operator" }, async (inner) => await inner.update(partnerBillingAccounts).set({ hostPoolVoiceSeconds: 60_000 }).where(eq(partnerBillingAccounts.partnerId, acme.partnerId)))))).toMatchObject({ code: "42501" });

      // While the deployment bills tiers, the tier sets the pool: a limit is refused, and clearing one still works.
      sellTiers();
      expect(await refusal(hostSets(tx, { partner: acme.partnerId, voiceMinutes: 500 }))).toMatchObject({ status: 409, code: "tier_billing_on" });
      for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
      // The worker last started with tier products, though this process has none.
      await tx.insert(partnerTierBilling).values({ id: 1, enabled: true }).onConflictDoUpdate({ target: partnerTierBilling.id, set: { enabled: true } });
      expect(await refusal(hostSets(tx, { partner: acme.partnerId, voiceMinutes: 500 }))).toMatchObject({ status: 409, code: "tier_billing_on" });
      expect(await hostSets(tx, { partner: acme.partnerId, clear: true })).toMatchObject({ pool: { voiceSeconds: null, chats: null } });
      expect(await tx.select({ voiceSeconds: partnerBillingAccounts.hostPoolVoiceSeconds, chats: partnerBillingAccounts.hostPoolChats, tierPool: partnerBillingAccounts.poolVoiceSeconds }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, acme.partnerId))).toEqual([{ voiceSeconds: null, chats: null, tierPool: 1_800 }]);
    });
  });

  it("shows owners the pool's use on the Billing page, with no overage, once the host set it", async () => {
    await rollbackTest(async (tx) => {
      const acme = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      const owner = { kind: "member" as const, partnerId: acme.partnerId, userId: acme.ownerId, role: "owner" as const };
      const billingPage = (userId: string) => asApp(tx, async (db) => await partnerHasBillingPage({ db }, { userId, partnerId: acme.partnerId }));
      expect(await billingPage(acme.ownerId)).toBe(false);
      expect(await asApp(tx, async (db) => await getPartnerBilling({ db }, owner))).toMatchObject({ billed: false, pool: null, poolUsage: null });

      await hostSets(tx, { partner: acme.partnerId, voiceMinutes: 500 });
      await finishedCall(tx, harbor, 90);
      await websiteChat(tx, harbor);
      expect(await billingPage(acme.ownerId)).toBe(true);
      // Someone off the partner's team reads no account.
      const other = await seedPartner(tx, { tier: "free", businesses: 1 });
      expect(await billingPage(other.ownerId)).toBe(false);
      expect(await asApp(tx, async (db) => await getPartnerBilling({ db }, owner))).toMatchObject({
        billed: false,
        tier: "free",
        pool: { voiceSeconds: 30_000, chats: null },
        poolUsage: { periodKey: periodKeyFor(), voiceSecondsUsed: 90, chatsUsed: 1, overageSpendCents: 0 },
        poolOverage: { billed: false },
        trialNumber: null,
      });
      // The owner still can't turn on overage: nothing prices it.
      expect(await asApp(tx, async (db) => await refusal(setPartnerPoolOverage({ db }, owner, { enabled: true, capCents: null })))).toMatchObject({ status: 409, code: "tier_billing_unavailable" });
    });
  });

  it("emails the partner's owners and admins at 80% and 100% of it, with no tier to pick", async () => {
    await rollbackTest(async (tx) => {
      vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
      const acme = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      await hostSets(tx, { partner: acme.partnerId, voiceMinutes: 10, chats: 5 });
      // 7 minutes is under 80% of 10, and a call that takes the businesses to 8 reaches it.
      await finishedCall(tx, harbor, 410);
      expect(await alertVariables(tx, acme.partnerId)).toEqual([]);
      await finishedCall(tx, harbor, 60);
      const at80 = await alertVariables(tx, acme.partnerId);
      expect(at80).toHaveLength(2);
      expect(at80[0]).toMatchObject({ kind: "minutes", threshold: "80", used: "8", included: "10", pool: "host", overage: "none", cap: "", url: `https://desk.example.test/partner/${acme.partnerId}/billing` });
      await finishedCall(tx, harbor, 120);
      for (let index = 0; index < 5; index++) await websiteChat(tx, harbor);
      expect((await alertVariables(tx, acme.partnerId)).map((variables) => `${variables.kind} ${variables.threshold} ${variables.pool}`).sort()).toEqual(["chats 100 host", "chats 100 host", "chats 80 host", "chats 80 host", "minutes 100 host", "minutes 100 host", "minutes 80 host", "minutes 80 host"]);
    });
  });
});

describe.skipIf(!client)("calls a partner's businesses hold open at once", () => {
  /** Open GPT-Live calls in a business, as calls in progress leave them. */
  async function openCalls(tx: DatabaseTransaction, businessId: string, count: number, startedAt = new Date()) {
    const ids = Array.from({ length: count }, () => randomUUID());
    if (count) await tx.insert(calls).values(ids.map((id) => ({ id, businessId, provider: "openai_live", providerCallId: `live_${id}`, transport: "voice", startedAt })));
    return ids;
  }

  it("refuses a new call, phone or browser, past the most its partner's businesses may hold open, as a pool out of minutes refuses it", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await seedPartner(tx, { tier: "scale", businesses: 2 });
      const [harbor, cedar] = acme.businessIds as [string, string];
      const other = await seedPartner(tx, { tier: "scale", businesses: 1 });
      const [elsewhere] = other.businessIds as [string];
      const limit = PARTNER_MAX_SIMULTANEOUS_CALLS;
      // Another partner's calls, calls that ended, and calls left open longer than any call runs don't count.
      await openCalls(tx, elsewhere, 3);
      const ended = await openCalls(tx, harbor, 1);
      await tx.update(calls).set({ endedAt: new Date() }).where(eq(calls.id, ended[0]!));
      await openCalls(tx, harbor, 2, new Date(Date.now() - 40 * 60_000));
      const held = await openCalls(tx, harbor, limit - 2);
      // The call reserving now doesn't count itself.
      const [arriving] = await openCalls(tx, cedar, 1);
      expect(await phoneCall(tx, cedar, arriving!)).toMatchObject({ allowed: true });
      await openCalls(tx, cedar, 1);
      // The partner's businesses hold the most calls open now, so the next call, on either business, is refused.
      expect(await phoneCall(tx, cedar)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await asWorker(tx, harbor, async (inner) => await reserveWebVoiceUsageInTransaction(inner, { businessId: harbor, callId: randomUUID() }))).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      // The live webhook gets the same refusal as a pool out of minutes, so it answers 503 and the trunk forwards the call.
      await expect(asWorkerRole(tx, async (db) => await startLivePhoneCall({ db }, { businessId: harbor, sessionId: `live_${randomUUID()}`, from: "+14165550142", to: "+15815550100" }))).rejects.toMatchObject({ status: 402, code: "voice_limit_reached" });
      // Another partner's business still takes calls.
      expect(await phoneCall(tx, elsewhere)).toMatchObject({ allowed: true });
      // One call ends, and the next one takes its place.
      await tx.update(calls).set({ endedAt: new Date() }).where(eq(calls.id, held[0]!));
      const [next] = await openCalls(tx, cedar, 1);
      expect(await phoneCall(tx, cedar, next!)).toMatchObject({ allowed: true });
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      // The environment can raise it.
      vi.stubEnv("PARTNER_MAX_SIMULTANEOUS_CALLS", String(limit + 1));
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: true });
    });
  });

  it("holds a partner without tier billing to it too, and never a direct business", async () => {
    await rollbackTest(async (tx) => {
      vi.stubEnv("PARTNER_MAX_SIMULTANEOUS_CALLS", "2");
      const acme = await seedPartner(tx, { tier: "free", businesses: 1 });
      const [harbor] = acme.businessIds as [string];
      await openCalls(tx, harbor, 2);
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      const [direct] = await tx.insert(businesses).values({ slug: `direct-${randomUUID()}`, name: "Corner Shop", timezone: "America/Toronto", businessType: "test", deploymentMode: "cloud", onboardingStage: "complete" }).returning({ id: businesses.id });
      await openCalls(tx, direct!.id, 3);
      expect(await phoneCall(tx, direct!.id)).toMatchObject({ allowed: true });
    });
  });
});

describe.skipIf(!client)("a partner's trial number on the pool", () => {
  it("forwards for good only once the calls that ended used the pool up, not while calls elsewhere hold it", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      vi.stubEnv("PARTNER_MAX_SIMULTANEOUS_CALLS", "2");
      const acme = await seedPartner(tx, { tier: "free", businesses: 2 });
      const [harbor, cedar] = acme.businessIds as [string, string];
      // Harbor holds the partner's trial number.
      const [number] = await tx.insert(phoneNumbers).values({ businessId: harbor, e164: `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`, status: "active" }).returning({ id: phoneNumbers.id });
      await tx.insert(numberTrials).values({ businessId: harbor, userId: acme.ownerId, phoneNumberId: number!.id, verifiedPhone: "+14165550199", status: "active", startedAt: new Date(), endsAt: new Date(Date.now() + 14 * 86_400_000) });
      const exhaustedAt = async () => (await tx.select({ at: numberTrials.minutesExhaustedAt }).from(numberTrials).where(eq(numberTrials.businessId, harbor)))[0]?.at ?? null;
      const mark = () => asWorkerRole(tx, async (db) => await markNumberTrialMinutesExhausted({ db }, { businessId: harbor }));
      const check = () => asWorkerRole(tx, async (db) => await checkNumberTrialMinutes({ db }, { businessId: harbor }));

      // Cedar holds as many calls open as the partner may, so Harbor's next call is refused and forwards, with the pool untouched.
      const open = [randomUUID(), randomUUID()];
      await tx.insert(calls).values(open.map((id) => ({ id, businessId: cedar, provider: "openai_live", providerCallId: `live_${id}`, transport: "voice", startedAt: new Date() })));
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await mark()).toBe(false);
      await tx.update(calls).set({ endedAt: new Date() }).where(eq(calls.businessId, cedar));

      // A browser call on Cedar holds all of Free's 1,800 seconds, so Harbor's next call is refused too.
      const browserCall = randomUUID();
      expect(await asWorker(tx, cedar, async (inner) => await reserveWebVoiceUsageInTransaction(inner, { businessId: cedar, callId: browserCall, maxDurationMs: 1_800_000 }))).toMatchObject({ allowed: true, maxDurationMs: 1_800_000 });
      expect(await phoneCall(tx, harbor)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      // Those seconds come back if the browser call ends early, so the trial number keeps answering.
      expect(await mark()).toBe(false);
      expect(await check()).toBe(false);
      expect(await exhaustedAt()).toBeNull();

      // The browser call ends having used them all, and the trial number switches to forwarding.
      await asWorker(tx, cedar, async (inner) => await correctUsageInTransaction(inner, { businessId: cedar, sourceKey: `voice:${browserCall}`, usageKind: "voice_seconds", quantity: 1_800 }));
      expect(await check()).toBe(true);
      expect(await exhaustedAt()).toBeInstanceOf(Date);
      expect(await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, number!.id), eq(outboxMessages.topic, "phoneNumber.route")))).toEqual([{ payload: { phoneNumberId: number!.id, mode: "fallback" } }]);
    });
  });
});

describe.skipIf(!client)("two businesses sharing one pool at once", () => {
  /** Committed rows, since each reservation runs in its own transaction; removed after the test. */
  async function committedPartner(input: Parameters<typeof seedPartner>[1]): Promise<Seeded> {
    return await seedPartner(client!.db, input);
  }

  async function removePartner(seeded: Seeded): Promise<void> {
    await client!.db.delete(businesses).where(eq(businesses.partnerId, seeded.partnerId));
    await client!.db.delete(partners).where(eq(partners.id, seeded.partnerId));
    await client!.db.delete(users).where(sql`${users.id} in (${seeded.ownerId}::uuid, ${seeded.adminId}::uuid)`);
  }

  /** A phone call's reservation in its own transaction, as the worker role, the way two calls arrive at once. */
  function reserveAlone(businessId: string) {
    return client!.db.transaction(async (tx) => {
      await tx.execute(sql`set local session authorization lobbystack_worker`);
      return await withBusinessTransaction(tx as unknown as Database, { businessId, actorType: "worker" }, async (inner) => await reserveUsageInTransaction(inner, { businessId, usageKind: "voice_seconds", sourceKey: `voice:${randomUUID()}` }));
    });
  }

  /** How many backends wait on a lock this one holds. Other suites run their own lock races at the same time. */
  async function waitingOn(blocker: { query: (text: string) => Promise<{ rows: Array<{ waiting: number }> }> }): Promise<number> {
    return (await blocker.query("select count(*)::int as waiting from pg_locks where not granted and pg_backend_pid() = any(pg_blocking_pids(pid))")).rows[0]!.waiting;
  }

  it("makes them wait on the pool's lock in turn, so only one gets the pool's last minutes", async () => {
    sellTiers();
    const acme = await committedPartner({ tier: "free", businesses: 3 });
    const [harbor, cedar, maple] = acme.businessIds as [string, string, string];
    const blocker = await client!.pool.connect();
    let pending: Promise<PromiseSettledResult<Awaited<ReturnType<typeof reserveAlone>>>[]> | undefined;
    try {
      // Maple used all but 200 of Free's 1,800 seconds.
      await client!.db.transaction(async (tx) => { await finishedCall(tx, maple, 1_600); });
      // Hold the pool's lock so both reservations queue behind it, each holding its own business's lock, then release them together.
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`billing-pool:${acme.partnerId}:${periodKeyFor()}`]);
      pending = Promise.allSettled([reserveAlone(harbor), reserveAlone(cedar)]);
      await vi.waitFor(async () => expect(await waitingOn(blocker)).toBe(2), { timeout: 5_000 });
      await blocker.query("rollback");
      const results = (await pending).map((result) => (result.status === "fulfilled" ? result.value : result.reason));
      expect(results.filter((result) => result.allowed)).toEqual([expect.objectContaining({ allowed: true, quantity: 200 })]);
      expect(results.filter((result) => !result.allowed)).toEqual([expect.objectContaining({ allowed: false, errorCode: "voice_limit_reached" })]);
      expect(await poolCounts(client!.db, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 1_800, voiceSecondsFinal: 1_600 });
    } finally {
      await blocker.query("rollback");
      blocker.release();
      await pending;
      await removePartner(acme);
    }
  });

  it("takes the business's lock before the pool's, so a business waiting on its own lock holds up none of its partner's other businesses", async () => {
    sellTiers();
    const acme = await committedPartner({ tier: "free", businesses: 2 });
    const [harbor, cedar] = acme.businessIds as [string, string];
    const blocker = await client!.pool.connect();
    let waiting: ReturnType<typeof reserveAlone> | undefined;
    try {
      // Hold Harbor's own usage lock, as a reservation in Harbor would.
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`billing-usage:${harbor}:${periodKeyFor()}`]);
      waiting = reserveAlone(harbor);
      await vi.waitFor(async () => expect(await waitingOn(blocker)).toBe(1), { timeout: 5_000 });
      // Harbor's reservation waits without the pool's lock, so Cedar's goes through.
      await expect(reserveAlone(cedar)).resolves.toMatchObject({ allowed: true, quantity: 300 });
      await blocker.query("rollback");
      await expect(waiting).resolves.toMatchObject({ allowed: true, quantity: 300 });
      expect(await poolCounts(client!.db, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 600 });
    } finally {
      await blocker.query("rollback");
      blocker.release();
      await waiting?.catch(() => undefined);
      await removePartner(acme);
    }
  });
});
