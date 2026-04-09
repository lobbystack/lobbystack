import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getBillingKey } from "../lib/billing";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;

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

  it("lifts stale free-tier blocking as soon as the workspace becomes paid", async () => {
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
        currentTier: "paid_monthly",
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
      tier: "paid_monthly",
      minimumMonthlyChargeCents: 500,
    });
    expect(status.usage.smsBlocked).toBe(false);
    expect(status.usage.smsSegmentsIncluded).toBeNull();
    expect(status.usage.smsSegmentsRemaining).toBeNull();
  });
});
