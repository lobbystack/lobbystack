import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { deriveBillingTier, getBillingKey } from "../lib/billing";
import { getPolarMeteredUsagePayload } from "../../packages/shared/src/billing";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;
const originalStarterProductId = process.env.POLAR_STARTER_PRODUCT_ID;
const originalGrowthProductId = process.env.POLAR_GROWTH_PRODUCT_ID;
const originalSiteUrl = process.env.SITE_URL;

afterEach(() => {
  if (originalStarterProductId === undefined) {
    delete process.env.POLAR_STARTER_PRODUCT_ID;
  } else {
    process.env.POLAR_STARTER_PRODUCT_ID = originalStarterProductId;
  }

  if (originalGrowthProductId === undefined) {
    delete process.env.POLAR_GROWTH_PRODUCT_ID;
  } else {
    process.env.POLAR_GROWTH_PRODUCT_ID = originalGrowthProductId;
  }

  if (originalSiteUrl === undefined) {
    delete process.env.SITE_URL;
  } else {
    process.env.SITE_URL = originalSiteUrl;
  }
});

async function seedBillingWorkspace(t: any, subject: string) {
  const seeded = await t.run(async (ctx: any) => {
    const businessId: Id<"businesses"> = await ctx.db.insert("businesses", {
      slug: `billing-${subject}`,
      name: "Billing Workspace",
      timezone: "America/Toronto",
      businessType: "clinic",
      deploymentMode: "cloud",
      status: "active",
    });
    const userId: Id<"users"> = await ctx.db.insert("users", {
      authSubject: subject,
      email: `${subject}@example.com`,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });

    return { businessId, userId };
  });

  return {
    ...seeded,
    authed: t.withIdentity({ subject }),
  };
}

describe("billing", () => {
  it("maps configured Polar product ids to starter and growth tiers", () => {
    process.env.POLAR_STARTER_PRODUCT_ID = "prod_starter";
    process.env.POLAR_GROWTH_PRODUCT_ID = "prod_growth";

    expect(
      deriveBillingTier({
        subscriptionStatus: "active",
        subscriptionProductId: "prod_starter",
      }),
    ).toBe("starter");
    expect(
      deriveBillingTier({
        subscriptionStatus: "active",
        subscriptionProductId: "prod_growth",
      }),
    ).toBe("growth");
    expect(
      deriveBillingTier({
        subscriptionStatus: "active",
        subscriptionProductId: "prod_unknown",
      }),
    ).toBe("free");
  });

  it("maps raw usage into Polar metered event payloads", () => {
    expect(getPolarMeteredUsagePayload("starter", "voice_seconds", 60)).toEqual({
      eventName: "billing.voice_minutes",
      quantity: 1,
    });
    expect(getPolarMeteredUsagePayload("growth", "voice_seconds", 30)).toEqual({
      eventName: "billing.voice_minutes",
      quantity: 0.5,
    });
    expect(getPolarMeteredUsagePayload("starter", "sms_segments", 3)).toEqual({
      eventName: "billing.sms_segments",
      quantity: 3,
    });
    expect(getPolarMeteredUsagePayload("growth", "sms_segments", 4)).toEqual({
      eventName: "billing.sms_segments",
      quantity: 4,
    });
  });

  it("records each usage source key only once and splits usage by UTC month", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedBillingWorkspace(t, "billing-idempotent");

    const first = await t.mutation(internal.billing.recordUsageEvent, {
      businessId,
      usageKind: "voice_seconds",
      quantity: 120,
      sourceKey: "voice:test-call",
      recordedAt: "2026-04-09T12:00:00.000Z",
    });

    const second = await t.mutation(internal.billing.recordUsageEvent, {
      businessId,
      usageKind: "voice_seconds",
      quantity: 120,
      sourceKey: "voice:test-call",
      recordedAt: "2026-04-09T12:00:00.000Z",
    });

    await t.mutation(internal.billing.recordUsageEvent, {
      businessId,
      usageKind: "voice_seconds",
      quantity: 45,
      sourceKey: "voice:test-call-may",
      recordedAt: "2026-05-01T00:00:00.000Z",
    });

    const usageByPeriod = await t.run(async (ctx: any) => {
      const april = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q: any) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      const may = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q: any) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-05"),
        )
        .unique();

      return { april, may };
    });

    expect(second.usageEventId).toBe(first.usageEventId);
    expect(usageByPeriod.april?.voiceSecondsUsed).toBe(120);
    expect(usageByPeriod.may?.voiceSecondsUsed).toBe(45);
  });

  it("lifts stale free-tier blocking as soon as the workspace becomes growth", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedBillingWorkspace(t, "billing-upgrade");

    await t.mutation(internal.billing.recordUsageEvent, {
      businessId,
      usageKind: "sms_segments",
      quantity: 60,
      sourceKey: "sms:test-upgrade",
      recordedAt: "2026-04-09T12:00:00.000Z",
    });

    await expect(
      t.query(internal.billing.assertSmsCanSend, {
        businessId,
      }),
    ).resolves.toEqual({ allowed: false });

    await t.run(async (ctx: any) => {
      await ctx.db.insert("billing_accounts", {
        businessId,
        billingKey: getBillingKey(businessId),
        currentTier: "growth",
        subscriptionState: "active",
        lastSyncedAt: "2026-04-09T12:05:00.000Z",
      });
    });

    await expect(
      t.query(internal.billing.assertSmsCanSend, {
        businessId,
      }),
    ).resolves.toEqual({ allowed: true });

    const status = await authed.query(api.billing.getStatus, {
      businessId,
    });

    expect(status).toMatchObject({
      tier: "growth",
      minimumMonthlyChargeCents: 2_000,
    });
    expect(status.usage.smsBlocked).toBe(false);
    expect(status.usage.smsSegmentsIncluded).toBeNull();
    expect(status.usage.smsSegmentsRemaining).toBeNull();
  });

  it("exposes starter and growth as checkout plans when both products are configured", async () => {
    process.env.POLAR_STARTER_PRODUCT_ID = "prod_starter";
    process.env.POLAR_GROWTH_PRODUCT_ID = "prod_growth";
    process.env.SITE_URL = "https://example.com";

    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedBillingWorkspace(t, "billing-plans");

    const status = await authed.query(api.billing.getStatus, {
      businessId,
    });

    expect(status.availableCheckoutPlans).toEqual(["starter", "growth"]);
    expect(status.hasCheckoutAccess).toBe(true);
  });

  it("builds metered payloads for paid Polar syncing", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedBillingWorkspace(t, "billing-polar-payload");

    const usageEventId = await t.run(async (ctx: any) => {
      await ctx.db.insert("billing_accounts", {
        businessId,
        billingKey: getBillingKey(businessId),
        currentTier: "starter",
        subscriptionState: "active",
        polarCustomerId: "cus_polar",
        lastSyncedAt: "2026-04-09T12:05:00.000Z",
      });

      return await ctx.db.insert("billing_usage_events", {
        businessId,
        periodKey: "2026-04",
        sourceKey: "voice:test-paid-sync",
        usageKind: "voice_seconds",
        quantity: 120,
        tierAtRecordTime: "starter",
        recordedAt: "2026-04-09T12:00:00.000Z",
        syncStatus: "pending",
      });
    });

    const payload = await t.query(internal.billing.getUsageSyncPayload, {
      usageEventId,
    });

    expect(payload).toMatchObject({
      billingKey: getBillingKey(businessId),
      usageKind: "voice_seconds",
      quantity: 120,
      polarEventName: "billing.voice_minutes",
      polarQuantity: 2,
    });
  });
});
