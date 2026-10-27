import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, outboxMessages, partnerBillingAccounts, partnerCheckoutRequests, providerEvents, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import {
  claimPartnerCheckoutRequest,
  createPartnerTierCheckout,
  getPartnerBilling,
  getPartnerTierCheckout,
  loadPartnerCheckoutRequest,
  loadPartnerTierInTransaction,
  markPartnerCheckoutCreated,
  markPartnerCheckoutFailed,
  partnerBillingPortalCustomer,
  partnerCheckoutLeaseEndsAt,
  reconcilePartnerTier,
  recordPartnerPolarEvent,
  setPartnerHostPool,
  setPartnerPoolOverage,
} from "./partnerBilling";
import { selfHostedSupportCatalog } from "@lobbystack/shared";

import { recordPartnerTierBilling } from "./partnerNumbers";
import { acceptPartnerInvitation, hashPartnerToken, invitePartnerMember, signUpPartner, type PartnerMemberActor } from "./partners";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner billing integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

// The Polar products a host sells tiers with.
const TIER_PRODUCTS = Object.fromEntries(["STARTER", "GROWTH", "SCALE"].flatMap((tier) => ["MONTHLY", "ANNUAL"].map((interval) => [`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier.toLowerCase()}_${interval.toLowerCase()}`])));
const CONSOLE = "https://desk.example.test";

function sellTiers(): void {
  for (const [name, value] of Object.entries(TIER_PRODUCTS)) vi.stubEnv(name, value);
}

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", CONSOLE);
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
  for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
});
afterEach(() => { vi.unstubAllEnvs(); });

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

/** This month's usage period, as usage metering keys it. */
const thisMonth = () => new Date().toISOString().slice(0, 7);

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

/** Runs as the worker role, as the worker does, then goes back to the app role. */
async function asWorker<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
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

/** The link token in the email queued for a team invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

/** A partner signed up by its owner, with a second owner, an admin and a member on its team. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, coOwner, admin, member] = await people(tx, 4);
  const context = { db: tx as unknown as Database };
  // A name of its own, so its slug never waits on another suite's partner of the same name.
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name: `${name} ${randomUUID().slice(0, 8)}` });
  const actor = (person: Person, role: PartnerMemberActor["role"]): PartnerMemberActor => ({ kind: "member", partnerId, userId: person.userId, role });
  const ownerActor = actor(owner!, "owner");
  for (const [person, role] of [[coOwner!, "owner"], [admin!, "admin"], [member!, "member"]] as const) {
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: person.email, emailVerified: true });
  }
  return { context, partnerId, owner: owner!, ownerActor, coOwnerActor: actor(coOwner!, "owner"), adminActor: actor(admin!, "admin"), memberActor: actor(member!, "member") };
}

type Subscription = { status: string; tier?: "starter" | "growth" | "scale"; interval?: "monthly" | "annual"; modifiedAt: string; cancelAtPeriodEnd?: boolean };

/** A subscription event for the partner's Polar customer, as the webhook route stores it after normalizing it. */
function subscriptionEvent(partnerId: string, input: Subscription): Record<string, unknown> {
  return {
    id: "sub_1",
    status: input.status,
    product_id: input.tier ? `prod_${input.tier}_${input.interval ?? "monthly"}` : "prod_other",
    customer: { id: "cus_1", external_id: `partner:${partnerId}` },
    current_period_start: "2026-10-01T00:00:00.000Z",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    ends_at: input.cancelAtPeriodEnd ? "2026-11-01T00:00:00.000Z" : null,
    modified_at: input.modifiedAt,
    billingKey: `partner:${partnerId}`,
    customerId: "cus_1",
    subscriptionId: "sub_1",
    ...(input.tier ? { partnerTier: input.tier, billingInterval: input.interval ?? "monthly" } : {}),
    subscriptionState: input.status,
    subscriptionModifiedAt: input.modifiedAt,
  };
}

/** Stores a Polar event as the webhook route does, then reconciles it as the worker does. Returns Polar's id for the delivery and the stored event's. */
async function deliver(tx: DatabaseTransaction, partnerId: string, eventType: string, payload: Record<string, unknown>, applies = true): Promise<{ deliveryId: string; storedId: string }> {
  const context = { db: tx as unknown as Database };
  const providerEventId = `evt_${randomUUID()}`;
  expect(await recordPartnerPolarEvent(context, { partnerId, providerEventId, eventType, payload })).toBe("stored");
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload, businessId: outboxMessages.businessId }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, `provider-event:${providerEventId}:partner-billing`)));
  expect(message).toMatchObject({ businessId: null, payload: { partnerId } });
  const storedId = String(message!.payload.providerEventId);
  expect(await asWorker(tx, async () => await reconcilePartnerTier(context, { partnerId, providerEventId: storedId }))).toBe(applies);
  return { deliveryId: providerEventId, storedId };
}

describe.skipIf(!client)("a partner's tier", () => {
  it("puts a partner Polar never billed on Free when the host sells tiers, and gives it no pool limit when the host doesn't", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      // Pool overage starts on with no cap, which Free never bills.
      const free = { tier: "free", billingInterval: null, subscriptionState: null, includedNumbers: 0, trialNumbers: 1, currentPeriodEnd: null, endsAt: null, hasCustomerPortal: false, numbersHeld: 0, poolOverage: { enabled: true, capCents: null, billed: false } };
      // Without tier products, the host bills no tier and nothing limits the pool.
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toEqual({ ...free, billed: false, pool: null, poolUsage: null, numbersCounted: false, trialNumber: null });
      expect(await refusal(createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "starter", billingInterval: "monthly", returnOrigin: CONSOLE }))).toMatchObject({ status: 409, code: "tier_billing_unavailable" });

      sellTiers();
      // The worker records that the deployment bills tiers when it starts, and the Billing page then counts the partner's numbers.
      await asWorker(tx, async () => await recordPartnerTierBilling(acme.context, { enabled: true }));
      // Free's one trial number is still there for one of its businesses to get.
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toEqual({ ...free, billed: true, pool: { voiceSeconds: 1_800, chats: 50 }, poolUsage: { periodKey: thisMonth(), voiceSecondsUsed: 0, chatsUsed: 0, overageSpendCents: 0 }, numbersCounted: true, trialNumber: "available" });
      // The worker reads the same tier for usage and numbers, with no business in its context.
      expect(await asWorker(tx, async () => await withBusinessTransaction(acme.context.db, { actorType: "worker" }, async (inner) => await loadPartnerTierInTransaction(inner, acme.partnerId)))).toMatchObject({ billed: true, tier: "free", pool: { voiceSeconds: 1_800, chats: 50 } });
    });
  });

  it("lets only the partner's own owners read its billing, start a checkout or open Polar's portal", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      const other = await partner(tx, "Bright Desk");
      const checkout = { tier: "growth", billingInterval: "annual", returnOrigin: CONSOLE };
      for (const actor of [acme.adminActor, acme.memberActor]) {
        expect(await refusal(getPartnerBilling(acme.context, actor))).toMatchObject({ status: 403, code: "owner_only" });
        expect(await refusal(createPartnerTierCheckout(acme.context, actor, checkout))).toMatchObject({ status: 403, code: "owner_only" });
        expect(await refusal(partnerBillingPortalCustomer(acme.context, actor))).toMatchObject({ status: 403, code: "owner_only" });
      }
      // Another partner's owner, and a platform key, get nothing.
      const outsider = { ...other.ownerActor, partnerId: acme.partnerId };
      expect(await refusal(getPartnerBilling(acme.context, outsider))).toMatchObject({ status: 403 });
      expect(await refusal(createPartnerTierCheckout(acme.context, outsider, checkout))).toMatchObject({ status: 403 });
      expect(await refusal(createPartnerTierCheckout(acme.context, { kind: "key", partnerId: acme.partnerId, platformKeyId: randomUUID() }, checkout))).toMatchObject({ status: 403 });
      expect(await asMigrator(tx, async () => await tx.select({ id: partnerCheckoutRequests.id }).from(partnerCheckoutRequests).where(eq(partnerCheckoutRequests.partnerId, acme.partnerId)))).toEqual([]);
      // An owner with no tier in Polar yet has no portal to open.
      expect(await refusal(partnerBillingPortalCustomer(acme.context, acme.ownerActor))).toMatchObject({ status: 409, code: "no_billing_customer" });
    });
  });

  it("queues one owner's checkout at a time for the worker, and refuses a tier or interval it doesn't sell", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      expect(await refusal(createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "free", billingInterval: "monthly", returnOrigin: CONSOLE }))).toMatchObject({ status: 400, code: "invalid_tier" });
      expect(await refusal(createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "growth", billingInterval: "weekly", returnOrigin: CONSOLE }))).toMatchObject({ status: 400, code: "invalid_interval" });

      const { requestId } = await createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "growth", billingInterval: "annual", returnOrigin: CONSOLE });
      const queued = await asMigrator(tx, async () => await tx.select({ topic: outboxMessages.topic, businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.aggregateId, requestId)));
      expect(queued).toEqual([{ topic: "billing.createPartnerCheckout", businessId: null, payload: { partnerId: acme.partnerId, requestId } }]);
      // Asking again for the same checkout returns it; another tier replaces it.
      expect(await createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "growth", billingInterval: "annual", returnOrigin: CONSOLE })).toEqual({ requestId });
      const replaced = await createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "scale", billingInterval: "monthly", returnOrigin: "https://acme-reception.portal.example.test" });
      expect(replaced.requestId).not.toBe(requestId);
      expect(await getPartnerTierCheckout(acme.context, acme.ownerActor, { requestId })).toMatchObject({ status: "superseded" });
      // Another owner waits for the open checkout.
      expect(await refusal(createPartnerTierCheckout(acme.context, acme.coOwnerActor, { tier: "starter", billingInterval: "monthly", returnOrigin: CONSOLE }))).toMatchObject({ status: 409, code: "checkout_in_progress" });
      // The partner's admins can't follow an owner's checkout, even through row-level security.
      expect(await refusal(getPartnerTierCheckout(acme.context, acme.adminActor, { requestId: replaced.requestId }))).toMatchObject({ status: 403, code: "owner_only" });
      const visibleToAdmin = await withBusinessTransaction(acme.context.db, { userId: acme.adminActor.userId, actorType: "operator" }, async (inner) => await inner.select({ id: partnerCheckoutRequests.id }).from(partnerCheckoutRequests));
      expect(visibleToAdmin).toEqual([]);
    });
  });

  it("lets the worker claim the checkout once, read what Polar needs and record the page Polar made", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      const { requestId } = await createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "starter", billingInterval: "monthly", returnOrigin: "https://acme-reception.portal.example.test" });
      const request = { partnerId: acme.partnerId, requestId };
      await asWorker(tx, async () => {
        expect(await claimPartnerCheckoutRequest(acme.context, request)).toBe(true);
        expect(await claimPartnerCheckoutRequest(acme.context, request)).toBe(false);
        expect(await partnerCheckoutLeaseEndsAt(acme.context, request)).toBeInstanceOf(Date);
        expect(await loadPartnerCheckoutRequest(acme.context, request)).toEqual({ requestId, partnerId: acme.partnerId, tier: "starter", billingInterval: "monthly", returnOrigin: "https://acme-reception.portal.example.test", customerEmail: acme.owner.email, externalCustomerId: `partner:${acme.partnerId}` });
        // Another partner's id finds nothing.
        expect(await loadPartnerCheckoutRequest(acme.context, { partnerId: randomUUID(), requestId })).toBeNull();
        expect(await markPartnerCheckoutCreated(acme.context, { ...request, checkoutId: "co_1", checkoutUrl: "https://polar.example.test/co_1" })).toBe(true);
        // A checkout that's ready isn't failed by a late retry.
        expect(await markPartnerCheckoutFailed(acme.context, { ...request, error: "Polar checkout creation failed." })).toBe(false);
      });
      expect(await getPartnerTierCheckout(acme.context, acme.ownerActor, { requestId })).toEqual({ requestId, tier: "starter", billingInterval: "monthly", status: "ready", checkoutUrl: "https://polar.example.test/co_1", synced: false });
    });
  });

  it("stores each of Polar's events for the partner once, and reconciles the tier with its pool and numbers", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      const { requestId } = await createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "growth", billingInterval: "monthly", returnOrigin: CONSOLE });
      // The owner caps the pool's overage before Polar's events arrive, and reconciling them keeps the cap.
      await setPartnerPoolOverage(acme.context, acme.ownerActor, { enabled: true, capCents: 10_000 });
      const payload = subscriptionEvent(acme.partnerId, { status: "active", tier: "growth", modifiedAt: "2026-10-01T00:00:01.000Z" });
      const { deliveryId, storedId: providerEventId } = await deliver(tx, acme.partnerId, "subscription.active", payload);

      // Polar retries a delivery, and an event can name a partner this deployment doesn't have.
      expect(await recordPartnerPolarEvent(acme.context, { partnerId: acme.partnerId, providerEventId: deliveryId, eventType: "subscription.active", payload })).toBe("duplicate");
      expect(await recordPartnerPolarEvent(acme.context, { partnerId: randomUUID(), providerEventId: `evt_${randomUUID()}`, eventType: "subscription.active", payload })).toBe("unknown_partner");
      const [stored] = await asMigrator(tx, async () => await tx.select({ partnerId: providerEvents.partnerId, businessId: providerEvents.businessId, status: providerEvents.status }).from(providerEvents).where(eq(providerEvents.id, providerEventId)));
      expect(stored).toEqual({ partnerId: acme.partnerId, businessId: null, status: "processed" });
      // Reconciling it again changes nothing.
      expect(await asWorker(tx, async () => await reconcilePartnerTier(acme.context, { partnerId: acme.partnerId, providerEventId }))).toBe(true);
      // Another partner's event isn't this partner's to reconcile.
      expect(await asWorker(tx, async () => await reconcilePartnerTier(acme.context, { partnerId: randomUUID(), providerEventId }))).toBe(false);

      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toEqual({
        billed: true,
        tier: "growth",
        billingInterval: "monthly",
        subscriptionState: "active",
        pool: { voiceSeconds: 78_000, chats: 5_000 },
        includedNumbers: 10,
        trialNumbers: 0,
        currentPeriodEnd: "2026-11-01T00:00:00.000Z",
        endsAt: null,
        hasCustomerPortal: true,
        numbersHeld: 0,
        numbersCounted: false,
        poolUsage: { periodKey: thisMonth(), voiceSecondsUsed: 0, chatsUsed: 0, overageSpendCents: 0 },
        poolOverage: { enabled: true, capCents: 10_000, billed: true },
        trialNumber: null,
      });
      expect(await asMigrator(tx, async () => await tx.select({ billingKey: partnerBillingAccounts.billingKey, customerId: partnerBillingAccounts.customerId, subscriptionId: partnerBillingAccounts.subscriptionId }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, acme.partnerId)))).toEqual([{ billingKey: `partner:${acme.partnerId}`, customerId: "cus_1", subscriptionId: "sub_1" }]);
      expect(await getPartnerTierCheckout(acme.context, acme.ownerActor, { requestId })).toMatchObject({ synced: true });
      expect(await partnerBillingPortalCustomer(acme.context, acme.ownerActor)).toEqual({ customerId: "cus_1" });
      // A partner whose tier is live changes it in Polar's portal, not at a second checkout.
      expect(await refusal(createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "scale", billingInterval: "monthly", returnOrigin: CONSOLE }))).toMatchObject({ status: 409, code: "subscription_active" });
    });
  });

  it("keeps the pool the host set when it reconciles a tier, and uses the tier's pool while the deployment bills tiers", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      // The host set a pool while it sold no tiers.
      await setPartnerHostPool(acme.context, { partner: acme.partnerId, voiceMinutes: 10, chats: 20 });
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ billed: false, tier: "free", pool: { voiceSeconds: 600, chats: 20 } });

      // It starts selling tiers, and the partner pays for Growth: the tier's pool applies, and the reconcile leaves the host's alone.
      sellTiers();
      await deliver(tx, acme.partnerId, "subscription.active", subscriptionEvent(acme.partnerId, { status: "active", tier: "growth", modifiedAt: "2026-10-01T00:00:01.000Z" }));
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ billed: true, tier: "growth", pool: { voiceSeconds: 78_000, chats: 5_000 } });
      expect(await asMigrator(tx, async () => await tx.select({ poolVoiceSeconds: partnerBillingAccounts.poolVoiceSeconds, hostPoolVoiceSeconds: partnerBillingAccounts.hostPoolVoiceSeconds, hostPoolChats: partnerBillingAccounts.hostPoolChats }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, acme.partnerId)))).toEqual([{ poolVoiceSeconds: 78_000, hostPoolVoiceSeconds: 600, hostPoolChats: 20 }]);

      // Back without tier products, the host's pool applies again.
      for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ billed: false, pool: { voiceSeconds: 600, chats: 20 } });
    });
  });

  it("keeps a newer snapshot when an older event arrives late, and follows a cancellation, a failed payment and the tier's end", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      await deliver(tx, acme.partnerId, "subscription.active", subscriptionEvent(acme.partnerId, { status: "active", tier: "scale", interval: "annual", modifiedAt: "2026-10-01T00:00:02.000Z" }));
      // An older snapshot of the same subscription can't roll it back.
      await deliver(tx, acme.partnerId, "subscription.created", subscriptionEvent(acme.partnerId, { status: "incomplete", tier: "scale", interval: "annual", modifiedAt: "2026-10-01T00:00:01.000Z" }));
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "scale", billingInterval: "annual", subscriptionState: "active", pool: { voiceSeconds: 240_000, chats: 10_000 }, includedNumbers: 25 });

      // The owner cancels at the end of the period: the tier stays until then.
      await deliver(tx, acme.partnerId, "subscription.canceled", subscriptionEvent(acme.partnerId, { status: "active", tier: "scale", interval: "annual", modifiedAt: "2026-10-05T00:00:00.000Z", cancelAtPeriodEnd: true }));
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "scale", subscriptionState: "active", endsAt: "2026-11-01T00:00:00.000Z" });
      // An order names the subscription without its cancellation, which stays as it was.
      await deliver(tx, acme.partnerId, "order.paid", { id: "ord_1", status: "paid", customer: { id: "cus_1", external_id: `partner:${acme.partnerId}` }, customerId: "cus_1", subscriptionId: "sub_1" });
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "scale", endsAt: "2026-11-01T00:00:00.000Z" });

      // A failed payment keeps the tier while Polar retries, as on direct plans.
      await deliver(tx, acme.partnerId, "subscription.past_due", subscriptionEvent(acme.partnerId, { status: "past_due", tier: "scale", interval: "annual", modifiedAt: "2026-10-06T00:00:00.000Z" }));
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "scale", subscriptionState: "past_due", pool: { voiceSeconds: 240_000, chats: 10_000 }, endsAt: null });

      // When the subscription ends, the partner is on Free, with Free's pool and numbers.
      await deliver(tx, acme.partnerId, "subscription.revoked", subscriptionEvent(acme.partnerId, { status: "canceled", tier: "scale", interval: "annual", modifiedAt: "2026-11-01T00:00:00.000Z" }));
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "free", billingInterval: null, subscriptionState: "canceled", pool: { voiceSeconds: 1_800, chats: 50 }, includedNumbers: 0, trialNumbers: 1, currentPeriodEnd: null, endsAt: null });
      expect(await asMigrator(tx, async () => await tx.select({ tier: partnerBillingAccounts.tier, poolVoiceSeconds: partnerBillingAccounts.poolVoiceSeconds, includedNumbers: partnerBillingAccounts.includedNumbers }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, acme.partnerId)))).toEqual([{ tier: "scale", poolVoiceSeconds: 1_800, includedNumbers: 0 }]);
      // A partner back on Free can buy a tier again.
      expect(await createPartnerTierCheckout(acme.context, acme.ownerActor, { tier: "starter", billingInterval: "monthly", returnOrigin: CONSOLE })).toEqual({ requestId: expect.any(String) });
    });
  });

  it("ends the tier when its own subscription moves to a support plan, and ignores a support plan bought beside it", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      await deliver(tx, acme.partnerId, "subscription.active", subscriptionEvent(acme.partnerId, { status: "active", tier: "growth", modifiedAt: "2026-10-01T00:00:01.000Z" }));
      // With multiple subscriptions on, the partner's customer can also hold a white-label support plan.
      const support = (subscriptionId: string, status: string, modifiedAt: string) => ({
        ...subscriptionEvent(acme.partnerId, { status, modifiedAt }),
        id: subscriptionId,
        subscriptionId,
        product_id: selfHostedSupportCatalog.white_label.premium.productIds.monthly,
        selfHostedSupport: true,
      });
      await deliver(tx, acme.partnerId, "subscription.active", support("sub_support", "active", "2026-10-02T00:00:00.000Z"), false);
      await deliver(tx, acme.partnerId, "subscription.revoked", support("sub_support", "canceled", "2026-10-03T00:00:00.000Z"), false);
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "growth", subscriptionState: "active" });

      // Switching the tier's own subscription to the support product in Polar's portal ends the tier.
      await deliver(tx, acme.partnerId, "subscription.updated", support("sub_1", "active", "2026-10-04T00:00:00.000Z"));
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "free", subscriptionState: "canceled" });
    });
  });

  it("ends the tier when its own subscription moves to a business's plan in Polar's portal", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      await deliver(tx, acme.partnerId, "subscription.active", subscriptionEvent(acme.partnerId, { status: "active", tier: "scale", modifiedAt: "2026-10-01T00:00:01.000Z" }));
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "scale" });
      // A business's Starter plan sells a partner no tier, so the partner doesn't keep Scale's pool and numbers at Starter's price.
      await deliver(tx, acme.partnerId, "subscription.updated", { ...subscriptionEvent(acme.partnerId, { status: "active", modifiedAt: "2026-10-02T00:00:00.000Z" }), product_id: "prod_starter_month", foreignProduct: true });
      expect(await getPartnerBilling(acme.context, acme.ownerActor)).toMatchObject({ tier: "free", subscriptionState: "canceled" });
    });
  });

  it("keeps each partner's billing to its own team, and lets only the worker write it", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      const other = await partner(tx, "Bright Desk");
      await deliver(tx, acme.partnerId, "subscription.active", subscriptionEvent(acme.partnerId, { status: "active", tier: "starter", modifiedAt: "2026-10-01T00:00:00.000Z" }));
      const read = async (userId: string) => await withBusinessTransaction(acme.context.db, { userId, actorType: "operator" }, async (inner) => await inner.select({ partnerId: partnerBillingAccounts.partnerId }).from(partnerBillingAccounts));
      expect(await read(acme.adminActor.userId)).toEqual([{ partnerId: acme.partnerId }]);
      expect(await read(other.ownerActor.userId)).toEqual([]);
      // An owner can't give the partner a tier by writing the account, nor read Polar's events for it.
      expect(await refusal(withBusinessTransaction(acme.context.db, { userId: acme.owner.userId, actorType: "operator" }, async (inner) => await inner.update(partnerBillingAccounts).set({ tier: "scale" }).where(eq(partnerBillingAccounts.partnerId, acme.partnerId))))).toMatchObject({ code: "42501" });
      expect(await withBusinessTransaction(acme.context.db, { userId: acme.owner.userId, actorType: "operator" }, async (inner) => await inner.select({ id: providerEvents.id }).from(providerEvents).where(eq(providerEvents.partnerId, acme.partnerId)))).toEqual([]);
      // A worker scoped to a business still reaches no business's events but its own.
      const businessEvents = await asWorker(tx, async () => await withBusinessTransaction(acme.context.db, { businessId: randomUUID(), actorType: "worker" }, async (inner) => await inner.select({ id: providerEvents.id }).from(providerEvents).where(sql`${providerEvents.businessId} is not null`)));
      expect(businessEvents).toEqual([]);
    });
  });
});
