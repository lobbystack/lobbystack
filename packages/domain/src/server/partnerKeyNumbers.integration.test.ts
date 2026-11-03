import { createHash, createHmac, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agents, auditLogs, businesses, businessInvitations, createDatabaseClient, onboardingNumberClaimEvents, operatorNotificationDeliveries, outboxMessages, partnerNumberCharges, phoneNumbers, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import type { ApiKeyScope } from "@lobbystack/shared";

import { forgetCachedBrands } from "./brands";
import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction, type OperatorNotificationEventKey } from "./notifications";
import { resolveNumberFallback } from "./numberTrials";
import { reconcilePartnerTier, recordPartnerPolarEvent } from "./partnerBilling";
import { createPartnerPlatformKey, revokePartnerPlatformKey } from "./partnerPlatformKeys";
import { loadPartnerNumberStanding, recordPartnerTierBilling, settlePartnerNumberCharges, type PartnerNumberCharge } from "./partnerNumbers";
import { createPartnerBusiness, listPartnerBusinesses, releaseBusiness, signUpPartner, type PartnerMemberActor } from "./partners";
import { claimNumberProvisioning, completeNumberProvisioning, reserveOnboardingNumberClaim } from "./phoneNumbers";
import { deletePartnerBusinessForApi, releasePartnerBusinessForApi } from "./publicApi/partner";
import { claimPhoneNumberForApi, completeOnboardingForApi, createCalendarConnectLinkForApi, createPartnerBusinessForApi, getOnboardingForApi, getTeamForApi, resolveActingUserId, searchPhoneNumbersForApi, type PlatformKeyCaller } from "./publicApi/operations";
import type { PartnerPlatformKey } from "./publicApi/platformKeys";
import { acceptInvitation } from "./tenancy";

// A partner that runs its own product on the v1 API: its platform keys buy and
// replace numbers on a paid tier, and create businesses nobody owns. These run
// the operations the routes call, against PostgreSQL with the worker role and
// RLS. Each claim goes through the check on the claim that counts the tier.

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner key number integration tests require a dedicated local test database.");
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

const SECRET = "number-claim-secret-for-these-tests";

/** Runs a test in one transaction as the app role, and rolls everything it wrote back. */
async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    // Tests that write the deployment's one tier billing row take this first, as partnerNumbers's do.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('test:partner_tier_billing', 0))`);
    await tx.execute(sql`set local role lobbystack_app`);
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

async function asMigrator<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** Runs as the worker role, as the v1 API does. Security-definer functions trust session_user, so this switches it. */
async function asWorker<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** The context the v1 routes run operations on: each transaction runs as lobbystack_worker. */
function workerContext(tx: DatabaseTransaction): DomainContext {
  const db = {
    async transaction<T>(callback: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
      return await asWorker(tx, async () => await tx.transaction(callback));
    },
  };
  return { db: db as unknown as Database };
}

async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

/** A random Toronto number, so tests running at once never share one. */
const testNumber = () => `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const inventory = () => ({ listAvailablePhoneNumbers: vi.fn(async () => [{ phoneE164: testNumber(), countryCode: "CA", capabilities: { sms: true, voice: true } }]) });

const SCOPES: ApiKeyScope[] = ["businesses:create", "business:read", "business:write", "phone_numbers:manage", "phone_numbers:purchase", "team:manage", "partner:read", "partner.businesses:write"];

/** A partner signed up by its owner, with a key made in its console, as the v1 pipeline resolves it. */
async function partner(tx: DatabaseTransaction, name: string) {
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await asMigrator(tx, async () => { await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Partner owner", emailVerified: true }); });
  const context: DomainContext = { db: tx as unknown as Database };
  const { partnerId } = await signUpPartner(context, { userId, email, emailVerified: true, name: `${name} ${randomUUID().slice(0, 8)}` });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId, role: "owner" };
  const key = async (): Promise<PartnerPlatformKey> => {
    const { platformKey } = await createPartnerPlatformKey(context, ownerActor, { name: "Product backend", scopes: SCOPES });
    return { platformKeyId: platformKey.id, prefix: platformKey.prefix, name: platformKey.name, group: partnerId, scopes: platformKey.scopes, createdAt: platformKey.createdAt, partnerId, access: "group" };
  };
  return { context, partnerId, ownerActor, key: await key(), makeKey: key };
}
type Partner = Awaited<ReturnType<typeof partner>>;

/** Polar's subscription for the partner's tier, stored as the webhook route does and reconciled as the worker does. */
async function tier(tx: DatabaseTransaction, partnerId: string, input: { tier: "starter" | "growth" | "scale"; status: string }): Promise<void> {
  const context = { db: tx as unknown as Database };
  const providerEventId = `evt_${randomUUID()}`;
  const payload = { id: "sub_1", status: input.status, customer: { id: "cus_1", external_id: `partner:${partnerId}` }, current_period_start: "2026-10-01T00:00:00.000Z", current_period_end: "2026-11-01T00:00:00.000Z", cancel_at_period_end: false, billingKey: `partner:${partnerId}`, customerId: "cus_1", subscriptionId: "sub_1", partnerTier: input.tier, billingInterval: "monthly", subscriptionState: input.status, subscriptionModifiedAt: new Date().toISOString() };
  await recordPartnerPolarEvent(context, { partnerId, providerEventId, eventType: `subscription.${input.status === "active" ? "active" : "updated"}`, payload });
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, `provider-event:${providerEventId}:partner-billing`)));
  expect(await asWorker(tx, async () => await reconcilePartnerTier(context, { partnerId, providerEventId: String(message!.payload.providerEventId) }))).toBe(true);
}

async function billTiers(tx: DatabaseTransaction, enabled: boolean): Promise<void> {
  await asWorker(tx, async () => await recordPartnerTierBilling({ db: tx as unknown as Database }, { enabled }));
}

/** A business with no owner, as POST /businesses makes it with no owner_email. */
async function ownerless(team: Partner, name = "Pier Dental"): Promise<string> {
  const { business } = await createPartnerBusinessForApi(team.context, { key: team.key, idempotencyKey: randomUUID(), requestHash: "hash", body: { name: `${name} ${randomUUID().slice(0, 8)}`, timezone: "America/Toronto" } });
  return business.id;
}

/** A business whose owner accepted the partner's invitation. */
async function owned(tx: DatabaseTransaction, team: Partner): Promise<{ businessId: string; userId: string }> {
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await asMigrator(tx, async () => { await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Business owner", emailVerified: true }); });
  const { businessId, invitationId } = await createPartnerBusiness(team.context, team.ownerActor, { name: `Harbor Dental ${randomUUID().slice(0, 8)}`, timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: email });
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  const token = new URL(String(message!.payload.url)).searchParams.get("token")!;
  await acceptInvitation(team.context, { userId, tokenHash: createHash("sha256").update(token).digest("hex"), email, emailVerified: true });
  return { businessId, userId };
}

const callerFor = (team: Partner, businessId: string, key = team.key): PlatformKeyCaller => ({ businessId, platformKeyId: key.platformKeyId, groupId: team.partnerId, partnerId: team.partnerId, actor: "platform_key" });

/** Searches as the key and claims the first offer. */
async function buy(tx: DatabaseTransaction, team: Partner, businessId: string) {
  const worker = workerContext(tx);
  const caller = callerFor(team, businessId);
  const [offer] = await searchPhoneNumbersForApi(worker, caller, {}, { platformKeyId: team.key.platformKeyId, scopes: SCOPES, provider: inventory(), claimTokenSecret: SECRET });
  return await claimPhoneNumberForApi(worker, caller, { offerToken: offer!.offer_token }, { platformKeyId: team.key.platformKeyId, scopes: SCOPES, claimTokenSecret: SECRET });
}

/** Buys the number a claim reserved, as the worker does. */
async function provision(tx: DatabaseTransaction, businessId: string, claimId: string, monthlyCostCents?: number): Promise<string> {
  const worker = workerContext(tx);
  const claim = await claimNumberProvisioning(worker, { businessId, claimId });
  return await completeNumberProvisioning(worker, { businessId, claimId, e164: claim!.e164, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "https://desk.example.test/voice", ...(monthlyCostCents !== undefined ? { monthlyCostCents } : {}) });
}

/** An offer signed as the search signs one, for a claim the search would never hand out. */
function signedOffer(input: { businessId: string; subject: string; trial?: boolean; purpose?: "onboarding" | "replacement" }): string {
  const e164 = testNumber();
  const payload = { v: 1, purpose: input.purpose ?? "onboarding", businessId: input.businessId, userId: input.subject, e164, countryCode: "CA", kind: "local", capabilities: { sms: true, voice: true }, selection: { countryCode: "CA", kind: "local", sms: true, ...(input.trial ? { trial: true, verifiedPhone: "+14165550100" } : {}) }, exp: Date.now() + 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", SECRET).update(encoded).digest("base64url")}`;
}

/** Calls the claim function directly as the worker in a business, past the operation's own checks. */
function rawClaim(tx: DatabaseTransaction, input: { businessId: string; platformKeyId: string; selection?: Record<string, unknown> }): Promise<unknown> {
  return workerContext(tx).db.transaction(async (inner) => {
    await inner.execute(sql`select set_config('app.actor_type', 'worker', true), set_config('app.business_id', ${input.businessId}, true)`);
    return await inner.execute(sql`select app.reserve_partner_key_number_claim(${input.businessId}::uuid, ${input.platformKeyId}::uuid, 'onboarding', null, ${testNumber()}, ${JSON.stringify(input.selection ?? { countryCode: "CA", kind: "local" })}::jsonb, ${randomUUID()}, ${randomUUID()})`);
  });
}

const DAY = 86_400_000;

describe.skipIf(!client)("a partner's platform key and phone numbers", () => {
  it("searches, claims and replaces on a paid tier, with no account behind the claim", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Software");
      await tier(tx, acme.partnerId, { tier: "growth", status: "active" });
      const businessId = await ownerless(acme);
      const worker = workerContext(tx);
      const caller = callerFor(acme, businessId);
      await expect(resolveActingUserId(worker, caller)).rejects.toMatchObject({ status: 403, code: "forbidden" });

      const provider = inventory();
      const [offer] = await searchPhoneNumbersForApi(worker, caller, {}, { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, provider, claimTokenSecret: SECRET });
      expect(offer).toMatchObject({ trial: false });
      expect(provider.listAvailablePhoneNumbers).toHaveBeenCalledTimes(1);

      const claim = await claimPhoneNumberForApi(worker, caller, { offerToken: offer!.offer_token }, { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, claimTokenSecret: SECRET });
      expect(claim).toMatchObject({ phone_number: offer!.phone_number, status: "pending" });
      const [row] = await asMigrator(tx, async () => await tx.select().from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.id, claim.id)));
      expect(row).toMatchObject({ userId: null, platformKeyId: acme.key.platformKeyId, businessId, purpose: "onboarding", byPartnerMember: false });
      const [audited] = await asMigrator(tx, async () => await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "api.phone_number.claim_started"))));
      expect(audited).toMatchObject({ actorUserId: null, payload: { actor: "platform_key", platformKeyId: acme.key.platformKeyId, partnerId: acme.partnerId, trial: false } });

      // The number comes from the worker's queue, and a business that waits for an owner stays on its onboarding step.
      const numberId = await provision(tx, businessId, claim.id);
      const [business] = await asMigrator(tx, async () => await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)));
      expect(business!.stage).toBe("website");

      const [replacement] = await searchPhoneNumbersForApi(worker, caller, { replaces: numberId }, { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, provider: inventory(), claimTokenSecret: SECRET });
      expect(await refusal(claimPhoneNumberForApi(worker, caller, { offerToken: replacement!.offer_token }, { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, claimTokenSecret: SECRET }))).toMatchObject({ code: "invalid_request" });
      const swap = await claimPhoneNumberForApi(worker, caller, { offerToken: replacement!.offer_token, replaces: numberId }, { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, claimTokenSecret: SECRET });
      expect(swap).toMatchObject({ replaces_phone_number_id: numberId });
      await provision(tx, businessId, swap.id);
      const [old] = await asMigrator(tx, async () => await tx.select({ reclaimScheduledAt: phoneNumbers.reclaimScheduledAt }).from(phoneNumbers).where(eq(phoneNumbers.id, numberId)));
      expect(old!.reclaimScheduledAt).not.toBeNull();
    });
  });

  it("refuses a partner that isn't on a paid tier, for a replacement too, before it asks the carrier", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Software");
      const businessId = await ownerless(acme);
      const worker = workerContext(tx);
      const caller = callerFor(acme, businessId);
      const key = { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, claimTokenSecret: SECRET };

      const provider = inventory();
      expect(await refusal(searchPhoneNumbersForApi(worker, caller, {}, { ...key, provider }))).toMatchObject({ status: 409, message: expect.stringContaining("paid tier") });
      expect(provider.listAvailablePhoneNumbers).not.toHaveBeenCalled();
      expect(await refusal(claimPhoneNumberForApi(worker, caller, { offerToken: signedOffer({ businessId, subject: `platform:${acme.key.platformKeyId}` }) }, key))).toMatchObject({ status: 409, message: expect.stringContaining("paid tier") });

      // Free's one number is a trial, which a replacement bought by a key would turn into a number nobody pays for.
      const [number] = await asMigrator(tx, async () => await tx.insert(phoneNumbers).values({ businessId, e164: testNumber(), status: "active" }).returning({ id: phoneNumbers.id }));
      expect(await refusal(searchPhoneNumbersForApi(worker, caller, { replaces: number!.id }, { ...key, provider }))).toMatchObject({ status: 409 });
      expect(await refusal(claimPhoneNumberForApi(worker, caller, { offerToken: signedOffer({ businessId, subject: `platform:${acme.key.platformKeyId}`, purpose: "replacement" }), replaces: number!.id }, key))).toMatchObject({ status: 409, message: expect.stringContaining("paid tier") });

      // A tier that ended counts as Free, whatever numbers it left on the account.
      await tier(tx, acme.partnerId, { tier: "growth", status: "active" });
      await tier(tx, acme.partnerId, { tier: "growth", status: "revoked" });
      const other = await ownerless(acme, "Cedar Clinic");
      expect(await refusal(buy(tx, acme, other))).toMatchObject({ status: 409, message: expect.stringContaining("paid tier") });

      // Without tier billing, the cloud buys a partner no number, and a self-hosted server doesn't count them.
      await billTiers(tx, false);
      expect(await refusal(searchPhoneNumbersForApi(worker, caller, { replaces: number!.id }, { ...key, provider }))).toMatchObject({ status: 409 });
      await asMigrator(tx, async () => await tx.update(businesses).set({ deploymentMode: "self_host" }).where(eq(businesses.id, other)));
      expect((await buy(tx, acme, other)).status).toBe("pending");
    });
  });

  it("refuses a key made before keys could buy numbers, which holds phone_numbers:manage alone", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Software");
      await tier(tx, acme.partnerId, { tier: "growth", status: "active" });
      const businessId = await ownerless(acme);
      const worker = workerContext(tx);
      const caller = callerFor(acme, businessId);
      const scopes: ApiKeyScope[] = ["phone_numbers:manage", "business:read"];
      const provider = inventory();
      expect(await refusal(searchPhoneNumbersForApi(worker, caller, {}, { platformKeyId: acme.key.platformKeyId, scopes, provider, claimTokenSecret: SECRET }))).toMatchObject({ status: 403, code: "insufficient_scope", message: expect.stringContaining("phone_numbers:purchase") });
      expect(provider.listAvailablePhoneNumbers).not.toHaveBeenCalled();
      expect(await refusal(claimPhoneNumberForApi(worker, caller, { offerToken: signedOffer({ businessId, subject: `platform:${acme.key.platformKeyId}` }) }, { platformKeyId: acme.key.platformKeyId, scopes, claimTokenSecret: SECRET }))).toMatchObject({ status: 403, code: "insufficient_scope" });
      // The new scope alone isn't enough either: it adds to phone_numbers:manage.
      expect(await refusal(searchPhoneNumbersForApi(worker, caller, {}, { platformKeyId: acme.key.platformKeyId, scopes: ["phone_numbers:purchase"], provider, claimTokenSecret: SECRET }))).toMatchObject({ status: 403, message: expect.stringContaining("phone_numbers:manage") });
      expect(await asMigrator(tx, async () => await tx.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.businessId, businessId)))).toEqual([]);
    });
  });

  it("waits for a number being bought before it releases a business, so the host never pays for it", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Software");
      await tier(tx, acme.partnerId, { tier: "growth", status: "active" });
      const { businessId, userId } = await owned(tx, acme);
      const claim = await buy(tx, acme, businessId);

      // The claim is waiting for the worker, so the business stays with the partner.
      expect(await refusal(releaseBusiness(acme.context, acme.ownerActor, { businessId }))).toMatchObject({ status: 409, code: "business_number_in_progress" });
      const [held] = await asMigrator(tx, async () => await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)));
      expect(held!.partnerId).toBe(acme.partnerId);

      // Bought and charged to the partner, the number no longer holds the business back.
      const numberId = await provision(tx, businessId, claim.id, 115);
      const [charge] = await asMigrator(tx, async () => await tx.select({ partnerId: partnerNumberCharges.partnerId }).from(partnerNumberCharges).where(eq(partnerNumberCharges.phoneNumberId, numberId)));
      expect(charge!.partnerId).toBe(acme.partnerId);
      expect(await releaseBusiness(acme.context, acme.ownerActor, { businessId })).toMatchObject({ ownerUserId: userId });
    });
  });

  it("never gives a key a trial number, even from a validly signed offer", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Software");
      const onFree = await ownerless(acme);
      const worker = workerContext(tx);
      const key = { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, claimTokenSecret: SECRET };
      const trialOffer = (businessId: string) => signedOffer({ businessId, subject: `platform:${acme.key.platformKeyId}`, trial: true });

      expect(await refusal(claimPhoneNumberForApi(worker, callerFor(acme, onFree), { offerToken: trialOffer(onFree) }, key))).toMatchObject({ status: 409 });
      await tier(tx, acme.partnerId, { tier: "starter", status: "active" });
      const onPaid = await ownerless(acme, "Cedar Clinic");
      expect(await refusal(claimPhoneNumberForApi(worker, callerFor(acme, onPaid), { offerToken: trialOffer(onPaid) }, key))).toMatchObject({ status: 409 });
      expect(await refusal(rawClaim(tx, { businessId: onPaid, platformKeyId: acme.key.platformKeyId, selection: { trial: "true" } }))).toMatchObject({ message: "trial_not_available" });
    });
  });

  it("keeps a key's offers and claims inside its own business, key and partner", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Software");
      const rival = await partner(tx, "Rival Software");
      await tier(tx, acme.partnerId, { tier: "growth", status: "active" });
      await tier(tx, rival.partnerId, { tier: "growth", status: "active" });
      const businessId = await ownerless(acme);
      const other = await ownerless(acme, "Cedar Clinic");
      const worker = workerContext(tx);
      const caller = callerFor(acme, businessId);
      const claimWith = (offerToken: string, platformKeyId = acme.key.platformKeyId) => claimPhoneNumberForApi(worker, { ...caller, platformKeyId }, { offerToken }, { platformKeyId, scopes: SCOPES, claimTokenSecret: SECRET });
      const [offer] = await searchPhoneNumbersForApi(worker, caller, {}, { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, provider: inventory(), claimTokenSecret: SECRET });

      // Another business, another of the partner's keys, and a person's offer: none is this key's.
      expect(await refusal(claimPhoneNumberForApi(worker, callerFor(acme, other), { offerToken: offer!.offer_token }, { platformKeyId: acme.key.platformKeyId, scopes: SCOPES, claimTokenSecret: SECRET }))).toMatchObject({ code: "invalid_request" });
      const second = await acme.makeKey();
      expect(await refusal(claimWith(offer!.offer_token, second.platformKeyId))).toMatchObject({ code: "invalid_request" });
      expect(await refusal(claimWith(signedOffer({ businessId, subject: randomUUID() })))).toMatchObject({ code: "invalid_request" });
      // The dashboard's claim takes a person's offer only.
      expect(await refusal(reserveOnboardingNumberClaim(acme.context, { userId: randomUUID(), businessId, claimToken: offer!.offer_token, claimTokenSecret: SECRET, idempotencyKey: randomUUID() }))).toMatchObject({ code: "number_offer_invalid" });

      // The database refuses another partner's key, and a business of no partner, whatever the application sends.
      expect(await refusal(rawClaim(tx, { businessId, platformKeyId: rival.key.platformKeyId }))).toMatchObject({ code: "42501" });
      const [direct] = await asMigrator(tx, async () => await tx.insert(businesses).values({ name: "Direct", slug: `direct-${randomUUID()}`, timezone: "America/Toronto", businessType: "test" }).returning({ id: businesses.id }));
      expect(await refusal(rawClaim(tx, { businessId: direct!.id, platformKeyId: acme.key.platformKeyId }))).toMatchObject({ code: "42501" });
      // Only the worker role, in the business's own transaction, can run it.
      await expect(tx.transaction(async (inner) => await inner.execute(sql`select app.reserve_partner_key_number_claim(${businessId}::uuid, ${acme.key.platformKeyId}::uuid, 'onboarding', null, ${testNumber()}, '{}'::jsonb, 'hash', 'key')`))).rejects.toMatchObject({ cause: { code: "42501" } });
      expect(await refusal(workerContext(tx).db.transaction(async (inner) => await inner.execute(sql`select app.reserve_partner_key_number_claim(${businessId}::uuid, ${acme.key.platformKeyId}::uuid, 'onboarding', null, ${testNumber()}, '{}'::jsonb, 'hash', 'key')`)))).toMatchObject({ code: "42501" });

      // A key revoked after the search buys nothing.
      await revokePartnerPlatformKey(acme.context, acme.ownerActor, { platformKeyId: acme.key.platformKeyId });
      expect(await refusal(claimWith(offer!.offer_token))).toMatchObject({ status: 401, code: "unauthorized" });
      const claims = await asMigrator(tx, async () => await tx.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.businessId, businessId)));
      expect(claims).toEqual([]);
    });
  });

  it("counts a key's numbers against the tier and the partner's quotas, and charges the ones past the included numbers", async () => {
    await rollbackTest(async (tx) => {
      await billTiers(tx, true);
      const acme = await partner(tx, "Acme Software");
      await tier(tx, acme.partnerId, { tier: "starter", status: "active" });
      const [harbor, cedar, maple] = [await ownerless(acme, "Harbor Dental"), await ownerless(acme, "Cedar Clinic"), await ownerless(acme, "Maple Vet")];
      const worker = workerContext(tx);
      const standing = () => worker.db.transaction(async (inner) => {
        await inner.execute(sql`select set_config('app.actor_type', 'worker', true), set_config('app.business_id', ${harbor}, true)`);
        return await loadPartnerNumberStanding(inner, acme.partnerId);
      });

      // Starter buys two numbers a day. A claim counts while it buys its number.
      const first = await buy(tx, acme, harbor);
      const second = await buy(tx, acme, cedar);
      expect(await standing()).toMatchObject({ held: 2, included: 2, paidTier: true });
      expect(await refusal(buy(tx, acme, maple))).toMatchObject({ status: 429, code: "rate_limited", message: "Too many numbers were claimed today. Try again tomorrow." });

      const harborNumber = await provision(tx, harbor, first.id, 115);
      await provision(tx, cedar, second.id, 115);
      await asMigrator(tx, async () => {
        await tx.update(onboardingNumberClaimEvents).set({ reservedAt: new Date(Date.now() - 2 * DAY), purchasedAt: new Date(Date.now() - 2 * DAY) }).where(eq(onboardingNumberClaimEvents.businessId, harbor));
        await tx.update(onboardingNumberClaimEvents).set({ reservedAt: new Date(Date.now() - 2 * DAY), purchasedAt: new Date(Date.now() - 2 * DAY) }).where(eq(onboardingNumberClaimEvents.businessId, cedar));
        await tx.update(phoneNumbers).set({ createdAt: new Date(Date.now() - 2 * DAY) }).where(eq(phoneNumbers.businessId, harbor));
        await tx.update(phoneNumbers).set({ createdAt: new Date(Date.now() - DAY) }).where(eq(phoneNumbers.businessId, cedar));
      });

      // Past the two included numbers, a paid tier still buys, and the partner pays what the host pays.
      const third = await buy(tx, acme, maple);
      const mapleNumber = await provision(tx, maple, third.id, 325);
      expect(await standing()).toMatchObject({ held: 3, included: 2 });
      const [mapleCharge] = await asMigrator(tx, async () => await tx.select({ id: partnerNumberCharges.id }).from(partnerNumberCharges).where(eq(partnerNumberCharges.phoneNumberId, mapleNumber)));
      expect(mapleCharge).toBeDefined();
      const reported: PartnerNumberCharge[] = [];
      expect(await settlePartnerNumberCharges(worker, { tierBilling: true, report: async (charge) => { reported.push(charge); }, now: new Date(Date.now() + 60_000) })).toMatchObject({ charged: 1 });
      expect(reported).toEqual([expect.objectContaining({ partnerId: acme.partnerId, businessId: maple, amountCents: 325 })]);
      expect(harborNumber).not.toBe(mapleNumber);

      // Each business still holds one number, which a second claim can't add to.
      expect(await refusal(buy(tx, acme, maple))).toMatchObject({ status: 409 });

      // Five numbers in 30 days is Starter's limit, whichever businesses bought them.
      const [birch, elm, oak] = [await ownerless(acme, "Birch Spa"), await ownerless(acme, "Elm Bakery"), await ownerless(acme, "Oak Gym")];
      await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ reservedAt: new Date(Date.now() - 2 * DAY), purchasedAt: new Date(Date.now() - 2 * DAY) }).where(eq(onboardingNumberClaimEvents.businessId, maple)));
      await buy(tx, acme, birch);
      await buy(tx, acme, elm);
      await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ status: "claimed", reservedAt: new Date(Date.now() - 2 * DAY), purchasedAt: new Date(Date.now() - 2 * DAY) }).where(eq(onboardingNumberClaimEvents.businessId, birch)));
      await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ status: "claimed", reservedAt: new Date(Date.now() - 2 * DAY), purchasedAt: new Date(Date.now() - 2 * DAY) }).where(eq(onboardingNumberClaimEvents.businessId, elm)));
      expect(await refusal(buy(tx, acme, oak))).toMatchObject({ status: 429, message: "Too many numbers were claimed in the last 30 days. Try again later." });
    });
  });
});

describe.skipIf(!client)("a business with no owner", () => {
  it("is made with no invitation, and a retry returns it", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Software");
      const idempotencyKey = randomUUID();
      const body = { name: `Pier Dental ${randomUUID().slice(0, 8)}`, timezone: "America/Toronto" };
      const { business, replayed } = await createPartnerBusinessForApi(acme.context, { key: acme.key, idempotencyKey, requestHash: "hash", body });
      expect(replayed).toBe(false);
      expect(await asMigrator(tx, async () => await tx.select({ id: businessInvitations.id }).from(businessInvitations).where(eq(businessInvitations.businessId, business.id)))).toEqual([]);
      const emails = await asMigrator(tx, async () => await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, business.id), eq(outboxMessages.topic, "email.send"))));
      expect(emails).toEqual([]);
      const [created] = await asMigrator(tx, async () => await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, business.id), eq(auditLogs.eventType, "partner.business_created"))));
      expect(created!.payload).toMatchObject({ actor: "platform_key", platformKeyId: acme.key.platformKeyId, ownerInvitationId: null, requestHash: "hash" });

      expect(await createPartnerBusinessForApi(acme.context, { key: acme.key, idempotencyKey, requestHash: "hash", body })).toMatchObject({ replayed: true, business: { id: business.id } });
      expect(await refusal(createPartnerBusinessForApi(acme.context, { key: acme.key, idempotencyKey, requestHash: "other", body }))).toMatchObject({ code: "idempotency_key_reused" });

      expect(await listPartnerBusinesses(acme.context, acme.ownerActor)).toEqual([expect.objectContaining({ businessId: business.id, owner: null })]);
      expect(await getTeamForApi(workerContext(tx), callerFor(acme, business.id))).toEqual({ members: [], invitations: [] });
    });
  });

  it("needs an owner for a package, and from a person on the partner's team", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Software");
      const body = { name: `Pier Dental ${randomUUID().slice(0, 8)}`, timezone: "America/Toronto" };
      expect(await refusal(createPartnerBusinessForApi(acme.context, { key: acme.key, idempotencyKey: randomUUID(), requestHash: "hash", body: { ...body, package_id: randomUUID() } }))).toMatchObject({ status: 400, code: "invalid_request", details: [{ path: "owner_email" }] });
      expect(await refusal(createPartnerBusinessForApi(acme.context, { key: acme.key, idempotencyKey: randomUUID(), requestHash: "hash", body: { ...body, owner_email: "not an email" } }))).toMatchObject({ status: 400, code: "invalid_request" });
      expect(await refusal(createPartnerBusiness(acme.context, acme.ownerActor, { name: body.name, timezone: body.timezone, businessType: "dental", accessLevel: "full" }))).toMatchObject({ status: 400, code: "invalid_email" });
      const member = { kind: "member" as const, partnerId: acme.partnerId, userId: acme.ownerActor.userId, grantId: randomUUID(), scopes: SCOPES };
      expect(await refusal(createPartnerBusinessForApi(acme.context, { key: member, idempotencyKey: randomUUID(), requestHash: "hash", body }))).toMatchObject({ status: 400, code: "invalid_request", details: [{ path: "owner_email" }] });
    });
  });

  it("refuses a call it can't take unless it has a transfer number", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Software");
      const businessId = await ownerless(acme);
      const e164 = testNumber();
      await asMigrator(tx, async () => await tx.insert(phoneNumbers).values({ businessId, e164, status: "active" }));
      const worker = workerContext(tx);
      expect(await resolveNumberFallback(worker, { businessId, e164 })).toEqual({ action: "reject" });

      await asMigrator(tx, async () => await tx.update(agents).set({ transferNumber: "+14165550177" }).where(eq(agents.businessId, businessId)));
      expect(await resolveNumberFallback(worker, { businessId, e164 })).toEqual({ action: "forward", to: "+14165550177" });

    });
  });

  it("emails the partner's owners and admins the alerts no webhook covers, while it has no owner", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Software");
      const worker = workerContext(tx);
      const alert = (businessId: string, eventKind: OperatorNotificationEventKey) => worker.db.transaction(async (inner) => {
        await inner.execute(sql`select set_config('app.actor_type', 'worker', true), set_config('app.business_id', ${businessId}, true)`);
        return await queueOperatorAlertInTransaction(inner, { businessId, eventKind, eventKey: `${eventKind}:${randomUUID()}`, subject: "An alert", body: "Something happened." });
      });
      const businessId = await ownerless(acme);
      const ids = await alert(businessId, "liveChatRequest");
      expect(ids).toHaveLength(1);
      const [delivery] = await asMigrator(tx, async () => await tx.select({ userId: operatorNotificationDeliveries.userId, channel: operatorNotificationDeliveries.channel, destination: operatorNotificationDeliveries.destination }).from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.id, ids[0]!)));
      expect(delivery).toEqual({ userId: acme.ownerActor.userId, channel: "email", destination: `${acme.ownerActor.userId}@example.invalid` });
      const [queued] = await asMigrator(tx, async () => await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.aggregateId, ids[0]!)));
      expect(queued!.topic).toBe("notification.dispatch");
      for (const eventKind of ["pausedSms", "transferFailed", "smsFailed", "calendarSync", "aiReplyFailed", "webhookDisabled"] as const) expect(await alert(businessId, eventKind), eventKind).toHaveLength(1);

      // Webhooks cover a message someone left, and a business with an owner tells them instead.
      expect(await alert(businessId, "voiceMessage")).toEqual([]);
      const { businessId: withOwner, userId } = await owned(tx, acme);
      const told = await alert(withOwner, "liveChatRequest");
      expect(await asMigrator(tx, async () => await tx.select({ userId: operatorNotificationDeliveries.userId }).from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.businessId, withOwner)))).toEqual([{ userId }]);
      expect(told).toHaveLength(1);
    });
  });

  it("refuses a Calendly link for a business nobody could open it for", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Software");
      const worker = workerContext(tx);
      const options = { provider: "calendly", requireAdmin: true, link: () => ({ url: "https://app.example.test/connect", expiresAt: new Date("2030-01-01T00:00:00Z") }) };
      await expect(createCalendarConnectLinkForApi(worker, callerFor(acme, await ownerless(acme)), options)).rejects.toMatchObject({ status: 409, code: "conflict", message: "This business has no owner or admin to open the link. Invite one with POST /team/invitations first." });
      const { businessId } = await owned(tx, acme);
      await expect(createCalendarConnectLinkForApi(worker, callerFor(acme, businessId), options)).resolves.toMatchObject({ url: "https://app.example.test/connect" });
    });
  });

  it("finishes onboarding with its key, and can't be released, only deleted", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Software");
      const businessId = await ownerless(acme);
      const worker = workerContext(tx);
      const caller = callerFor(acme, businessId);
      expect(await getOnboardingForApi(worker, caller)).toMatchObject({ complete: false, missing: ["phone_number"] });
      expect(await completeOnboardingForApi(worker, caller, { skip_number: true })).toMatchObject({ complete: true, stage: "complete" });
      // The founder's check-in goes to people who set up their own business.
      expect(await asMigrator(tx, async () => await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), sql`${outboxMessages.topic} like 'onboarding%'`)))).toEqual([]);

      expect(await refusal(releasePartnerBusinessForApi(acme.context, acme.key, businessId))).toMatchObject({ status: 409, code: "conflict", message: expect.stringContaining("no owner") });
      const [business] = await asMigrator(tx, async () => await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)));
      expect(business!.partnerId).toBe(acme.partnerId);

      expect(await deletePartnerBusinessForApi(acme.context, acme.key, businessId)).toEqual({ id: businessId, deleted: true });
      expect(await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId)))).toEqual([]);
    });
  });
});
