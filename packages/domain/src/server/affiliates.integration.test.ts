import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { affiliateAttributions, affiliateClicks, affiliateCommissions, affiliatePayoutItems, affiliatePayoutRuns, affiliateProfileStats, affiliateProfiles, businesses, createDatabaseClient, providerEvents, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

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
});
