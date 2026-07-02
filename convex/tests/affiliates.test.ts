import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

type ConvexHarness = TestConvex<typeof schema>;
type TestContext = Parameters<Parameters<ConvexHarness["run"]>[0]>[0];

function createConvexHarness() {
  return convexTest(schema, modules);
}

async function seedUser(ctx: TestContext, subject: string) {
  return await ctx.db.insert("users", {
    authSubject: subject,
    email: `${subject}@example.com`,
    displayName: subject,
  });
}

async function seedBusiness(
  ctx: TestContext,
  input: {
    ownerId: Id<"users">;
    slug: string;
    onboardingStage?: string;
  },
) {
  const businessId = await ctx.db.insert("businesses", {
    slug: input.slug,
    name: `${input.slug} Business`,
    timezone: "America/Toronto",
    defaultLocale: "en",
    onboardingStage: input.onboardingStage ?? "attribution",
    businessType: "clinic",
    deploymentMode: "manual",
    status: "active",
  });
  await ctx.db.insert("business_memberships", {
    businessId,
    userId: input.ownerId,
    role: "business_owner",
    status: "active",
  });
  return businessId;
}

describe("affiliate program", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires tenant admin access to bind a referral to a business", async () => {
    const t = createConvexHarness();

    const { businessId } = await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "affiliate-owner");
      const viewerUserId = await seedUser(ctx, "referred-viewer");
      const ownerUserId = await seedUser(ctx, "referred-owner");
      const businessId = await seedBusiness(ctx, {
        ownerId: ownerUserId,
        slug: "viewer-attribution",
      });
      await ctx.db.insert("business_memberships", {
        businessId,
        userId: viewerUserId,
        role: "viewer",
        status: "active",
      });
      await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "partner",
        status: "active",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      return { businessId };
    });

    await expect(
      t.withIdentity({ subject: "referred-viewer" }).mutation(
        api.affiliates.bindAttribution,
        {
          businessId,
          referralCode: "partner",
        },
      ),
    ).rejects.toThrow("Tenant admin access required.");
  });

  it("does not double count paid payout items in dashboard totals", async () => {
    const t = createConvexHarness();

    await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "paid-affiliate");
      const profileId = await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "paid-affiliate",
        status: "active",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      const referredUserId = await seedUser(ctx, "paid-referred-owner");
      const referredBusinessId = await seedBusiness(ctx, {
        ownerId: referredUserId,
        slug: "paid-referred",
        onboardingStage: "completed",
      });
      const billingTransactionId = await ctx.db.insert("billing_transactions", {
        businessId: referredBusinessId,
        kind: "order",
        sourceId: "order-paid",
        status: "paid",
        amountCents: 10_000,
        currency: "usd",
        occurredAt: "2026-04-10T00:00:00.000Z",
        lastSyncedAt: "2026-04-10T00:00:00.000Z",
      });
      await ctx.db.insert("affiliate_commissions", {
        affiliateProfileId: profileId,
        referredBusinessId,
        sourceKey: "order:order-paid",
        billingTransactionId,
        amountCents: 10_000,
        commissionCents: 2_000,
        currency: "usd",
        status: "paid",
        payoutState: "paid",
        occurredAt: "2026-04-10T00:00:00.000Z",
        clearsAt: "2026-05-10T00:00:00.000Z",
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
        paidAt: "2026-05-15T00:00:00.000Z",
      });
      const payoutRunId = await ctx.db.insert("affiliate_payout_runs", {
        periodKey: "2026-05",
        status: "paid",
        totalCents: 2_000,
        currency: "usd",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      });
      await ctx.db.insert("affiliate_payout_items", {
        payoutRunId,
        affiliateProfileId: profileId,
        amountCents: 2_000,
        currency: "usd",
        status: "paid",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
        paidAt: "2026-05-15T00:00:00.000Z",
      });
    });

    const summary = await t
      .withIdentity({ subject: "paid-affiliate" })
      .query(api.affiliates.getDashboardSummary, {});

    expect(summary.stats.paidCents).toBe(2_000);
  });

  it("returns an app signup referral URL so the web app captures attribution", async () => {
    const t = createConvexHarness();

    await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "signup-link-affiliate");
      await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "partner-code",
        status: "active",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
    });

    const summary = await t
      .withIdentity({ subject: "signup-link-affiliate" })
      .query(api.affiliates.getDashboardSummary, {});

    expect(summary.referralUrl).toBe("https://app.lobbystack.com/signup?via=partner-code");
  });

  it("keeps generated collision suffixes inside the normalized referral code", async () => {
    const t = createConvexHarness();
    const base = "a".repeat(32);

    await t.run(async (ctx) => {
      const existingUserId = await seedUser(ctx, "existing-long-code");
      await ctx.db.insert("affiliate_profiles", {
        userId: existingUserId,
        referralCode: base,
        status: "active",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      await ctx.db.insert("users", {
        authSubject: "new-long-code",
        email: "new-long-code@example.com",
        displayName: base,
      });
    });

    await t
      .withIdentity({ subject: "new-long-code" })
      .mutation(api.affiliates.activate, {});

    const summary = await t
      .withIdentity({ subject: "new-long-code" })
      .query(api.affiliates.getDashboardSummary, {});

    expect(summary.profile?.referralCode).toBe(`${"a".repeat(30)}-2`);
    expect(summary.referralUrl).toBe(
      `https://app.lobbystack.com/signup?via=${"a".repeat(30)}-2`,
    );
  });

  it("removes refunded commissions from unpaid payout items and runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
    const t = createConvexHarness();

    const seeded = await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "refund-affiliate");
      const profileId = await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "refund-affiliate",
        status: "active",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      const referredUserId = await seedUser(ctx, "refund-referred-owner");
      const referredBusinessId = await seedBusiness(ctx, {
        ownerId: referredUserId,
        slug: "refund-referred",
      });
      const billingTransactionId = await ctx.db.insert("billing_transactions", {
        businessId: referredBusinessId,
        kind: "order",
        sourceId: "order-refunded",
        status: "paid",
        amountCents: 50_000,
        currency: "usd",
        orderId: "order-refunded",
        occurredAt: "2026-04-01T00:00:00.000Z",
        lastSyncedAt: "2026-04-01T00:00:00.000Z",
      });
      const payoutRunId = await ctx.db.insert("affiliate_payout_runs", {
        periodKey: "2026-05",
        status: "draft",
        totalCents: 10_000,
        currency: "usd",
        createdAt: "2026-05-01T13:00:00.000Z",
        updatedAt: "2026-05-01T13:00:00.000Z",
      });
      const commissionId = await ctx.db.insert("affiliate_commissions", {
        affiliateProfileId: profileId,
        referredBusinessId,
        sourceKey: "order:order-refunded",
        billingTransactionId,
        amountCents: 50_000,
        commissionCents: 10_000,
        currency: "usd",
        status: "pending",
        payoutState: "assigned",
        occurredAt: "2026-04-01T00:00:00.000Z",
        clearsAt: "2026-05-01T00:00:00.000Z",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-05-01T13:00:00.000Z",
      });
      const payoutItemId = await ctx.db.insert("affiliate_payout_items", {
        payoutRunId,
        affiliateProfileId: profileId,
        amountCents: 10_000,
        currency: "usd",
        status: "ready",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-05-01T13:00:00.000Z",
        updatedAt: "2026-05-01T13:00:00.000Z",
      });
      await ctx.db.patch(commissionId, { payoutItemId, payoutState: "assigned" });
      return {
        billingTransactionId,
        commissionId,
        payoutItemId,
        payoutRunId,
        referredBusinessId,
      };
    });

    await t.mutation(internal.affiliates.createCommissionForBillingTransaction, {
      billingTransactionId: seeded.billingTransactionId,
      businessId: seeded.referredBusinessId,
      kind: "refund",
      sourceId: "refund-1",
      status: "succeeded",
      amountCents: 50_000,
      currency: "usd",
      orderId: "order-refunded",
      occurredAt: "2026-05-20T12:00:00.000Z",
    });

    const result = await t.run(async (ctx) => {
      return {
        commission: await ctx.db.get(seeded.commissionId),
        payoutItem: await ctx.db.get(seeded.payoutItemId),
        payoutRun: await ctx.db.get(seeded.payoutRunId),
      };
    });

    expect(result.commission?.status).toBe("voided");
    expect(result.commission?.payoutItemId).toBeUndefined();
    expect(result.payoutItem?.amountCents).toBe(0);
    expect(result.payoutItem?.status).toBe("voided");
    expect(result.payoutRun?.totalCents).toBe(0);
  });

  it("does not resurrect a voided commission after a late paid order webhook", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
    const t = createConvexHarness();

    const seeded = await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "late-order-affiliate");
      const profileId = await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "late-order-affiliate",
        status: "active",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      const referredUserId = await seedUser(ctx, "late-order-referred-owner");
      const referredBusinessId = await seedBusiness(ctx, {
        ownerId: referredUserId,
        slug: "late-order-referred",
      });
      await ctx.db.insert("affiliate_attributions", {
        affiliateProfileId: profileId,
        businessId: referredBusinessId,
        referredUserId,
        referralCode: "late-order-affiliate",
        source: "via",
        attributedAt: "2026-04-01T00:00:00.000Z",
      });
      const billingTransactionId = await ctx.db.insert("billing_transactions", {
        businessId: referredBusinessId,
        kind: "order",
        sourceId: "order-late-replay",
        status: "paid",
        amountCents: 50_000,
        currency: "usd",
        orderId: "order-late-replay",
        occurredAt: "2026-04-01T00:00:00.000Z",
        lastSyncedAt: "2026-04-01T00:00:00.000Z",
      });
      return {
        billingTransactionId,
        profileId,
        referredBusinessId,
      };
    });

    await t.mutation(internal.affiliates.createCommissionForBillingTransaction, {
      billingTransactionId: seeded.billingTransactionId,
      businessId: seeded.referredBusinessId,
      kind: "order",
      sourceId: "order-late-replay",
      status: "paid",
      amountCents: 50_000,
      currency: "usd",
      orderId: "order-late-replay",
      occurredAt: "2026-04-01T00:00:00.000Z",
    });
    await t.mutation(internal.affiliates.createCommissionForBillingTransaction, {
      billingTransactionId: seeded.billingTransactionId,
      businessId: seeded.referredBusinessId,
      kind: "refund",
      sourceId: "refund-late-replay",
      status: "succeeded",
      amountCents: 50_000,
      currency: "usd",
      orderId: "order-late-replay",
      occurredAt: "2026-05-20T12:00:00.000Z",
    });
    await t.mutation(internal.affiliates.createCommissionForBillingTransaction, {
      billingTransactionId: seeded.billingTransactionId,
      businessId: seeded.referredBusinessId,
      kind: "order",
      sourceId: "order-late-replay",
      status: "paid",
      amountCents: 50_000,
      currency: "usd",
      orderId: "order-late-replay",
      occurredAt: "2026-04-01T00:00:00.000Z",
    });

    const result = await t.run(async (ctx) => {
      const commission = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_source_key", (q) => q.eq("sourceKey", "order:order-late-replay"))
        .unique();
      const stats = await ctx.db
        .query("affiliate_profile_stats")
        .withIndex("by_affiliate_profile_id", (q) =>
          q.eq("affiliateProfileId", seeded.profileId),
        )
        .unique();
      return { commission, stats };
    });

    expect(result.commission?.status).toBe("voided");
    expect(result.stats?.conversionCount).toBe(0);
    expect(result.stats?.pendingCommissionCents).toBe(0);
  });

  it("continues monthly payout runs in batches when eligible commissions exceed the batch limit", async () => {
    const t = createConvexHarness();

    await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "batch-affiliate");
      const profileId = await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "batch-affiliate",
        status: "active",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      const referredUserId = await seedUser(ctx, "batch-referred-owner");
      const referredBusinessId = await seedBusiness(ctx, {
        ownerId: referredUserId,
        slug: "batch-referred",
      });

      for (let index = 0; index < 251; index += 1) {
        const billingTransactionId = await ctx.db.insert("billing_transactions", {
          businessId: referredBusinessId,
          kind: "order",
          sourceId: `order-batch-${index}`,
          status: "paid",
          amountCents: 10_000,
          currency: "usd",
          occurredAt: "2026-04-01T00:00:00.000Z",
          lastSyncedAt: "2026-04-01T00:00:00.000Z",
        });
        await ctx.db.insert("affiliate_commissions", {
          affiliateProfileId: profileId,
          referredBusinessId,
          sourceKey: `order:order-batch-${index}`,
          billingTransactionId,
          amountCents: 10_000,
          commissionCents: 2_000,
          currency: "usd",
          status: "pending",
          payoutState: "unassigned",
          occurredAt: "2026-04-01T00:00:00.000Z",
          clearsAt: "2026-05-01T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        });
      }
    });

    const payoutRunId = await t.mutation(internal.affiliates.generateMonthlyPayoutRun, {
      periodKey: "2026-05",
      createdAt: "2026-05-01T13:00:00.000Z",
    });
    await t.mutation(internal.affiliates.generateMonthlyPayoutRun, {
      periodKey: "2026-05",
      createdAt: "2026-05-01T13:00:00.000Z",
    });

    const result = await t.run(async (ctx) => {
      const payoutRun = await ctx.db.get(payoutRunId);
      const item = await ctx.db
        .query("affiliate_payout_items")
        .withIndex("by_payout_run_id", (q) => q.eq("payoutRunId", payoutRunId))
        .unique();
      const remainingUnassigned = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_status_and_payout_state_and_clears_at", (q) =>
          q
            .eq("status", "pending")
            .eq("payoutState", "unassigned")
            .lte("clearsAt", "2026-05-01T13:00:00.000Z"),
        )
        .take(1);
      const assignedCommissions = item
        ? await ctx.db
            .query("affiliate_commissions")
            .withIndex("by_payout_item_id_and_payout_state", (q) =>
              q.eq("payoutItemId", item._id).eq("payoutState", "assigned"),
            )
            .take(300)
        : [];
      return { assignedCommissions, item, payoutRun, remainingUnassigned };
    });

    expect(result.remainingUnassigned).toEqual([]);
    expect(result.item?.amountCents).toBe(502_000);
    expect(result.assignedCommissions).toHaveLength(251);
    expect(result.item?.status).toBe("ready");
    expect(result.payoutRun?.totalCents).toBe(502_000);
  });

  it("leaves below-minimum commissions unassigned for a future payout run", async () => {
    const t = createConvexHarness();

    const seeded = await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "below-minimum-affiliate");
      const profileId = await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "below-minimum-affiliate",
        status: "active",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      const referredUserId = await seedUser(ctx, "below-minimum-referred-owner");
      const referredBusinessId = await seedBusiness(ctx, {
        ownerId: referredUserId,
        slug: "below-minimum-referred",
      });
      const billingTransactionId = await ctx.db.insert("billing_transactions", {
        businessId: referredBusinessId,
        kind: "order",
        sourceId: "order-below-minimum",
        status: "paid",
        amountCents: 10_000,
        currency: "usd",
        occurredAt: "2026-04-01T00:00:00.000Z",
        lastSyncedAt: "2026-04-01T00:00:00.000Z",
      });
      const commissionId = await ctx.db.insert("affiliate_commissions", {
        affiliateProfileId: profileId,
        referredBusinessId,
        sourceKey: "order:order-below-minimum",
        billingTransactionId,
        amountCents: 10_000,
        commissionCents: 2_000,
        currency: "usd",
        status: "pending",
        payoutState: "unassigned",
        occurredAt: "2026-04-01T00:00:00.000Z",
        clearsAt: "2026-05-01T00:00:00.000Z",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      return { commissionId };
    });

    const payoutRunId = await t.mutation(internal.affiliates.generateMonthlyPayoutRun, {
      periodKey: "2026-05",
      createdAt: "2026-05-01T13:00:00.000Z",
    });

    const result = await t.run(async (ctx) => {
      const commission = await ctx.db.get(seeded.commissionId);
      const payoutItems = await ctx.db
        .query("affiliate_payout_items")
        .withIndex("by_payout_run_id", (q) => q.eq("payoutRunId", payoutRunId))
        .take(10);
      const payoutRun = await ctx.db.get(payoutRunId);
      return { commission, payoutItems, payoutRun };
    });

    expect(result.commission?.payoutItemId).toBeUndefined();
    expect(result.commission?.payoutState).toBe("unassigned");
    expect(result.payoutItems).toEqual([]);
    expect(result.payoutRun?.totalCents).toBe(0);
  });

  it("releases multi-page below-minimum draft payout items without reassigning commissions", async () => {
    const t = createConvexHarness();

    const seeded = await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "cleanup-batch-affiliate");
      const profileId = await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "cleanup-batch-affiliate",
        status: "active",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      const referredUserId = await seedUser(ctx, "cleanup-batch-referred-owner");
      const referredBusinessId = await seedBusiness(ctx, {
        ownerId: referredUserId,
        slug: "cleanup-batch-referred",
      });
      const payoutRunId = await ctx.db.insert("affiliate_payout_runs", {
        periodKey: "2026-05",
        status: "draft",
        totalCents: 0,
        currency: "usd",
        createdAt: "2026-05-01T13:00:00.000Z",
        updatedAt: "2026-05-01T13:00:00.000Z",
      });
      const payoutItemId = await ctx.db.insert("affiliate_payout_items", {
        payoutRunId,
        affiliateProfileId: profileId,
        amountCents: 251,
        currency: "usd",
        status: "draft",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-05-01T13:00:00.000Z",
        updatedAt: "2026-05-01T13:00:00.000Z",
      });

      for (let index = 0; index < 251; index += 1) {
        const billingTransactionId = await ctx.db.insert("billing_transactions", {
          businessId: referredBusinessId,
          kind: "order",
          sourceId: `order-cleanup-${index}`,
          status: "paid",
          amountCents: 5,
          currency: "usd",
          occurredAt: "2026-04-01T00:00:00.000Z",
          lastSyncedAt: "2026-04-01T00:00:00.000Z",
        });
        await ctx.db.insert("affiliate_commissions", {
          affiliateProfileId: profileId,
          referredBusinessId,
          sourceKey: `order:order-cleanup-${index}`,
          billingTransactionId,
          amountCents: 5,
          commissionCents: 1,
          currency: "usd",
          status: "pending",
          payoutState: "assigned",
          payoutItemId,
          occurredAt: "2026-04-01T00:00:00.000Z",
          clearsAt: "2026-05-01T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        });
      }

      return { payoutItemId, payoutRunId };
    });

    await t.mutation(internal.affiliates.releaseBelowMinimumDraftPayoutItemsForRun, {
      payoutRunId: seeded.payoutRunId,
      updatedAt: "2026-05-01T13:00:00.000Z",
    });
    await t.mutation(internal.affiliates.releaseBelowMinimumDraftPayoutItemsForRun, {
      payoutRunId: seeded.payoutRunId,
      updatedAt: "2026-05-01T13:00:00.000Z",
    });

    const result = await t.run(async (ctx) => {
      const payoutItem = await ctx.db.get(seeded.payoutItemId);
      const assignedCommissions = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_payout_item_id_and_payout_state", (q) =>
          q.eq("payoutItemId", seeded.payoutItemId).eq("payoutState", "assigned"),
        )
        .take(1);
      const unassignedCommissions = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_status_and_payout_state_and_clears_at", (q) =>
          q
            .eq("status", "pending")
            .eq("payoutState", "unassigned")
            .lte("clearsAt", "2026-05-01T13:00:00.000Z"),
        )
        .take(300);
      return { assignedCommissions, payoutItem, unassignedCommissions };
    });

    expect(result.payoutItem).toBeNull();
    expect(result.assignedCommissions).toEqual([]);
    expect(result.unassignedCommissions).toHaveLength(251);
  });

  it("reopens deferred commissions across multiple batches after PayPal is added", async () => {
    const t = createConvexHarness();

    const seeded = await t.run(async (ctx) => {
      const affiliateUserId = await seedUser(ctx, "deferred-batch-affiliate");
      const profileId = await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "deferred-batch-affiliate",
        status: "active",
        paypalEmail: "affiliate@example.com",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      const referredUserId = await seedUser(ctx, "deferred-batch-referred-owner");
      const referredBusinessId = await seedBusiness(ctx, {
        ownerId: referredUserId,
        slug: "deferred-batch-referred",
      });

      for (let index = 0; index < 251; index += 1) {
        const billingTransactionId = await ctx.db.insert("billing_transactions", {
          businessId: referredBusinessId,
          kind: "order",
          sourceId: `order-deferred-${index}`,
          status: "paid",
          amountCents: 10_000,
          currency: "usd",
          occurredAt: "2026-04-01T00:00:00.000Z",
          lastSyncedAt: "2026-04-01T00:00:00.000Z",
        });
        await ctx.db.insert("affiliate_commissions", {
          affiliateProfileId: profileId,
          referredBusinessId,
          sourceKey: `order:order-deferred-${index}`,
          billingTransactionId,
          amountCents: 10_000,
          commissionCents: 2_000,
          currency: "usd",
          status: "pending",
          payoutState: "deferred",
          occurredAt: "2026-04-01T00:00:00.000Z",
          clearsAt: "2026-05-01T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        });
      }

      return { profileId };
    });

    await t.mutation(internal.affiliates.reopenDeferredCommissionsForProfile, {
      affiliateProfileId: seeded.profileId,
      updatedAt: "2026-05-01T13:00:00.000Z",
    });
    await t.mutation(internal.affiliates.reopenDeferredCommissionsForProfile, {
      affiliateProfileId: seeded.profileId,
      updatedAt: "2026-05-01T13:00:00.000Z",
    });

    const result = await t.run(async (ctx) => {
      const deferredCommissions = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_affiliate_profile_id_and_status_and_payout_state", (q) =>
          q
            .eq("affiliateProfileId", seeded.profileId)
            .eq("status", "pending")
            .eq("payoutState", "deferred"),
        )
        .take(1);
      const unassignedCommissions = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_affiliate_profile_id_and_status_and_payout_state", (q) =>
          q
            .eq("affiliateProfileId", seeded.profileId)
            .eq("status", "pending")
            .eq("payoutState", "unassigned"),
        )
        .take(300);
      return { deferredCommissions, unassignedCommissions };
    });

    expect(result.deferredCommissions).toEqual([]);
    expect(result.unassignedCommissions).toHaveLength(251);
  });
});
