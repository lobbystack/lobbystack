import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingAccounts, businesses, createDatabaseClient, numberTrials, onboardingNumberClaimEvents, onboardingPhoneVerifications, outboxMessages, partnerBillingAccounts, partnerLifecycles, partnerNumberCharges, partners, partnerTierBilling, phoneNumbers, prospectDemos, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { openPartnerBusiness } from "./businessAccess";
import { forgetCachedBrands } from "./brands";
import { claimProspectDemo, createPartnerDemo } from "./demos";
import { getPartnerBilling, reconcilePartnerTier, recordPartnerPolarEvent } from "./partnerBilling";
import { loadPartnerNumberStanding, partnerNumberAvailabilityInTransaction, recordPartnerNumberCostInTransaction, recordPartnerTierBilling, settlePartnerNumberCharges, type PartnerNumberCharge } from "./partnerNumbers";
import { acceptPartnerInvitation, createPartnerBusiness, hashPartnerToken, invitePartnerMember, signUpPartner, type PartnerMemberActor } from "./partners";
import { assertTransferNumberAllowed, keepPartnerTrialNumber, sweepNumberTrial, trialTransferNumber } from "./numberTrials";
import { claimNumberProvisioning, completeNumberProvisioning, reserveOnboardingNumberClaim, searchBusinessNumberInventory } from "./phoneNumbers";
import { checkOnboardingPhoneVerificationCode, startOnboardingPhoneVerification } from "./phoneVerification";
import { setManagedPlanForApi, type PlatformKeyCaller } from "./publicApi/operations";
import { acceptInvitation, createBusiness } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner number integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

/**
 * partner_tier_billing holds one row, and each test writes it in a transaction
 * it rolls back, so suites running at once wait on each other's row. Every
 * test that writes it takes this lock first, before it holds anything another
 * suite could wait on, so those waits never deadlock.
 */
async function lockTierBilling(tx: DatabaseTransaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('test:partner_tier_billing', 0))`);
}

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await lockTierBilling(tx);
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

type Person = { userId: string; email: string };

/** Accounts made as the migrator; every call after this runs as the app role. */
async function people(tx: DatabaseTransaction, count: number): Promise<Person[]> {
  const made = Array.from({ length: count }, () => {
    const userId = randomUUID();
    return { userId, email: `${userId}@example.invalid` };
  });
  await tx.execute(sql`reset role`);
  await tx.insert(users).values(made.map((person) => ({ id: person.userId, email: person.email, normalizedEmail: person.email, name: `Person ${person.userId.slice(0, 4)}`, emailVerified: true })));
  await tx.execute(sql`set local role lobbystack_app`);
  return made;
}

/** Reads or writes as the migrator, then goes back to the app role. */
async function asMigrator<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/**
 * Runs as the worker role, as the worker and the v1 API do, then goes back to
 * the app role. Security-definer functions trust session_user, so this
 * switches it rather than the current role.
 */
async function asWorker<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** Runs as the app's own session, as the admin does, which the dashboard's claim functions require. */
async function asAppSession<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_app`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

/** The link token in the email queued for an invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

/** A partner signed up by its owner, with a member on its team. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, member] = await people(tx, 2);
  const context = { db: tx as unknown as Database };
  // A name of its own, so its slug never waits on another suite's partner of the same name.
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name: `${name} ${randomUUID().slice(0, 8)}` });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  const { invitationId } = await invitePartnerMember(context, ownerActor, { email: member!.email, role: "member" });
  await acceptPartnerInvitation(context, { userId: member!.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: member!.email, emailVerified: true });
  return { context, partnerId, owner: owner!, ownerActor, member: member! };
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** A random Toronto number, so tests running at once never share one. */
const testNumber = () => `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;

/** A business the partner created, past onboarding, whose own owner accepted the invitation. */
async function business(tx: DatabaseTransaction, acme: Awaited<ReturnType<typeof partner>>, name: string): Promise<{ businessId: string; owner: Person }> {
  const [owner] = await people(tx, 1);
  // A name of its own, so its slug never waits on another suite's business of the same name.
  const { businessId, invitationId } = await createPartnerBusiness(acme.context, acme.ownerActor, { name: `${name} ${randomUUID().slice(0, 8)}`, timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: owner!.email });
  await acceptInvitation(acme.context, { userId: owner!.userId, tokenHash: hash(await linkToken(tx, invitationId)), email: owner!.email, emailVerified: true });
  await asMigrator(tx, async () => await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId)));
  return { businessId, owner: owner! };
}

/** Polar's subscription for the partner's tier, stored as the webhook route does and reconciled as the worker does. */
async function tier(tx: DatabaseTransaction, partnerId: string, input: { tier: "starter" | "growth" | "scale"; status: string; modifiedAt: string }): Promise<void> {
  const context = { db: tx as unknown as Database };
  const providerEventId = `evt_${randomUUID()}`;
  const payload = {
    id: "sub_1",
    status: input.status,
    customer: { id: "cus_1", external_id: `partner:${partnerId}` },
    current_period_start: "2026-10-01T00:00:00.000Z",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancel_at_period_end: false,
    billingKey: `partner:${partnerId}`,
    customerId: "cus_1",
    subscriptionId: "sub_1",
    partnerTier: input.tier,
    billingInterval: "monthly",
    subscriptionState: input.status,
    subscriptionModifiedAt: input.modifiedAt,
  };
  expect(await recordPartnerPolarEvent(context, { partnerId, providerEventId, eventType: `subscription.${input.status === "active" ? "active" : "updated"}`, payload })).toBe("stored");
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, `provider-event:${providerEventId}:partner-billing`)));
  expect(await asWorker(tx, async () => await reconcilePartnerTier(context, { partnerId, providerEventId: String(message!.payload.providerEventId) }))).toBe(true);
}

/** Reserves a number from the dashboard, as the business's owner. Resolves to the claim's id. */
function claim(tx: DatabaseTransaction, input: { businessId: string; owner: Person }): Promise<string | undefined> {
  const db = tx as unknown as Database;
  return asAppSession(tx, async () => await withBusinessTransaction(db, { userId: input.owner.userId, businessId: input.businessId, actorType: "operator" }, async (inner) => (await inner.execute<{ id: string }>(sql`select app.reserve_onboarding_number_claim(${input.businessId}::uuid, ${input.owner.userId}::uuid, ${testNumber()}, '{"countryCode":"CA","kind":"local"}'::jsonb, ${randomUUID()}, ${randomUUID()}) as id`)).rows[0]?.id));
}

/** Reserves a number through the v1 API, as a platform key does: its claim limits count by business. An API key's count the person's claims. */
function apiClaim(tx: DatabaseTransaction, input: { businessId: string; owner: Person }, quotaByBusiness = true): Promise<unknown> {
  const db = tx as unknown as Database;
  return asWorker(tx, async () => await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (inner) => await inner.execute(sql`select app.reserve_api_number_claim(${input.businessId}::uuid, ${input.owner.userId}::uuid, 'onboarding', null, ${testNumber()}, '{"countryCode":"CA","kind":"local"}'::jsonb, ${randomUUID()}, ${randomUUID()}, null, ${quotaByBusiness}::boolean)`)));
}

/** Reserves a replacement for a number the business holds through the v1 API, as a platform key does. */
function apiReplacement(tx: DatabaseTransaction, input: { businessId: string; owner: Person; phoneNumberId: string }): Promise<unknown> {
  const db = tx as unknown as Database;
  return asWorker(tx, async () => await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (inner) => await inner.execute(sql`select app.reserve_api_number_claim(${input.businessId}::uuid, ${input.owner.userId}::uuid, 'replacement', ${input.phoneNumberId}::uuid, ${testNumber()}, '{"countryCode":"CA","kind":"local"}'::jsonb, ${randomUUID()}, ${randomUUID()}, null, true)`)));
}

/** Claims of the business that bought a number `hoursAgo`, made by its owner, whose own claim limits the dashboard then counts. */
async function boughtEarlier(tx: DatabaseTransaction, input: { businessId: string; owner: Person }, count: number, hoursAgo: number): Promise<void> {
  const at = new Date(Date.now() - hoursAgo * 3_600_000);
  await asMigrator(tx, async () => await tx.insert(onboardingNumberClaimEvents).values(Array.from({ length: count }, () => ({ businessId: input.businessId, userId: input.owner.userId, requestedE164: testNumber(), selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "claimed", reservedAt: at, purchasedAt: at }))));
}

/** Claims this person made for the business this hour that failed, from its own team. */
async function failedThisHour(tx: DatabaseTransaction, input: { businessId: string; userId: string }, count: number): Promise<void> {
  await asMigrator(tx, async () => await tx.insert(onboardingNumberClaimEvents).values(Array.from({ length: count }, () => ({ businessId: input.businessId, userId: input.userId, requestedE164: testNumber(), selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "failed" }))));
}

/** A number the business holds, bought at `createdAt`. */
async function hold(tx: DatabaseTransaction, businessId: string, input: { createdAt?: Date; reclaimScheduledAt?: Date } = {}): Promise<string> {
  const [number] = await asMigrator(tx, async () => await tx.insert(phoneNumbers).values({ businessId, e164: testNumber(), status: "active", ...(input.createdAt ? { createdAt: input.createdAt } : {}), ...(input.reclaimScheduledAt ? { reclaimScheduledAt: input.reclaimScheduledAt, reclaimReason: "replacement" } : {}) }).returning({ id: phoneNumbers.id }));
  return number!.id;
}

/** Records whether the deployment bills tiers, as the worker does from its environment when it starts. */
async function billTiers(tx: DatabaseTransaction, enabled: boolean): Promise<void> {
  await asWorker(tx, async () => await recordPartnerTierBilling({ db: tx as unknown as Database }, { enabled }));
}

/** The partner's standing as its owner reads it on the Billing page. */
async function numbersHeld(acme: Awaited<ReturnType<typeof partner>>): Promise<number> {
  return (await getPartnerBilling(acme.context, acme.ownerActor)).numbersHeld;
}

const inventory = () => ({ listAvailablePhoneNumbers: vi.fn(async () => [{ phoneE164: testNumber(), countryCode: "CA", capabilities: { sms: true, voice: true } }]) });
const DAY = 86_400_000;

describe.skipIf(!client)("phone numbers across a partner's businesses", () => {
  it("counts the numbers all its businesses hold against its tier's included numbers, and lets only a paid tier hold more", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const [harbor, cedar, maple, birch] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic"), await business(tx, acme, "Maple Vet"), await business(tx, acme, "Birch Spa")];

      // On Free the tier includes no number. The dashboard offers the partner's trial number instead, which needs the owner's verified
      // mobile, so the search refuses before it offers one, and every claim for a number of the business's own refuses.
      expect(await withBusinessTransaction(acme.context.db, { userId: harbor!.owner.userId, businessId: harbor!.businessId, actorType: "operator" }, async (inner) => await partnerNumberAvailabilityInTransaction(inner, harbor!.businessId))).toEqual({ available: true, trial: true, refusal: null });
      const search = inventory();
      expect(await refusal(searchBusinessNumberInventory(acme.context, { userId: harbor!.owner.userId, businessId: harbor!.businessId, claimTokenSecret: "test-secret" }, search))).toMatchObject({ status: 409, code: "phone_verification_required" });
      expect(search.listAvailablePhoneNumbers).not.toHaveBeenCalled();
      expect(await refusal(claim(tx, harbor!))).toMatchObject({ code: "P0001", message: "partner_number_limit_reached" });
      expect(await refusal(apiClaim(tx, harbor!))).toMatchObject({ code: "P0001", message: "partner_number_limit_reached" });

      // Starter includes two numbers. A number on its way out, such as a replaced one, isn't held.
      await tier(tx, acme.partnerId, { tier: "starter", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      await hold(tx, harbor!.businessId);
      await hold(tx, cedar!.businessId, { reclaimScheduledAt: new Date(Date.now() + 30 * DAY) });
      expect(await numbersHeld(acme)).toBe(1);
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "starter", includedNumbers: 2 });

      // A claim counts while it buys its number, so the next business's claim takes the second included number.
      await expect(claim(tx, maple!)).resolves.toEqual(expect.any(String));
      expect(await numbersHeld(acme)).toBe(2);

      // Past the included numbers, a paid tier still gets a number, which costs the partner extra.
      expect(await withBusinessTransaction(acme.context.db, { userId: birch!.owner.userId, businessId: birch!.businessId, actorType: "operator" }, async (inner) => await partnerNumberAvailabilityInTransaction(inner, birch!.businessId))).toEqual({ available: true, trial: false, refusal: null });
      const offered = inventory();
      expect((await searchBusinessNumberInventory(acme.context, { userId: birch!.owner.userId, businessId: birch!.businessId, claimTokenSecret: "test-secret" }, offered)).numbers).toHaveLength(1);
      await expect(claim(tx, birch!)).resolves.toEqual(expect.any(String));
      expect(await numbersHeld(acme)).toBe(3);
      // Inside a business, the partner's own count is what the claim checks, though RLS hides the partner's other businesses.
      expect(await withBusinessTransaction(acme.context.db, { userId: birch!.owner.userId, businessId: birch!.businessId, actorType: "operator" }, async (inner) => await loadPartnerNumberStanding(inner, acme.partnerId))).toEqual({ held: 3, included: 2, paidTier: true, counted: true, trialAvailable: false });

      // Once the tier ends, the partner is on Free again and gets no number past the included ones.
      await tier(tx, acme.partnerId, { tier: "starter", status: "revoked", modifiedAt: "2026-10-02T00:00:01.000Z" });
      const [elm] = [await business(tx, acme, "Elm Bakery")];
      expect(await refusal(apiClaim(tx, elm!))).toMatchObject({ code: "P0001", message: "partner_number_limit_reached" });
    });
  });

  it("tells only the partner's own team, and its own businesses, where it stands", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const other = await partner(tx, "Bright Desk");
      const harbor = await business(tx, acme, "Harbor Dental");
      const elsewhere = await business(tx, other, "Corner Shop");
      await billTiers(tx, true);
      await expect(withBusinessTransaction(acme.context.db, { userId: acme.owner.userId, actorType: "operator" }, async (inner) => await loadPartnerNumberStanding(inner, acme.partnerId))).resolves.toEqual({ held: 0, included: 0, paidTier: false, counted: true, trialAvailable: true });
      await expect(withBusinessTransaction(acme.context.db, { userId: harbor.owner.userId, businessId: harbor.businessId, actorType: "operator" }, async (inner) => await loadPartnerNumberStanding(inner, acme.partnerId))).resolves.toMatchObject({ held: 0 });
      // Another partner's owner, or a business of another partner, reads nothing.
      await expect(withBusinessTransaction(acme.context.db, { userId: other.owner.userId, actorType: "operator" }, async (inner) => await loadPartnerNumberStanding(inner, acme.partnerId))).rejects.toThrow("can't be read");
      await expect(withBusinessTransaction(acme.context.db, { userId: elsewhere.owner.userId, businessId: elsewhere.businessId, actorType: "operator" }, async (inner) => await loadPartnerNumberStanding(inner, acme.partnerId))).rejects.toThrow("can't be read");
    });
  });

  it("holds each of the partner's businesses to three claims an hour, whoever claims and however", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      await tier(tx, acme.partnerId, { tier: "scale", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const [harbor, cedar, maple, birch, elm] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic"), await business(tx, acme, "Maple Vet"), await business(tx, acme, "Birch Spa"), await business(tx, acme, "Elm Bakery")];

      // Three people each claimed for Harbor this hour, and each claim failed. None of them reached their own limit, but Harbor reached its.
      const others = await people(tx, 3);
      await asMigrator(tx, async () => await tx.insert(onboardingNumberClaimEvents).values(others.map((person) => ({ businessId: harbor!.businessId, userId: person.userId, requestedE164: testNumber(), selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "failed" }))));
      expect(await refusal(claim(tx, harbor!))).toMatchObject({ code: "P0001", message: "number_claim_rate_limited" });
      expect(await refusal(apiClaim(tx, harbor!))).toMatchObject({ code: "P0001", message: "number_claim_rate_limited" });

      // The partner's other businesses still claim this hour, more than three of them between them.
      await expect(claim(tx, cedar!)).resolves.toEqual(expect.any(String));
      await expect(claim(tx, maple!)).resolves.toEqual(expect.any(String));
      await apiClaim(tx, birch!);
      await expect(claim(tx, elm!)).resolves.toEqual(expect.any(String));
    });
  });

  it("sizes the daily and 30-day quotas from the partner's tier, counting the numbers all its businesses bought or are buying", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      await tier(tx, acme.partnerId, { tier: "scale", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const [harbor, cedar, maple, birch, elm] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic"), await business(tx, acme, "Maple Vet"), await business(tx, acme, "Birch Spa"), await business(tx, acme, "Elm Bakery")];

      // Scale includes 25 numbers, so its businesses buy up to 25 a day and 50 in 30 days between them.
      // Past the 2 a day and 5 in 30 days of a partner without tier billing, Cedar still gets a number.
      await boughtEarlier(tx, harbor!, 6, 72);
      await boughtEarlier(tx, harbor!, 2, 2);
      await expect(claim(tx, cedar!)).resolves.toEqual(expect.any(String));

      // Cedar's claim is still buying its number, so it counts toward the day: Maple's is the 25th, and Birch's would be the 26th.
      await boughtEarlier(tx, harbor!, 21, 2);
      await expect(claim(tx, maple!)).resolves.toEqual(expect.any(String));
      expect(await refusal(claim(tx, birch!))).toMatchObject({ code: "P0001", message: "daily_claim_quota_reached" });
      expect(await refusal(apiClaim(tx, birch!))).toMatchObject({ code: "P0001", message: "daily_claim_quota_reached" });

      // Three days later the day is clear, and 31 numbers count toward the 30 days. Birch's is the 50th, and Elm's would be the 51st.
      await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ reservedAt: sql`now() - interval '3 days'`, purchasedAt: sql`now() - interval '3 days'` }).where(and(eq(onboardingNumberClaimEvents.businessId, harbor!.businessId), eq(onboardingNumberClaimEvents.status, "claimed"))));
      await boughtEarlier(tx, harbor!, 18, 96);
      await apiClaim(tx, birch!);
      expect(await refusal(claim(tx, elm!))).toMatchObject({ code: "P0001", message: "monthly_claim_quota_reached" });
    });
  });

  it("buys a partner's business no new number on the cloud without tier billing, even before the worker records it, and still replaces a number it holds", async () => {
    await rollbackTest(async (tx) => {
      // The worker hasn't recorded yet whether the deployment bills tiers, as after the migration that added the record.
      await asMigrator(tx, async () => await tx.delete(partnerTierBilling));
      const acme = await partner(tx, "Acme Reception");
      // Even a paid tier gets none: without tier billing, nobody would pay for the numbers.
      await tier(tx, acme.partnerId, { tier: "scale", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const [harbor, cedar] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic")];
      const inHarbor = <T>(run: (inner: DatabaseTransaction) => Promise<T>) => withBusinessTransaction(acme.context.db, { userId: harbor!.owner.userId, businessId: harbor!.businessId, actorType: "operator" }, run);
      expect(await inHarbor(async (inner) => await loadPartnerNumberStanding(inner, acme.partnerId))).toMatchObject({ counted: false });
      expect(await inHarbor(async (inner) => await partnerNumberAvailabilityInTransaction(inner, harbor!.businessId))).toEqual({ available: false, trial: false, refusal: "partner_numbers_unavailable" });
      const search = inventory();
      expect(await refusal(searchBusinessNumberInventory(acme.context, { userId: harbor!.owner.userId, businessId: harbor!.businessId, claimTokenSecret: "test-secret" }, search))).toMatchObject({ status: 409, code: "partner_numbers_unavailable" });
      expect(search.listAvailablePhoneNumbers).not.toHaveBeenCalled();
      expect(await refusal(claim(tx, harbor!))).toMatchObject({ code: "P0001", message: "partner_numbers_unavailable" });
      expect(await refusal(apiClaim(tx, cedar!))).toMatchObject({ code: "P0001", message: "partner_numbers_unavailable" });

      // Once the worker records that the deployment bills no tiers, the cloud still buys none.
      await billTiers(tx, false);
      expect(await refusal(claim(tx, cedar!))).toMatchObject({ code: "P0001", message: "partner_numbers_unavailable" });

      // A replacement swaps a number the business already holds, so the search offers one and the claim takes it.
      const held = await hold(tx, harbor!.businessId);
      const offered = inventory();
      expect((await searchBusinessNumberInventory(acme.context, { userId: harbor!.owner.userId, businessId: harbor!.businessId, purpose: "replacement", claimTokenSecret: "test-secret" }, offered)).numbers).toHaveLength(1);
      await expect(apiReplacement(tx, { ...harbor!, phoneNumberId: held })).resolves.toBeDefined();
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ numbersCounted: false });
    });
  });

  it("puts no tier limit on a partner's numbers on a self-hosted server without tier billing, and holds its businesses to 2 bought a day and 5 in 30 days between them", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, false);
      const acme = await partner(tx, "Acme Reception");
      const owned = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic"), await business(tx, acme, "Maple Vet")];
      await asMigrator(tx, async () => await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.partnerId, acme.partnerId)));
      // The partner is on Free, which would include no number on a deployment that billed tiers.
      const search = inventory();
      expect((await searchBusinessNumberInventory(acme.context, { userId: owned[0]!.owner.userId, businessId: owned[0]!.businessId, claimTokenSecret: "test-secret" }, search)).numbers).toHaveLength(1);
      expect(await withBusinessTransaction(acme.context.db, { userId: owned[0]!.owner.userId, businessId: owned[0]!.businessId, actorType: "operator" }, async (inner) => await partnerNumberAvailabilityInTransaction(inner, owned[0]!.businessId))).toEqual({ available: true, trial: false, refusal: null });
      await expect(claim(tx, owned[0]!)).resolves.toEqual(expect.any(String));
      await apiClaim(tx, owned[1]!);
      // The two numbers these claims are buying fill the partner's day.
      expect(await refusal(claim(tx, owned[2]!))).toMatchObject({ code: "P0001", message: "daily_claim_quota_reached" });

      // The Billing page shows no count, and a number bought for the partner's business costs it nothing.
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ numbersHeld: 2, numbersCounted: false });
      const [first] = await asMigrator(tx, async () => await tx.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.businessId, owned[0]!.businessId)));
      expect(await asWorker(tx, async () => await claimNumberProvisioning(acme.context, { businessId: owned[0]!.businessId, claimId: first!.id }))).toMatchObject({ countsForPartner: false });

      // Days later both are bought, and three more bought this month make five in 30 days.
      await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ status: "claimed", reservedAt: sql`now() - interval '3 days'`, purchasedAt: sql`now() - interval '3 days'` }).where(sql`${onboardingNumberClaimEvents.businessId} in (select id from businesses where partner_id = ${acme.partnerId}::uuid)`));
      await boughtEarlier(tx, owned[1]!, 3, 96);
      expect(await refusal(claim(tx, owned[2]!))).toMatchObject({ code: "P0001", message: "monthly_claim_quota_reached" });
    });
  });

  it("counts a partner's numbers against its tier on a self-hosted server that bills tiers", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      await asMigrator(tx, async () => await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, harbor.businessId)));
      const search = inventory();
      expect(await refusal(searchBusinessNumberInventory(acme.context, { userId: harbor.owner.userId, businessId: harbor.businessId, claimTokenSecret: "test-secret" }, search))).toMatchObject({ status: 409, code: "partner_number_limit_reached" });
      expect(search.listAvailablePhoneNumbers).not.toHaveBeenCalled();
      expect(await refusal(claim(tx, harbor))).toMatchObject({ code: "P0001", message: "partner_number_limit_reached" });
      await tier(tx, acme.partnerId, { tier: "starter", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const claimId = (await claim(tx, harbor))!;
      expect(await asWorker(tx, async () => await claimNumberProvisioning(acme.context, { businessId: harbor.businessId, claimId }))).toMatchObject({ countsForPartner: true });
    });
  });

  it("holds a partner member's claims to the partner's quotas, and leaves them out of the member's own cap", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      await tier(tx, acme.partnerId, { tier: "scale", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const owned = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic"), await business(tx, acme, "Maple Vet"), await business(tx, acme, "Birch Spa"), await business(tx, acme, "Elm Bakery"), await business(tx, acme, "Pier Clinic")];
      for (const each of owned) await openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: each.businessId });
      const asMember = (each: { businessId: string }) => ({ businessId: each.businessId, owner: acme.member });
      const [harbor, cedar, maple, birch, elm, pier] = owned;

      // The member claims for four of the partner's businesses this hour, one more than a person's own cap would allow.
      for (const each of [harbor, cedar, maple, birch]) await expect(claim(tx, asMember(each!))).resolves.toEqual(expect.any(String));
      expect(await asMigrator(tx, async () => await tx.select({ byPartnerMember: onboardingNumberClaimEvents.byPartnerMember }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.userId, acme.member.userId)))).toEqual([{ byPartnerMember: true }, { byPartnerMember: true }, { byPartnerMember: true }, { byPartnerMember: true }]);

      // In a business of the member's own, those claims don't count against the member's cap, from the dashboard or an API key. The cap still holds there.
      const { businessId: ownId } = await createBusiness(acme.context, { userId: acme.member.userId, name: `Member Desk ${randomUUID().slice(0, 8)}`, timezone: "America/Toronto", businessType: "test" });
      await asMigrator(tx, async () => await tx.update(businesses).set({ onboardingStage: "complete", deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, ownId)));
      const own = { businessId: ownId, owner: acme.member };
      const fail = async () => await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ status: "failed" }).where(and(eq(onboardingNumberClaimEvents.businessId, ownId), eq(onboardingNumberClaimEvents.status, "reserved"))));
      await expect(claim(tx, own)).resolves.toEqual(expect.any(String));
      await fail();
      await expect(apiClaim(tx, own, false)).resolves.toBeDefined();
      await fail();
      await failedThisHour(tx, { businessId: ownId, userId: acme.member.userId }, 1);
      expect(await refusal(claim(tx, own))).toMatchObject({ code: "P0001", message: "number_claim_rate_limited" });
      expect(await refusal(apiClaim(tx, own, false))).toMatchObject({ code: "P0001", message: "number_claim_rate_limited" });

      // The partner's quotas still hold the member: each business's three claims an hour...
      const others = await people(tx, 3);
      await asMigrator(tx, async () => await tx.insert(onboardingNumberClaimEvents).values(others.map((person) => ({ businessId: elm!.businessId, userId: person.userId, requestedE164: testNumber(), selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "failed" }))));
      expect(await refusal(claim(tx, asMember(elm!)))).toMatchObject({ code: "P0001", message: "number_claim_rate_limited" });
      // ...and the numbers the partner's businesses buy in a day: Scale's 25, here the member's four still buying and 21 bought earlier today.
      await boughtEarlier(tx, harbor!, 21, 2);
      expect(await refusal(claim(tx, asMember(pier!)))).toMatchObject({ code: "P0001", message: "daily_claim_quota_reached" });
    });
  });

  it("keeps the per-user cap for a partner's business's own team", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      await tier(tx, acme.partnerId, { tier: "scale", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const [harbor, cedar] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic")];
      // Harbor's owner claimed three numbers elsewhere this hour, so the dashboard refuses a fourth though Harbor itself made none.
      await failedThisHour(tx, { businessId: cedar!.businessId, userId: harbor!.owner.userId }, 3);
      expect(await refusal(claim(tx, harbor!))).toMatchObject({ code: "P0001", message: "number_claim_rate_limited" });
      await openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: harbor!.businessId });
      await expect(claim(tx, { businessId: harbor!.businessId, owner: acme.member })).resolves.toEqual(expect.any(String));
    });
  });

  it("takes the partner's lock, so two of its businesses claiming at once can't both pass its daily quota", async () => {
    const userId = randomUUID();
    const partnerId = randomUUID();
    const businessIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await client!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Race owner", emailVerified: true });
    await client!.db.insert(partners).values({ id: partnerId, name: "Race Reception", slug: `race-${partnerId.slice(0, 8)}` });
    // Self-hosted, on Starter, whose two included numbers make its daily quota 2 whether or not the server bills tiers.
    await client!.db.insert(businesses).values(businessIds.map((id) => ({ id, slug: `race-${id}`, name: "Race Clinic", timezone: "America/Toronto", businessType: "test", deploymentMode: "self_hosted_standard", onboardingStage: "complete", partnerId })));
    await client!.db.insert(partnerBillingAccounts).values({ partnerId, billingKey: `partner:${partnerId}`, tier: "starter", subscriptionState: "active", poolVoiceSeconds: 0, poolChats: 0, includedNumbers: 2 });
    // The partner's first business bought a number today, so the partner has one left today.
    const earlier = new Date(Date.now() - 2 * 3_600_000);
    await client!.db.insert(onboardingNumberClaimEvents).values({ businessId: businessIds[0]!, userId, requestedE164: testNumber(), selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "claimed", reservedAt: earlier, purchasedAt: earlier });
    const blocker = await client!.pool.connect();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      // Hold the partner's lock so both claims queue behind it, then release them together.
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`partner-numbers:${partnerId}`]);
      pending = Promise.allSettled(businessIds.slice(2).map((businessId) => client!.db.transaction(async (tx) => {
        await tx.execute(sql`set local session authorization lobbystack_worker`);
        return await withBusinessTransaction(tx as unknown as Database, { businessId, actorType: "worker" }, async (inner) => await inner.execute(sql`select app.reserve_api_number_claim(${businessId}::uuid, ${userId}::uuid, 'onboarding', null, ${testNumber()}, '{"countryCode":"CA","kind":"local"}'::jsonb, ${randomUUID()}, ${randomUUID()}, null, true)`));
      })));
      await vi.waitFor(async () => {
        // Count only this blocker's waiters: other test files run their own lock races in parallel.
        const result = await blocker.query("select count(*)::int as waiting from pg_locks where not granted and pg_backend_pid() = any(pg_blocking_pids(pid))");
        expect(result.rows[0].waiting).toBe(2);
      }, { timeout: 3000 });
      await blocker.query("rollback");
      const results = await pending;
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const [rejected] = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      expect((rejected!.reason as { cause?: { message?: string } }).cause?.message).toBe("daily_claim_quota_reached");
      expect(await client!.db.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents).where(sql`${onboardingNumberClaimEvents.businessId} in (select id from businesses where partner_id = ${partnerId}::uuid)`)).toHaveLength(2);
    } finally {
      await blocker.query("rollback");
      blocker.release();
      await pending;
      await client!.db.delete(businesses).where(eq(businesses.partnerId, partnerId));
      await client!.db.delete(partners).where(eq(partners.id, partnerId));
      await client!.db.delete(users).where(eq(users.id, userId));
    }
  });
});

describe.skipIf(!client)("what a partner pays for its numbers", () => {
  it("records what the host pays for each number it buys for a partner's business, and nothing for a direct business", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      await tier(tx, acme.partnerId, { tier: "starter", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const harbor = await business(tx, acme, "Harbor Dental");
      const claimId = (await claim(tx, harbor))!;

      const bought = await asWorker(tx, async () => {
        const provisioning = await claimNumberProvisioning(acme.context, { businessId: harbor.businessId, claimId });
        expect(provisioning).toMatchObject({ id: claimId, countsForPartner: true });
        return await completeNumberProvisioning(acme.context, { businessId: harbor.businessId, claimId, e164: provisioning!.e164, providerPhoneId: `PN${randomUUID()}`, voiceUrl: "sip-trunk:TK1", smsUrl: "https://desk.example.test/api/webhooks/twilio/sms", monthlyCostCents: 325 });
      });
      const recorded = await asMigrator(tx, async () => await tx.select({ partnerId: partnerNumberCharges.partnerId, businessId: partnerNumberCharges.businessId, phoneNumberId: partnerNumberCharges.phoneNumberId, monthlyCostCents: partnerNumberCharges.monthlyCostCents, monthsSettled: partnerNumberCharges.monthsSettled }).from(partnerNumberCharges).where(eq(partnerNumberCharges.businessId, harbor.businessId)));
      expect(recorded).toEqual([{ partnerId: acme.partnerId, businessId: harbor.businessId, phoneNumberId: bought, monthlyCostCents: 325, monthsSettled: 0 }]);
      expect(await numbersHeld(acme)).toBe(1);

      // A direct business's number counts against no partner.
      const [owner] = await people(tx, 1);
      const { businessId: direct } = await createBusiness(acme.context, { userId: owner!.userId, name: `Corner Shop ${randomUUID().slice(0, 8)}`, timezone: "America/Toronto", businessType: "test" });
      await asMigrator(tx, async () => {
        await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, direct));
        await tx.insert(billingAccounts).values({ businessId: direct, billingKey: `business:${direct}`, plan: "starter", subscriptionState: "active" });
      });
      const directClaim = (await claim(tx, { businessId: direct, owner: owner! }))!;
      expect(await asWorker(tx, async () => await claimNumberProvisioning(acme.context, { businessId: direct, claimId: directClaim }))).toMatchObject({ countsForPartner: false });

      // The worker records a cost only for the business's own number, under its own partner, and the app never reads them.
      const elsewhere = await hold(tx, direct);
      await expect(asWorker(tx, async () => await withBusinessTransaction(acme.context.db, { businessId: harbor.businessId, actorType: "worker" }, async (inner) => await recordPartnerNumberCostInTransaction(inner, { businessId: harbor.businessId, phoneNumberId: elsewhere, monthlyCostCents: 1 })))).rejects.toThrow();
      await expect(withBusinessTransaction(acme.context.db, { userId: harbor.owner.userId, businessId: harbor.businessId, actorType: "operator" }, async (inner) => await inner.select().from(partnerNumberCharges))).rejects.toThrow();
    });
  });

  /** Numbers the businesses hold, bought at `bought`, with what the host pays for each recorded as the worker does. */
  async function numbersBought(tx: DatabaseTransaction, acme: Awaited<ReturnType<typeof partner>>, owned: Array<{ businessId: string }>, bought: Date[], costs: number[]): Promise<string[]> {
    const numbers: string[] = [];
    for (const [index, owner] of owned.entries()) {
      const phoneNumberId = await hold(tx, owner.businessId, { createdAt: bought[index]! });
      numbers.push(phoneNumberId);
      await asWorker(tx, async () => await withBusinessTransaction(acme.context.db, { businessId: owner.businessId, actorType: "worker" }, async (inner) => await recordPartnerNumberCostInTransaction(inner, { businessId: owner.businessId, phoneNumberId, monthlyCostCents: costs[index]!, startedAt: bought[index]! })));
    }
    return numbers;
  }

  it("charges the partner each month for the numbers past its paid tier's included ones, oldest numbers included first", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      await tier(tx, acme.partnerId, { tier: "starter", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const start = Date.now();
      const owned = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic"), await business(tx, acme, "Maple Vet")];
      // Harbor's and Cedar's numbers are Starter's two included ones; Maple's, the newest, is one more.
      const bought = [start - 3 * DAY, start - 2 * DAY, start - DAY].map((at) => new Date(at));
      const numbers = await numbersBought(tx, acme, owned, bought, [110, 220, 325]);
      const maple = owned[2]!;
      const [mapleCharge] = await asMigrator(tx, async () => await tx.select({ id: partnerNumberCharges.id }).from(partnerNumberCharges).where(eq(partnerNumberCharges.phoneNumberId, numbers[2]!)));
      const reported: PartnerNumberCharge[] = [];
      const report = async (charge: PartnerNumberCharge) => { reported.push(charge); };
      const settle = (now: Date, send = report) => asWorker(tx, async () => await settlePartnerNumberCharges(acme.context, { tierBilling: true, report: send, now }));

      // Each number's first month: only Maple's is charged, at what the host pays for it.
      expect(await settle(new Date(start + 60_000))).toEqual({ settled: 3, charged: 1 });
      expect(reported).toEqual([{ chargeId: mapleCharge!.id, partnerId: acme.partnerId, businessId: maple.businessId, month: 0, periodStart: bought[2], amountCents: 325, idempotencyKey: `partner-number:${mapleCharge!.id}:0` }]);
      // Settling again charges nothing twice.
      expect(await settle(new Date(start + 60_000))).toEqual({ settled: 0, charged: 0 });
      expect(reported).toHaveLength(1);

      // A month later Polar is down: the months the tier covers still settle, and Maple's waits for the next run.
      const nextMonth = new Date(start + 32 * DAY);
      await expect(settle(nextMonth, async () => { throw new Error("Polar request failed with status 503."); })).rejects.toThrow("status 503");
      expect(await settle(nextMonth)).toEqual({ settled: 1, charged: 1 });
      expect(reported.at(-1)).toMatchObject({ businessId: maple.businessId, month: 1, amountCents: 325, idempotencyKey: `partner-number:${mapleCharge!.id}:1` });

      // Harbor's number is on its way out, so Maple's becomes an included one. Harbor's month still settles, uncharged.
      await asMigrator(tx, async () => await tx.update(phoneNumbers).set({ reclaimScheduledAt: new Date(start + 40 * DAY), reclaimReason: "replacement" }).where(eq(phoneNumbers.id, numbers[0]!)));
      expect(await settle(new Date(start + 63 * DAY))).toEqual({ settled: 3, charged: 0 });
      expect(reported).toHaveLength(2);

      // Harbor keeps its number after all, and the partner goes back to Free, which includes none and pays for none.
      // Harbor has no month to catch up on, so nothing is charged late, and every month settles uncharged.
      await asMigrator(tx, async () => await tx.update(phoneNumbers).set({ reclaimScheduledAt: null, reclaimReason: null }).where(eq(phoneNumbers.id, numbers[0]!)));
      await tier(tx, acme.partnerId, { tier: "starter", status: "revoked", modifiedAt: "2026-10-02T00:00:01.000Z" });
      expect(await settle(new Date(start + 95 * DAY))).toEqual({ settled: 3, charged: 0 });
      expect(reported).toHaveLength(2);

      // A number released settles no more months.
      await asMigrator(tx, async () => await tx.update(phoneNumbers).set({ status: "released" }).where(eq(phoneNumbers.id, numbers[1]!)));
      expect(await settle(new Date(start + 126 * DAY))).toEqual({ settled: 2, charged: 0 });
      const counts = await asMigrator(tx, async () => await tx.select({ phoneNumberId: partnerNumberCharges.phoneNumberId, monthsSettled: partnerNumberCharges.monthsSettled, monthsCharged: partnerNumberCharges.monthsCharged }).from(partnerNumberCharges).where(eq(partnerNumberCharges.partnerId, acme.partnerId)));
      expect(Object.fromEntries(counts.map((row) => [row.phoneNumberId, [row.monthsSettled, row.monthsCharged]]))).toEqual({ [numbers[0]!]: [5, 0], [numbers[1]!]: [4, 0], [numbers[2]!]: [5, 2] });
    });
  });

  it("keeps charging every other partner when Polar refuses one partner's charges", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const start = Date.now();
      const bought = [start - 3 * DAY, start - 2 * DAY, start - DAY].map((at) => new Date(at));
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      for (const team of [acme, bright]) await tier(tx, team.partnerId, { tier: "starter", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      // Acme's oldest numbers are bought first, so its charges come up before Bright's.
      const acmeNumbers = await numbersBought(tx, acme, [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic"), await business(tx, acme, "Maple Vet"), await business(tx, acme, "Elm Bakery")], [...bought, new Date(start - DAY + 60_000)].map((at) => new Date(at.getTime() - 60 * 60_000)), [110, 220, 325, 330]);
      await numbersBought(tx, bright, [await business(tx, bright, "Corner Shop"), await business(tx, bright, "Pier Clinic"), await business(tx, bright, "Oak Salon")], bought, [110, 220, 400]);
      const reported: PartnerNumberCharge[] = [];
      const refused: PartnerNumberCharge[] = [];
      const report = async (charge: PartnerNumberCharge) => {
        if (charge.partnerId === acme.partnerId) {
          refused.push(charge);
          throw new Error("Polar request failed with status 422.");
        }
        reported.push(charge);
      };
      const run = asWorker(tx, async () => await settlePartnerNumberCharges(acme.context, { tierBilling: true, report, now: new Date(start + 60_000) }));
      await expect(run).rejects.toThrow("Couldn't report 1 partner number charge for 1 partner; the next run reports it again. First error: Polar request failed with status 422.");
      // Polar heard of Acme's first extra number only: its second waits without another request, and Bright's is charged.
      expect(refused).toHaveLength(1);
      expect(reported).toEqual([expect.objectContaining({ partnerId: bright.partnerId, amountCents: 400, month: 0 })]);
      const counts = await asMigrator(tx, async () => await tx.select({ phoneNumberId: partnerNumberCharges.phoneNumberId, partnerId: partnerNumberCharges.partnerId, monthsSettled: partnerNumberCharges.monthsSettled }).from(partnerNumberCharges).where(sql`${partnerNumberCharges.partnerId} in (${acme.partnerId}::uuid, ${bright.partnerId}::uuid)`));
      // Every month the tiers cover settles, Acme's included numbers too; Acme's two extra numbers wait.
      expect(counts.filter((row) => row.monthsSettled === 0).map((row) => row.phoneNumberId).sort()).toEqual([acmeNumbers[2]!, acmeNumbers[3]!].sort());
      expect(counts.filter((row) => row.monthsSettled === 1)).toHaveLength(5);
    });
  });

  it("charges nothing on a deployment that bills no tiers, and settles the months so none is charged later", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      await tier(tx, acme.partnerId, { tier: "starter", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const start = Date.now();
      const owned = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic"), await business(tx, acme, "Maple Vet")];
      await numbersBought(tx, acme, owned, [start - 3 * DAY, start - 2 * DAY, start - DAY].map((at) => new Date(at)), [110, 220, 325]);
      const report = vi.fn(async () => undefined);
      expect(await asWorker(tx, async () => await settlePartnerNumberCharges(acme.context, { tierBilling: false, report, now: new Date(start + 60_000) }))).toEqual({ settled: 3, charged: 0 });
      expect(report).not.toHaveBeenCalled();
      // The run recorded that the deployment bills no tiers, so the partner's numbers aren't counted either.
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ numbersHeld: 3, numbersCounted: false });
      // Tiers billed again later charge from the next month on, never the months already settled.
      expect(await asWorker(tx, async () => await settlePartnerNumberCharges(acme.context, { tierBilling: true, report, now: new Date(start + 60_000) }))).toEqual({ settled: 0, charged: 0 });
      expect(report).not.toHaveBeenCalled();
    });
  });
});

describe.skipIf(!client)("a partner's trial number", () => {
  const claimTokenSecret = "partner-trial-secret";

  /** The business's owner verified a Canadian mobile in the business, as onboarding has them do. Resolves to the mobile. */
  async function verifyOwner(tx: DatabaseTransaction, input: { businessId: string; owner: Person }): Promise<string> {
    const phone = testNumber();
    await asMigrator(tx, async () => {
      await tx.update(users).set({ phone, phoneVerifiedAt: new Date() }).where(eq(users.id, input.owner.userId));
      await tx.insert(onboardingPhoneVerifications).values({ businessId: input.businessId, userId: input.owner.userId, phoneE164: phone, countryCode: "CA", status: "approved", approvedAt: new Date(), expiresAt: new Date(Date.now() + 600_000), requestFingerprint: randomUUID() });
    });
    return phone;
  }

  /** The owner searches the dashboard for a number and claims the first offer. Resolves to the search and the claim's id. */
  async function claimFromDashboard(tx: DatabaseTransaction, acme: Awaited<ReturnType<typeof partner>>, input: { businessId: string; owner: Person }) {
    const search = await searchBusinessNumberInventory(acme.context, { userId: input.owner.userId, businessId: input.businessId, claimTokenSecret }, inventory());
    const claimId = await asAppSession(tx, async () => await reserveOnboardingNumberClaim(acme.context, { userId: input.owner.userId, businessId: input.businessId, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID(), ipHash: randomUUID() }));
    return { search, claimId };
  }

  /** The worker buys the claim's number. Resolves to the number's id. */
  async function provision(tx: DatabaseTransaction, acme: Awaited<ReturnType<typeof partner>>, input: { businessId: string; claimId: string }): Promise<string> {
    return await asWorker(tx, async () => {
      expect(await claimNumberProvisioning(acme.context, input)).toMatchObject({ countsForPartner: true });
      return await completeNumberProvisioning(acme.context, { ...input, e164: testNumber(), providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "sip-trunk:TK-test", smsUrl: "https://example.invalid/sms", monthlyCostCents: 115 });
    });
  }

  /** A trial claim made straight against the database, for a business the dashboard wouldn't offer one. */
  function trialClaim(tx: DatabaseTransaction, input: { businessId: string; owner: Person; phone: string }): Promise<unknown> {
    const db = tx as unknown as Database;
    const selection = JSON.stringify({ countryCode: "CA", kind: "local", trial: true, verifiedPhone: input.phone });
    return asAppSession(tx, async () => await withBusinessTransaction(db, { userId: input.owner.userId, businessId: input.businessId, actorType: "operator" }, async (inner) => await inner.execute(sql`select app.reserve_trial_number_claim(${input.businessId}::uuid, ${input.owner.userId}::uuid, ${testNumber()}, ${selection}::jsonb, ${randomUUID()}, ${randomUUID()}, ${randomUUID()})`)));
  }

  const availability = (acme: Awaited<ReturnType<typeof partner>>, input: { businessId: string; owner: Person }) => withBusinessTransaction(acme.context.db, { userId: input.owner.userId, businessId: input.businessId, actorType: "operator" }, async (inner) => await partnerNumberAvailabilityInTransaction(inner, input.businessId));

  /** Twilio Verify and Lookup, approving every code. */
  const approvingVerify = { lookupLineType: async () => "mobile", sendCode: async () => ({ sid: "VE-test" }), checkCode: async () => "approved" };

  /** Verifies the person's mobile in the business at the phone step, as the phone settings do. Resolves to the mobile. */
  async function verifyAtPhoneStep(tx: DatabaseTransaction, acme: Awaited<ReturnType<typeof partner>>, input: { userId: string; businessId: string }): Promise<string> {
    const phoneE164 = testNumber();
    await asAppSession(tx, async () => {
      const { attemptId } = await startOnboardingPhoneVerification(acme.context, { ...input, phoneE164, countryCode: "CA" }, approvingVerify);
      expect(await checkOnboardingPhoneVerificationCode(acme.context, { ...input, attemptId, code: "123456" }, approvingVerify)).toMatchObject({ approved: true });
    });
    return phoneE164;
  }

  it("lets a partner member who opened a business verify their mobile and claim the partner's trial, whose calls then transfer only to that mobile", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const [harbor, cedar] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic")];
      const cedarPhone = await verifyOwner(tx, cedar);
      await openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: harbor.businessId });
      const inHarbor = { businessId: harbor.businessId, owner: acme.member };
      expect(await availability(acme, inHarbor)).toEqual({ available: true, trial: true, refusal: null });

      // The trial needs the claimer's own verified mobile, so the search refuses until the member verifies one in Harbor.
      expect(await refusal(searchBusinessNumberInventory(acme.context, { userId: acme.member.userId, businessId: harbor.businessId, claimTokenSecret }, inventory()))).toMatchObject({ status: 409, code: "phone_verification_required" });
      const memberPhone = await verifyAtPhoneStep(tx, acme, { userId: acme.member.userId, businessId: harbor.businessId });
      const { search, claimId } = await claimFromDashboard(tx, acme, inHarbor);
      expect(search.trial).toBe(true);
      expect(await asMigrator(tx, async () => await tx.select({ userId: numberTrials.userId, verifiedPhone: numberTrials.verifiedPhone, partnerId: numberTrials.partnerId }).from(numberTrials).where(eq(numberTrials.businessId, harbor.businessId)))).toEqual([{ userId: acme.member.userId, verifiedPhone: memberPhone, partnerId: acme.partnerId }]);
      expect(await asMigrator(tx, async () => (await tx.select({ byPartnerMember: onboardingNumberClaimEvents.byPartnerMember }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.id, claimId)))[0])).toEqual({ byPartnerMember: true });
      // The member's verification leaves the owner's onboarding as it was.
      expect(await asMigrator(tx, async () => (await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, harbor.businessId)))[0])).toEqual({ stage: "complete" });

      // The partner still has one trial, so Cedar's owner gets none.
      expect(await refusal(trialClaim(tx, { ...cedar, phone: cedarPhone }))).toMatchObject({ code: "P0001", message: "partner_trial_used" });

      // Once the worker buys the number, calls transfer only to the member's mobile.
      await provision(tx, acme, { businessId: harbor.businessId, claimId });
      expect(await asWorker(tx, async () => await trialTransferNumber(acme.context, { businessId: harbor.businessId }))).toBe(memberPhone);
      await expect(withBusinessTransaction(acme.context.db, { userId: harbor.owner.userId, businessId: harbor.businessId, actorType: "operator" }, async (inner) => await assertTransferNumberAllowed(inner, { businessId: harbor.businessId, phone: testNumber() }))).rejects.toMatchObject({ status: 409, code: "trial_transfer_locked" });

      // The host's trial emails carry the host's prices, so a partner's business gets none, whoever claimed the trial.
      const [trial] = await asMigrator(tx, async () => await tx.select({ endsAt: numberTrials.endsAt }).from(numberTrials).where(eq(numberTrials.businessId, harbor.businessId)));
      expect(await asWorker(tx, async () => await sweepNumberTrial(acme.context, { businessId: harbor.businessId, now: new Date(trial!.endsAt!.getTime() - 4 * DAY) }))).toEqual({ ended: false, emails: [] });
    });
  });

  it("lets a partner member verify a mobile only while the business is offered its partner's trial, from a country with trial numbers", async () => {
    await rollbackTest(async (tx) => {
      // Australia sells numbers, but none for a trial.
      vi.stubEnv("TWILIO_AU_BUNDLE_SID", "BU-test");
      vi.stubEnv("TWILIO_AU_ADDRESS_SID", "AD-test");
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const member = { userId: acme.member.userId, businessId: harbor.businessId };
      await openPartnerBusiness(acme.context, member);
      const start = (input: { userId: string; businessId: string }, countryCode: string) => asAppSession(tx, async () => await startOnboardingPhoneVerification(acme.context, { ...input, phoneE164: countryCode === "AU" ? `+614${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}` : testNumber(), countryCode }, approvingVerify));
      const forbidden = { status: 403, code: "forbidden" };

      // The member verifies only for the trial, so only from a trial country. The owner's phone step still takes Australia.
      expect(await refusal(start(member, "AU"))).toMatchObject({ status: 422, code: "phone_country_unsupported" });
      await expect(start({ userId: harbor.owner.userId, businessId: harbor.businessId }, "AU")).resolves.toMatchObject({ attemptId: expect.any(String) });
      await expect(start(member, "CA")).resolves.toMatchObject({ attemptId: expect.any(String) });

      // Before the owner finishes onboarding, the business can't claim a number yet.
      await asMigrator(tx, async () => await tx.update(businesses).set({ onboardingStage: "website" }).where(eq(businesses.id, harbor.businessId)));
      expect(await availability(acme, { businessId: harbor.businessId, owner: acme.member })).toEqual({ available: false, trial: false, refusal: "invalid_onboarding_stage" });
      expect(await refusal(start(member, "CA"))).toMatchObject(forbidden);
      await asMigrator(tx, async () => await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, harbor.businessId)));

      // A paid tier includes numbers, so it offers no trial.
      await tier(tx, acme.partnerId, { tier: "starter", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      expect(await refusal(start(member, "CA"))).toMatchObject(forbidden);
      // Nor does the cloud without tier billing, where the business gets no number at all.
      await billTiers(tx, false);
      expect(await availability(acme, { businessId: harbor.businessId, owner: acme.member })).toEqual({ available: false, trial: false, refusal: "partner_numbers_unavailable" });
      expect(await refusal(start(member, "CA"))).toMatchObject(forbidden);
    });
  });


  it("gives a partner on Free one 14-day trial number for one of its businesses, ever, even after that business is deleted", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const [harbor, cedar] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic")];
      const [, cedarPhone] = [await verifyOwner(tx, harbor), await verifyOwner(tx, cedar)];
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "free", trialNumber: "available" });
      expect(await availability(acme, harbor)).toEqual({ available: true, trial: true, refusal: null });

      // Harbor's owner picks a number from the dashboard, and it's the partner's trial.
      const { search, claimId } = await claimFromDashboard(tx, acme, harbor);
      expect(search.trial).toBe(true);
      expect(await asMigrator(tx, async () => await tx.select({ partnerId: numberTrials.partnerId, status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, harbor.businessId)))).toEqual([{ partnerId: acme.partnerId, status: "reserved" }]);

      // While Harbor's number is still being bought, the partner's other businesses get no trial of their own.
      expect(await availability(acme, cedar)).toEqual({ available: false, trial: false, refusal: "partner_number_limit_reached" });
      expect(await refusal(searchBusinessNumberInventory(acme.context, { userId: cedar.owner.userId, businessId: cedar.businessId, claimTokenSecret }, inventory()))).toMatchObject({ status: 409, code: "partner_number_limit_reached" });
      expect(await refusal(trialClaim(tx, { ...cedar, phone: cedarPhone }))).toMatchObject({ code: "P0001", message: "partner_trial_used" });

      // The worker buys it: the trial runs 14 days, its number goes when its month at the carrier runs out, and calls transfer only to the owner's mobile.
      const phoneNumberId = await provision(tx, acme, { businessId: harbor.businessId, claimId });
      const [trial] = await asMigrator(tx, async () => await tx.select({ status: numberTrials.status, startedAt: numberTrials.startedAt, endsAt: numberTrials.endsAt }).from(numberTrials).where(eq(numberTrials.businessId, harbor.businessId)));
      expect(trial).toMatchObject({ status: "active" });
      expect(trial!.endsAt!.getTime() - trial!.startedAt!.getTime()).toBeGreaterThan(13 * DAY);
      expect(await asMigrator(tx, async () => (await tx.select({ reason: phoneNumbers.reclaimReason }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0])).toEqual({ reason: "trial" });
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ trialNumber: "used", numbersHeld: 0 });

      // Deleting the business deletes its trial, and the partner still had its one.
      await asMigrator(tx, async () => await tx.delete(businesses).where(eq(businesses.id, harbor.businessId)));
      expect(await availability(acme, cedar)).toEqual({ available: false, trial: false, refusal: "partner_number_limit_reached" });
      expect(await refusal(trialClaim(tx, { ...cedar, phone: cedarPhone }))).toMatchObject({ code: "P0001", message: "partner_trial_used" });
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ trialNumber: "used" });
    });
  });

  it("frees the partner's trial from a claim that stalled in another of its businesses", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const [harbor, cedar] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic")];
      await verifyOwner(tx, harbor);
      await verifyOwner(tx, cedar);
      const stalled = await claimFromDashboard(tx, acme, harbor);
      expect(await availability(acme, cedar)).toEqual({ available: false, trial: false, refusal: "partner_number_limit_reached" });

      // Nobody bought Harbor's number in the 15 minutes its reservation lasts, so the partner can use its trial elsewhere.
      await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ reservedAt: new Date(Date.now() - 16 * 60_000) }).where(eq(onboardingNumberClaimEvents.id, stalled.claimId)));
      expect(await availability(acme, cedar)).toEqual({ available: true, trial: true, refusal: null });
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ trialNumber: "available" });

      // Cedar's owner claims it, which expires Harbor's claim and its trial.
      const { search, claimId } = await claimFromDashboard(tx, acme, cedar);
      expect(search.trial).toBe(true);
      expect(await asMigrator(tx, async () => (await tx.select({ status: onboardingNumberClaimEvents.status }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.id, stalled.claimId)))[0])).toEqual({ status: "failed" });
      const trials = await asMigrator(tx, async () => await tx.select({ businessId: numberTrials.businessId, status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.partnerId, acme.partnerId)));
      expect(trials).toHaveLength(2);
      expect(trials).toEqual(expect.arrayContaining([{ businessId: harbor.businessId, status: "failed" }, { businessId: cedar.businessId, status: "reserved" }]));
      await provision(tx, acme, { businessId: cedar.businessId, claimId });
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ trialNumber: "used" });
    });
  });

  it("keeps a trial on its partner, until the partner itself is deleted after releasing the business that holds it", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      await verifyOwner(tx, harbor);
      const { claimId } = await claimFromDashboard(tx, acme, harbor);
      await provision(tx, acme, { businessId: harbor.businessId, claimId });
      const trialPartner = async () => await asMigrator(tx, async () => (await tx.select({ partnerId: numberTrials.partnerId, status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, harbor.businessId)))[0]);
      // No update moves the trial off its partner.
      await asMigrator(tx, async () => await tx.update(numberTrials).set({ partnerId: null }).where(eq(numberTrials.businessId, harbor.businessId)));
      expect(await trialPartner()).toEqual({ partnerId: acme.partnerId, status: "active" });
      // The partner releases the business, which keeps its trial, and is then deleted. That clears the trial's partner, and the trial keeps running.
      await asMigrator(tx, async () => await tx.update(businesses).set({ partnerId: null }).where(eq(businesses.id, harbor.businessId)));
      expect(await trialPartner()).toEqual({ partnerId: acme.partnerId, status: "active" });
      await asMigrator(tx, async () => await tx.delete(partners).where(eq(partners.id, acme.partnerId)));
      expect(await trialPartner()).toEqual({ partnerId: null, status: "active" });
    });
  });

  it("makes the trial number one of the partner's numbers when it pays for a tier, and offers no trial to a paid tier", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const [harbor, cedar] = [await business(tx, acme, "Harbor Dental"), await business(tx, acme, "Cedar Clinic")];
      await verifyOwner(tx, harbor);
      const cedarPhone = await verifyOwner(tx, cedar);
      const { claimId } = await claimFromDashboard(tx, acme, harbor);
      const phoneNumberId = await provision(tx, acme, { businessId: harbor.businessId, claimId });
      // On Free nothing pays for the number, so reconciling keeps the trial as it is.
      expect(await asWorker(tx, async () => await keepPartnerTrialNumber(acme.context, { partnerId: acme.partnerId }))).toBe(false);

      // The partner buys Starter, and the worker keeps the number once it reconciles the tier.
      await tier(tx, acme.partnerId, { tier: "starter", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      expect(await asWorker(tx, async () => await keepPartnerTrialNumber(acme.context, { partnerId: acme.partnerId }))).toBe(true);
      expect(await asMigrator(tx, async () => (await tx.select({ status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, harbor.businessId)))[0])).toEqual({ status: "converted" });
      expect(await asMigrator(tx, async () => (await tx.select({ reason: phoneNumbers.reclaimReason, at: phoneNumbers.reclaimScheduledAt }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0])).toEqual({ reason: null, at: null });
      expect(await asMigrator(tx, async () => await tx.select({ topic: outboxMessages.topic, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, phoneNumberId), eq(outboxMessages.topic, "phoneNumber.route"))))).toEqual([{ topic: "phoneNumber.route", payload: { phoneNumberId, mode: "receptionist" } }]);
      // It now counts as one of Starter's two included numbers.
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "starter", numbersHeld: 1, trialNumber: null });
      expect(await asWorker(tx, async () => await keepPartnerTrialNumber(acme.context, { partnerId: acme.partnerId }))).toBe(false);

      // A paid tier includes numbers, so it gets no trial.
      expect(await availability(acme, cedar)).toEqual({ available: true, trial: false, refusal: null });
      expect((await searchBusinessNumberInventory(acme.context, { userId: cedar.owner.userId, businessId: cedar.businessId, claimTokenSecret }, inventory())).trial).toBe(false);
      expect(await refusal(trialClaim(tx, { ...cedar, phone: cedarPhone }))).toMatchObject({ code: "P0001", message: "trial_not_needed" });
    });
  });

  it("keeps a trial number the partner paid for while the worker was still buying it", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      await verifyOwner(tx, harbor);
      const { claimId } = await claimFromDashboard(tx, acme, harbor);
      await tier(tx, acme.partnerId, { tier: "growth", status: "active", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const phoneNumberId = await provision(tx, acme, { businessId: harbor.businessId, claimId });
      expect(await asMigrator(tx, async () => (await tx.select({ status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, harbor.businessId)))[0])).toEqual({ status: "converted" });
      expect(await asMigrator(tx, async () => (await tx.select({ reason: phoneNumbers.reclaimReason }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0])).toEqual({ reason: null });
    });
  });

  it("offers no trial to a business paused with its partner's others, nor to a demo nobody claimed yet", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const harborPhone = await verifyOwner(tx, harbor);
      expect(await availability(acme, harbor)).toEqual({ available: true, trial: true, refusal: null });

      // The partner's tier ended a month ago, so its businesses are paused: none of them is live, and none gets the trial.
      await asMigrator(tx, async () => await tx.insert(partnerLifecycles).values({ partnerId: acme.partnerId, state: "paused", since: new Date(Date.now() - DAY), tierEndedAt: new Date(Date.now() - 31 * DAY) }));
      expect(await availability(acme, harbor)).toEqual({ available: false, trial: false, refusal: "partner_number_limit_reached" });
      expect(await refusal(searchBusinessNumberInventory(acme.context, { userId: harbor.owner.userId, businessId: harbor.businessId, claimTokenSecret }, inventory()))).toMatchObject({ status: 409, code: "partner_numbers_unavailable" });
      expect(await refusal(trialClaim(tx, { ...harbor, phone: harborPhone }))).toMatchObject({ code: "P0001", message: "partner_numbers_unavailable" });
      // The partner still has its trial for when its businesses answer again.
      await asMigrator(tx, async () => await tx.update(partnerLifecycles).set({ state: "active", since: new Date(), tierEndedAt: null }).where(eq(partnerLifecycles.partnerId, acme.partnerId)));
      expect(await availability(acme, harbor)).toEqual({ available: true, trial: true, refusal: null });

      // A demo is one of the partner's businesses with no owner. The partner's owner opens it and verified a mobile there, but it expires, so it gets no trial.
      const demo = await createPartnerDemo(acme.context, acme.ownerActor, { name: `Pier Dental ${randomUUID().slice(0, 8)}`, websiteUrl: "https://example.com" });
      await openPartnerBusiness(acme.context, { userId: acme.owner.userId, businessId: demo.businessId });
      await asMigrator(tx, async () => await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, demo.businessId)));
      const inDemo = { businessId: demo.businessId, owner: acme.owner };
      const demoPhone = await verifyOwner(tx, inDemo);
      expect(await availability(acme, inDemo)).toEqual({ available: false, trial: false, refusal: "partner_number_limit_reached" });
      expect(await refusal(searchBusinessNumberInventory(acme.context, { userId: acme.owner.userId, businessId: demo.businessId, claimTokenSecret }, inventory()))).toMatchObject({ status: 409, code: "partner_numbers_unavailable" });
      expect(await refusal(trialClaim(tx, { ...inDemo, phone: demoPhone }))).toMatchObject({ code: "P0001", message: "partner_numbers_unavailable" });

      // Once a prospect claims it, it's a business someone keeps, and its owner can get the partner's trial.
      const [prospect] = await people(tx, 1);
      await asMigrator(tx, async () => await tx.update(prospectDemos).set({ status: "active", publishedAt: new Date() }).where(eq(prospectDemos.id, demo.demoId)));
      await claimProspectDemo(acme.context, { userId: prospect!.userId, token: demo.token, brand: { kind: "partner", partnerId: acme.partnerId } });
      await asMigrator(tx, async () => await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, demo.businessId)));
      const claimed = { businessId: demo.businessId, owner: prospect! };
      await verifyOwner(tx, claimed);
      expect(await availability(acme, claimed)).toEqual({ available: true, trial: true, refusal: null });
    });
  });

  it("offers no trial without tier billing, or on a self-hosted server", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, false);
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const phone = await verifyOwner(tx, harbor);
      // Without tier billing, the cloud buys a partner's business no number, trial included.
      expect(await availability(acme, harbor)).toEqual({ available: false, trial: false, refusal: "partner_numbers_unavailable" });
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ trialNumber: null });
      expect(await refusal(trialClaim(tx, { ...harbor, phone }))).toMatchObject({ code: "P0001", message: "partner_numbers_unavailable" });

      // A self-hosted server's businesses get no trial numbers, as direct ones get none there.
      await billTiers(tx, true);
      await asMigrator(tx, async () => await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, harbor.businessId)));
      expect(await availability(acme, harbor)).toEqual({ available: false, trial: false, refusal: "partner_number_limit_reached" });
      expect(await refusal(trialClaim(tx, { ...harbor, phone }))).toMatchObject({ code: "P0001", message: "trial_not_available" });
    });
  });
});

describe.skipIf(!client)("a managed plan", () => {
  it("is refused for a partner's business, which its partner bills", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const caller: PlatformKeyCaller = { businessId: harbor.businessId, platformKeyId: randomUUID(), groupId: "lobbystack", actingUserId: harbor.owner.userId, actor: "platform_key" };
      expect(await refusal(asWorker(tx, () => setManagedPlanForApi(acme.context, caller)))).toMatchObject({ status: 409, code: "conflict", message: "Its partner bills this business, so it can't have a managed plan." });
      expect(await asMigrator(tx, async () => await tx.select({ id: billingAccounts.id }).from(billingAccounts).where(and(eq(billingAccounts.businessId, harbor.businessId), eq(billingAccounts.source, "managed"))))).toEqual([]);
    });
  });
});
