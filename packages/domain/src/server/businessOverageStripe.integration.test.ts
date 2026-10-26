import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingAccounts, billingUsageEvents, businesses, businessMemberships, createDatabaseClient, outboxMessages, partnerMembers, partnerPackages, partners, partnerStripeAccounts, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";

import { reserveWidgetChatUsageInTransaction } from "./billing";
import { syncBusinessOverage } from "./businessOverageSync";
import { setPartnerBusinessOverage, type PartnerBusinessOverageInput } from "./packageBilling";
import type { PartnerMemberActor } from "./partners";
import { correctUsageInTransaction, enqueueUsageSyncInTransaction, readAllowanceUsageInTransaction, reserveUsageInTransaction } from "./usage";

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

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  // Partner features read these to turn Stripe Connect on; the fake stands in for Stripe itself.
  vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "sk_test_overage");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_overage");
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
  admin: PartnerMemberActor;
  accountId: string;
  /** On the Front desk package, whose subscription pays on the partner's Stripe. */
  cedar: string;
  customerId: string;
  subscriptionId: string;
  /** Cedar's own team: an owner, an admin and a viewer. */
  team: { ownerId: string; adminId: string; viewerId: string };
};

/**
 * A partner whose Stripe account, made on the fake, is Canadian, with its
 * Front desk package of 10 minutes and 3 chats a month in CAD. Cedar's owner
 * paid for Front desk at the package's checkout, so Cedar has a customer and
 * a live subscription on the partner's account. Made as the migrator.
 */
async function seedPartner(db: DatabaseTransaction, stripe: FakeStripeConnect): Promise<Seeded> {
  const partnerId = randomUUID();
  const adminId = randomUUID();
  const team = { ownerId: randomUUID(), adminId: randomUUID(), viewerId: randomUUID() };
  const people = [adminId, team.ownerId, team.adminId, team.viewerId];
  await db.insert(users).values(people.map((id) => ({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid`, name: id === team.ownerId ? "Mia Ortega" : "Cedar Person", emailVerified: true, ...(id === team.adminId ? { preferredLocale: "fr" } : {}) })));
  await db.insert(partners).values({ id: partnerId, name: "Overage Reception", slug: `stripe-overage-${partnerId.slice(0, 8)}` });
  await db.insert(partnerMembers).values({ partnerId, userId: adminId, role: "admin" });
  const cedar = randomUUID();
  await db.insert(businesses).values({ id: cedar, slug: `stripe-overage-${cedar}`, name: "Cedar Clinic", timezone: "America/Toronto", businessType: "test", deploymentMode: "cloud", onboardingStage: "complete", partnerId });
  await db.insert(businessMemberships).values([{ businessId: cedar, userId: team.ownerId, role: "business_owner" }, { businessId: cedar, userId: team.adminId, role: "business_admin" }, { businessId: cedar, userId: team.viewerId, role: "viewer" }]);
  const { accountId } = await stripe.createOnboardingLink({ accountId: null, country: "CA", idempotencyKey: `partner:${partnerId}`, returnUrl: "https://desk.test/r", refreshUrl: "https://desk.test/f", metadata: {} });
  stripe.updateAccount(accountId, { currency: "CAD", chargesEnabled: true, detailsSubmitted: true });
  await db.insert(partnerStripeAccounts).values({ partnerId, stripeAccountId: accountId, currency: "CAD", chargesEnabled: true, detailsSubmitted: true });
  const packageId = randomUUID();
  const prices = await stripe.upsertPackagePrice(accountId, { packageId, name: "Front desk", currency: "CAD", monthlyPriceMinor: 4_900, setupFeeMinor: null, active: true, prices: null });
  await db.insert(partnerPackages).values({ id: packageId, partnerId, name: "Front desk", currency: "CAD", monthlyPriceMinor: 4_900, voiceMinutes: 10, chats: 3, stripeAccountId: accountId, stripeProductId: prices.productId, stripePriceId: prices.priceId });
  const checkout = await stripe.createCheckout(accountId, { priceId: prices.priceId, setupPriceId: null, customerId: null, customerEmail: null, successUrl: "https://a.test/s", cancelUrl: "https://a.test/c", idempotencyKey: `checkout:${cedar}`, clientReferenceId: cedar, metadata: { lobbystack_business_id: cedar, lobbystack_package_id: packageId } });
  const subscription = stripe.completeCheckout(checkout.sessionId);
  await db.insert(billingAccounts).values({ businessId: cedar, billingKey: `business:${cedar}`, packageId, stripeAccountId: accountId, stripeCustomerId: subscription.customerId, stripeSubscriptionId: subscription.subscriptionId, stripeSubscriptionState: "active" });
  return { partnerId, admin: { kind: "member", partnerId, userId: adminId, role: "admin" }, accountId, cedar, customerId: subscription.customerId, subscriptionId: subscription.subscriptionId, team };
}

/** Sets a business's overage from the console, as the app does for an owner or admin. */
async function setOverage(tx: DatabaseTransaction, stripe: FakeStripeConnect, actor: PartnerMemberActor, input: PartnerBusinessOverageInput) {
  return await asApp(tx, async (db) => await setPartnerBusinessOverage({ db, stripeConnect: stripe }, actor, input));
}

/** A call's end at this many seconds, the way the call's finish corrects its reservation and queues its sync. */
async function endCall(tx: DatabaseTransaction, businessId: string, sourceKey: string, seconds: number): Promise<string> {
  return await asWorker(tx, businessId, async (inner) => {
    const usageEventId = await correctUsageInTransaction(inner, { businessId, sourceKey, usageKind: "voice_seconds", quantity: seconds });
    await enqueueUsageSyncInTransaction(inner, { businessId, usageEventId });
    return usageEventId;
  });
}

async function websiteChat(tx: DatabaseTransaction, businessId: string, conversationId = randomUUID()) {
  return { sourceKey: `chat:${conversationId}`, ...await asWorker(tx, businessId, async (inner) => await reserveWidgetChatUsageInTransaction(inner, { businessId, conversationId })) };
}

/** The usage sync job's Stripe half, as the worker runs it. */
async function sync(tx: DatabaseTransaction, stripe: FakeStripeConnect, businessId: string, usageEventId: string) {
  return await asWorkerRole(tx, async (db) => await syncBusinessOverage({ db, stripeConnect: stripe }, { businessId, usageEventId }));
}

async function usageEvent(tx: DatabaseTransaction, businessId: string, sourceKey: string) {
  const [event] = await tx.select({ id: billingUsageEvents.id, syncStatus: billingUsageEvents.syncStatus, stripeSyncStatus: billingUsageEvents.stripeSyncStatus, businessOverageMinor: billingUsageEvents.businessOverageMinor, stripeOverageReportedMinor: billingUsageEvents.stripeOverageReportedMinor, stripeOverageSendingMinor: billingUsageEvents.stripeOverageSendingMinor, stripeOverageReports: billingUsageEvents.stripeOverageReports })
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.sourceKey, sourceKey)));
  return event!;
}

async function syncsQueued(tx: DatabaseTransaction, usageEventId: string): Promise<number> {
  return (await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, usageEventId), eq(outboxMessages.topic, "billing.syncUsage")))).length;
}

async function alertEmails(tx: DatabaseTransaction, businessId: string, template = "business_allowance_alert") {
  const rows = await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "email.send"), sql`${outboxMessages.payload}->>'template' = ${template}`));
  return rows.map((row) => row.payload as { to: string; variables: Record<string, string>; brand: unknown; replyTo: unknown });
}

/** The same alerts, as the partner's own owners and admins get them. */
async function partnerAlertEmails(tx: DatabaseTransaction, businessId: string) {
  return await alertEmails(tx, businessId, "partner_business_allowance_alert");
}

// Front desk's overage in these tests: 30 cents a minute, which is half a cent a second, and 10 cents a chat.
const FRONT_DESK_OVERAGE = { enabled: true, voiceMinuteRateMinor: 30, chatRateMinor: 10, capMinor: null };

describe.skipIf(!client)("a business's overage on its partner's Stripe", () => {
  it("reports what each call and chat put past the allowance once, as meter events named by the usage's source", async () => {
    await rollbackTest(async (tx) => {
      const stripe = new FakeStripeConnect();
      const acme = await seedPartner(tx, stripe);
      await setOverage(tx, stripe, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE });

      // A call within the allowance owes the partner's Stripe nothing, so it syncs nothing.
      const within = `voice:${randomUUID()}`;
      const withinId = await endCall(tx, acme.cedar, within, 540);
      expect(await usageEvent(tx, acme.cedar, within)).toMatchObject({ businessOverageMinor: 0, stripeSyncStatus: null });
      expect(await syncsQueued(tx, withinId)).toBe(0);

      // The next one ends 2 minutes past it: 60 cents.
      const past = `voice:${randomUUID()}`;
      const pastId = await endCall(tx, acme.cedar, past, 180);
      expect(await usageEvent(tx, acme.cedar, past)).toMatchObject({ businessOverageMinor: 60, stripeSyncStatus: "pending", syncStatus: "skipped" });
      expect(await syncsQueued(tx, pastId)).toBe(1);
      expect(await sync(tx, stripe, acme.cedar, pastId)).toBe("synced");
      expect(stripe.meterEvents).toEqual([{ accountId: acme.accountId, eventName: "lobbystack_call_overage", identifier: past, customerId: acme.customerId, value: "0.6" }]);
      expect(await usageEvent(tx, acme.cedar, past)).toMatchObject({ stripeSyncStatus: "synced", stripeOverageReportedMinor: 60, stripeOverageSendingMinor: null, stripeOverageReports: 1 });

      // The first report put the meter's price on the subscription, which the business's billing account remembers.
      const [account] = await tx.select({ items: billingAccounts.stripeOverageItems }).from(billingAccounts).where(eq(billingAccounts.businessId, acme.cedar));
      expect(account!.items).toEqual({ subscriptionId: acme.subscriptionId, voice: expect.stringMatching(/^si_/) });
      expect(stripe.subscriptions.get(acme.subscriptionId)!.items).toHaveLength(2);

      // A second run of the job, as a retry would, sends nothing more.
      expect(await sync(tx, stripe, acme.cedar, pastId)).toBe("synced");
      expect(stripe.meterEvents).toHaveLength(1);

      // Three chats are included; the fourth costs 10 cents and goes to the chat meter, on an item of its own.
      for (let index = 0; index < 3; index++) await websiteChat(tx, acme.cedar);
      const chat = await websiteChat(tx, acme.cedar);
      expect(chat).toMatchObject({ allowed: true });
      const chatEvent = await usageEvent(tx, acme.cedar, chat.sourceKey);
      expect(chatEvent).toMatchObject({ businessOverageMinor: 10, stripeSyncStatus: "pending" });
      expect(await syncsQueued(tx, chatEvent.id)).toBe(1);
      expect(await sync(tx, stripe, acme.cedar, chatEvent.id)).toBe("synced");
      expect(stripe.meterEvents.at(-1)).toEqual({ accountId: acme.accountId, eventName: "lobbystack_chat_overage", identifier: chat.sourceKey, customerId: acme.customerId, value: "0.1" });
      expect(stripe.subscriptions.get(acme.subscriptionId)!.items).toHaveLength(3);

      // Cedar's next invoice charges exactly what its overage cost.
      expect(stripe.overageBilled(acme.accountId, acme.customerId, "voice")).toBe(60);
      expect(stripe.overageBilled(acme.accountId, acme.customerId, "chat")).toBe(10);
    });
  });

  it("sends what a correction moved under a new identifier, and a report Stripe may have counted the same again", async () => {
    await rollbackTest(async (tx) => {
      const stripe = new FakeStripeConnect();
      const acme = await seedPartner(tx, stripe);
      await setOverage(tx, stripe, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE });
      await endCall(tx, acme.cedar, `voice:${randomUUID()}`, 600);
      const call = `voice:${randomUUID()}`;
      const callId = await endCall(tx, acme.cedar, call, 100);
      expect(await sync(tx, stripe, acme.cedar, callId)).toBe("synced");

      // A correction moves the call to 160 seconds, 30 cents more, which goes out as the call's second report.
      await endCall(tx, acme.cedar, call, 160);
      expect(await usageEvent(tx, acme.cedar, call)).toMatchObject({ businessOverageMinor: 80, stripeSyncStatus: "pending", stripeOverageReportedMinor: 50 });

      // Stripe counts the report, but its answer never arrives: the job fails for a retry, with the report still out.
      const lostAnswer = Object.assign(Object.create(stripe) as FakeStripeConnect, {
        reportOverage: async (...args: Parameters<FakeStripeConnect["reportOverage"]>) => {
          await stripe.reportOverage(...args);
          throw Object.assign(new Error("Stripe timed out."), { type: "StripeConnectionError" });
        },
      });
      await expect(sync(tx, lostAnswer, acme.cedar, callId)).rejects.toThrow("Stripe timed out.");
      expect(await usageEvent(tx, acme.cedar, call)).toMatchObject({ stripeSyncStatus: "pending", stripeOverageSendingMinor: 30, stripeOverageReports: 2 });

      // The retry sends the same report again, which Stripe counts once.
      expect(await sync(tx, stripe, acme.cedar, callId)).toBe("synced");
      expect(stripe.meterEvents.map((event) => [event.identifier, event.value])).toEqual([[call, "0.5"], [`${call}:2`, "0.3"]]);
      expect(await usageEvent(tx, acme.cedar, call)).toMatchObject({ stripeSyncStatus: "synced", stripeOverageReportedMinor: 80, stripeOverageSendingMinor: null, stripeOverageReports: 2 });
      expect(stripe.overageBilled(acme.accountId, acme.customerId, "voice")).toBe(80);

      // When Stripe refuses outright, nothing goes out and the event waits for the retry.
      await endCall(tx, acme.cedar, call, 40);
      stripe.failNextCall();
      await expect(sync(tx, stripe, acme.cedar, callId)).rejects.toThrow("Stripe is unavailable.");
      expect(await sync(tx, stripe, acme.cedar, callId)).toBe("synced");
      // A correction that lowered the overage sends the difference below zero.
      expect(stripe.meterEvents.at(-1)).toMatchObject({ identifier: `${call}:3`, value: "-0.6" });
      expect(stripe.overageBilled(acme.accountId, acme.customerId, "voice")).toBe(20);
    });
  });

  it("skips overage no subscription can bill, and sends nothing for usage no package prices", async () => {
    await rollbackTest(async (tx) => {
      const stripe = new FakeStripeConnect();
      const acme = await seedPartner(tx, stripe);
      await setOverage(tx, stripe, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE });
      await endCall(tx, acme.cedar, `voice:${randomUUID()}`, 600);
      const call = `voice:${randomUUID()}`;
      const callId = await endCall(tx, acme.cedar, call, 120);

      // The subscription ends before the job runs, so nothing on Stripe would ever invoice the overage.
      stripe.updateSubscription(acme.subscriptionId, { status: "canceled" });
      await tx.update(billingAccounts).set({ stripeSubscriptionState: "canceled" }).where(eq(billingAccounts.businessId, acme.cedar));
      expect(await sync(tx, stripe, acme.cedar, callId)).toBe("skipped");
      expect(await usageEvent(tx, acme.cedar, call)).toMatchObject({ stripeSyncStatus: "skipped", stripeOverageReports: 0 });
      expect(stripe.meterEvents).toEqual([]);

      // An event with no overage, and a deployment without Stripe Connect, report nothing.
      const unpaid = await asWorker(tx, acme.cedar, async (inner) => await reserveUsageInTransaction(inner, { businessId: acme.cedar, usageKind: "outbound_call_attempts", sourceKey: `outbound_call:${randomUUID()}`, quantity: 1 }));
      expect(await sync(tx, stripe, acme.cedar, unpaid.usageEventId!)).toBe("none");
      expect(await asWorkerRole(tx, async (db) => await syncBusinessOverage({ db }, { businessId: acme.cedar, usageEventId: callId }))).toBe("none");
      expect(stripe.meterEvents).toEqual([]);
    });
  });

  it("keeps the overage's subscription items from the business's own team", async () => {
    await rollbackTest(async (tx) => {
      const stripe = new FakeStripeConnect();
      const acme = await seedPartner(tx, stripe);
      const write = asApp(tx, async (db) => await withBusinessTransaction(db, { userId: acme.team.ownerId, businessId: acme.cedar, actorType: "operator" }, async (inner) => await inner.update(billingAccounts).set({ stripeOverageItems: { subscriptionId: acme.subscriptionId, voice: "si_made_up" } }).where(eq(billingAccounts.businessId, acme.cedar))));
      expect(await refusal(write)).toMatchObject({ code: "42501", message: "package_billing_locked" });
    });
  });

  it("emails the business's owners and admins at 80% and 100% of its minutes and chats, once each, under its partner's brand", async () => {
    await rollbackTest(async (tx) => {
      const stripe = new FakeStripeConnect();
      const acme = await seedPartner(tx, stripe);
      // A partner member, who sees no billing, gets none of the partner's copies.
      const memberId = randomUUID();
      await tx.insert(users).values({ id: memberId, email: `${memberId}@example.invalid`, normalizedEmail: `${memberId}@example.invalid`, name: "Partner Member", emailVerified: true });
      await tx.insert(partnerMembers).values({ partnerId: acme.partnerId, userId: memberId, role: "member" });

      // 7 of 10 minutes send nothing; 8 minutes, counted when the call ends, are 80%.
      await endCall(tx, acme.cedar, `voice:${randomUUID()}`, 420);
      expect(await alertEmails(tx, acme.cedar)).toEqual([]);
      const open = await asWorker(tx, acme.cedar, async (inner) => await reserveUsageInTransaction(inner, { businessId: acme.cedar, usageKind: "voice_seconds", sourceKey: `voice:${randomUUID()}` }));
      expect(open).toMatchObject({ allowed: true });
      expect(await alertEmails(tx, acme.cedar)).toEqual([]);
      await endCall(tx, acme.cedar, `voice:${randomUUID()}`, 60);
      const eighty = await alertEmails(tx, acme.cedar);
      // The owner and the admin each get one, in their own language; the viewer gets none.
      expect(eighty.map((email) => email.to).sort()).toEqual([`${acme.team.adminId}@example.invalid`, `${acme.team.ownerId}@example.invalid`].sort());
      const toOwner = eighty.find((email) => email.to === `${acme.team.ownerId}@example.invalid`)!;
      expect(toOwner).toMatchObject({ brand: { kind: "business", businessId: acme.cedar }, replyTo: null });
      expect(toOwner.variables).toEqual({ locale: "en", firstName: "Mia", businessName: "Cedar Clinic", kind: "minutes", threshold: "80", used: "8", included: "10", overage: "off", capped: "", month: expect.any(String), url: "https://app.example.test/settings/usage" });
      expect(eighty.find((email) => email.to === `${acme.team.adminId}@example.invalid`)!.variables).toMatchObject({ locale: "fr", threshold: "80" });
      // The partner's admin gets its own copy, under the host's brand, with a link to the console's Businesses page.
      const toPartner = await partnerAlertEmails(tx, acme.cedar);
      expect(toPartner).toEqual([{ to: `${acme.admin.userId}@example.invalid`, brand: { kind: "host" }, replyTo: null, template: "partner_business_allowance_alert", variables: { locale: "en", firstName: "Cedar", businessName: "Cedar Clinic", kind: "minutes", threshold: "80", used: "8", included: "10", overage: "off", capped: "", month: expect.any(String), url: `https://app.example.test/partner/${acme.partnerId}/businesses` } }]);

      // Another call at 80% sends nothing new; the call that reaches 10 minutes sends the 100% alert.
      await endCall(tx, acme.cedar, `voice:${randomUUID()}`, 30);
      expect(await alertEmails(tx, acme.cedar)).toHaveLength(2);
      await setOverage(tx, stripe, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE, capMinor: 500 });
      await endCall(tx, acme.cedar, `voice:${randomUUID()}`, 120);
      const sent = async (kind: string, threshold: string) => (await alertEmails(tx, acme.cedar)).filter((email) => email.variables.kind === kind && email.variables.threshold === threshold);
      const full = await sent("minutes", "100");
      expect(full).toHaveLength(2);
      // With overage on, the email says the receptionist keeps answering, up to the partner's monthly limit.
      expect(full.find((email) => email.to === `${acme.team.ownerId}@example.invalid`)!.variables).toMatchObject({ used: "11", included: "10", overage: "on", capped: "yes" });
      await endCall(tx, acme.cedar, `voice:${randomUUID()}`, 60);
      expect(await alertEmails(tx, acme.cedar)).toHaveLength(4);

      // The third chat takes Cedar from 67% of its chats to 100%, so only the 100% alert goes out.
      for (let index = 0; index < 3; index++) await websiteChat(tx, acme.cedar);
      expect(await sent("chats", "80")).toEqual([]);
      expect(await sent("chats", "100")).toHaveLength(2);
      await websiteChat(tx, acme.cedar);
      expect(await alertEmails(tx, acme.cedar)).toHaveLength(6);
      // The partner's admin got each of the three alerts once too, and the partner's member none.
      const partnerCopies = await partnerAlertEmails(tx, acme.cedar);
      expect(partnerCopies.map((email) => [email.to, email.variables.kind, email.variables.threshold])).toEqual(expect.arrayContaining([[`${acme.admin.userId}@example.invalid`, "minutes", "80"], [`${acme.admin.userId}@example.invalid`, "minutes", "100"], [`${acme.admin.userId}@example.invalid`, "chats", "100"]]));
      expect(partnerCopies).toHaveLength(3);
    });
  });

  it("shows the business's own dashboard what it used past its allowance, with no prices", async () => {
    await rollbackTest(async (tx) => {
      const stripe = new FakeStripeConnect();
      const acme = await seedPartner(tx, stripe);
      const usage = async () => await asWorker(tx, acme.cedar, async (inner) => await readAllowanceUsageInTransaction(inner, { businessId: acme.cedar }));
      expect((await usage()).overage).toEqual({ enabled: false, voiceSeconds: 0, chats: 0 });
      await setOverage(tx, stripe, acme.admin, { businessId: acme.cedar, ...FRONT_DESK_OVERAGE });
      await endCall(tx, acme.cedar, `voice:${randomUUID()}`, 630);
      for (let index = 0; index < 5; index++) await websiteChat(tx, acme.cedar);
      // A call still open counts once it ends.
      await asWorker(tx, acme.cedar, async (inner) => await reserveUsageInTransaction(inner, { businessId: acme.cedar, usageKind: "voice_seconds", sourceKey: `voice:${randomUUID()}` }));
      expect(await usage()).toMatchObject({ voiceSeconds: { used: 930, included: 600 }, chats: { used: 5, included: 3 }, overage: { enabled: true, voiceSeconds: 30, chats: 2 } });
    });
  });
});
