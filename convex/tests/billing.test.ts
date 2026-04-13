import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getBillingKey } from "../lib/billing";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;
const originalProProductId = process.env.POLAR_PRO_PRODUCT_ID;
const originalAiSmsAddonProductId = process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID;
const originalAiSmsSetupProductId = process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID;
const originalSiteUrl = process.env.SITE_URL;

type ConvexHarness = TestConvex<typeof schema>;
type TestRunFunction = Parameters<ConvexHarness["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

afterEach(() => {
  if (originalProProductId === undefined) {
    delete process.env.POLAR_PRO_PRODUCT_ID;
  } else {
    process.env.POLAR_PRO_PRODUCT_ID = originalProProductId;
  }

  if (originalAiSmsAddonProductId === undefined) {
    delete process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID;
  } else {
    process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID = originalAiSmsAddonProductId;
  }

  if (originalAiSmsSetupProductId === undefined) {
    delete process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID;
  } else {
    process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID = originalAiSmsSetupProductId;
  }

  if (originalSiteUrl === undefined) {
    delete process.env.SITE_URL;
  } else {
    process.env.SITE_URL = originalSiteUrl;
  }
});

async function seedWorkspace(
  t: ConvexHarness,
  input: {
    subject: string;
    deploymentMode: "cloud" | "manual";
  },
) {
  const seeded = await t.run(async (ctx: TestContext) => {
    const businessId: Id<"businesses"> = await ctx.db.insert("businesses", {
      slug: `billing-${input.subject}`,
      name: "Billing Workspace",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: input.deploymentMode,
      status: "active",
    });
    const userId: Id<"users"> = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
      displayName: "Billing Owner",
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
    authed: t.withIdentity({ subject: input.subject }),
  };
}

async function seedBillingAccount(
  ctx: TestContext,
  input: {
    businessId: Id<"businesses">;
    currentPlan: "free_cloud" | "pro" | "enterprise";
    activeAddons?: Array<"ai_sms">;
  },
): Promise<void> {
  await ctx.db.insert("billing_accounts", {
    businessId: input.businessId,
    billingKey: getBillingKey(input.businessId),
    currentPlan: input.currentPlan,
    activeAddons: input.activeAddons ?? [],
    subscriptionState: input.currentPlan === "pro" ? "active" : "inactive",
    billingContactEmail: "owner@example.com",
    billingContactName: "Billing Owner",
    lastSyncedAt: "2026-04-12T12:00:00.000Z",
  });
}

async function seedUsageAnchors(
  ctx: TestContext,
  input: {
    businessId: Id<"businesses">;
  },
): Promise<{
  callId: Id<"calls">;
  notificationId: Id<"notifications">;
  messageId: Id<"messages">;
}> {
  const contactId = await ctx.db.insert("contacts", {
    businessId: input.businessId,
    phone: "+14165550199",
    name: "Billing Test Contact",
  });
  const smsConversationId = await ctx.db.insert("conversations", {
    businessId: input.businessId,
    contactId,
    channel: "sms",
    status: "open",
  });
  const voiceConversationId = await ctx.db.insert("conversations", {
    businessId: input.businessId,
    contactId,
    channel: "voice",
    status: "closed",
  });
  const callId = await ctx.db.insert("calls", {
    businessId: input.businessId,
    conversationId: voiceConversationId,
    twilioCallSid: "CA-billing-test",
    status: "completed",
    providerCallStatus: "completed",
    startedAt: "2026-04-12T14:00:00.000Z",
    endedAt: "2026-04-12T14:10:00.000Z",
  });
  const notificationId = await ctx.db.insert("notifications", {
    businessId: input.businessId,
    channel: "sms",
    kind: "appointment_reminder",
    scheduledFor: "2026-04-12T14:01:00.000Z",
    status: "sent",
  });
  const messageId = await ctx.db.insert("messages", {
    businessId: input.businessId,
    conversationId: smsConversationId,
    direction: "outbound",
    channel: "sms",
    body: "AI SMS test message",
    status: "sent",
    aiGenerated: true,
    senderRole: "business_ai",
  });

  return {
    callId,
    notificationId,
    messageId,
  };
}

describe("billing", () => {
  it("returns Free Cloud entitlements with no AI SMS and no overages", async () => {
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.SITE_URL = "https://example.com";

    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-free-cloud",
      deploymentMode: "cloud",
    });

    const status = await authed.query(api.billing.getStatus, { businessId });

    expect(status).toMatchObject({
      plan: "free_cloud",
      aiSmsEnabled: false,
      overagesBillable: false,
      monthlyChargeCents: 0,
      includedBusinessNumbers: 0,
      availableCheckoutPlans: ["pro"],
      canPurchaseAiSmsAddon: false,
      hasCheckoutAccess: true,
    });
    expect(status.usage).toMatchObject({
      voiceSecondsIncluded: 600,
      alertSmsSegmentsIncluded: 10,
      outboundCallAttemptsIncluded: 2,
      voiceSecondsRemaining: 600,
      alertSmsSegmentsRemaining: 10,
      outboundCallAttemptsRemaining: 2,
      voiceBlocked: false,
      alertSmsBlocked: false,
      outboundCallAttemptsBlocked: false,
    });
  });

  it("keeps self-host workspaces outside hosted billing enforcement", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-self-host",
      deploymentMode: "manual",
    });

    const status = await authed.query(api.billing.getStatus, { businessId });

    expect(status).toMatchObject({
      plan: "self_host",
      aiSmsEnabled: true,
      overagesBillable: false,
      monthlyChargeCents: 0,
      hasCheckoutAccess: false,
      canPurchaseAiSmsAddon: false,
      includedBusinessNumbers: null,
    });
    expect(status.usage).toMatchObject({
      voiceSecondsIncluded: null,
      alertSmsSegmentsIncluded: null,
      outboundCallAttemptsIncluded: null,
      voiceSecondsRemaining: null,
      alertSmsSegmentsRemaining: null,
      outboundCallAttemptsRemaining: null,
      voiceBlocked: false,
      alertSmsBlocked: false,
      outboundCallAttemptsBlocked: false,
    });
  });

  it("only advertises checkout actions that are fully configured", async () => {
    process.env.SITE_URL = "https://example.com";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";

    const t = convexTest(schema, convexModules);
    const freeWorkspace = await seedWorkspace(t, {
      subject: "billing-checkout-free",
      deploymentMode: "cloud",
    });
    const proWorkspace = await seedWorkspace(t, {
      subject: "billing-checkout-pro",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId: proWorkspace.businessId,
        currentPlan: "pro",
      });
    });

    const freeStatus = await freeWorkspace.authed.query(api.billing.getStatus, {
      businessId: freeWorkspace.businessId,
    });
    const proStatus = await proWorkspace.authed.query(api.billing.getStatus, {
      businessId: proWorkspace.businessId,
    });

    expect(freeStatus).toMatchObject({
      availableCheckoutPlans: ["pro"],
      hasCheckoutAccess: true,
      canPurchaseAiSmsAddon: false,
    });
    expect(proStatus).toMatchObject({
      availableCheckoutPlans: ["pro"],
      hasCheckoutAccess: true,
      canPurchaseAiSmsAddon: false,
    });
  });

  it("hides Pro checkout when the Polar Pro product is not configured", async () => {
    process.env.SITE_URL = "https://example.com";
    delete process.env.POLAR_PRO_PRODUCT_ID;

    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-no-pro-product",
      deploymentMode: "cloud",
    });

    const status = await authed.query(api.billing.getStatus, { businessId });

    expect(status).toMatchObject({
      plan: "free_cloud",
      availableCheckoutPlans: [],
      hasCheckoutAccess: false,
      canPurchaseAiSmsAddon: false,
    });
  });

  it("enables the AI SMS add-on only for eligible Pro workspaces", async () => {
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID = "prod_ai_sms";
    process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID = "prod_ai_sms_setup";
    process.env.SITE_URL = "https://example.com";

    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-pro-addon",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
      });
    });

    const beforeAddon = await authed.query(api.billing.getStatus, { businessId });
    const beforePolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "ai",
    });

    expect(beforeAddon).toMatchObject({
      plan: "pro",
      aiSmsEnabled: false,
      overagesBillable: true,
      canPurchaseAiSmsAddon: true,
    });
    expect(beforePolicy).toEqual({
      allowed: false,
      senderRole: "business_ai",
      errorCode: "ai_sms_not_enabled",
    });

    await t.run(async (ctx: TestContext) => {
      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();

      if (!account) {
        throw new Error("Expected billing account to exist.");
      }

      await ctx.db.patch(account._id, {
        activeAddons: ["ai_sms"],
      });
    });

    const afterAddon = await authed.query(api.billing.getStatus, { businessId });
    const afterPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "ai",
    });

    expect(afterAddon).toMatchObject({
      plan: "pro",
      aiSmsEnabled: true,
      canPurchaseAiSmsAddon: false,
    });
    expect(afterPolicy).toEqual({
      allowed: true,
      senderRole: "business_ai",
      errorCode: null,
    });
  });

  it("recomputes alert sms entitlement from the current plan after an upgrade", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-alert-upgrade",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "free_cloud",
      });
      await ctx.db.insert("billing_usage_months", {
        businessId,
        periodKey: "2026-04",
        planAtSnapshot: "free_cloud",
        alertSmsSegmentsUsed: 5,
        alertSmsSegmentsIncluded: 10,
        alertSmsBlocked: false,
        lastRecordedAt: "2026-04-12T14:00:00.000Z",
      });

      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();

      if (!account) {
        throw new Error("Expected billing account to exist.");
      }

      await ctx.db.patch(account._id, {
        currentPlan: "pro",
        subscriptionState: "active",
      });
    });

    const status = await authed.query(api.billing.getStatus, { businessId });

    expect(status).toMatchObject({
      plan: "pro",
      overagesBillable: true,
    });
    expect(status.usage).toMatchObject({
      alertSmsSegmentsUsed: 5,
      alertSmsSegmentsIncluded: 50,
      alertSmsSegmentsRemaining: 45,
      alertSmsBlocked: false,
    });
  });

  it("tracks free cloud usage buckets separately and hard-stops at included limits", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-free-usage",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const voiceResult = await t.mutation(internal.billing.recordVoiceUsage, {
      businessId,
      callId: anchors.callId,
      quantity: 600,
      recordedAt: "2026-04-12T14:00:00.000Z",
    });
    const alertResult = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      quantity: 10,
      recordedAt: "2026-04-12T14:01:00.000Z",
    });
    const attemptResult = await t.mutation(
      internal.billing.recordOutboundCallAttemptUsage,
      {
        businessId,
        sourceKey: "outbound_attempt:test",
        quantity: 2,
        recordedAt: "2026-04-12T14:02:00.000Z",
      },
    );

    const status = await authed.query(api.billing.getStatus, { businessId });
    const alertPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "alert",
    });
    const voicePolicy = await t.query(internal.billing.assertVoiceCanStart, {
      businessId,
    });
    const outboundPolicy = await t.query(
      internal.billing.assertOutboundCallAttemptCanStart,
      {
        businessId,
      },
    );

    expect(voiceResult.syncNeeded).toBe(false);
    expect(alertResult.syncNeeded).toBe(false);
    expect(attemptResult.syncNeeded).toBe(false);
    expect(status.usage).toMatchObject({
      voiceSecondsUsed: 600,
      alertSmsSegmentsUsed: 10,
      outboundCallAttemptsUsed: 2,
      aiSmsSegmentsUsed: 0,
      voiceSecondsRemaining: 0,
      alertSmsSegmentsRemaining: 0,
      outboundCallAttemptsRemaining: 0,
      voiceBlocked: true,
      alertSmsBlocked: true,
      outboundCallAttemptsBlocked: true,
    });
    expect(alertPolicy).toEqual({
      allowed: false,
      senderRole: "platform_alert",
      errorCode: "alert_sms_limit_reached",
    });
    expect(voicePolicy).toEqual({
      allowed: false,
      errorCode: "voice_limit_reached",
    });
    expect(outboundPolicy).toEqual({
      allowed: false,
      errorCode: "outbound_call_attempt_limit_reached",
    });
  });

  it("lets Pro workspaces exceed included usage while keeping AI SMS metered separately", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-pro-overages",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        activeAddons: ["ai_sms"],
      });
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const voiceResult = await t.mutation(internal.billing.recordVoiceUsage, {
      businessId,
      callId: anchors.callId,
      quantity: 5_400,
      recordedAt: "2026-04-12T15:00:00.000Z",
    });
    const alertResult = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      quantity: 55,
      recordedAt: "2026-04-12T15:01:00.000Z",
    });
    const attemptResult = await t.mutation(
      internal.billing.recordOutboundCallAttemptUsage,
      {
        businessId,
        sourceKey: "outbound_attempt:pro-test",
        quantity: 25,
        recordedAt: "2026-04-12T15:02:00.000Z",
      },
    );
    const aiSmsResult = await t.mutation(internal.billing.recordAiSmsUsage, {
      businessId,
      messageId: anchors.messageId,
      quantity: 7,
      recordedAt: "2026-04-12T15:03:00.000Z",
    });

    const status = await authed.query(api.billing.getStatus, { businessId });
    const alertPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "alert",
    });
    const aiPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "ai",
    });
    const voicePolicy = await t.query(internal.billing.assertVoiceCanStart, {
      businessId,
    });
    const outboundPolicy = await t.query(
      internal.billing.assertOutboundCallAttemptCanStart,
      {
        businessId,
      },
    );

    expect(voiceResult.syncNeeded).toBe(true);
    expect(alertResult.syncNeeded).toBe(true);
    expect(attemptResult.syncNeeded).toBe(true);
    expect(aiSmsResult.syncNeeded).toBe(true);
    expect(status).toMatchObject({
      plan: "pro",
      aiSmsEnabled: true,
      overagesBillable: true,
    });
    expect(status.usage).toMatchObject({
      voiceSecondsUsed: 5_400,
      alertSmsSegmentsUsed: 55,
      outboundCallAttemptsUsed: 25,
      aiSmsSegmentsUsed: 7,
      voiceSecondsRemaining: 0,
      alertSmsSegmentsRemaining: 0,
      outboundCallAttemptsRemaining: 0,
      voiceBlocked: false,
      alertSmsBlocked: false,
      outboundCallAttemptsBlocked: false,
    });
    expect(alertPolicy).toEqual({
      allowed: true,
      senderRole: "platform_alert",
      errorCode: null,
    });
    expect(aiPolicy).toEqual({
      allowed: true,
      senderRole: "business_ai",
      errorCode: null,
    });
    expect(voicePolicy).toEqual({
      allowed: true,
      errorCode: null,
    });
    expect(outboundPolicy).toEqual({
      allowed: true,
      errorCode: null,
    });
  });

  it("moves an updated usage event into the new billing month", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-cross-month",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      quantity: 3,
      recordedAt: "2026-04-30T23:59:00.000Z",
    });
    await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      quantity: 4,
      recordedAt: "2026-05-01T00:01:00.000Z",
    });

    const usageState = await t.run(async (ctx: TestContext) => {
      const april = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      const may = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-05"),
        )
        .unique();
      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q.eq("businessId", businessId).eq("sourceKey", `alert_sms:${String(anchors.notificationId)}`),
        )
        .unique();

      return { april, may, usageEvent };
    });

    expect(usageState.april).toMatchObject({
      alertSmsSegmentsUsed: 0,
    });
    expect(usageState.may).toMatchObject({
      alertSmsSegmentsUsed: 4,
      lastRecordedAt: "2026-05-01T00:01:00.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      periodKey: "2026-05",
      quantity: 4,
      recordedAt: "2026-05-01T00:01:00.000Z",
    });
  });
});
