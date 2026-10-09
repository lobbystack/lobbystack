import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { affiliateAttributions, affiliateClicks, affiliateCommissions, affiliatePayoutItems, affiliatePayoutRuns, affiliateProfileStats, affiliateProfiles, billingTransactions, businesses, createDatabaseClient, providerEvents, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { attributeBusiness, generateAffiliatePayoutRun, markAffiliatePayoutItemPaid, recordAffiliateClick } from "./affiliates";
import { reconcileBillingProviderEvent } from "./billing";
import { submitOnboardingAttribution } from "./onboarding";
import { createBusiness } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Affiliate integration tests require a dedicated local test database.");
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

/** Runs `work` in a savepoint as `role`, then returns to the migrator role. */
async function asRole<T>(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker" | "lobbystack_dispatcher", work: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local role ${role}`));
  try {
    return await work(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset role`);
  }
}

async function createUser(tx: DatabaseTransaction, label: string): Promise<string> {
  const id = randomUUID();
  const email = `affiliate-${label}-${id}@example.invalid`;
  await tx.insert(users).values({ id, email, normalizedEmail: email, name: label });
  return id;
}

/** A referred workspace whose payments earn `profileId` commission. */
async function referredBusiness(tx: DatabaseTransaction, label: string): Promise<{ businessId: string; profileId: string }> {
  const affiliateUserId = await createUser(tx, `${label}-referrer`);
  const referredUserId = await createUser(tx, `${label}-customer`);
  const referralCode = `${label}-${randomUUID().slice(0, 8)}`;
  const [profile] = await tx.insert(affiliateProfiles).values({ userId: affiliateUserId, referralCode, payoutEmail: "payouts@example.invalid" }).returning();
  const { businessId } = await asRole(tx, "lobbystack_app", async (db) => {
    const created = await createBusiness({ db }, { userId: referredUserId, name: "Paying workspace", timezone: "UTC", businessType: "test" });
    await attributeBusiness({ db }, { businessId: created.businessId, referredUserId, referralCode, source: "referral_link" });
    return created;
  });
  return { businessId, profileId: profile!.id };
}

/** Reconciles one Polar order webhook, shaped as polar-event.ts stores it. */
async function reconcileOrder(tx: DatabaseTransaction, businessId: string, eventType: string, order: Record<string, unknown>): Promise<void> {
  const [event] = await tx.insert(providerEvents).values({ provider: "polar", providerEventId: `evt-${randomUUID()}`, eventType, businessId, payload: { billingKey: `business:${businessId}`, currency: "usd", ...order } }).returning({ id: providerEvents.id });
  await asRole(tx, "lobbystack_worker", (db) => reconcileBillingProviderEvent({ db }, { businessId, providerEventId: event!.id }));
}

describe.skipIf(!testUrl)("affiliate program against dedicated PostgreSQL roles", () => {
  it("attributes a referred workspace from the operator's own session", async () => {
    await rollbackTest(async (tx) => {
      const affiliateUserId = await createUser(tx, "referrer");
      const referredUserId = await createUser(tx, "referred");
      const referralCode = `partner-${randomUUID().slice(0, 8)}`;
      const [profile] = await tx.insert(affiliateProfiles).values({ userId: affiliateUserId, referralCode }).returning();
      const { businessId } = await asRole(tx, "lobbystack_app", (db) => createBusiness({ db }, { userId: referredUserId, name: "Referred workspace", timezone: "UTC", businessType: "test" }));
      await tx.update(businesses).set({ onboardingStage: "attribution" }).where(eq(businesses.id, businessId));

      // The admin app connects as lobbystack_app with the referred operator's
      // RLS context. The referrer's profile is not visible there, so the
      // attribution has to run as the system actor.
      await asRole(tx, "lobbystack_app", (db) => submitOnboardingAttribution({ db }, { userId: referredUserId, businessId, source: "friend", referralCode: referralCode.toUpperCase() }));

      const attributions = await tx.select().from(affiliateAttributions).where(eq(affiliateAttributions.businessId, businessId));
      expect(attributions).toHaveLength(1);
      expect(attributions[0]).toMatchObject({ affiliateProfileId: profile!.id, referredUserId, referralCode, source: "referral_link" });
      const [stats] = await tx.select().from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profile!.id));
      expect(stats?.referralCount).toBe(1);

      // Retrying the form or attributing at creation again never double counts.
      await asRole(tx, "lobbystack_app", (db) => submitOnboardingAttribution({ db }, { userId: referredUserId, businessId, source: "friend", referralCode }));
      expect(await asRole(tx, "lobbystack_app", (db) => attributeBusiness({ db }, { businessId, referredUserId, referralCode, source: "referral_link" }))).toBeNull();
      const [after] = await tx.select().from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profile!.id));
      expect(after?.referralCount).toBe(1);
    });
  });

  it("still attributes when the form is retried after the attribution failed", async () => {
    await rollbackTest(async (tx) => {
      const affiliateUserId = await createUser(tx, "retry-referrer");
      const referredUserId = await createUser(tx, "retry-referred");
      const referralCode = `retry-${randomUUID().slice(0, 8)}`;
      await tx.insert(affiliateProfiles).values({ userId: affiliateUserId, referralCode });
      const { businessId } = await asRole(tx, "lobbystack_app", (db) => createBusiness({ db }, { userId: referredUserId, name: "Retried workspace", timezone: "UTC", businessType: "test" }));
      await tx.update(businesses).set({ onboardingStage: "attribution" }).where(eq(businesses.id, businessId));
      await tx.execute(sql`create function fail_attribution() returns trigger language plpgsql as $$ begin raise exception 'attribution unavailable'; end $$`);
      await tx.execute(sql`create trigger fail_attribution before insert on affiliate_attributions for each row execute function fail_attribution()`);

      await expect(asRole(tx, "lobbystack_app", (db) => submitOnboardingAttribution({ db }, { userId: referredUserId, businessId, source: "friend", referralCode }))).rejects.toThrow();
      expect((await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)))[0]?.stage).toBe("attribution");

      await tx.execute(sql`drop trigger fail_attribution on affiliate_attributions`);
      await asRole(tx, "lobbystack_app", (db) => submitOnboardingAttribution({ db }, { userId: referredUserId, businessId, source: "friend", referralCode }));
      expect(await tx.select().from(affiliateAttributions).where(eq(affiliateAttributions.businessId, businessId))).toHaveLength(1);
      expect((await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)))[0]?.stage).toBe("complete");
    });
  });

  it("does not attribute a business that already finished onboarding", async () => {
    await rollbackTest(async (tx) => {
      const affiliateUserId = await createUser(tx, "late-referrer");
      const adminUserId = await createUser(tx, "late-admin");
      const referralCode = `late-${randomUUID().slice(0, 8)}`;
      await tx.insert(affiliateProfiles).values({ userId: affiliateUserId, referralCode });
      const { businessId } = await asRole(tx, "lobbystack_app", (db) => createBusiness({ db }, { userId: adminUserId, name: "Long-time customer", timezone: "UTC", businessType: "test" }));
      await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));

      await asRole(tx, "lobbystack_app", (db) => submitOnboardingAttribution({ db }, { userId: adminUserId, businessId, source: "friend", referralCode }));

      expect(await tx.select().from(affiliateAttributions).where(eq(affiliateAttributions.businessId, businessId))).toHaveLength(0);
    });
  });

  it("rejects self-referrals and inactive or unknown codes", async () => {
    await rollbackTest(async (tx) => {
      const userId = await createUser(tx, "self");
      const referralCode = `self-${randomUUID().slice(0, 8)}`;
      await tx.insert(affiliateProfiles).values({ userId, referralCode });
      const inactiveOwner = await createUser(tx, "inactive");
      const inactiveCode = `inactive-${randomUUID().slice(0, 8)}`;
      await tx.insert(affiliateProfiles).values({ userId: inactiveOwner, referralCode: inactiveCode, status: "suspended" });
      const { businessId } = await asRole(tx, "lobbystack_app", (db) => createBusiness({ db }, { userId, name: "Own workspace", timezone: "UTC", businessType: "test" }));
      await asRole(tx, "lobbystack_app", async (db) => {
        expect(await attributeBusiness({ db }, { businessId, referredUserId: userId, referralCode, source: "referral_link" })).toBeNull();
        expect(await attributeBusiness({ db }, { businessId, referredUserId: userId, referralCode: inactiveCode, source: "referral_link" })).toBeNull();
        expect(await attributeBusiness({ db }, { businessId, referredUserId: userId, referralCode: "no-such-code", source: "referral_link" })).toBeNull();
      });
      expect(await tx.select().from(affiliateAttributions).where(eq(affiliateAttributions.businessId, businessId))).toHaveLength(0);
    });
  });

  it("matches referral codes longer than 32 characters", async () => {
    await rollbackTest(async (tx) => {
      const affiliateUserId = await createUser(tx, "long");
      const referralCode = `a-very-long-affiliate-display-name-${randomUUID().slice(0, 8)}`;
      expect(referralCode.length).toBeGreaterThan(32);
      await tx.insert(affiliateProfiles).values({ userId: affiliateUserId, referralCode });
      const recorded = await asRole(tx, "lobbystack_app", (db) => recordAffiliateClick({ db }, { referralCode, visitorId: "visitor-long" }));
      expect(recorded).toBe(true);
    });
  });

  it("counts one click per visitor per day", async () => {
    await rollbackTest(async (tx) => {
      const affiliateUserId = await createUser(tx, "clicks");
      const referralCode = `clicks-${randomUUID().slice(0, 8)}`;
      const [profile] = await tx.insert(affiliateProfiles).values({ userId: affiliateUserId, referralCode }).returning();
      await asRole(tx, "lobbystack_app", async (db) => {
        expect(await recordAffiliateClick({ db }, { referralCode, visitorId: "visitor-1" })).toBe(true);
        expect(await recordAffiliateClick({ db }, { referralCode, visitorId: "visitor-1" })).toBe(false);
        expect(await recordAffiliateClick({ db }, { referralCode, visitorId: "visitor-2" })).toBe(true);
      });
      expect(await tx.select().from(affiliateClicks).where(eq(affiliateClicks.affiliateProfileId, profile!.id))).toHaveLength(2);
      const [stats] = await tx.select().from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profile!.id));
      expect(stats?.clickCount).toBe(2);
    });
  });

  it("counts one click when the same visitor's clicks race", async () => {
    const userId = randomUUID();
    const referralCode = `race-${randomUUID().slice(0, 8)}`;
    await client!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    const [profile] = await client!.db.insert(affiliateProfiles).values({ userId, referralCode }).returning();
    const blocker = await client!.pool.connect();
    let pending: Promise<PromiseSettledResult<boolean>[]> | undefined;
    try {
      // Hold the visitor's lock so both requests queue behind it, then release them together.
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`affiliate-click:${profile!.id}:visitor-race`]);
      pending = Promise.allSettled([0, 1].map(() => client!.db.transaction(async (tx) => {
        await tx.execute(sql`set local role lobbystack_app`);
        return recordAffiliateClick({ db: tx as unknown as Database }, { referralCode, visitorId: "visitor-race" });
      })));
      await vi.waitFor(async () => {
        // Count only this blocker's waiters: other test files run their own lock races in parallel.
        const result = await blocker.query("select count(*)::int as waiting from pg_locks where not granted and pg_backend_pid() = any(pg_blocking_pids(pid))");
        expect(result.rows[0].waiting).toBe(2);
      }, { timeout: 3000 });
      await blocker.query("rollback");
      const results = await pending;
      expect(results.map((result) => result.status === "fulfilled" && result.value)).toEqual(expect.arrayContaining([true, false]));
      expect(await client!.db.select().from(affiliateClicks).where(eq(affiliateClicks.affiliateProfileId, profile!.id))).toHaveLength(1);
      const [stats] = await client!.db.select().from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profile!.id));
      expect(stats?.clickCount).toBe(1);
    } finally {
      await blocker.query("rollback");
      blocker.release();
      await pending;
      await client!.db.delete(affiliateClicks).where(eq(affiliateClicks.affiliateProfileId, profile!.id));
      await client!.db.delete(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profile!.id));
      await client!.db.delete(affiliateProfiles).where(eq(affiliateProfiles.id, profile!.id));
      await client!.db.delete(users).where(eq(users.id, userId));
    }
  });

  it("moves a paid referral from pending to eligible to paid", async () => {
    await rollbackTest(async (tx) => {
      const affiliateUserId = await createUser(tx, "earner");
      const referredUserId = await createUser(tx, "customer");
      const referralCode = `earner-${randomUUID().slice(0, 8)}`;
      const [profile] = await tx.insert(affiliateProfiles).values({ userId: affiliateUserId, referralCode, payoutEmail: "payouts@example.invalid" }).returning();
      const { businessId } = await asRole(tx, "lobbystack_app", async (db) => {
        const created = await createBusiness({ db }, { userId: referredUserId, name: "Paying workspace", timezone: "UTC", businessType: "test" });
        // Attribution at creation precedes the plan step's first payment.
        await attributeBusiness({ db }, { businessId: created.businessId, referredUserId, referralCode, source: "referral_link" });
        return created;
      });

      // Commission only counts payments made after the attribution.
      const paidAt = new Date(Date.now() + 60_000);
      const orderId = `order-${randomUUID()}`;
      const [event] = await tx.insert(providerEvents).values({
        provider: "polar",
        providerEventId: `evt-${randomUUID()}`,
        eventType: "order.paid",
        businessId,
        payload: { billingKey: `business:${businessId}`, order: { id: orderId, status: "paid", totalAmount: 60_000, currency: "USD", createdAt: paidAt.toISOString() } },
      }).returning({ id: providerEvents.id });
      await asRole(tx, "lobbystack_worker", (db) => reconcileBillingProviderEvent({ db }, { businessId, providerEventId: event!.id }));

      const [pending] = await tx.select().from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, `order:${orderId}`));
      expect(pending).toMatchObject({ affiliateProfileId: profile!.id, amountCents: 60_000, commissionCents: 12_000, currency: "usd", status: "pending", payoutState: "unassigned" });
      expect(pending!.clearsAt.getTime() - paidAt.getTime()).toBe(30 * 24 * 60 * 60_000);

      const day = 24 * 60 * 60_000;
      const periodKey = `test-${randomUUID().slice(0, 8)}`;
      const early = await asRole(tx, "lobbystack_worker", (db) => generateAffiliatePayoutRun({ db }, { periodKey, createdAt: new Date(paidAt.getTime() + 29 * day).toISOString() }));
      expect(early.assignedCommissions).toBe(0);

      const cleared = await asRole(tx, "lobbystack_worker", (db) => generateAffiliatePayoutRun({ db }, { periodKey, createdAt: new Date(paidAt.getTime() + 31 * day).toISOString() }));
      expect(cleared).toMatchObject({ assignedCommissions: 1, totalCents: 12_000 });
      const [item] = await tx.select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.payoutRunId, cleared.payoutRunId));
      expect(item).toMatchObject({ affiliateProfileId: profile!.id, amountCents: 12_000, status: "ready", payoutEmail: "payouts@example.invalid" });

      expect(await asRole(tx, "lobbystack_dispatcher", (db) => markAffiliatePayoutItemPaid({ db }, { payoutItemId: item!.id, externalReference: "paypal-test" }))).toBe(true);
      const [paid] = await tx.select().from(affiliateCommissions).where(eq(affiliateCommissions.id, pending!.id));
      expect(paid).toMatchObject({ status: "paid", payoutState: "paid" });
      const [run] = await tx.select().from(affiliatePayoutRuns).where(eq(affiliatePayoutRuns.id, cleared.payoutRunId));
      expect(run?.status).toBe("paid");
      const [stats] = await tx.select().from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profile!.id));
      expect(stats).toMatchObject({ referralCount: 1, conversionCount: 1, pendingCommissionCents: 0, paidCommissionCents: 12_000 });
    });
  });

  it("cuts the commission when Polar reports a partial refund on the order", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, profileId } = await referredBusiness(tx, "partial");
      // $960 plus $96 tax; half is refunded, and Polar reports the refunded tax separately.
      const order = { id: `order-${randomUUID()}`, total_amount: 105_600, created_at: new Date(Date.now() + 60_000).toISOString() };
      await reconcileOrder(tx, businessId, "order.paid", { ...order, status: "paid", refunded_amount: 0, refunded_tax_amount: 0 });
      await reconcileOrder(tx, businessId, "order.refunded", { ...order, status: "partially_refunded", refunded_amount: 48_000, refunded_tax_amount: 4_800 });

      const [commission] = await tx.select().from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, `order:${order.id}`));
      expect(commission).toMatchObject({ amountCents: 52_800, commissionCents: 10_560, status: "pending" });
      const [stats] = await tx.select().from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profileId));
      expect(stats).toMatchObject({ conversionCount: 1, pendingCommissionCents: 10_560 });
      const [transaction] = await tx.select().from(billingTransactions).where(eq(billingTransactions.sourceId, order.id));
      expect(transaction).toMatchObject({ status: "partially_refunded", amountCents: 105_600, refundedAmountCents: 52_800 });
    });
  });

  it("keeps a refund that is reconciled before the order's paid event", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, profileId } = await referredBusiness(tx, "late-paid");
      const refunded = { id: `order-${randomUUID()}`, total_amount: 60_000, created_at: new Date(Date.now() + 60_000).toISOString() };
      await reconcileOrder(tx, businessId, "order.refunded", { ...refunded, status: "refunded", refunded_amount: 60_000 });
      await reconcileOrder(tx, businessId, "order.paid", { ...refunded, status: "paid", refunded_amount: 0 });
      expect(await tx.select().from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, `order:${refunded.id}`))).toHaveLength(0);
      // The late paid event cannot erase the refund already stored on the order.
      const [transaction] = await tx.select().from(billingTransactions).where(eq(billingTransactions.sourceId, refunded.id));
      expect(transaction?.refundedAmountCents).toBe(60_000);

      const partial = { id: `order-${randomUUID()}`, total_amount: 60_000, created_at: new Date(Date.now() + 60_000).toISOString() };
      await reconcileOrder(tx, businessId, "order.refunded", { ...partial, status: "partially_refunded", refunded_amount: 30_000 });
      await reconcileOrder(tx, businessId, "order.paid", { ...partial, status: "paid", refunded_amount: 0 });
      const [commission] = await tx.select().from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, `order:${partial.id}`));
      expect(commission).toMatchObject({ amountCents: 30_000, commissionCents: 6_000, status: "pending" });
      const [stats] = await tx.select().from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profileId));
      expect(stats).toMatchObject({ conversionCount: 1, pendingCommissionCents: 6_000 });
    });
  });

  it("pays an affiliate whose commissions cleared after 250 unpayable ones", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Payout backlog", timezone: "UTC", businessType: "test" });
      const [payment] = await tx.insert(billingTransactions).values({ businessId, kind: "order", sourceId: randomUUID(), status: "paid", amountCents: 100_000, currency: "usd", occurredAt: new Date("1999-01-01") }).returning();
      const [small] = await tx.insert(affiliateProfiles).values({ userId: await createUser(tx, "small"), referralCode: `small-${randomUUID().slice(0, 8)}`, payoutEmail: "small@example.invalid" }).returning();
      const [payable] = await tx.insert(affiliateProfiles).values({ userId: await createUser(tx, "payable"), referralCode: `payable-${randomUUID().slice(0, 8)}`, payoutEmail: "payable@example.invalid" }).returning();
      const commission = (profileId: string, commissionCents: number, clearsAt: Date) => ({ affiliateProfileId: profileId, referredBusinessId: businessId, sourceKey: randomUUID(), billingTransactionId: payment!.id, amountCents: commissionCents * 5, commissionCents, currency: "usd", occurredAt: new Date("1999-01-01"), clearsAt });
      // Older rows that stay below the payout minimum must not hide newer, payable ones.
      await tx.insert(affiliateCommissions).values(Array.from({ length: 251 }, () => commission(small!.id, 10, new Date("1999-02-01"))));
      await tx.insert(affiliateCommissions).values(commission(payable!.id, 12_000, new Date("1999-03-01")));

      const run = await asRole(tx, "lobbystack_worker", (db) => generateAffiliatePayoutRun({ db }, { periodKey: `test-${randomUUID().slice(0, 8)}`, createdAt: "2000-01-01T00:00:00Z" }));
      const [item] = await tx.select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.affiliateProfileId, payable!.id));
      expect(item).toMatchObject({ payoutRunId: run.payoutRunId, amountCents: 12_000, status: "ready" });
    });
  });
});
