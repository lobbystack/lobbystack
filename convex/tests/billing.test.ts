import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

const { polarEventsIngestMock } = vi.hoisted(() => ({
  polarEventsIngestMock: vi.fn(),
}));

const { enqueuePostHogEventBestEffortMock } = vi.hoisted(() => ({
  enqueuePostHogEventBestEffortMock: vi.fn(async () => {}),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: vi.fn(function MockPolar() {
    return {
      checkouts: {
        create: vi.fn(),
      },
      customerSessions: {
        create: vi.fn(),
      },
      customers: {
        create: vi.fn(),
      },
      events: {
        ingest: polarEventsIngestMock,
      },
      orders: {
        invoice: vi.fn(),
      },
    };
  }),
}));

vi.mock("../telemetry/posthog", async () => {
  const actual = await vi.importActual<typeof import("../telemetry/posthog")>(
    "../telemetry/posthog",
  );
  return {
    ...actual,
    enqueuePostHogEventBestEffort: enqueuePostHogEventBestEffortMock,
  };
});

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getBillingKey } from "../lib/billing";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;
const originalProProductId = process.env.POLAR_PRO_PRODUCT_ID;
const originalAiSmsAddonProductId = process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID;
const originalAiSmsSetupProductId = process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID;
const originalPolarOrganizationToken = process.env.POLAR_ORGANIZATION_TOKEN;
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

  if (originalPolarOrganizationToken === undefined) {
    delete process.env.POLAR_ORGANIZATION_TOKEN;
  } else {
    process.env.POLAR_ORGANIZATION_TOKEN = originalPolarOrganizationToken;
  }

  if (originalSiteUrl === undefined) {
    delete process.env.SITE_URL;
  } else {
    process.env.SITE_URL = originalSiteUrl;
  }

  vi.clearAllMocks();
});

async function seedWorkspace(
  t: ConvexHarness,
  input: {
    subject: string;
    deploymentMode: "cloud" | "manual";
    role?: "business_owner" | "business_admin" | "scheduler" | "viewer";
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
      role: input.role ?? "business_owner",
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
    polarCustomerId?: string;
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
    ...(input.polarCustomerId ? { polarCustomerId: input.polarCustomerId } : {}),
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
        polarCustomerId: "cus_polar_retry",
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

  it("reserves remaining free cloud voice capacity before the call finishes", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-voice-reservation",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      const seeded = await seedUsageAnchors(ctx, { businessId });
      const secondCallId = await ctx.db.insert("calls", {
        businessId,
        twilioCallSid: "CA-billing-test-2",
        status: "in_progress",
        startedAt: "2026-04-12T14:05:00.000Z",
      });
      return { ...seeded, secondCallId };
    });

    const firstReservation = await t.mutation(internal.billing.reserveVoiceUsageAtCallStart, {
      businessId,
      callId: anchors.callId,
      recordedAt: "2026-04-12T14:00:00.000Z",
    });
    const secondReservation = await t.mutation(internal.billing.reserveVoiceUsageAtCallStart, {
      businessId,
      callId: anchors.secondCallId,
      recordedAt: "2026-04-12T14:00:30.000Z",
    });

    const usageMonth = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: false,
    });
    expect(secondReservation).toEqual({
      allowed: false,
      errorCode: "voice_limit_reached",
    });
    expect(usageMonth).toMatchObject({
      voiceSecondsUsed: 600,
      voiceBlocked: true,
    });
  });

  it("treats duplicate voice start reservations for the same call as idempotent", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-voice-idempotent",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const firstReservation = await t.mutation(internal.billing.reserveVoiceUsageAtCallStart, {
      businessId,
      callId: anchors.callId,
      recordedAt: "2026-04-12T14:00:00.000Z",
    });
    const secondReservation = await t.mutation(internal.billing.reserveVoiceUsageAtCallStart, {
      businessId,
      callId: anchors.callId,
      recordedAt: "2026-04-12T14:00:05.000Z",
    });

    const usageState = await t.run(async (ctx: TestContext) => {
      const usageMonth = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q.eq("businessId", businessId).eq("sourceKey", `voice:${String(anchors.callId)}`),
        )
        .unique();
      return { usageMonth, usageEvent };
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: false,
    });
    expect(secondReservation).toEqual({
      allowed: true,
      errorCode: null,
      usageEventId: firstReservation.usageEventId,
      syncNeeded: false,
    });
    expect(usageState.usageMonth).toMatchObject({
      voiceSecondsUsed: 600,
      voiceBlocked: true,
      lastRecordedAt: "2026-04-12T14:00:00.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      quantity: 600,
      recordedAt: "2026-04-12T14:00:00.000Z",
    });
  });

  it("shrinks a full voice reservation back to the actual duration when the call completes", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-voice-reconcile",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    await t.mutation(internal.billing.reserveVoiceUsageAtCallStart, {
      businessId,
      callId: anchors.callId,
      recordedAt: "2026-04-12T14:00:00.000Z",
    });
    const usageResult = await t.mutation(internal.billing.recordVoiceUsage, {
      businessId,
      callId: anchors.callId,
      quantity: 33,
      recordedAt: "2026-04-12T14:00:33.000Z",
    });

    const usageState = await t.run(async (ctx: TestContext) => {
      const usageMonth = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q.eq("businessId", businessId).eq("sourceKey", `voice:${String(anchors.callId)}`),
        )
        .unique();
      return { usageMonth, usageEvent };
    });

    expect(usageResult).toMatchObject({
      syncNeeded: false,
    });
    expect(usageState.usageMonth).toMatchObject({
      voiceSecondsUsed: 33,
      voiceBlocked: false,
      lastRecordedAt: "2026-04-12T14:00:33.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      quantity: 33,
      recordedAt: "2026-04-12T14:00:33.000Z",
    });
  });

  it("reserves hosted alert SMS usage before Twilio reports segments", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-alert-reservation",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      const seeded = await seedUsageAnchors(ctx, { businessId });
      const secondNotificationId = await ctx.db.insert("notifications", {
        businessId,
        channel: "sms",
        kind: "appointment_reminder",
        scheduledFor: "2026-04-12T14:03:00.000Z",
        status: "pending",
      });
      return { ...seeded, secondNotificationId };
    });

    const firstReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      estimatedSegments: 8,
      recordedAt: "2026-04-12T14:01:00.000Z",
    });
    const secondReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.secondNotificationId,
      estimatedSegments: 3,
      recordedAt: "2026-04-12T14:02:00.000Z",
    });

    const usageMonth = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: false,
    });
    expect(secondReservation).toEqual({
      allowed: false,
      errorCode: "alert_sms_limit_reached",
    });
    expect(usageMonth).toMatchObject({
      alertSmsSegmentsUsed: 8,
      alertSmsBlocked: false,
    });
  });

  it("treats duplicate hosted alert SMS reservations for the same notification as idempotent", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-alert-idempotent",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      const seeded = await seedUsageAnchors(ctx, { businessId });
      const secondNotificationId = await ctx.db.insert("notifications", {
        businessId,
        channel: "sms",
        kind: "appointment_reminder",
        scheduledFor: "2026-04-12T14:03:00.000Z",
        status: "pending",
      });
      return { ...seeded, secondNotificationId };
    });

    const firstReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      estimatedSegments: 8,
      recordedAt: "2026-04-12T14:01:00.000Z",
    });
    const secondReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      estimatedSegments: 8,
      recordedAt: "2026-04-12T14:01:30.000Z",
    });
    const thirdReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.secondNotificationId,
      estimatedSegments: 3,
      recordedAt: "2026-04-12T14:02:00.000Z",
    });

    const usageState = await t.run(async (ctx: TestContext) => {
      const usageMonth = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q.eq("businessId", businessId).eq("sourceKey", `alert_sms:${String(anchors.notificationId)}`),
        )
        .unique();
      return { usageMonth, usageEvent };
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: false,
    });
    expect(secondReservation).toEqual({
      allowed: true,
      errorCode: null,
      usageEventId: firstReservation.usageEventId,
      syncNeeded: false,
    });
    expect(thirdReservation).toEqual({
      allowed: false,
      errorCode: "alert_sms_limit_reached",
    });
    expect(usageState.usageMonth).toMatchObject({
      alertSmsSegmentsUsed: 8,
      alertSmsBlocked: false,
      lastRecordedAt: "2026-04-12T14:01:00.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      quantity: 8,
      recordedAt: "2026-04-12T14:01:00.000Z",
    });
  });

  it("reserves outbound transfer attempts before the live handoff executes", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-outbound-reservation",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      const seeded = await seedUsageAnchors(ctx, { businessId });
      const secondCallId = await ctx.db.insert("calls", {
        businessId,
        twilioCallSid: "CA-billing-outbound-2",
        status: "in_progress",
        startedAt: "2026-04-12T14:06:00.000Z",
      });
      const thirdCallId = await ctx.db.insert("calls", {
        businessId,
        twilioCallSid: "CA-billing-outbound-3",
        status: "in_progress",
        startedAt: "2026-04-12T14:07:00.000Z",
      });
      return { ...seeded, secondCallId, thirdCallId };
    });

    const firstReservation = await t.mutation(
      internal.billing.reserveOutboundCallAttemptUsage,
      {
        businessId,
        callId: anchors.callId,
        recordedAt: "2026-04-12T14:02:00.000Z",
      },
    );
    const secondReservation = await t.mutation(
      internal.billing.reserveOutboundCallAttemptUsage,
      {
        businessId,
        callId: anchors.secondCallId,
        recordedAt: "2026-04-12T14:03:00.000Z",
      },
    );
    const thirdReservation = await t.mutation(
      internal.billing.reserveOutboundCallAttemptUsage,
      {
        businessId,
        callId: anchors.thirdCallId,
        recordedAt: "2026-04-12T14:04:00.000Z",
      },
    );

    const usageMonth = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: false,
    });
    expect(secondReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: false,
    });
    expect(thirdReservation).toEqual({
      allowed: false,
      errorCode: "outbound_call_attempt_limit_reached",
    });
    expect(usageMonth).toMatchObject({
      outboundCallAttemptsUsed: 2,
      outboundCallAttemptsBlocked: true,
    });
  });

  it("treats duplicate outbound transfer reservations for the same call as idempotent", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-outbound-idempotent",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      const seeded = await seedUsageAnchors(ctx, { businessId });
      const secondCallId = await ctx.db.insert("calls", {
        businessId,
        twilioCallSid: "CA-billing-outbound-idempotent-2",
        status: "in_progress",
        startedAt: "2026-04-12T14:06:00.000Z",
      });
      return { ...seeded, secondCallId };
    });

    const firstReservation = await t.mutation(
      internal.billing.reserveOutboundCallAttemptUsage,
      {
        businessId,
        callId: anchors.callId,
        recordedAt: "2026-04-12T14:02:00.000Z",
      },
    );
    const secondReservation = await t.mutation(
      internal.billing.reserveOutboundCallAttemptUsage,
      {
        businessId,
        callId: anchors.callId,
        recordedAt: "2026-04-12T14:02:30.000Z",
      },
    );
    const thirdReservation = await t.mutation(
      internal.billing.reserveOutboundCallAttemptUsage,
      {
        businessId,
        callId: anchors.secondCallId,
        recordedAt: "2026-04-12T14:03:00.000Z",
      },
    );

    const usageState = await t.run(async (ctx: TestContext) => {
      const usageMonth = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q
            .eq("businessId", businessId)
            .eq("sourceKey", `outbound_attempt:voice_call:${String(anchors.callId)}`),
        )
        .unique();
      return { usageMonth, usageEvent };
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: false,
    });
    expect(secondReservation).toEqual({
      allowed: true,
      errorCode: null,
      usageEventId: firstReservation.usageEventId,
      syncNeeded: false,
    });
    expect(thirdReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: false,
    });
    expect(usageState.usageMonth).toMatchObject({
      outboundCallAttemptsUsed: 2,
      outboundCallAttemptsBlocked: true,
      lastRecordedAt: "2026-04-12T14:03:00.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      quantity: 1,
      recordedAt: "2026-04-12T14:02:00.000Z",
    });
  });

  it("prepares transfer reservations by Twilio SID when the gateway has no callId", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-outbound-fallback",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const reservation = await t.mutation(internal.voice.runtime.prepareTransferForVoice, {
      twilioCallSid: "CA-billing-test",
      recordedAt: "2026-04-12T14:02:30.000Z",
    });

    const usageMonth = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
    });

    expect(anchors.callId).toBeDefined();
    expect(reservation).toEqual({
      allowed: true,
      errorCode: null,
    });
    expect(usageMonth).toMatchObject({
      outboundCallAttemptsUsed: 1,
      outboundCallAttemptsBlocked: false,
    });
  });

  it("still blocks transfer preparation by Twilio SID after free outbound quota is exhausted", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-outbound-fallback-cap",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      const seeded = await seedUsageAnchors(ctx, { businessId });
      const secondCallId = await ctx.db.insert("calls", {
        businessId,
        twilioCallSid: "CA-billing-fallback-2",
        status: "in_progress",
        startedAt: "2026-04-12T14:06:00.000Z",
      });
      await ctx.db.insert("calls", {
        businessId,
        twilioCallSid: "CA-billing-fallback-3",
        status: "in_progress",
        startedAt: "2026-04-12T14:07:00.000Z",
      });
      return { ...seeded, secondCallId };
    });

    await t.mutation(internal.billing.reserveOutboundCallAttemptUsage, {
      businessId,
      callId: anchors.callId,
      recordedAt: "2026-04-12T14:02:00.000Z",
    });
    await t.mutation(internal.billing.reserveOutboundCallAttemptUsage, {
      businessId,
      callId: anchors.secondCallId,
      recordedAt: "2026-04-12T14:03:00.000Z",
    });

    const reservation = await t.mutation(internal.voice.runtime.prepareTransferForVoice, {
      twilioCallSid: "CA-billing-fallback-3",
      recordedAt: "2026-04-12T14:04:00.000Z",
    });

    expect(reservation).toEqual({
      allowed: false,
      errorCode: "outbound_call_attempt_limit_reached",
    });
  });

  it("releases a reserved outbound transfer attempt when the handoff never starts", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-outbound-release",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const reserved = await t.mutation(internal.voice.runtime.prepareTransferForVoice, {
      callId: anchors.callId,
      recordedAt: "2026-04-12T14:02:00.000Z",
    });

    const released = await t.mutation(internal.voice.runtime.releaseTransferForVoice, {
      callId: anchors.callId,
      recordedAt: "2026-04-12T14:02:30.000Z",
    });

    const usageState = await t.run(async (ctx: TestContext) => {
      const usageMonth = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q
            .eq("businessId", businessId)
            .eq("sourceKey", `outbound_attempt:voice_call:${String(anchors.callId)}`),
        )
        .unique();
      return { usageMonth, usageEvent };
    });

    expect(reserved).toEqual({
      allowed: true,
      errorCode: null,
    });
    expect(released).toEqual({
      released: true,
    });
    expect(usageState.usageMonth).toMatchObject({
      outboundCallAttemptsUsed: 0,
      outboundCallAttemptsBlocked: false,
      lastRecordedAt: "2026-04-12T14:02:30.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      quantity: 0,
      recordedAt: "2026-04-12T14:02:30.000Z",
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

  it("allows Pro alert SMS reservations after included segments are exhausted", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-pro-alert-reservation",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      const seeded = await seedUsageAnchors(ctx, { businessId });
      const secondNotificationId = await ctx.db.insert("notifications", {
        businessId,
        channel: "sms",
        kind: "appointment_reminder",
        scheduledFor: "2026-04-12T16:03:00.000Z",
        status: "pending",
      });
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
      });
      return { ...seeded, secondNotificationId };
    });

    const firstReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      estimatedSegments: 50,
      recordedAt: "2026-04-12T16:01:00.000Z",
    });
    const secondReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.secondNotificationId,
      estimatedSegments: 3,
      recordedAt: "2026-04-12T16:02:00.000Z",
    });

    const usageMonth = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: true,
    });
    expect(secondReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: true,
    });
    expect(usageMonth).toMatchObject({
      alertSmsSegmentsUsed: 53,
      alertSmsBlocked: false,
    });
  });

  it("allows Pro outbound transfer reservations after included attempts are exhausted", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-pro-outbound-reservation",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      const seeded = await seedUsageAnchors(ctx, { businessId });
      const secondCallId = await ctx.db.insert("calls", {
        businessId,
        twilioCallSid: "CA-billing-pro-outbound-2",
        status: "in_progress",
        startedAt: "2026-04-12T16:06:00.000Z",
      });
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
      });
      return { ...seeded, secondCallId };
    });

    const firstReservation = await t.mutation(
      internal.billing.reserveOutboundCallAttemptUsage,
      {
        businessId,
        callId: anchors.callId,
        recordedAt: "2026-04-12T16:03:00.000Z",
      },
    );
    await t.mutation(internal.billing.recordOutboundCallAttemptUsage, {
      businessId,
      sourceKey: "outbound_attempt:pro-existing-bundle",
      quantity: 19,
      recordedAt: "2026-04-12T16:03:30.000Z",
    });
    const secondReservation = await t.mutation(
      internal.billing.reserveOutboundCallAttemptUsage,
      {
        businessId,
        callId: anchors.secondCallId,
        recordedAt: "2026-04-12T16:04:00.000Z",
      },
    );

    const usageMonth = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: true,
    });
    expect(secondReservation).toMatchObject({
      allowed: true,
      errorCode: null,
      syncNeeded: true,
    });
    expect(usageMonth).toMatchObject({
      outboundCallAttemptsUsed: 21,
      outboundCallAttemptsBlocked: false,
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

  it("schedules a retry when Polar usage ingestion fails transiently", async () => {
    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    polarEventsIngestMock.mockRejectedValueOnce(new Error("temporary polar outage"));

    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-polar-retry",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_polar_retry",
      });
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const usageResult = await t.mutation(internal.billing.recordVoiceUsage, {
      businessId,
      callId: anchors.callId,
      quantity: 61,
      recordedAt: "2026-04-12T16:00:00.000Z",
    });
    const state = await t.run(async (ctx: TestContext) => {
      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
      const usageEvent = await ctx.db.get(usageResult.usageEventId);
      return { account, usageEvent };
    });

    expect(state.account?.polarCustomerId).toBe("cus_polar_retry");
    expect(state.usageEvent).toMatchObject({
      syncStatus: "pending",
      planAtRecordTime: "pro",
      quantity: 61,
    });
    const payload = await t.query(internal.billing.getUsageSyncPayload, {
      usageEventId: usageResult.usageEventId,
    });

    expect(payload).not.toBeNull();

    const syncResult = await t.action(internal.billing.syncUsageEventToPolar, {
      usageEventId: usageResult.usageEventId,
    });

    expect(syncResult).toMatchObject({
      synced: false,
      scheduledRetry: true,
      error: "temporary polar outage",
    });

    await t.run(async (ctx: TestContext) => {
      const usageEvent = await ctx.db.get(usageResult.usageEventId);

      expect(usageEvent).toMatchObject({
        syncStatus: "failed",
        syncError: "temporary polar outage",
      });
    });

    expect(enqueuePostHogEventBestEffortMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: "ops.billing.usage_sync_failed",
        businessId,
        distinctId: `system:business:${String(businessId)}`,
        groupKey: `business:${String(businessId)}`,
        provider: "polar",
        properties: expect.objectContaining({
          usageKind: "voice_seconds",
          quantity: 61,
          attemptNumber: 1,
          retryScheduled: true,
          retryDelayMs: 30000,
          errorType: "Error",
        }),
      }),
    );
  });

  it("emits a recovery telemetry event when a retry later succeeds", async () => {
    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    polarEventsIngestMock
      .mockRejectedValueOnce(new Error("temporary polar outage"))
      .mockResolvedValueOnce(undefined);

    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-polar-recovery",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_polar_recovery",
      });
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const usageResult = await t.mutation(internal.billing.recordVoiceUsage, {
      businessId,
      callId: anchors.callId,
      quantity: 61,
      recordedAt: "2026-04-12T16:00:00.000Z",
    });

    await t.action(internal.billing.syncUsageEventToPolar, {
      usageEventId: usageResult.usageEventId,
    });
    const recoveryResult = await t.action(internal.billing.syncUsageEventToPolar, {
      usageEventId: usageResult.usageEventId,
      attempt: 1,
    });

    expect(recoveryResult).toEqual({ synced: true });

    await t.run(async (ctx: TestContext) => {
      const usageEvent = await ctx.db.get(usageResult.usageEventId);

      expect(usageEvent).toMatchObject({
        syncStatus: "succeeded",
      });
    });

    expect(enqueuePostHogEventBestEffortMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        eventName: "ops.billing.usage_sync_failed",
        businessId,
      }),
    );
    expect(enqueuePostHogEventBestEffortMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        eventName: "ops.billing.usage_sync_recovered",
        businessId,
        distinctId: `system:business:${String(businessId)}`,
        groupKey: `business:${String(businessId)}`,
        provider: "polar",
        properties: expect.objectContaining({
          usageKind: "voice_seconds",
          quantity: 61,
          attemptNumber: 2,
          recovered: true,
        }),
      }),
    );
  });

  it("requires admin access for billing checkout and portal actions", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-viewer",
      deploymentMode: "cloud",
      role: "viewer",
    });

    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID = "prod_ai_sms";
    process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID = "prod_ai_sms_setup";
    process.env.SITE_URL = "https://example.com";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "free_cloud",
        polarCustomerId: "cus_polar_viewer",
      });
    });

    const status = await authed.query(api.billing.getStatus, { businessId });

    expect(status.hasCheckoutAccess).toBe(false);
    expect(status.hasCustomerPortalAccess).toBe(false);
    expect(status.availableCheckoutPlans).toEqual([]);
    expect(status.canPurchaseAiSmsAddon).toBe(false);
    expect(status.billingContactEmail).toBeNull();
    expect(status.billingContactName).toBeNull();
    expect(status.recentTransactions).toEqual([]);

    await expect(
      authed.action(api.billing.startCheckout, {
        businessId,
        target: "pro",
      }),
    ).rejects.toThrow("Billing management requires admin access.");

    await expect(
      authed.action(api.billing.openPortal, {
        businessId,
      }),
    ).rejects.toThrow("Billing management requires admin access.");

    await expect(
      authed.query(api.billing.listTransactions, {
        businessId,
      }),
    ).rejects.toThrow("Billing management requires admin access.");
  });
});
