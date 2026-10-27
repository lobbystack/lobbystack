import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, billingAccounts, businesses, businessTemplates, calls, createDatabaseClient, onboardingNumberClaimEvents, outboxMessages, partnerLifecycleEvents, partnerLifecycles, partnerPackages, partnerStripeAccounts, partnerUsageMonths, phoneNumbers, prospectDemos, receptionistProfiles, storageObjects, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { PROSPECT_DEMO_WIDGET_ID } from "@lobbystack/shared";
import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";

import { getWebVoiceBillingAllowance, getWidgetChatAllowance, reserveWebVoiceUsageInTransaction, reserveWidgetChatUsageInTransaction } from "./billing";
import { forgetCachedBrands } from "./brands";
import type { DomainContext } from "./context";
import { createPartnerDemo } from "./demos";
import { loadEntitlement } from "./entitlement";
import { startLivePhoneCall, startLiveWebCall } from "./liveCalls";
import { resolveNumberFallback } from "./numberTrials";
import { reconcilePartnerTier, recordPartnerPolarEvent } from "./partnerBilling";
import { advancePartnerLifecycles, getPartnerLifecycle, loadPartnerLifecycleInTransaction, PartnerLifecycleError, type PartnerStanding } from "./partnerLifecycle";
import { acceptPartnerInvitation, createPartnerBusiness, deletePartnerBusiness, hashPartnerToken, invitePartnerMember, listPartnerBusinesses, releaseBusiness, signUpPartner, type PartnerMemberActor } from "./partners";
import { acceptInvitation } from "./tenancy";
import { POOL_ALERT_AGGREGATE } from "./partnerPoolAlerts";
import { correctUsageInTransaction, periodKeyFor, reserveUsageInTransaction } from "./usage";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner lifecycle integration tests require a dedicated local test database.");
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

/**
 * Runs as the worker role, as the worker does, then goes back to the app
 * role. Security-definer functions trust session_user, so this switches it
 * rather than the current role.
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

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

/** The link token in the email queued for an invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** A partner signed up by its owner, with a member on its team. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, member] = await people(tx, 2);
  const context = { db: tx as unknown as Database };
  // A name of its own, so its slug never waits on another suite's partner of the same name.
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name: `${name} ${randomUUID().slice(0, 8)}` });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  const { invitationId } = await invitePartnerMember(context, ownerActor, { email: member!.email, role: "member" });
  await acceptPartnerInvitation(context, { userId: member!.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: member!.email, emailVerified: true });
  return { context, partnerId, owner: owner!, ownerActor, memberActor: { kind: "member", partnerId, userId: member!.userId, role: "member" } satisfies PartnerMemberActor };
}

type Partner = Awaited<ReturnType<typeof partner>>;

/** A business the partner bills outside LobbyStack, whose owner accepted the invitation. */
async function business(tx: DatabaseTransaction, seller: Partner, name: string): Promise<{ businessId: string; owner: Person }> {
  const [owner] = await people(tx, 1);
  // A name of its own, so its slug never waits on another suite's business of the same name.
  const { businessId, invitationId } = await createPartnerBusiness(seller.context, seller.ownerActor, { name: `${name} ${randomUUID().slice(0, 8)}`, timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: owner!.email });
  await acceptInvitation(seller.context, { userId: owner!.userId, tokenHash: hash(await linkToken(tx, invitationId)), email: owner!.email, emailVerified: true });
  return { businessId, owner: owner! };
}

const DAY = 24 * 60 * 60_000;
// Every time here is in the past, as Polar's would be, counted from when the test runs.
const ago = (days: number) => new Date(Date.now() - days * DAY);
const after = (time: Date, days: number) => new Date(time.getTime() + days * DAY);

type Subscription = { id?: string; status: string; tier?: "starter" | "growth" | "scale"; modifiedAt: Date; cancelAtPeriodEnd?: boolean; endedAt?: Date };

/** A subscription event for the partner's Polar customer, as the webhook route stores it after normalizing it. */
function subscriptionEvent(partnerId: string, input: Subscription): Record<string, unknown> {
  const id = input.id ?? "sub_1";
  const tier = input.tier ?? "growth";
  return {
    id,
    status: input.status,
    product_id: `prod_${tier}_monthly`,
    customer: { id: "cus_1", external_id: `partner:${partnerId}` },
    current_period_start: after(input.modifiedAt, -30).toISOString(),
    current_period_end: input.modifiedAt.toISOString(),
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    ends_at: input.cancelAtPeriodEnd ? input.modifiedAt.toISOString() : null,
    ended_at: input.endedAt?.toISOString() ?? null,
    modified_at: input.modifiedAt.toISOString(),
    billingKey: `partner:${partnerId}`,
    customerId: "cus_1",
    subscriptionId: id,
    partnerTier: tier,
    billingInterval: "monthly",
    subscriptionState: input.status,
    subscriptionModifiedAt: input.modifiedAt.toISOString(),
  };
}

/** Stores a Polar event as the webhook route does, then reconciles it as the worker does. */
async function deliver(tx: DatabaseTransaction, partnerId: string, eventType: string, input: Subscription): Promise<void> {
  const context = { db: tx as unknown as Database };
  const providerEventId = `evt_${randomUUID()}`;
  expect(await recordPartnerPolarEvent(context, { partnerId, providerEventId, eventType, payload: subscriptionEvent(partnerId, input) })).toBe("stored");
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, `provider-event:${providerEventId}:partner-billing`)));
  expect(await asWorker(tx, async () => await reconcilePartnerTier(context, { partnerId, providerEventId: String(message!.payload.providerEventId) }))).toBe(true);
}

/** Where the partner stands, as the worker reads it. */
async function standing(tx: DatabaseTransaction, partnerId: string): Promise<PartnerStanding> {
  return await asWorker(tx, async () => await withBusinessTransaction(tx as unknown as Database, { actorType: "worker" }, async (inner) => await loadPartnerLifecycleInTransaction(inner, partnerId)));
}

/** The hourly job, run as the worker at a time of the test's choosing. */
async function clock(tx: DatabaseTransaction, now: Date): Promise<number> {
  return (await asWorker(tx, async () => await advancePartnerLifecycles({ db: tx as unknown as Database }, { now }))).moved;
}

/** The hourly job with everything it reports, on a worker that may have Stripe Connect. */
async function hour(tx: DatabaseTransaction, now: Date, context: Partial<DomainContext> = {}) {
  return await asWorker(tx, async () => await advancePartnerLifecycles({ ...context, db: tx as unknown as Database }, { now }));
}

/** The lifecycle steps in the business's audit log. Rows written in one transaction share a time, so they come back by step. */
async function lifecycleAudit(tx: DatabaseTransaction, businessId: string) {
  const rows = await asMigrator(tx, async () => await tx.select({ entityType: auditLogs.entityType, entityId: auditLogs.entityId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "partner.lifecycle_changed"))));
  const order = ["past_due", "ending", "paused", "deleted", "active"];
  return rows.sort((a, b) => order.indexOf(String(a.payload?.to)) - order.indexOf(String(b.payload?.to)));
}

const step = (partnerId: string, from: string, to: string, since: Date, event: string) => ({ entityType: "partner", entityId: partnerId, payload: { partnerId, from, to, since: since.toISOString(), event } });

/** The partner's own record of one kind, which outlives its businesses. Steps come back in the order a partner takes them, since rows written in one transaction share a time. */
async function lifecycleRecord(tx: DatabaseTransaction, partnerId: string, eventType: "partner.lifecycle_changed" | "partner.business_deleted") {
  const rows = await asMigrator(tx, async () => await tx.select({ businessId: partnerLifecycleEvents.businessId, payload: partnerLifecycleEvents.payload }).from(partnerLifecycleEvents).where(and(eq(partnerLifecycleEvents.partnerId, partnerId), eq(partnerLifecycleEvents.eventType, eventType))));
  const order = ["past_due", "ending", "paused", "deleted", "active"];
  return rows.sort((a, b) => order.indexOf(String(a.payload.to)) - order.indexOf(String(b.payload.to)) || String(a.businessId).localeCompare(String(b.businessId)));
}

const changed = (from: string, to: string, since: Date, tierEndedAt: Date | null, event: string) => ({ businessId: null, payload: { from, to, since: since.toISOString(), tierEndedAt: tierEndedAt?.toISOString() ?? null, event } });

/** What a call, a chat and the widget get from the business now, as usage metering answers the worker, and what the number claims' SQL says. */
async function answers(tx: DatabaseTransaction, businessId: string) {
  const reserved = await asWorker(tx, async () => {
    const db = tx as unknown as Database;
    const metered = await withBusinessTransaction(db, { businessId, actorType: "worker" }, async (inner) => ({
      entitlement: await loadEntitlement(inner, businessId),
      call: await reserveUsageInTransaction(inner, { businessId, usageKind: "voice_seconds", sourceKey: `voice:${randomUUID()}` }),
      chat: await reserveWidgetChatUsageInTransaction(inner, { businessId, conversationId: randomUUID() }),
    }));
    return { ...metered, widget: await getWidgetChatAllowance({ db }, { businessId }) };
  });
  const [row] = (await asMigrator(tx, async () => await tx.execute<{ live: boolean }>(sql`select app.has_live_entitlement(${businessId}::uuid) as live`))).rows;
  return { ...reserved, sqlLive: row?.live };
}


describe.skipIf(!client)("a partner's tier ending", () => {
  it("starts the 30 days at a failed payment, keeps them through Polar's retries, dates the deletion from the tier's end, and stops them when the partner pays", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const { businessId } = await business(tx, acme, "Harbor Dental");
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(80) });
      // A partner whose tier never ended is active, and has nothing to record.
      expect(await standing(tx, acme.partnerId)).toMatchObject({ state: "active" });
      expect(await asMigrator(tx, async () => await tx.select().from(partnerLifecycles).where(eq(partnerLifecycles.partnerId, acme.partnerId)))).toEqual([]);

      const failed = ago(50);
      await deliver(tx, acme.partnerId, "subscription.past_due", { status: "past_due", modifiedAt: failed });
      // The tier is still in force while Polar retries, so it hasn't ended.
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "past_due", since: failed, tierEndedAt: null });
      // Polar retrying and failing again doesn't start the days over.
      await deliver(tx, acme.partnerId, "subscription.updated", { status: "past_due", modifiedAt: after(failed, 7) });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "past_due", since: failed, tierEndedAt: null });
      // Polar gives up and revokes the tier: the businesses still pause 30 days after the failed payment, and the 90 days count from the revocation.
      const revoked = after(failed, 21);
      await deliver(tx, acme.partnerId, "subscription.revoked", { status: "canceled", modifiedAt: revoked, endedAt: revoked });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "ending", since: failed, tierEndedAt: revoked });

      // The partner buys a tier again.
      const paid = after(failed, 25);
      await deliver(tx, acme.partnerId, "subscription.active", { id: "sub_2", tier: "starter", status: "active", modifiedAt: paid });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "active", since: paid, tierEndedAt: null });
      expect(await lifecycleAudit(tx, businessId)).toEqual([
        step(acme.partnerId, "active", "past_due", failed, "tier_failed"),
        step(acme.partnerId, "past_due", "ending", failed, "tier_cancelled"),
        step(acme.partnerId, "ending", "active", paid, "tier_paid"),
      ]);
      // The partner's own record has each step, with when the tier ended.
      expect(await lifecycleRecord(tx, acme.partnerId, "partner.lifecycle_changed")).toEqual([
        changed("active", "past_due", failed, null, "tier_failed"),
        changed("past_due", "ending", failed, revoked, "tier_cancelled"),
        changed("ending", "active", paid, null, "tier_paid"),
      ]);
      // The hourly job finds nothing to move for a partner that pays.
      expect(await clock(tx, new Date())).toBe(0);
    });
  });

  it("counts the 30 days from the end of a cancelled tier's period, not from the day the partner cancelled", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(60) });
      // The owner cancels at the end of the period: the tier stays until then.
      await deliver(tx, acme.partnerId, "subscription.canceled", { status: "active", modifiedAt: ago(40), cancelAtPeriodEnd: true });
      expect(await standing(tx, acme.partnerId)).toMatchObject({ state: "active" });
      const ended = ago(20);
      // Polar revokes it when the period ends, and the worker reconciles it a while later.
      await deliver(tx, acme.partnerId, "subscription.revoked", { status: "canceled", modifiedAt: after(ended, 1), endedAt: ended });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "ending", since: ended, tierEndedAt: ended });
    });
  });
});

describe.skipIf(!client)("the hourly lifecycle job", () => {
  it("keeps the businesses answering for 30 days, then pauses them so calls forward and chat can't reply, and answers again once the partner pays", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const harbor = await business(tx, acme, "Harbor Dental");
      const maple = await business(tx, acme, "Maple Physio");
      const other = await business(tx, bright, "Cedar Vet");
      const ended = ago(1);
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(40) });
      await deliver(tx, acme.partnerId, "subscription.revoked", { status: "canceled", modifiedAt: ended, endedAt: ended });

      // For 30 days the businesses answer as before.
      expect(await clock(tx, after(ended, 29))).toBe(0);
      expect(await answers(tx, harbor.businessId)).toMatchObject({
        entitlement: { live: true, source: "billed_outside", allowance: { voiceSeconds: null, chats: null } },
        call: { allowed: true },
        chat: { allowed: true },
        widget: { allowed: true },
        sqlLive: true,
      });

      // Then they pause: no allowance, so the call's reservation fails and it forwards, and the chat can't reply.
      expect(await clock(tx, after(ended, 30))).toBe(1);
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "paused", since: after(ended, 30), tierEndedAt: ended });
      for (const { businessId } of [harbor, maple]) {
        expect(await answers(tx, businessId)).toEqual({
          entitlement: expect.objectContaining({ live: false, source: "billed_outside", allowance: { voiceSeconds: 0, chats: 0, alertSms: 0, outboundAttempts: 0 }, poolPartnerId: acme.partnerId }),
          call: expect.objectContaining({ allowed: false, errorCode: "voice_limit_reached" }),
          chat: expect.objectContaining({ allowed: false, errorCode: "chat_ai_limit_reached" }),
          widget: expect.objectContaining({ allowed: false, errorCode: "chat_ai_limit_reached" }),
          sqlLive: false,
        });
        expect(await lifecycleAudit(tx, businessId)).toEqual([
          step(acme.partnerId, "active", "ending", ended, "tier_cancelled"),
          step(acme.partnerId, "ending", "paused", after(ended, 30), "clock"),
        ]);
      }
      // The business's own operators see the pause too, though RLS shows them nothing of the partner.
      const asOwner = await withBusinessTransaction(acme.context.db, { userId: harbor.owner.userId, businessId: harbor.businessId, actorType: "operator" }, async (inner) => ({
        entitlement: await loadEntitlement(inner, harbor.businessId),
        lifecycle: await inner.select({ state: partnerLifecycles.state }).from(partnerLifecycles),
        record: await inner.select({ id: partnerLifecycleEvents.id }).from(partnerLifecycleEvents),
      }));
      expect(asOwner).toEqual({ entitlement: expect.objectContaining({ live: false, allowance: { voiceSeconds: 0, chats: 0, alertSms: 0, outboundAttempts: 0 } }), lifecycle: [], record: [] });
      // Another partner's businesses keep answering, and nothing records a step for that partner.
      expect(await answers(tx, other.businessId)).toMatchObject({ entitlement: { live: true }, call: { allowed: true }, sqlLive: true });
      expect(await lifecycleAudit(tx, other.businessId)).toEqual([]);
      expect(await lifecycleRecord(tx, bright.partnerId, "partner.lifecycle_changed")).toEqual([]);
      // Running again moves nobody.
      expect(await clock(tx, after(ended, 31))).toBe(0);

      // Paying for a tier again brings the businesses back.
      const paid = new Date();
      await deliver(tx, acme.partnerId, "subscription.active", { id: "sub_2", status: "active", modifiedAt: paid });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "active", since: paid, tierEndedAt: null });
      expect(await answers(tx, harbor.businessId)).toMatchObject({ entitlement: { live: true, allowance: { voiceSeconds: null } }, call: { allowed: true }, chat: { allowed: true }, sqlLive: true });
      expect(await lifecycleRecord(tx, acme.partnerId, "partner.lifecycle_changed")).toEqual([
        changed("active", "ending", ended, ended, "tier_cancelled"),
        changed("ending", "paused", after(ended, 30), ended, "clock"),
        changed("paused", "active", paid, null, "tier_paid"),
      ]);
    });
  });

  it("pauses 30 days after a failed payment, and reaches deletion only 90 days after Polar revokes the tier", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const failed = ago(3);
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(40) });
      await deliver(tx, acme.partnerId, "subscription.past_due", { status: "past_due", modifiedAt: failed });
      // Each step starts at its deadline, not when the job noticed.
      expect(await clock(tx, after(after(failed, 30), 0.5))).toBe(1);
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "paused", since: after(failed, 30), tierEndedAt: null });
      // While Polar still retries, the tier is in force, so nothing deletes the businesses.
      expect(await clock(tx, after(failed, 95))).toBe(0);

      // Polar revokes the tier: the 90 days count from then, not from the failed payment.
      const revoked = ago(2);
      await deliver(tx, acme.partnerId, "subscription.revoked", { status: "canceled", modifiedAt: revoked, endedAt: revoked });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "paused", since: after(failed, 30), tierEndedAt: revoked });
      expect(await clock(tx, after(revoked, 89))).toBe(0);
      expect(await clock(tx, after(after(revoked, 90), 0.1))).toBe(1);
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "deleted", since: after(revoked, 90), tierEndedAt: revoked });
      expect(await clock(tx, after(revoked, 400))).toBe(0);
    });
  });

  it("goes straight to deletion for a partner the job missed for 90 days", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const ended = ago(3);
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(40) });
      await deliver(tx, acme.partnerId, "subscription.revoked", { status: "canceled", modifiedAt: ended, endedAt: ended });
      expect(await clock(tx, after(ended, 120))).toBe(1);
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "deleted", since: after(ended, 90), tierEndedAt: ended });
      // A partner with no businesses still has the step on record.
      expect(await lifecycleRecord(tx, acme.partnerId, "partner.lifecycle_changed")).toEqual([
        changed("active", "ending", ended, ended, "tier_cancelled"),
        changed("ending", "deleted", after(ended, 90), ended, "clock"),
      ]);
    });
  });
});

describe.skipIf(!client)("who sees and moves a partner's lifecycle", () => {
  it("shows it to the partner's team, and lets only the worker move it or record it", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const { businessId } = await business(tx, acme, "Harbor Dental");
      const ended = ago(1);
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(40) });
      await deliver(tx, acme.partnerId, "subscription.revoked", { status: "canceled", modifiedAt: ended, endedAt: ended });
      const asOperator = async <T>(userId: string, run: (inner: DatabaseTransaction) => Promise<T>) => await withBusinessTransaction(acme.context.db, { userId, actorType: "operator" }, run);
      const asWorkerIn = async <T>(run: (inner: DatabaseTransaction) => Promise<T>) => await asWorker(tx, async () => await withBusinessTransaction(acme.context.db, { actorType: "worker" }, run));

      // Anyone on the partner's team reads where it stands and its record; another partner's owner reads nothing of either.
      expect(await asOperator(acme.memberActor.userId, async (inner) => await loadPartnerLifecycleInTransaction(inner, acme.partnerId))).toEqual({ state: "ending", since: ended, tierEndedAt: ended });
      expect(await asOperator(acme.memberActor.userId, async (inner) => (await inner.select({ eventType: partnerLifecycleEvents.eventType }).from(partnerLifecycleEvents)).length)).toBe(1);
      expect(await asOperator(bright.owner.userId, async (inner) => await inner.select({ state: partnerLifecycles.state }).from(partnerLifecycles))).toEqual([]);
      expect(await asOperator(bright.owner.userId, async (inner) => await inner.select({ id: partnerLifecycleEvents.id }).from(partnerLifecycleEvents))).toEqual([]);
      expect(await asOperator(bright.owner.userId, async (inner) => (await inner.execute<{ answers: boolean | null }>(sql`select app.partner_business_answers(${businessId}::uuid) as answers`)).rows)).toEqual([{ answers: null }]);
      // Inside one of the partner's businesses, the database answers for loadEntitlement.
      expect(await withBusinessTransaction(acme.context.db, { businessId, actorType: "system" }, async (inner) => (await inner.execute<{ answers: boolean | null }>(sql`select app.partner_business_answers(${businessId}::uuid) as answers`)).rows)).toEqual([{ answers: true }]);

      // An owner can't move the partner back to active, nor record a step or write one to the audit log.
      expect(await refusal(asOperator(acme.owner.userId, async (inner) => await inner.update(partnerLifecycles).set({ state: "active" }).where(eq(partnerLifecycles.partnerId, acme.partnerId))))).toMatchObject({ code: "42501" });
      expect(await refusal(withBusinessTransaction(acme.context.db, { actorType: "system" }, async (inner) => await inner.insert(partnerLifecycles).values({ partnerId: bright.partnerId, state: "paused", since: new Date() })))).toMatchObject({ code: "42501" });
      expect(await refusal(withBusinessTransaction(acme.context.db, { actorType: "system" }, async (inner) => await inner.insert(partnerLifecycleEvents).values({ partnerId: acme.partnerId, eventType: "partner.lifecycle_changed", payload: {} })))).toMatchObject({ code: "42501" });
      expect(await refusal(withBusinessTransaction(acme.context.db, { actorType: "system" }, async (inner) => await inner.execute(sql`select app.audit_partner_lifecycle_step(${acme.partnerId}::uuid, 'ending', 'active', now(), 'tier_paid')`)))).toMatchObject({ code: "42501" });
      // The worker can't write a step the partner didn't take, nor rewrite or remove the partner's record.
      expect(await refusal(asWorkerIn(async (inner) => await inner.execute(sql`select app.audit_partner_lifecycle_step(${acme.partnerId}::uuid, 'ending', 'paused', now(), 'clock')`)))).toMatchObject({ code: "P0001", message: "partner_lifecycle_step_not_stored" });
      expect(await refusal(asWorkerIn(async (inner) => await inner.update(partnerLifecycleEvents).set({ payload: {} }).where(eq(partnerLifecycleEvents.partnerId, acme.partnerId))))).toMatchObject({ code: "42501" });
      expect(await refusal(asWorkerIn(async (inner) => await inner.delete(partnerLifecycleEvents).where(eq(partnerLifecycleEvents.partnerId, acme.partnerId))))).toMatchObject({ code: "42501" });
      expect(await lifecycleAudit(tx, businessId)).toEqual([step(acme.partnerId, "active", "ending", ended, "tier_cancelled")]);
      expect(await lifecycleRecord(tx, acme.partnerId, "partner.lifecycle_changed")).toEqual([changed("active", "ending", ended, ended, "tier_cancelled")]);
    });
  });
});

/** A phone number no other row holds. */
const phoneNumber = () => `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const providerPhoneId = () => `PN${randomUUID().replaceAll("-", "")}`;

/** The partner pays for a tier, which Polar revokes on this day. */
async function endTier(tx: DatabaseTransaction, partnerId: string, ended: Date): Promise<void> {
  await deliver(tx, partnerId, "subscription.active", { status: "active", modifiedAt: after(ended, -40) });
  await deliver(tx, partnerId, "subscription.revoked", { status: "canceled", modifiedAt: ended, endedAt: ended });
}

/** Which of these businesses still exist. */
async function existing(tx: DatabaseTransaction, businessIds: string[]): Promise<string[]> {
  const rows = await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(inArray(businesses.id, businessIds)));
  return rows.map((row) => row.id).sort();
}

/** The partner connects a Stripe account that takes payments, and sells a package on it, in Stripe and as the deployment records them. */
async function connectStripe(tx: DatabaseTransaction, seller: Partner, stripe: FakeStripeConnect) {
  const { accountId } = await stripe.createOnboardingLink({ accountId: null, country: "US", idempotencyKey: `connect:${seller.partnerId}`, returnUrl: "https://desk.example.test/return", refreshUrl: "https://desk.example.test/refresh", metadata: {} });
  stripe.updateAccount(accountId, { detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, disabledReason: null });
  const packageId = randomUUID();
  const prices = await stripe.upsertPackagePrice(accountId, { packageId, name: "Front desk", currency: "USD", monthlyPriceMinor: 9_900, setupFeeMinor: null, active: true, prices: null });
  await asMigrator(tx, async () => {
    await tx.insert(partnerStripeAccounts).values({ partnerId: seller.partnerId, stripeAccountId: accountId, country: "US", currency: "USD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true });
    await tx.insert(partnerPackages).values({ id: packageId, partnerId: seller.partnerId, name: "Front desk", currency: "USD", monthlyPriceMinor: 9_900, voiceMinutes: 300, chats: 500, stripeAccountId: accountId, stripeProductId: prices.productId, stripePriceId: prices.priceId });
  });
  return { accountId, packageId, priceId: prices.priceId };
}

/** The business's owner pays for the package at a checkout on the partner's account and has another checkout open, as the Connect webhook records them. */
async function payForPackage(tx: DatabaseTransaction, stripe: FakeStripeConnect, input: { accountId: string; packageId: string; priceId: string; businessId: string }) {
  const checkout = async (key: string) => await stripe.createCheckout(input.accountId, { priceId: input.priceId, setupPriceId: null, customerId: null, customerEmail: null, successUrl: "https://desk.example.test/paid", cancelUrl: "https://desk.example.test/cancelled", idempotencyKey: `${input.businessId}:${key}`, clientReferenceId: input.businessId, metadata: { lobbystack_business_id: input.businessId } });
  const paid = stripe.completeCheckout((await checkout("paid")).sessionId);
  const open = await checkout("open");
  const billing = { packageId: input.packageId, stripeAccountId: input.accountId, stripeCustomerId: paid.customerId, stripeSubscriptionId: paid.subscriptionId, stripeSubscriptionState: "active", stripeCheckoutSessionId: open.sessionId, stripeCheckoutUrl: open.url, stripeCheckoutExpiresAt: open.expiresAt };
  await asMigrator(tx, async () => await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: `business:${input.businessId}`, ...billing }).onConflictDoUpdate({ target: billingAccounts.businessId, set: billing }));
  return { subscriptionId: paid.subscriptionId, openCheckoutId: open.sessionId };
}

describe.skipIf(!client)("a paused partner's businesses", () => {
  it("refuse a call's minutes before it's answered, so the live webhook answers 503 and the trunk forwards it, and their chat can't reply", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const line = phoneNumber();
      const transfer = "+14165550188";
      await asMigrator(tx, async () => {
        await tx.insert(phoneNumbers).values({ businessId: harbor.businessId, e164: line, providerPhoneId: providerPhoneId(), status: "active" });
        await tx.update(receptionistProfiles).set({ transferNumber: transfer }).where(eq(receptionistProfiles.businessId, harbor.businessId));
      });
      const worker = { db: tx as unknown as Database };
      // What the live webhook does with an incoming call before it accepts it.
      const ring = async () => await asWorker(tx, async () => await startLivePhoneCall(worker, { businessId: harbor.businessId, sessionId: `rtc_${randomUUID()}`, from: "+14165550134", to: line }));
      const ended = ago(1);
      await endTier(tx, acme.partnerId, ended);

      // For 30 days the receptionist answers.
      await expect(ring()).resolves.toMatchObject({ blocked: false, duplicate: false });
      expect(await clock(tx, after(ended, 30))).toBe(1);

      // Then the call gets no minutes, which the webhook answers with a 503 so the trunk fails it over.
      expect(await refusal(ring())).toMatchObject({ status: 402, code: "voice_limit_reached" });
      // The trunk's fallback forwards it to the business's transfer number.
      expect(await asWorker(tx, async () => await resolveNumberFallback(worker, { businessId: harbor.businessId, e164: line }))).toEqual({ action: "forward", to: transfer });
      // Only the call answered before the pause is on record.
      expect(await asMigrator(tx, async () => await tx.select({ id: calls.id }).from(calls).where(eq(calls.businessId, harbor.businessId)))).toHaveLength(1);
      // The website chat shows its "can't reply" message.
      expect(await answers(tx, harbor.businessId)).toMatchObject({ chat: { allowed: false, errorCode: "chat_ai_limit_reached" }, widget: { allowed: false, errorCode: "chat_ai_limit_reached" } });
    });
  });

  it("get nothing on a package either, though its Stripe subscription still pays", async () => {
    await rollbackTest(async (tx) => {
      vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "sk_test_platform");
      vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_test_partner_connect");
      const acme = await partner(tx, "Acme Reception");
      const maple = await business(tx, acme, "Maple Physio");
      const stripe = new FakeStripeConnect();
      const sold = await connectStripe(tx, acme, stripe);
      await payForPackage(tx, stripe, { ...sold, businessId: maple.businessId });
      // While the partner pays for a tier, the package's minutes and chats.
      expect(await answers(tx, maple.businessId)).toMatchObject({ entitlement: { live: true, source: "package", allowance: { voiceSeconds: 300 * 60, chats: 500 } }, call: { allowed: true }, chat: { allowed: true }, sqlLive: true });

      const ended = ago(1);
      await endTier(tx, acme.partnerId, ended);
      expect(await answers(tx, maple.businessId)).toMatchObject({ entitlement: { live: true, source: "package" }, call: { allowed: true }, sqlLive: true });
      expect(await hour(tx, after(ended, 30), { stripeConnect: stripe })).toEqual({ moved: 1, deleted: 0, waiting: 0 });
      expect(await answers(tx, maple.businessId)).toEqual({
        entitlement: expect.objectContaining({ live: false, source: "package", allowance: { voiceSeconds: 0, chats: 0, alertSms: 0, outboundAttempts: 0 }, poolPartnerId: acme.partnerId }),
        call: expect.objectContaining({ allowed: false, errorCode: "voice_limit_reached" }),
        chat: expect.objectContaining({ allowed: false, errorCode: "chat_ai_limit_reached" }),
        widget: expect.objectContaining({ allowed: false, errorCode: "chat_ai_limit_reached" }),
        sqlLive: false,
      });
    });
  });
});

describe.skipIf(!client)("a paused partner's pool", () => {
  // The Polar products a host sells tiers with. With all six set, the deployment bills tiers and the partner's pool has limits.
  const sellTiers = () => {
    for (const tier of ["STARTER", "GROWTH", "SCALE"]) for (const interval of ["MONTHLY", "ANNUAL"]) vi.stubEnv(`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier.toLowerCase()}_${interval.toLowerCase()}`);
  };

  /** The pool's counts this month, read as the migrator. */
  const poolMonth = async (tx: DatabaseTransaction, partnerId: string) => (await asMigrator(tx, async () => await tx.select({ voiceSecondsUsed: partnerUsageMonths.voiceSecondsUsed, voiceSecondsFinal: partnerUsageMonths.voiceSecondsFinal, chatsUsed: partnerUsageMonths.chatsUsed, alertsSent: partnerUsageMonths.alertsSent }).from(partnerUsageMonths).where(and(eq(partnerUsageMonths.partnerId, partnerId), eq(partnerUsageMonths.periodKey, periodKeyFor())))))[0];

  /** The pool alerts queued for the partner's people, whichever business's outbox carries them. */
  const poolAlerts = async (tx: DatabaseTransaction, partnerId: string) => await asMigrator(tx, async () => await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateType, POOL_ALERT_AGGREGATE), eq(outboxMessages.aggregateId, partnerId), eq(outboxMessages.topic, "email.send"))));

  it("stops its businesses' calls, browser calls and chats whatever the pool has left, and takes nothing from it", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const demo = await createPartnerDemo(acme.context, acme.memberActor, { name: `Pier Dental ${randomUUID().slice(0, 8)}`, websiteUrl: "https://example.com" });
      const worker = { db: tx as unknown as Database };
      const demoCall = async () => await asWorker(tx, async () => await startLiveWebCall(worker, { businessId: demo.businessId, sessionId: `live_${randomUUID()}`, widgetId: PROSPECT_DEMO_WIDGET_ID, billable: true, maxDurationMs: 120_000, sessionPurpose: "prospect_demo", prospectDemoId: demo.demoId }));
      const failed = ago(2);
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(40) });
      await deliver(tx, acme.partnerId, "subscription.past_due", { status: "past_due", modifiedAt: failed });

      // While the businesses answer, their calls and chats draw on Growth's pool, demo calls included.
      expect(await answers(tx, harbor.businessId)).toMatchObject({ call: { allowed: true, quantity: 300 }, chat: { allowed: true } });
      expect(await demoCall()).toMatchObject({ maxDurationMs: 120_000 });
      const before = await poolMonth(tx, acme.partnerId);
      expect(before).toMatchObject({ voiceSecondsUsed: 420, chatsUsed: 1 });

      // 30 days after the failed payment they pause. Polar still retries, so Growth stays in force: its pool keeps nearly all of its 1,300 minutes, with overage on and no cap.
      expect(await clock(tx, after(failed, 30))).toBe(1);
      expect(await answers(tx, harbor.businessId)).toMatchObject({
        entitlement: { live: false, allowance: { voiceSeconds: 0, chats: 0 } },
        call: { allowed: false, errorCode: "voice_limit_reached" },
        chat: { allowed: false, errorCode: "chat_ai_limit_reached" },
        widget: { allowed: false, errorCode: "chat_ai_limit_reached" },
        sqlLive: false,
      });
      // A browser call gets nothing either: the widget offers none, and one that starts anyway reserves none.
      expect(await asWorker(tx, async () => await getWebVoiceBillingAllowance(worker, { businessId: harbor.businessId }))).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      expect(await asWorker(tx, async () => await withBusinessTransaction(worker.db, { businessId: harbor.businessId, actorType: "worker" }, async (inner) => await reserveWebVoiceUsageInTransaction(inner, { businessId: harbor.businessId, callId: randomUUID() })))).toMatchObject({ allowed: false, errorCode: "voice_limit_reached" });
      // The demo's billable call is refused like any of the partner's businesses' calls.
      expect(await refusal(demoCall())).toMatchObject({ status: 402, code: "voice_limit_reached" });
      // None of them moved the pool.
      expect(await poolMonth(tx, acme.partnerId)).toEqual(before);
    });
  });

  it("keeps the month's counts with the partner when the host deletes its businesses, and the alerts their usage queued", async () => {
    await rollbackTest(async (tx) => {
      sellTiers();
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const ended = ago(1);
      await endTier(tx, acme.partnerId, ended);

      // On Free's pool of 1,800 seconds, a 1,500-second call crosses 80% of its minutes, which queues an email to the partner's owner in Harbor's outbox.
      await asWorker(tx, async () => await withBusinessTransaction(tx as unknown as Database, { businessId: harbor.businessId, actorType: "worker" }, async (inner) => await correctUsageInTransaction(inner, { businessId: harbor.businessId, sourceKey: `voice:${randomUUID()}`, usageKind: "voice_seconds", quantity: 1_500 })));
      expect(await poolAlerts(tx, acme.partnerId)).toEqual([{ businessId: harbor.businessId, payload: expect.objectContaining({ template: "partner_pool_alert", to: acme.owner.email }) }]);

      expect(await hour(tx, after(ended, 30))).toEqual({ moved: 1, deleted: 0, waiting: 0 });
      expect(await hour(tx, after(ended, 90))).toEqual({ moved: 1, deleted: 1, waiting: 0 });
      expect(await existing(tx, [harbor.businessId])).toEqual([]);

      // The pool's month is the partner's, so it keeps what Harbor used and the alert it sent.
      expect(await poolMonth(tx, acme.partnerId)).toMatchObject({ voiceSecondsUsed: 1_500, voiceSecondsFinal: 1_500, alertsSent: { "minutes:80:1800": expect.any(String) } });
      // The alert's email is for the partner's people, so it stays queued with no business, and the worker sends it as it sends any pool alert.
      expect(await poolAlerts(tx, acme.partnerId)).toEqual([{ businessId: null, payload: expect.objectContaining({ template: "partner_pool_alert", to: acme.owner.email }) }]);
    });
  });
});

describe.skipIf(!client)("releasing a business once the partner's tier ends", () => {
  it("works while the businesses answer, and the released business leaves the partner's lifecycle", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const maple = await business(tx, acme, "Maple Physio");
      const failed = ago(2);
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(40) });
      await deliver(tx, acme.partnerId, "subscription.past_due", { status: "past_due", modifiedAt: failed });

      // After a failed payment, the partner releases a business.
      expect(await releaseBusiness(acme.context, acme.ownerActor, { businessId: harbor.businessId })).toEqual({ ownerUserId: harbor.owner.userId });
      // Polar revokes the tier: the 30 days go on, and the partner releases another.
      const revoked = ago(1);
      await deliver(tx, acme.partnerId, "subscription.revoked", { status: "canceled", modifiedAt: revoked, endedAt: revoked });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "ending", since: failed, tierEndedAt: revoked });
      expect(await releaseBusiness(acme.context, acme.ownerActor, { businessId: maple.businessId })).toEqual({ ownerUserId: maple.owner.userId });
      expect(await listPartnerBusinesses(acme.context, acme.memberActor)).toEqual([]);

      // The pause and the deletion pass the released businesses by: they're direct, on the host's Free plan.
      expect(await clock(tx, after(failed, 30))).toBe(1);
      expect(await hour(tx, after(revoked, 90))).toEqual({ moved: 1, deleted: 0, waiting: 0 });
      expect(await existing(tx, [harbor.businessId, maple.businessId])).toEqual([harbor.businessId, maple.businessId].sort());
      for (const { businessId } of [harbor, maple]) {
        expect(await answers(tx, businessId)).toMatchObject({ entitlement: { source: "plan", poolPartnerId: null }, call: { allowed: true } });
      }
      // Harbor left before the tier ended, so its log stops at the failed payment.
      expect(await lifecycleAudit(tx, harbor.businessId)).toEqual([step(acme.partnerId, "active", "past_due", failed, "tier_failed")]);
      expect(await lifecycleRecord(tx, acme.partnerId, "partner.business_deleted")).toEqual([]);
    });
  });
});

describe.skipIf(!client)("deleting a partner's businesses 90 days after its tier ended", () => {
  it("deletes each business the partner had, sends its numbers back the way a deleted business's go, and keeps a record that outlives them", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const harbor = await business(tx, acme, "Harbor Dental");
      const maple = await business(tx, acme, "Maple Physio");
      const other = await business(tx, bright, "Cedar Vet");
      // The shared sender texts for every business, so it stays, as a reclaim leaves it.
      const sharedSender = phoneNumber();
      vi.stubEnv("TWILIO_ALERT_SMS_FROM", sharedSender);
      const numbers = await asMigrator(tx, async () => await tx.insert(phoneNumbers).values([
        { businessId: harbor.businessId, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "active" },
        { businessId: harbor.businessId, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "reclaiming" },
        { businessId: harbor.businessId, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "reclaimed" },
        { businessId: harbor.businessId, e164: sharedSender, providerPhoneId: providerPhoneId(), status: "active" },
        { businessId: maple.businessId, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "active" },
        { businessId: other.businessId, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "active" },
      ]).returning({ id: phoneNumbers.id, e164: phoneNumbers.e164, providerPhoneId: phoneNumbers.providerPhoneId }));
      const objectKey = `${harbor.businessId}/knowledge/${randomUUID()}.pdf`;
      await asMigrator(tx, async () => await tx.insert(storageObjects).values({ businessId: harbor.businessId, objectKey, purpose: "knowledge", fileName: "menu.pdf", contentType: "application/pdf", status: "ready" }));
      const ended = ago(1);
      await endTier(tx, acme.partnerId, ended);

      // Paused, the businesses stay for 60 days.
      expect(await hour(tx, after(ended, 30))).toEqual({ moved: 1, deleted: 0, waiting: 0 });
      expect(await hour(tx, after(ended, 89))).toEqual({ moved: 0, deleted: 0, waiting: 0 });
      expect(await listPartnerBusinesses(acme.context, acme.memberActor)).toHaveLength(2);

      // At 90 days the run that reaches deletion deletes them.
      expect(await hour(tx, after(ended, 90))).toEqual({ moved: 1, deleted: 2, waiting: 0 });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "deleted", since: after(ended, 90), tierEndedAt: ended });
      expect(await existing(tx, [harbor.businessId, maple.businessId, other.businessId])).toEqual([other.businessId]);
      expect(await listPartnerBusinesses(acme.context, acme.memberActor)).toEqual([]);
      const queued = await asMigrator(tx, async () => ({
        numbers: await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(inArray(phoneNumbers.businessId, [harbor.businessId, maple.businessId])),
        released: await tx.select({ aggregateId: outboxMessages.aggregateId, businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "phoneNumber.releaseDeleted"), inArray(outboxMessages.aggregateId, numbers.map((number) => number.id)))),
        stored: await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "privacy.deleteStoredObjects"), eq(outboxMessages.aggregateId, harbor.businessId))),
      }));
      // Harbor's active number, the one a reclaim was releasing, and Maple's, each through phoneNumber.releaseDeleted.
      const releases = [numbers[0]!, numbers[1]!, numbers[4]!];
      expect(queued.numbers).toEqual([]);
      expect(queued.released).toHaveLength(releases.length);
      expect(queued.released).toEqual(expect.arrayContaining(releases.map((number) => ({ aggregateId: number.id, businessId: null, payload: { providerPhoneId: number.providerPhoneId, e164: number.e164 } }))));
      expect(queued.stored).toEqual([{ businessId: null, payload: { objectKeys: [objectKey] } }]);
      // Each owner hears their business is gone, from the partner, as when the partner deletes it.
      const notices = await asMigrator(tx, async () => await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "email.sendNotice"), inArray(outboxMessages.dedupeKey, [harbor, maple].map((deleted) => `partner-business-deleted:${deleted.businessId}:${deleted.owner.email}`)))));
      expect(notices).toHaveLength(2);
      for (const notice of notices) expect(notice).toEqual({ businessId: null, payload: expect.objectContaining({ template: "business_deleted", brand: { kind: "partner", partnerId: acme.partnerId } }) });

      // The businesses' audit logs went with them, and the partner's record keeps the step and each deletion with the numbers it released.
      expect(await asMigrator(tx, async () => await tx.select({ id: auditLogs.id }).from(auditLogs).where(inArray(auditLogs.businessId, [harbor.businessId, maple.businessId])))).toEqual([]);
      expect((await lifecycleRecord(tx, acme.partnerId, "partner.lifecycle_changed")).at(-1)).toEqual(changed("paused", "deleted", after(ended, 90), ended, "clock"));
      const deletions = await lifecycleRecord(tx, acme.partnerId, "partner.business_deleted");
      const deletion = (businessId: string, released: typeof numbers) => ({ businessId, payload: { businessId, releasedNumbers: expect.arrayContaining(released.map((number) => ({ id: number.id, e164: number.e164 }))), cancelledSubscriptionId: null } });
      expect(deletions).toEqual([deletion(harbor.businessId, [numbers[0]!, numbers[1]!]), deletion(maple.businessId, [numbers[4]!])].sort((a, b) => a.businessId.localeCompare(b.businessId)));
      expect(deletions.map((row) => (row.payload.releasedNumbers as unknown[]).length).sort()).toEqual([1, 2]);

      // Another partner's business keeps its number and answers.
      expect(await asMigrator(tx, async () => await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, other.businessId)))).toEqual([{ id: numbers[5]!.id }]);
      expect(await answers(tx, other.businessId)).toMatchObject({ entitlement: { live: true }, call: { allowed: true } });
      // The next run has nothing left to delete.
      expect(await hour(tx, after(ended, 91))).toEqual({ moved: 0, deleted: 0, waiting: 0 });
    });
  });

  it("pauses and deletes a demo nobody claimed with the partner's other businesses, and leaves the partner's templates", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      // A partner's demo is one of its businesses from the start, with no owner, until someone claims it.
      const demo = await createPartnerDemo(acme.context, acme.memberActor, { name: `Pier Dental ${randomUUID().slice(0, 8)}`, websiteUrl: "https://example.com" });
      const objectKey = `${demo.businessId}/knowledge/${randomUUID()}/menu.pdf`;
      const templateId = randomUUID();
      const number = await asMigrator(tx, async () => {
        await tx.insert(storageObjects).values({ businessId: demo.businessId, objectKey, purpose: "knowledge", fileName: "menu.pdf", contentType: "application/pdf", status: "ready" });
        await tx.insert(businessTemplates).values({ id: templateId, partnerId: acme.partnerId, name: "Dental", manifest: { business: { name: "Template", timezone: "America/Toronto", business_type: "dental" } } });
        return (await tx.insert(phoneNumbers).values({ businessId: demo.businessId, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "active" }).returning({ id: phoneNumbers.id, e164: phoneNumbers.e164, providerPhoneId: phoneNumbers.providerPhoneId }))[0]!;
      });
      const ended = ago(1);
      await endTier(tx, acme.partnerId, ended);

      // The demo pauses with the partner's other businesses.
      expect(await answers(tx, demo.businessId)).toMatchObject({ entitlement: { live: true }, call: { allowed: true } });
      expect(await hour(tx, after(ended, 30))).toEqual({ moved: 1, deleted: 0, waiting: 0 });
      expect(await answers(tx, demo.businessId)).toMatchObject({ entitlement: { live: false }, call: { allowed: false, errorCode: "voice_limit_reached" } });

      // At 90 days it goes with them, its number and stored file as a deleted business's go.
      expect(await hour(tx, after(ended, 90))).toEqual({ moved: 1, deleted: 2, waiting: 0 });
      expect(await existing(tx, [harbor.businessId, demo.businessId])).toEqual([]);
      const left = await asMigrator(tx, async () => ({
        demos: await tx.select({ id: prospectDemos.id }).from(prospectDemos).where(eq(prospectDemos.id, demo.demoId)),
        released: await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "phoneNumber.releaseDeleted"), eq(outboxMessages.aggregateId, number.id))),
        stored: await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "privacy.deleteStoredObjects"), eq(outboxMessages.aggregateId, demo.businessId))),
        // Templates belong to the partner, not to a business.
        templates: await tx.select({ id: businessTemplates.id }).from(businessTemplates).where(eq(businessTemplates.partnerId, acme.partnerId)),
      }));
      expect(left).toEqual({
        demos: [],
        released: [{ businessId: null, payload: { providerPhoneId: number.providerPhoneId, e164: number.e164 } }],
        stored: [{ businessId: null, payload: { objectKeys: [objectKey] } }],
        templates: [{ id: templateId }],
      });
      expect((await lifecycleRecord(tx, acme.partnerId, "partner.business_deleted")).map((row) => row.businessId)).toEqual([harbor.businessId, demo.businessId].sort((a, b) => a.localeCompare(b)));
    });
  });

  it("waits for a number being bought, and deletes a suspended business, and one whose subscription the deployment can't reach", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      const maple = await business(tx, acme, "Maple Physio");
      const pier = await business(tx, acme, "Pier Clinic");
      // A number is being bought for Harbor.
      await asMigrator(tx, async () => await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, harbor.businessId)));
      const [claim] = await asMigrator(tx, async () => await tx.insert(onboardingNumberClaimEvents).values({ businessId: harbor.businessId, userId: harbor.owner.userId, requestedE164: phoneNumber(), selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "provisioning" }).returning({ id: onboardingNumberClaimEvents.id }));
      // Maple pays for its package through Stripe, but this worker has no Stripe Connect, so it can't hear of the subscription or end it. The partner's own delete goes ahead there too.
      const stripe = new FakeStripeConnect();
      const sold = await connectStripe(tx, acme, stripe);
      const maplePays = await payForPackage(tx, stripe, { ...sold, businessId: maple.businessId });
      // The host suspended Pier.
      await asMigrator(tx, async () => await tx.update(businesses).set({ status: "suspended" }).where(eq(businesses.id, pier.businessId)));
      const ended = ago(1);
      await endTier(tx, acme.partnerId, ended);

      // The host deletes Maple and Pier. Harbor waits for its number.
      expect(await hour(tx, after(ended, 90))).toEqual({ moved: 1, deleted: 2, waiting: 1 });
      expect(await existing(tx, [harbor.businessId, maple.businessId, pier.businessId])).toEqual([harbor.businessId]);
      expect(stripe.subscriptions.get(maplePays.subscriptionId)?.status).toBe("active");
      // Once nobody's buying the number any more, the next run deletes Harbor too.
      expect(await hour(tx, after(ended, 90.05))).toEqual({ moved: 0, deleted: 0, waiting: 1 });
      await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ updatedAt: sql`now() - interval '31 minutes'` }).where(eq(onboardingNumberClaimEvents.id, claim!.id)));
      expect(await hour(tx, after(ended, 90.1))).toEqual({ moved: 0, deleted: 1, waiting: 0 });
      expect(await existing(tx, [harbor.businessId])).toEqual([]);
    });
  });

  it("cancels the subscription that pays for a business's package and closes its checkout before it deletes the business", async () => {
    await rollbackTest(async (tx) => {
      vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "sk_test_platform");
      vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_test_partner_connect");
      const acme = await partner(tx, "Acme Reception");
      const maple = await business(tx, acme, "Maple Physio");
      const pier = await business(tx, acme, "Pier Clinic");
      const stripe = new FakeStripeConnect();
      const sold = await connectStripe(tx, acme, stripe);
      const maplePays = await payForPackage(tx, stripe, { ...sold, businessId: maple.businessId });
      const pierPays = await payForPackage(tx, stripe, { ...sold, businessId: pier.businessId });
      // The partner itself can't delete Maple until it cancels the subscription.
      expect(await refusal(deletePartnerBusiness({ ...acme.context, stripeConnect: stripe }, acme.ownerActor, { businessId: maple.businessId }))).toMatchObject({ status: 409, code: "subscription_active" });
      const ended = ago(1);
      await endTier(tx, acme.partnerId, ended);

      // Pausing cancels nothing.
      expect(await hour(tx, after(ended, 30), { stripeConnect: stripe })).toEqual({ moved: 1, deleted: 0, waiting: 0 });
      expect([maplePays, pierPays].map((pays) => stripe.subscriptions.get(pays.subscriptionId)?.status)).toEqual(["active", "active"]);

      // At 90 days Stripe can't cancel Pier's subscription, so Pier stays for the next run, and the run fails so the queue shows it.
      const cancelSubscription = stripe.cancelSubscription.bind(stripe);
      const cancel = vi.spyOn(stripe, "cancelSubscription").mockImplementation(async (accountId, subscriptionId) => {
        if (subscriptionId === pierPays.subscriptionId) throw Object.assign(new Error("Stripe is unavailable."), { type: "StripeConnectionError" });
        return await cancelSubscription(accountId, subscriptionId);
      });
      await expect(hour(tx, after(ended, 90), { stripeConnect: stripe })).rejects.toThrow(PartnerLifecycleError);
      expect(cancel).toHaveBeenCalledWith(sold.accountId, maplePays.subscriptionId);
      // Maple's owner pays nothing more: its subscription ended and its open checkout closed before the business went.
      expect(stripe.subscriptions.get(maplePays.subscriptionId)?.status).toBe("canceled");
      expect(stripe.checkouts.get(maplePays.openCheckoutId)?.status).toBe("expired");
      expect(await existing(tx, [maple.businessId, pier.businessId])).toEqual([pier.businessId]);
      expect(stripe.subscriptions.get(pierPays.subscriptionId)?.status).toBe("active");

      // Stripe answers again: the next run cancels Pier's subscription, then deletes Pier.
      cancel.mockRestore();
      expect(await hour(tx, after(ended, 90.05), { stripeConnect: stripe })).toEqual({ moved: 0, deleted: 1, waiting: 0 });
      expect(stripe.subscriptions.get(pierPays.subscriptionId)?.status).toBe("canceled");
      expect(await existing(tx, [maple.businessId, pier.businessId])).toEqual([]);
      // The partner's record names the subscription each deletion cancelled.
      expect(await lifecycleRecord(tx, acme.partnerId, "partner.business_deleted")).toEqual([
        { businessId: maple.businessId, payload: { businessId: maple.businessId, releasedNumbers: [], cancelledSubscriptionId: maplePays.subscriptionId } },
        { businessId: pier.businessId, payload: { businessId: pier.businessId, releasedNumbers: [], cancelledSubscriptionId: pierPays.subscriptionId } },
      ].sort((a, b) => a.businessId.localeCompare(b.businessId)));
    });
  });

  it("leaves the businesses the partner makes once it reached deletion, which answer as a Free partner's do", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const harbor = await business(tx, acme, "Harbor Dental");
      // Harbor dates from long before the tier ended.
      await asMigrator(tx, async () => await tx.update(businesses).set({ createdAt: ago(200) }).where(eq(businesses.id, harbor.businessId)));
      const ended = ago(95);
      await endTier(tx, acme.partnerId, ended);

      // The job missed the 30-day step: one run reaches deletion and deletes Harbor.
      expect(await hour(tx, new Date())).toEqual({ moved: 1, deleted: 1, waiting: 0 });
      expect(await standing(tx, acme.partnerId)).toEqual({ state: "deleted", since: after(ended, 90), tierEndedAt: ended });

      // The partner is on Free now: a business it makes stays, and answers.
      const pier = await business(tx, acme, "Pier Clinic");
      expect(await hour(tx, after(new Date(), 1))).toEqual({ moved: 0, deleted: 0, waiting: 0 });
      expect((await listPartnerBusinesses(acme.context, acme.memberActor)).map((listed) => listed.businessId)).toEqual([pier.businessId]);
      expect(await answers(tx, pier.businessId)).toMatchObject({ entitlement: { live: true, source: "billed_outside" }, call: { allowed: true }, chat: { allowed: true }, sqlLive: true });
      // Paying for a tier again keeps it answering.
      await deliver(tx, acme.partnerId, "subscription.active", { id: "sub_2", status: "active", modifiedAt: new Date() });
      expect(await answers(tx, pier.businessId)).toMatchObject({ entitlement: { live: true }, call: { allowed: true }, sqlLive: true });
    });
  });
});

describe.skipIf(!client)("the console's view of a partner's lifecycle", () => {
  it("shows owners and admins when the businesses pause and when the host deletes them, and members nothing", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [admin] = await people(tx, 1);
      const { invitationId } = await invitePartnerMember(acme.context, acme.ownerActor, { email: admin!.email, role: "admin" });
      await acceptPartnerInvitation(acme.context, { userId: admin!.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: admin!.email, emailVerified: true });
      const adminActor: PartnerMemberActor = { kind: "member", partnerId: acme.partnerId, userId: admin!.userId, role: "admin" };

      // A partner whose tier never ended has no dates to show.
      expect(await getPartnerLifecycle(acme.context, acme.ownerActor)).toEqual({ state: "active", tierEndedAt: null, pausesAt: null, deletesAt: null });
      const failed = ago(3);
      await deliver(tx, acme.partnerId, "subscription.active", { status: "active", modifiedAt: ago(40) });
      await deliver(tx, acme.partnerId, "subscription.past_due", { status: "past_due", modifiedAt: failed });
      // The tier is still in force, so it hasn't ended and the deletion has no date.
      const unpaid = { tierEndedAt: null, pausesAt: after(failed, 30).toISOString(), deletesAt: null };
      for (const actor of [acme.ownerActor, adminActor]) expect(await getPartnerLifecycle(acme.context, actor)).toEqual({ state: "past_due", ...unpaid });
      expect(await clock(tx, after(failed, 30))).toBe(1);
      expect(await getPartnerLifecycle(acme.context, adminActor)).toEqual({ state: "paused", ...unpaid });

      // Polar revokes the tier, which dates the deletion.
      const revoked = ago(2);
      await deliver(tx, acme.partnerId, "subscription.revoked", { status: "canceled", modifiedAt: revoked, endedAt: revoked });
      expect(await getPartnerLifecycle(acme.context, acme.ownerActor)).toEqual({ state: "paused", tierEndedAt: revoked.toISOString(), pausesAt: after(failed, 30).toISOString(), deletesAt: after(revoked, 90).toISOString() });
      expect(await clock(tx, after(revoked, 90))).toBe(1);
      expect(await getPartnerLifecycle(acme.context, acme.ownerActor)).toEqual({ state: "deleted", tierEndedAt: revoked.toISOString(), pausesAt: null, deletesAt: after(revoked, 90).toISOString() });

      // Members don't see it, and nor does anyone off the team.
      expect(await refusal(getPartnerLifecycle(acme.context, acme.memberActor))).toMatchObject({ status: 403 });
      expect(await refusal(getPartnerLifecycle(acme.context, { ...bright.ownerActor, partnerId: acme.partnerId }))).toMatchObject({ status: 403 });
    });
  });
});
