import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, billingAccounts, businesses, createDatabaseClient, outboxMessages, partnerBillingAccounts, productEvents, providerEvents, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";

import { forgetCachedBrands } from "./brands";
import { openPartnerBusiness } from "./businessAccess";
import { loadEntitlement } from "./entitlement";
import { getPackageBilling, openPackagePortal, setPartnerBusinessBilling, startInvitationCheckout, startPackageCheckout } from "./packageBilling";
import { acceptPartnerInvitation, createPartnerBusiness, deletePartnerBusiness, hashPartnerToken, invitePartnerMember, listPartnerBusinesses, releaseBusiness, signUpPartner, type PartnerMemberActor } from "./partners";
import { getNumberTrialState, numberStepRedirect } from "./numberTrials";
import { recordPartnerTierBilling } from "./partnerNumbers";
import { searchBusinessNumberInventory } from "./phoneNumbers";
import { createPartnerPackage, recordStripeConnectEvent, startPartnerStripeOnboarding } from "./partnerStripe";
import { acceptInvitation, createBusiness, inviteMember, previewInvitation } from "./tenancy";
import { readVoiceSecondsLeftInTransaction, reserveUsageInTransaction } from "./usage";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Package billing integration tests require a dedicated local test database.");
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
  // Partner features read these to turn Stripe Connect on; the fake stands in for Stripe itself.
  vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "sk_test_platform");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_test_platform");
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

/** Runs as the worker role, as usage metering does during calls and chats, then goes back to the app role. */
async function asWorker<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** A refusal's status and code, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** The link token in the email queued for an invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

const onboardingUrls = { returnUrl: "https://acme.portal.example.test/partner/p/stripe?onboarding=return", refreshUrl: "https://acme.portal.example.test/partner/p/stripe?onboarding=refresh" };

/**
 * A partner with an owner, an admin and a member, whose owner connected a
 * Canadian Stripe account that takes payments, and a package on it.
 */
async function sellingPartner(tx: DatabaseTransaction, stripe = new FakeStripeConnect()) {
  const [owner, admin, member] = await people(tx, 3);
  const context = { db: tx as unknown as Database, stripeConnect: stripe };
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name: `Partner ${randomUUID().slice(0, 6)}` });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  const join = async (person: Person, role: "admin" | "member"): Promise<PartnerMemberActor> => {
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.aggregateId, invitationId)));
    const token = new URL(String(message!.payload.url)).searchParams.get("token")!;
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(token), email: person.email, emailVerified: true });
    return { kind: "member", partnerId, userId: person.userId, role };
  };
  const { accountId } = await startPartnerStripeOnboarding(context, ownerActor, { country: "CA", ...onboardingUrls });
  stripe.updateAccount(accountId, { currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, disabledReason: null });
  const accountUpdate = stripe.delivery("account.updated", { accountId });
  await recordStripeConnectEvent(context, stripe.verifyWebhook(accountUpdate.body, accountUpdate.signature));
  const frontDesk = await createPartnerPackage(context, ownerActor, { name: "Front desk", monthlyPriceMinor: 14900, setupFeeMinor: 5000, voiceMinutes: 300, chats: 1000 });
  return { context, stripe, partnerId, accountId, frontDesk, owner: ownerActor, admin: await join(admin!, "admin"), member: await join(member!, "member") };
}

type Seller = Awaited<ReturnType<typeof sellingPartner>>;

/** A business the partner creates on a package, or billed outside LobbyStack, with the token of its owner's invitation. */
async function soldBusiness(tx: DatabaseTransaction, seller: Seller, input: { packageId: string | null; owner?: Person }) {
  const [owner] = input.owner ? [input.owner] : await people(tx, 1);
  const { businessId, invitationId } = await createPartnerBusiness(seller.context, seller.admin, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: owner!.email, packageId: input.packageId });
  const token = await linkToken(tx, invitationId);
  return { businessId, owner: owner!, token, tokenHash: hash(token) };
}

const returnUrls = (token: string) => ({ successUrl: `https://acme.portal.example.test/accept-invite?token=${token}&checkout=complete`, cancelUrl: `https://acme.portal.example.test/accept-invite?token=${token}&checkout=canceled` });

/** Sends a Connect delivery through the fake's signature check, as the webhook route does. */
async function deliver(seller: Seller, type: string, object: Record<string, unknown>, eventId?: string) {
  const { body, signature } = seller.stripe.delivery(type, { accountId: seller.accountId, object, ...(eventId ? { eventId } : {}) });
  return await recordStripeConnectEvent(seller.context, seller.stripe.verifyWebhook(body, signature));
}

/** Pays the checkout the invitation link opens, and delivers Stripe's checkout.session.completed. */
async function payInvitation(tx: DatabaseTransaction, seller: Seller, sold: { tokenHash: string; token: string }) {
  const { url } = await startInvitationCheckout(seller.context, { tokenHash: sold.tokenHash, partnerId: seller.partnerId, ...returnUrls(sold.token) });
  const sessionId = url.split("/").at(-1)!;
  const subscription = seller.stripe.completeCheckout(sessionId);
  const outcome = await deliver(seller, "checkout.session.completed", seller.stripe.checkoutObject(sessionId));
  return { sessionId, subscription, outcome };
}

/** The business's entitlement as the worker reads it when a call or chat reserves usage, and in SQL. */
async function entitlementOf(tx: DatabaseTransaction, seller: Seller, businessId: string) {
  const entitlement = await asWorker(tx, async () => await withBusinessTransaction(seller.context.db, { businessId, actorType: "worker" }, async (inner) => await loadEntitlement(inner, businessId)));
  const [row] = (await asMigrator(tx, async () => await tx.execute<{ live: boolean }>(sql`select app.has_live_entitlement(${businessId}::uuid) as live`))).rows;
  return { entitlement, sqlLive: row?.live };
}

/** A subscription the partner starts in its own Stripe Dashboard, outside LobbyStack, naming a business in its metadata. */
async function subscriptionMadeInStripe(seller: Seller, businessId: string) {
  const [priceId] = [...seller.stripe.prices].find(([, price]) => price.accountId === seller.accountId && price.recurring)!;
  const checkout = await seller.stripe.createCheckout(seller.accountId, { priceId, setupPriceId: null, customerId: null, customerEmail: null, successUrl: "https://a.test/s", cancelUrl: "https://a.test/c", idempotencyKey: randomUUID(), clientReferenceId: businessId, metadata: { lobbystack_business_id: businessId } });
  return { sessionId: checkout.sessionId, subscription: seller.stripe.completeCheckout(checkout.sessionId) };
}

async function subscriptionStarts(tx: DatabaseTransaction, businessId: string) {
  return await asMigrator(tx, async () => await tx.select({ properties: productEvents.properties }).from(productEvents).where(and(eq(productEvents.businessId, businessId), eq(productEvents.name, "billing.package_subscription_started"))));
}

describe.skipIf(!client)("choosing how a partner's business is billed", () => {
  it("bills a new business outside LobbyStack unless an owner or admin sells it one of the partner's packages", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const outside = await soldBusiness(tx, seller, { packageId: null });
      const onPackage = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });

      const listed = new Map((await listPartnerBusinesses(seller.context, seller.owner)).map((business) => [business.businessId, business.billing]));
      expect(listed.get(outside.businessId)).toEqual({ kind: "outside" });
      // Its overage stays off until an owner or admin turns it on, in the package's currency.
      expect(listed.get(onPackage.businessId)).toEqual({ kind: "package", packageId: seller.frontDesk.packageId, packageName: "Front desk", status: "awaiting_payment", overage: { enabled: false, currency: "CAD", voiceMinuteRateMinor: 0, chatRateMinor: 0, capMinor: null } });
      // Members never see what a business pays.
      expect((await listPartnerBusinesses(seller.context, seller.member)).every((business) => business.billing === null)).toBe(true);

      expect((await entitlementOf(tx, seller, outside.businessId))).toMatchObject({ entitlement: { live: true, source: "billed_outside", allowance: { voiceSeconds: null, chats: null } }, sqlLive: true });
      const audit = await asMigrator(tx, async () => await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, onPackage.businessId), eq(auditLogs.eventType, "partner.business_created"))));
      expect(audit[0]?.payload).toMatchObject({ packageId: seller.frontDesk.packageId });
    });
  });

  it("sells only the partner's own packages that are for sale, and only with Stripe Connect", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const other = await sellingPartner(tx);
      const [owner] = await people(tx, 1);
      const create = (context: Seller["context"] | { db: Database }, packageId: string) => createPartnerBusiness(context, seller.admin, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: owner!.email, packageId });
      expect(await refusal(create(seller.context, other.frontDesk.packageId))).toMatchObject({ status: 404, code: "package_not_found" });
      expect(await refusal(create({ db: seller.context.db }, seller.frontDesk.packageId))).toMatchObject({ status: 409, code: "stripe_not_configured" });
      expect(await refusal(create(seller.context, "not-a-uuid"))).toMatchObject({ status: 400, code: "invalid_package" });
      expect(await refusal(createPartnerBusiness(seller.context, seller.member, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: owner!.email, packageId: seller.frontDesk.packageId }))).toMatchObject({ status: 403 });

      // The database refuses another partner's package whoever asks, the system actor included.
      const sold = await soldBusiness(tx, seller, { packageId: null });
      const write = withBusinessTransaction(seller.context.db, { businessId: sold.businessId, actorType: "system" }, async (inner) => await inner.insert(billingAccounts).values({ businessId: sold.businessId, billingKey: `business:${sold.businessId}`, packageId: other.frontDesk.packageId }));
      expect(await refusal(write)).toMatchObject({ code: "23514", message: "package_partner_mismatch" });
    });
  });

  it("lets owners and admins change it until the business pays, and records each change", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: null });
      expect(await setPartnerBusinessBilling(seller.context, seller.owner, { businessId: sold.businessId, packageId: seller.frontDesk.packageId })).toMatchObject({ kind: "package", status: "awaiting_payment" });
      expect(await refusal(setPartnerBusinessBilling(seller.context, seller.member, { businessId: sold.businessId, packageId: null }))).toMatchObject({ status: 403 });
      const stranger = await sellingPartner(tx);
      expect(await refusal(setPartnerBusinessBilling(stranger.context, stranger.owner, { businessId: sold.businessId, packageId: null }))).toMatchObject({ status: 404, code: "business_not_found" });

      // The open checkout for the old package closes, so nobody can pay for it any more.
      const { url } = await startInvitationCheckout(seller.context, { tokenHash: sold.tokenHash, partnerId: seller.partnerId, ...returnUrls(sold.token) });
      expect(await setPartnerBusinessBilling(seller.context, seller.admin, { businessId: sold.businessId, packageId: null })).toEqual({ kind: "outside" });
      expect(seller.stripe.checkouts.get(url.split("/").at(-1)!)?.status).toBe("expired");
      const changes = await asMigrator(tx, async () => await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, sold.businessId), eq(auditLogs.eventType, "partner.business_billing_changed"))));
      expect(changes.map((row) => row.payload?.packageId)).toEqual([seller.frontDesk.packageId, null]);

      await setPartnerBusinessBilling(seller.context, seller.admin, { businessId: sold.businessId, packageId: seller.frontDesk.packageId });
      await payInvitation(tx, seller, sold);
      expect(await refusal(setPartnerBusinessBilling(seller.context, seller.admin, { businessId: sold.businessId, packageId: null }))).toMatchObject({ status: 409, code: "subscription_active" });
    });
  });

  it("lets the partner rebill a business whose live subscription nobody would hear end", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      await payInvitation(tx, seller, sold);
      // The partner disconnects its account, so no more of its webhooks arrive.
      const { body, signature } = seller.stripe.delivery("account.application.deauthorized", { accountId: seller.accountId });
      await recordStripeConnectEvent(seller.context, seller.stripe.verifyWebhook(body, signature));
      expect(await setPartnerBusinessBilling(seller.context, seller.owner, { businessId: sold.businessId, packageId: null })).toEqual({ kind: "outside" });
      const subscriptionOf = async (businessId: string) => (await asMigrator(tx, async () => await tx.select({ subscriptionId: billingAccounts.stripeSubscriptionId, state: billingAccounts.stripeSubscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId))))[0];
      // The change forgets the subscription, so it can't make a later package live.
      expect(await subscriptionOf(sold.businessId)).toEqual({ subscriptionId: null, state: null });
      expect((await entitlementOf(tx, seller, sold.businessId)).entitlement).toMatchObject({ live: true, source: "billed_outside" });

      // On a deployment without Stripe Connect, the same.
      const offline = await sellingPartner(tx);
      const paid = await soldBusiness(tx, offline, { packageId: offline.frontDesk.packageId });
      await payInvitation(tx, offline, paid);
      expect(await setPartnerBusinessBilling({ db: offline.context.db }, offline.owner, { businessId: paid.businessId, packageId: null })).toEqual({ kind: "outside" });
      expect(await subscriptionOf(paid.businessId)).toEqual({ subscriptionId: null, state: null });
    });
  });

  it("keeps a business's own operators from giving themselves a package or a live subscription", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      await acceptInvitation(seller.context, { userId: sold.owner.userId, tokenHash: sold.tokenHash, email: sold.owner.email, emailVerified: true });
      const asOwner = (change: Partial<typeof billingAccounts.$inferInsert>) => withBusinessTransaction(seller.context.db, { userId: sold.owner.userId, businessId: sold.businessId, actorType: "operator" }, async (inner) => await inner.update(billingAccounts).set(change).where(eq(billingAccounts.businessId, sold.businessId)));
      expect(await refusal(asOwner({ stripeSubscriptionState: "active" }))).toMatchObject({ code: "42501", message: "package_billing_locked" });
      expect(await refusal(asOwner({ packageId: null }))).toMatchObject({ code: "42501", message: "package_billing_locked" });
      // Deleting the account would leave the business billed outside LobbyStack, with no limit.
      const deleteAsOwner = withBusinessTransaction(seller.context.db, { userId: sold.owner.userId, businessId: sold.businessId, actorType: "operator" }, async (inner) => await inner.delete(billingAccounts).where(eq(billingAccounts.businessId, sold.businessId)));
      expect(await refusal(deleteAsOwner)).toMatchObject({ code: "42501", message: "package_billing_locked" });
      expect((await entitlementOf(tx, seller, sold.businessId)).entitlement.live).toBe(false);
    });
  });
});

describe.skipIf(!client)("paying for a package from the invitation link", () => {
  it("shows the invited owner the package and opens a checkout on the partner's account for it, reused until it closes", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      // It names no price: only Stripe's checkout shows the owner what they pay.
      expect((await previewInvitation(seller.context, { tokenHash: sold.tokenHash }))?.payment).toEqual({ packageName: "Front desk", allowance: { voiceMinutes: 300, chats: 1000 }, status: "awaiting_payment", canPay: true });
      // Without Stripe Connect the business is billed outside LobbyStack, so the link only signs in.
      expect((await previewInvitation({ db: seller.context.db }, { tokenHash: sold.tokenHash }))?.payment).toBeNull();

      const first = await startInvitationCheckout(seller.context, { tokenHash: sold.tokenHash, partnerId: seller.partnerId, ...returnUrls(sold.token) });
      const [checkout] = [...seller.stripe.checkouts.values()];
      expect(checkout).toMatchObject({ accountId: seller.accountId, status: "open" });
      const prices = [...seller.stripe.prices.entries()].filter(([, price]) => price.accountId === seller.accountId).map(([priceId]) => priceId);
      expect(checkout!.input).toMatchObject({
        priceId: expect.any(String),
        setupPriceId: expect.any(String),
        customerId: null,
        customerEmail: sold.owner.email,
        clientReferenceId: sold.businessId,
        metadata: { lobbystack_business_id: sold.businessId, lobbystack_package_id: seller.frontDesk.packageId },
        ...returnUrls(sold.token),
      });
      expect(prices).toEqual(expect.arrayContaining([checkout!.input.priceId, checkout!.input.setupPriceId]));
      expect(await startInvitationCheckout(seller.context, { tokenHash: sold.tokenHash, partnerId: seller.partnerId, ...returnUrls(sold.token) })).toEqual(first);
      expect(seller.stripe.checkouts.size).toBe(1);
    });
  });

  it("opens only on the business's own partner's domain, only for the invitation to own it, and only while the partner takes payments", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      const start = (input: Partial<Parameters<typeof startInvitationCheckout>[1]>, context: Seller["context"] | { db: Database } = seller.context) => startInvitationCheckout(context, { tokenHash: sold.tokenHash, partnerId: seller.partnerId, ...returnUrls(sold.token), ...input });
      expect(await refusal(start({ partnerId: null }))).toMatchObject({ status: 409, code: "invitation_invalid" });
      expect(await refusal(start({ partnerId: randomUUID() }))).toMatchObject({ status: 409, code: "invitation_invalid" });
      expect(await refusal(start({ tokenHash: hash("forged") }))).toMatchObject({ status: 409, code: "invitation_invalid" });
      expect(await refusal(start({}, { db: seller.context.db }))).toMatchObject({ status: 409, code: "stripe_not_configured" });

      // An invitation to join the team, once the owner is in, sells nothing.
      await acceptInvitation(seller.context, { userId: sold.owner.userId, tokenHash: sold.tokenHash, email: sold.owner.email, emailVerified: true });
      const [teammate] = await people(tx, 1);
      const { token } = await inviteMember(seller.context, { userId: sold.owner.userId, businessId: sold.businessId, email: teammate!.email, role: "viewer" });
      expect((await previewInvitation(seller.context, { tokenHash: hash(token) }))?.payment).toBeNull();
      expect(await refusal(start({ tokenHash: hash(token) }))).toMatchObject({ status: 409, code: "invitation_invalid" });

      const second = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      seller.stripe.updateAccount(seller.accountId, { chargesEnabled: false, disabledReason: "requirements.past_due" });
      const update = seller.stripe.delivery("account.updated", { accountId: seller.accountId });
      await recordStripeConnectEvent(seller.context, seller.stripe.verifyWebhook(update.body, update.signature));
      expect(await refusal(startInvitationCheckout(seller.context, { tokenHash: second.tokenHash, partnerId: seller.partnerId, ...returnUrls(second.token) }))).toMatchObject({ status: 409, code: "payments_unavailable" });
      // The link says so, and its owner signs in first instead.
      expect((await previewInvitation(seller.context, { tokenHash: second.tokenHash }))?.payment).toMatchObject({ packageName: "Front desk", canPay: false });

      const outside = await soldBusiness(tx, seller, { packageId: null });
      expect(await refusal(startInvitationCheckout(seller.context, { tokenHash: outside.tokenHash, partnerId: seller.partnerId, ...returnUrls(outside.token) }))).toMatchObject({ status: 409, code: "billed_outside" });
    });
  });
});

describe.skipIf(!client)("the package's subscription", () => {
  it("never lets a subscription for one package unlock another package's allowance", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      const { url } = await startInvitationCheckout(seller.context, { tokenHash: sold.tokenHash, partnerId: seller.partnerId, ...returnUrls(sold.token) });
      const fullService = await createPartnerPackage(seller.context, seller.owner, { name: "Full service", monthlyPriceMinor: 49900, setupFeeMinor: null, voiceMinutes: 3000, chats: 10000 });
      // Stripe doesn't answer when the change closes the old checkout, so it stays open, and the owner pays it.
      seller.stripe.failNextCall();
      await setPartnerBusinessBilling(seller.context, seller.owner, { businessId: sold.businessId, packageId: fullService.packageId });
      const sessionId = url.split("/").at(-1)!;
      expect(seller.stripe.checkouts.get(sessionId)?.status).toBe("open");
      seller.stripe.completeCheckout(sessionId);
      expect(await deliver(seller, "checkout.session.completed", seller.stripe.checkoutObject(sessionId))).toMatchObject({ duplicate: false, applied: false, businessId: sold.businessId, otherPackage: true });
      expect(await entitlementOf(tx, seller, sold.businessId)).toMatchObject({ entitlement: { live: false, allowance: { voiceSeconds: 0, chats: 0 } }, sqlLive: false });
      expect(await subscriptionStarts(tx, sold.businessId)).toEqual([]);
      // It doesn't pay for the package the business is on, so the partner can still change that.
      expect(await setPartnerBusinessBilling(seller.context, seller.owner, { businessId: sold.businessId, packageId: null })).toEqual({ kind: "outside" });
    });
  });

  it("never sends the owner back to a checkout it closed when the business's billing changed meanwhile", async () => {
    await rollbackTest(async (tx) => {
      const stripe = new FakeStripeConnect();
      const seller = await sellingPartner(tx, stripe);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      // The partner bills the business outside LobbyStack while Stripe makes the checkout.
      const create = stripe.createCheckout.bind(stripe);
      let meanwhile: (() => Promise<unknown>) | null = async () => await setPartnerBusinessBilling(seller.context, seller.owner, { businessId: sold.businessId, packageId: null });
      stripe.createCheckout = async (accountId, input) => {
        const made = await create(accountId, input);
        const run = meanwhile;
        meanwhile = null;
        await run?.();
        return made;
      };
      const start = () => startInvitationCheckout(seller.context, { tokenHash: sold.tokenHash, partnerId: seller.partnerId, ...returnUrls(sold.token) });
      expect(await refusal(start())).toMatchObject({ status: 409, code: "billing_changed" });
      const [closed] = [...stripe.checkouts.values()];
      expect(closed?.status).toBe("expired");

      // Back on the package, the same click gets a new checkout, open to pay, not Stripe's replay of the closed one.
      await setPartnerBusinessBilling(seller.context, seller.owner, { businessId: sold.businessId, packageId: seller.frontDesk.packageId });
      const { url } = await start();
      expect(url).not.toBe(closed!.url);
      expect(stripe.checkouts.get(url.split("/").at(-1)!)?.status).toBe("open");
    });
  });

  it("never offers a partner's business the host's free trial number while it waits to pay", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      await acceptInvitation(seller.context, { userId: sold.owner.userId, tokenHash: sold.tokenHash, email: sold.owner.email, emailVerified: true });
      const owner = { userId: sold.owner.userId, businessId: sold.businessId };
      expect((await entitlementOf(tx, seller, sold.businessId)).entitlement.live).toBe(false);
      expect(await getNumberTrialState(seller.context, owner)).toEqual({ status: "none" });
      expect(await numberStepRedirect(seller.context, { ...owner, finished: false })).toBeNull();
    });
  });

  it("buys a business that hasn't paid for its package no number, the host's free trial included, while its partner pays for a tier", async () => {
    await rollbackTest(async (tx) => {
      await lockTierBilling(tx);
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      await acceptInvitation(seller.context, { userId: sold.owner.userId, tokenHash: sold.tokenHash, email: sold.owner.email, emailVerified: true });
      const phone = `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
      await asMigrator(tx, async () => {
        await tx.update(businesses).set({ onboardingStage: "phone_number" }).where(eq(businesses.id, sold.businessId));
        await tx.update(users).set({ phone, phoneVerifiedAt: new Date() }).where(eq(users.id, sold.owner.userId));
        // The partner pays for Scale, which counts its numbers and lets it hold more than it includes.
        await tx.insert(partnerBillingAccounts).values({ partnerId: seller.partnerId, billingKey: `partner:${seller.partnerId}`, tier: "scale", billingInterval: "monthly", subscriptionState: "active", poolVoiceSeconds: 0, poolChats: 0, includedNumbers: 25 });
      });
      await asWorker(tx, async () => await recordPartnerTierBilling({ db: tx as unknown as Database }, { enabled: true }));
      expect((await entitlementOf(tx, seller, sold.businessId)).entitlement.live).toBe(false);

      // The search refuses before it asks the carrier, instead of offering the host's trial.
      const inventory = { listAvailablePhoneNumbers: vi.fn(async () => [{ phoneE164: phone, countryCode: "CA", capabilities: { sms: true, voice: true } }]) };
      expect(await refusal(searchBusinessNumberInventory(seller.context, { userId: sold.owner.userId, businessId: sold.businessId, claimTokenSecret: "test-secret" }, inventory))).toMatchObject({ status: 409, code: "partner_numbers_unavailable" });
      expect(inventory.listAvailablePhoneNumbers).not.toHaveBeenCalled();

      // The trial claim refuses it too.
      await tx.execute(sql`set local session authorization lobbystack_app`);
      const trialClaim = withBusinessTransaction(seller.context.db, { userId: sold.owner.userId, businessId: sold.businessId, actorType: "operator" }, async (inner) => await inner.execute(sql`select app.reserve_trial_number_claim(${sold.businessId}::uuid, ${sold.owner.userId}::uuid, ${phone}, ${JSON.stringify({ trial: true, verifiedPhone: phone })}::jsonb, ${randomUUID()}, ${randomUUID()}, null)`));
      expect(await refusal(trialClaim)).toMatchObject({ code: "P0001", message: "partner_numbers_unavailable" });
      await tx.execute(sql`reset session authorization`);
      await tx.execute(sql`set local role lobbystack_app`);
    });
  });

  it("makes the business live with the package's allowance once Stripe says it pays, and reports the start once", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      // Before it pays, it has nothing to answer with: calls forward, and chat shows its message.
      expect(await entitlementOf(tx, seller, sold.businessId)).toMatchObject({ entitlement: { live: false, source: "package", allowance: { voiceSeconds: 0, chats: 0 } }, sqlLive: false });
      const reserve = (sourceKey: string) => asWorker(tx, async () => await withBusinessTransaction(seller.context.db, { businessId: sold.businessId, actorType: "worker" }, async (inner) => await reserveUsageInTransaction(inner, { businessId: sold.businessId, usageKind: "voice_seconds", sourceKey })));
      expect(await reserve(`voice:${randomUUID()}`)).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });

      const { subscription, outcome } = await payInvitation(tx, seller, sold);
      expect(outcome).toEqual({ duplicate: false, applied: true, partnerId: seller.partnerId, businessId: sold.businessId });
      expect(await entitlementOf(tx, seller, sold.businessId)).toEqual({
        entitlement: {
          live: true,
          source: "package",
          allowance: { voiceSeconds: 18_000, chats: 1000, alertSms: null, outboundAttempts: null },
          overage: { enabled: false, currency: "CAD", rates: { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 }, capMinor: null },
          poolPartnerId: seller.partnerId,
          includedNumbers: null,
        },
        sqlLive: true,
      });
      expect(await reserve(`voice:${randomUUID()}`)).toMatchObject({ allowed: true });
      expect((await asWorker(tx, async () => await withBusinessTransaction(seller.context.db, { businessId: sold.businessId, actorType: "worker" }, async (inner) => await readVoiceSecondsLeftInTransaction(inner, { businessId: sold.businessId })))).seconds).toBeLessThanOrEqual(18_000);

      // Redelivery, and later news of the same live subscription, start nothing again.
      expect(await deliver(seller, "customer.subscription.created", seller.stripe.subscriptionObject(subscription.subscriptionId))).toMatchObject({ applied: true });
      const stored = await asMigrator(tx, async () => await tx.select({ providerEventId: providerEvents.providerEventId }).from(providerEvents).where(eq(providerEvents.businessId, sold.businessId)));
      expect(await deliver(seller, "customer.subscription.created", seller.stripe.subscriptionObject(subscription.subscriptionId), stored.at(-1)!.providerEventId)).toMatchObject({ duplicate: true });
      expect(await subscriptionStarts(tx, sold.businessId)).toEqual([{ properties: expect.objectContaining({ businessId: sold.businessId, partnerId: seller.partnerId, packageId: seller.frontDesk.packageId, currency: "CAD" }) }]);
      expect(JSON.stringify(await subscriptionStarts(tx, sold.businessId))).not.toContain("14900");
    });
  });

  it("keeps the allowance while Stripe retries a failed payment, and ends it when the subscription ends", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      const { subscription } = await payInvitation(tx, seller, sold);

      seller.stripe.updateSubscription(subscription.subscriptionId, { status: "past_due" });
      await deliver(seller, "invoice.payment_failed", { id: `in_${randomUUID()}`, object: "invoice", parent: { type: "subscription_details", subscription_details: { subscription: subscription.subscriptionId } } });
      expect(await entitlementOf(tx, seller, sold.businessId)).toMatchObject({ entitlement: { live: true, allowance: { voiceSeconds: 18_000 } }, sqlLive: true });

      seller.stripe.updateSubscription(subscription.subscriptionId, { status: "canceled" });
      await deliver(seller, "customer.subscription.deleted", seller.stripe.subscriptionObject(subscription.subscriptionId));
      expect(await entitlementOf(tx, seller, sold.businessId)).toMatchObject({ entitlement: { live: false, source: "package", allowance: { voiceSeconds: 0, chats: 0 } }, sqlLive: false });

      // A delivery that arrives late, describing the subscription as it once was, can't bring it back: the webhook reads Stripe's answer now.
      await deliver(seller, "customer.subscription.updated", seller.stripe.subscriptionObject(subscription.subscriptionId, { status: "active" }));
      expect((await entitlementOf(tx, seller, sold.businessId)).entitlement.live).toBe(false);
    });
  });

  it("ignores a subscription that names another partner's business, and an older subscription ending", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const other = await sellingPartner(tx);
      const theirs = await soldBusiness(tx, other, { packageId: other.frontDesk.packageId });
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });

      // The partner makes a subscription on its own account that claims another partner's business.
      const forged = await subscriptionMadeInStripe(seller, theirs.businessId);
      expect(await deliver(seller, "checkout.session.completed", seller.stripe.checkoutObject(forged.sessionId))).toMatchObject({ duplicate: false, applied: false, partnerId: seller.partnerId, businessId: null });
      expect((await entitlementOf(tx, other, theirs.businessId)).entitlement.live).toBe(false);

      // The business pays, then another subscription of its own starts and ends: the live one stays.
      const { subscription } = await payInvitation(tx, seller, sold);
      const { subscription: stray } = await subscriptionMadeInStripe(seller, sold.businessId);
      seller.stripe.updateSubscription(stray.subscriptionId, { status: "canceled" });
      expect(await deliver(seller, "customer.subscription.deleted", seller.stripe.subscriptionObject(stray.subscriptionId))).toMatchObject({ applied: false, businessId: sold.businessId });
      const [account] = await asMigrator(tx, async () => await tx.select({ subscriptionId: billingAccounts.stripeSubscriptionId, state: billingAccounts.stripeSubscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, sold.businessId)));
      expect(account).toEqual({ subscriptionId: subscription.subscriptionId, state: "active" });
    });
  });

  it("bills every partner business outside LobbyStack on a deployment without Stripe Connect", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
      expect((await entitlementOf(tx, seller, sold.businessId)).entitlement).toMatchObject({ live: true, source: "billed_outside", allowance: { voiceSeconds: null, chats: null } });
      const context = { db: seller.context.db };
      expect((await listPartnerBusinesses(context, seller.owner)).find((business) => business.businessId === sold.businessId)?.billing).toEqual({ kind: "outside" });
    });
  });
});

describe.skipIf(!client)("a partner's business's billing page", () => {
  it("shows its owner the package, opens a checkout until it pays, then the partner's customer portal", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      await acceptInvitation(seller.context, { userId: sold.owner.userId, tokenHash: sold.tokenHash, email: sold.owner.email, emailVerified: true });
      const owner = { userId: sold.owner.userId, businessId: sold.businessId };
      expect(await getPackageBilling(seller.context, owner)).toMatchObject({ billing: "package", offer: { packageName: "Front desk", status: "awaiting_payment" }, canOpenPortal: false, canSubscribe: true });
      expect(await refusal(openPackagePortal(seller.context, { ...owner, returnUrl: "https://acme.portal.example.test/settings/subscription" }))).toMatchObject({ status: 409, code: "no_customer" });

      const urls = { successUrl: "https://acme.portal.example.test/settings/subscription?checkout=complete", cancelUrl: "https://acme.portal.example.test/settings/subscription" };
      const { url } = await startPackageCheckout(seller.context, { ...owner, email: sold.owner.email, ...urls });
      const subscription = seller.stripe.completeCheckout(url.split("/").at(-1)!);
      await deliver(seller, "customer.subscription.created", seller.stripe.subscriptionObject(subscription.subscriptionId));

      expect(await getPackageBilling(seller.context, owner)).toMatchObject({ billing: "package", offer: { status: "active" }, currentPeriodEnd: subscription.currentPeriodEnd!.toISOString(), canOpenPortal: true, canSubscribe: false });
      expect(await refusal(startPackageCheckout(seller.context, { ...owner, email: sold.owner.email, ...urls }))).toMatchObject({ status: 409, code: "subscription_active" });
      expect(await openPackagePortal(seller.context, { ...owner, returnUrl: "https://acme.portal.example.test/settings/subscription" })).toEqual({ url: expect.stringContaining(subscription.customerId) });
      expect(seller.stripe.portals).toEqual([{ accountId: seller.accountId, customerId: subscription.customerId, returnUrl: "https://acme.portal.example.test/settings/subscription" }]);

      // After it ends, a new checkout bills the same customer, so the portal keeps every invoice.
      seller.stripe.updateSubscription(subscription.subscriptionId, { status: "canceled" });
      await deliver(seller, "customer.subscription.deleted", seller.stripe.subscriptionObject(subscription.subscriptionId));
      await startPackageCheckout(seller.context, { ...owner, email: sold.owner.email, ...urls });
      expect([...seller.stripe.checkouts.values()].at(-1)!.input.customerId).toBe(subscription.customerId);
    });
  });

  it("is only for owners and admins of a partner's business, and says when the partner bills it outside LobbyStack", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: null });
      await acceptInvitation(seller.context, { userId: sold.owner.userId, tokenHash: sold.tokenHash, email: sold.owner.email, emailVerified: true });
      expect(await getPackageBilling(seller.context, { userId: sold.owner.userId, businessId: sold.businessId })).toEqual({ billing: "outside" });

      const [viewer, directOwner] = await people(tx, 2);
      const { token } = await inviteMember(seller.context, { userId: sold.owner.userId, businessId: sold.businessId, email: viewer!.email, role: "viewer" });
      await acceptInvitation(seller.context, { userId: viewer!.userId, tokenHash: hash(token), email: viewer!.email, emailVerified: true });
      expect(await refusal(getPackageBilling(seller.context, { userId: viewer!.userId, businessId: sold.businessId }))).toMatchObject({ status: 403 });
      expect(await refusal(openPackagePortal(seller.context, { userId: viewer!.userId, businessId: sold.businessId, returnUrl: "https://acme.portal.example.test/settings/subscription" }))).toMatchObject({ status: 403 });

      // A name of its own: soldBusiness made a Harbor Dental first, and another suite makes a Corner Shop before its Harbor Dental, so a shared slug would deadlock the two.
      const { businessId: direct } = await createBusiness(seller.context, { userId: directOwner!.userId, name: `Corner Shop ${randomUUID().slice(0, 8)}`, timezone: "UTC", businessType: "test" });
      expect(await refusal(getPackageBilling(seller.context, { userId: directOwner!.userId, businessId: direct }))).toMatchObject({ status: 404, code: "business_not_found" });
    });
  });

  it("stays with the business's own team, out of reach of someone from the partner who opened it", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      await acceptInvitation(seller.context, { userId: sold.owner.userId, tokenHash: sold.tokenHash, email: sold.owner.email, emailVerified: true });
      // An open acts with an admin's role, for the partner's admins and members alike.
      for (const actor of [seller.admin, seller.member]) {
        await openPartnerBusiness(seller.context, { userId: actor.userId, businessId: sold.businessId, partnerId: seller.partnerId });
        const opened = { userId: actor.userId, businessId: sold.businessId };
        expect(await refusal(getPackageBilling(seller.context, opened))).toMatchObject({ status: 403 });
        expect(await refusal(startPackageCheckout(seller.context, { ...opened, email: null, successUrl: "https://acme.portal.example.test/settings/subscription", cancelUrl: "https://acme.portal.example.test/settings/subscription" }))).toMatchObject({ status: 403 });
        expect(await refusal(openPackagePortal(seller.context, { ...opened, returnUrl: "https://acme.portal.example.test/settings/subscription" }))).toMatchObject({ status: 403 });
      }
      expect(seller.stripe.checkouts.size).toBe(0);
    });
  });
});

describe.skipIf(!client)("releasing or deleting a business on a package", () => {
  const packageOf = async (tx: DatabaseTransaction, businessId: string) => (await asMigrator(tx, async () => await tx.select({ packageId: billingAccounts.packageId, plan: billingAccounts.plan }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId))))[0];
  const cancel = async (seller: Seller, subscriptionId: string) => {
    seller.stripe.updateSubscription(subscriptionId, { status: "canceled" });
    await deliver(seller, "customer.subscription.deleted", seller.stripe.subscriptionObject(subscriptionId));
  };

  it("waits for the partner to cancel a live subscription, then releases the business with no package", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      const { subscription } = await payInvitation(tx, seller, sold);
      await acceptInvitation(seller.context, { userId: sold.owner.userId, tokenHash: sold.tokenHash, email: sold.owner.email, emailVerified: true });
      // Its owner would keep paying the partner for a business the partner no longer runs.
      expect(await refusal(releaseBusiness(seller.context, seller.admin, { businessId: sold.businessId }))).toMatchObject({ status: 409, code: "subscription_active" });
      expect((await listPartnerBusinesses(seller.context, seller.owner)).map((business) => business.businessId)).toEqual([sold.businessId]);

      await cancel(seller, subscription.subscriptionId);
      expect(await releaseBusiness(seller.context, seller.admin, { businessId: sold.businessId })).toEqual({ ownerUserId: sold.owner.userId });
      expect(await packageOf(tx, sold.businessId)).toEqual({ packageId: null, plan: "free_cloud" });
      expect((await entitlementOf(tx, seller, sold.businessId)).entitlement).toMatchObject({ poolPartnerId: null });
    });
  });

  it("closes the checkout of a business it releases or deletes before it paid", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const released = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      const { url: releasedCheckout } = await startInvitationCheckout(seller.context, { tokenHash: released.tokenHash, partnerId: seller.partnerId, ...returnUrls(released.token) });
      await acceptInvitation(seller.context, { userId: released.owner.userId, tokenHash: released.tokenHash, email: released.owner.email, emailVerified: true });
      await releaseBusiness(seller.context, seller.owner, { businessId: released.businessId });
      expect(seller.stripe.checkouts.get(releasedCheckout.split("/").at(-1)!)?.status).toBe("expired");
      expect(await packageOf(tx, released.businessId)).toMatchObject({ packageId: null });

      const deleted = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      const { url: deletedCheckout } = await startInvitationCheckout(seller.context, { tokenHash: deleted.tokenHash, partnerId: seller.partnerId, ...returnUrls(deleted.token) });
      await deletePartnerBusiness(seller.context, seller.admin, { businessId: deleted.businessId });
      expect(seller.stripe.checkouts.get(deletedCheckout.split("/").at(-1)!)?.status).toBe("expired");
    });
  });

  it("waits for the partner to cancel a live subscription before it deletes the business", async () => {
    await rollbackTest(async (tx) => {
      const seller = await sellingPartner(tx);
      const sold = await soldBusiness(tx, seller, { packageId: seller.frontDesk.packageId });
      const { subscription } = await payInvitation(tx, seller, sold);
      expect(await refusal(deletePartnerBusiness(seller.context, seller.owner, { businessId: sold.businessId }))).toMatchObject({ status: 409, code: "subscription_active" });
      await cancel(seller, subscription.subscriptionId);
      await deletePartnerBusiness(seller.context, seller.owner, { businessId: sold.businessId });
      expect(await listPartnerBusinesses(seller.context, seller.owner)).toEqual([]);
    });
  });
});
