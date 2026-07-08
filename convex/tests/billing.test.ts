import { convexTest, type TestConvex } from "convex-test";
import { register as registerPolarComponent } from "@convex-dev/polar/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  polarCheckoutsCreateMock,
  polarCheckoutsGetMock,
  polarCustomerSessionsCreateMock,
  polarCustomerPortalSubscriptionsListMock,
  polarCustomersCreateMock,
  polarCustomersListMock,
  polarCustomersUpdateMock,
  polarEventsIngestMock,
  polarMembersCreateMock,
  polarMembersListMock,
  polarMembersUpdateMock,
  polarSubscriptionsGetMock,
  polarSubscriptionsListMock,
  polarSubscriptionsUpdateMock,
} = vi.hoisted(() => ({
  polarCheckoutsCreateMock: vi.fn(),
  polarCheckoutsGetMock: vi.fn(),
  polarCustomerSessionsCreateMock: vi.fn(),
  polarCustomerPortalSubscriptionsListMock: vi.fn(),
  polarCustomersCreateMock: vi.fn(),
  polarCustomersListMock: vi.fn(),
  polarCustomersUpdateMock: vi.fn(),
  polarEventsIngestMock: vi.fn(),
  polarMembersCreateMock: vi.fn(),
  polarMembersListMock: vi.fn(),
  polarMembersUpdateMock: vi.fn(),
  polarSubscriptionsGetMock: vi.fn(),
  polarSubscriptionsListMock: vi.fn(),
  polarSubscriptionsUpdateMock: vi.fn(),
}));

const {
  enqueuePostHogEventBestEffortMock,
  enqueuePostHogProviderExceptionBestEffortMock,
} = vi.hoisted(() => ({
  enqueuePostHogEventBestEffortMock: vi.fn(async () => {}),
  enqueuePostHogProviderExceptionBestEffortMock: vi.fn(async () => {}),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: vi.fn(function MockPolar() {
    return {
      checkouts: {
        create: polarCheckoutsCreateMock,
        get: polarCheckoutsGetMock,
      },
      customerSessions: {
        create: polarCustomerSessionsCreateMock,
      },
      customerPortal: {
        subscriptions: {
          list: polarCustomerPortalSubscriptionsListMock,
        },
      },
      customers: {
        create: polarCustomersCreateMock,
        list: polarCustomersListMock,
        update: polarCustomersUpdateMock,
      },
      events: {
        ingest: polarEventsIngestMock,
      },
      members: {
        createMember: polarMembersCreateMock,
        listMembers: polarMembersListMock,
        updateMember: polarMembersUpdateMock,
      },
      orders: {
        invoice: vi.fn(),
      },
      subscriptions: {
        get: polarSubscriptionsGetMock,
        list: polarSubscriptionsListMock,
        update: polarSubscriptionsUpdateMock,
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
    enqueuePostHogProviderExceptionBestEffort:
      enqueuePostHogProviderExceptionBestEffortMock,
  };
});

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getBillingKey } from "../lib/billing";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;
const originalStarterMonthlyProductId = process.env.POLAR_STARTER_MONTHLY_PRODUCT_ID;
const originalStarterAnnualProductId = process.env.POLAR_STARTER_ANNUAL_PRODUCT_ID;
const originalProMonthlyProductId = process.env.POLAR_PRO_MONTHLY_PRODUCT_ID;
const originalProAnnualProductId = process.env.POLAR_PRO_ANNUAL_PRODUCT_ID;
const originalStarterMonthlyAiSmsProductId =
  process.env.POLAR_STARTER_MONTHLY_AI_SMS_PRODUCT_ID;
const originalStarterAnnualAiSmsProductId =
  process.env.POLAR_STARTER_ANNUAL_AI_SMS_PRODUCT_ID;
const originalProMonthlyAiSmsProductId =
  process.env.POLAR_PRO_MONTHLY_AI_SMS_PRODUCT_ID;
const originalProAnnualAiSmsProductId =
  process.env.POLAR_PRO_ANNUAL_AI_SMS_PRODUCT_ID;
const originalProProductId = process.env.POLAR_PRO_PRODUCT_ID;
const originalAiSmsAddonProductId = process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID;
const originalProAiSmsProductId = process.env.POLAR_PRO_AI_SMS_PRODUCT_ID;
const originalAiSmsSetupProductId = process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID;
const originalReferralDiscountId = process.env.POLAR_REFERRAL_DISCOUNT_ID;
const originalPolarOrganizationToken = process.env.POLAR_ORGANIZATION_TOKEN;
const originalSiteUrl = process.env.SITE_URL;

type ConvexHarness = TestConvex<typeof schema>;
type TestRunFunction = Parameters<ConvexHarness["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

async function* polarListPages<T>(
  pages: Array<Array<T>>,
): AsyncGenerator<{ result: { items: Array<T> } }> {
  for (const items of pages) {
    yield { result: { items } };
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));
});

afterEach(() => {
  if (originalStarterMonthlyProductId === undefined) {
    delete process.env.POLAR_STARTER_MONTHLY_PRODUCT_ID;
  } else {
    process.env.POLAR_STARTER_MONTHLY_PRODUCT_ID = originalStarterMonthlyProductId;
  }

  if (originalStarterAnnualProductId === undefined) {
    delete process.env.POLAR_STARTER_ANNUAL_PRODUCT_ID;
  } else {
    process.env.POLAR_STARTER_ANNUAL_PRODUCT_ID = originalStarterAnnualProductId;
  }

  if (originalProMonthlyProductId === undefined) {
    delete process.env.POLAR_PRO_MONTHLY_PRODUCT_ID;
  } else {
    process.env.POLAR_PRO_MONTHLY_PRODUCT_ID = originalProMonthlyProductId;
  }

  if (originalProAnnualProductId === undefined) {
    delete process.env.POLAR_PRO_ANNUAL_PRODUCT_ID;
  } else {
    process.env.POLAR_PRO_ANNUAL_PRODUCT_ID = originalProAnnualProductId;
  }

  if (originalStarterMonthlyAiSmsProductId === undefined) {
    delete process.env.POLAR_STARTER_MONTHLY_AI_SMS_PRODUCT_ID;
  } else {
    process.env.POLAR_STARTER_MONTHLY_AI_SMS_PRODUCT_ID =
      originalStarterMonthlyAiSmsProductId;
  }

  if (originalStarterAnnualAiSmsProductId === undefined) {
    delete process.env.POLAR_STARTER_ANNUAL_AI_SMS_PRODUCT_ID;
  } else {
    process.env.POLAR_STARTER_ANNUAL_AI_SMS_PRODUCT_ID =
      originalStarterAnnualAiSmsProductId;
  }

  if (originalProMonthlyAiSmsProductId === undefined) {
    delete process.env.POLAR_PRO_MONTHLY_AI_SMS_PRODUCT_ID;
  } else {
    process.env.POLAR_PRO_MONTHLY_AI_SMS_PRODUCT_ID =
      originalProMonthlyAiSmsProductId;
  }

  if (originalProAnnualAiSmsProductId === undefined) {
    delete process.env.POLAR_PRO_ANNUAL_AI_SMS_PRODUCT_ID;
  } else {
    process.env.POLAR_PRO_ANNUAL_AI_SMS_PRODUCT_ID =
      originalProAnnualAiSmsProductId;
  }

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

  if (originalProAiSmsProductId === undefined) {
    delete process.env.POLAR_PRO_AI_SMS_PRODUCT_ID;
  } else {
    process.env.POLAR_PRO_AI_SMS_PRODUCT_ID = originalProAiSmsProductId;
  }

  if (originalAiSmsSetupProductId === undefined) {
    delete process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID;
  } else {
    process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID = originalAiSmsSetupProductId;
  }

  if (originalReferralDiscountId === undefined) {
    delete process.env.POLAR_REFERRAL_DISCOUNT_ID;
  } else {
    process.env.POLAR_REFERRAL_DISCOUNT_ID = originalReferralDiscountId;
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
  vi.useRealTimers();
});

async function seedWorkspace(
  t: ConvexHarness,
  input: {
    subject: string;
    deploymentMode: "cloud" | "manual";
    role?: "business_owner" | "business_admin" | "scheduler" | "viewer";
    onboardingStage?: string;
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
      ...(input.onboardingStage ? { onboardingStage: input.onboardingStage } : {}),
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
    currentPlan: "free_cloud" | "starter" | "pro" | "enterprise";
    activeAddons?: Array<"ai_sms">;
    billingInterval?: "monthly" | "annual";
    polarCustomerId?: string;
    proSubscriptionId?: string;
    proSubscriptionProductId?: string;
  },
): Promise<void> {
  await ctx.db.insert("billing_accounts", {
    businessId: input.businessId,
    billingKey: getBillingKey(input.businessId),
    currentPlan: input.currentPlan,
    activeAddons: input.activeAddons ?? [],
    subscriptionState:
      input.currentPlan === "starter" || input.currentPlan === "pro"
        ? "active"
        : "inactive",
    billingContactEmail: "owner@example.com",
    billingContactName: "Billing Owner",
    ...(input.billingInterval ? { billingInterval: input.billingInterval } : {}),
    ...(input.polarCustomerId ? { polarCustomerId: input.polarCustomerId } : {}),
    ...(input.proSubscriptionId ? { proSubscriptionId: input.proSubscriptionId } : {}),
    ...(input.proSubscriptionProductId
      ? { proSubscriptionProductId: input.proSubscriptionProductId }
      : {}),
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

async function seedBusinessPhoneNumber(
  ctx: TestContext,
  input: {
    businessId: Id<"businesses">;
    e164?: string;
    twilioPhoneSid?: string;
  },
): Promise<Id<"phone_numbers">> {
  return await ctx.db.insert("phone_numbers", {
    businessId: input.businessId,
    e164: input.e164 ?? "+14165550111",
    twilioPhoneSid: input.twilioPhoneSid ?? "PN-billing-phone",
    voiceEnabled: true,
    smsEnabled: true,
    status: "active",
  });
}

async function seedSmsComplianceRegistration(
  ctx: TestContext,
  input: {
    businessId: Id<"businesses">;
    status:
      | "pending_brand_verification"
      | "pending_review"
      | "approved"
      | "failed";
    approvedPhoneNumberId?: Id<"phone_numbers">;
    twilioMessagingServiceSid?: string;
  },
): Promise<Id<"sms_compliance_registrations">> {
  return await ctx.db.insert("sms_compliance_registrations", {
    businessId: input.businessId,
    status: input.status,
    customerType: "direct_customer",
    brandKind: "standard_business",
    trafficTier: "low_volume",
    draft: {
      businessName: "Billing Workspace LLC",
      websiteUrl: "https://example.com",
    },
    ...(input.approvedPhoneNumberId
      ? { approvedPhoneNumberId: input.approvedPhoneNumberId }
      : {}),
    ...(input.twilioMessagingServiceSid
      ? { twilioMessagingServiceSid: input.twilioMessagingServiceSid }
      : {}),
  });
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
      aiSmsReady: false,
      overagesBillable: false,
      monthlyChargeCents: 0,
      includedBusinessNumbers: 0,
      availableCheckoutPlans: ["pro"],
      availableCheckoutIntervals: {
        starter: [],
        pro: ["monthly"],
      },
      canPurchaseAiSmsAddon: false,
      hasCheckoutAccess: true,
    });
    expect(status.usage).toMatchObject({
      voiceSecondsIncluded: 1_800,
      alertSmsSegmentsIncluded: 10,
      outboundCallAttemptsIncluded: 2,
      voiceSecondsRemaining: 1_800,
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
      aiSmsReady: true,
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
      availableCheckoutIntervals: {
        starter: [],
        pro: ["monthly"],
      },
      hasCheckoutAccess: true,
      canPurchaseAiSmsAddon: false,
    });
    expect(proStatus).toMatchObject({
      availableCheckoutPlans: ["pro"],
      availableCheckoutIntervals: {
        starter: [],
        pro: ["monthly"],
      },
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
      availableCheckoutIntervals: {
        starter: [],
        pro: [],
      },
      hasCheckoutAccess: false,
      canPurchaseAiSmsAddon: false,
    });
  });

  it("enables the AI SMS add-on for eligible paid workspaces", async () => {
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID = "prod_ai_sms_setup";
    process.env.POLAR_PRO_AI_SMS_PRODUCT_ID = "prod_pro_ai_sms";
    process.env.POLAR_STARTER_MONTHLY_AI_SMS_PRODUCT_ID = "prod_starter_ai_sms";
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
      aiSmsReady: false,
      overagesBillable: true,
      monthlyChargeCents: 10_000,
      canPurchaseAiSmsAddon: true,
    });
    expect(beforePolicy).toMatchObject({
      allowed: false,
      senderRole: "business_ai",
      senderMode: "platform_phone",
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
      aiSmsReady: false,
      monthlyChargeCents: 10_500,
      canPurchaseAiSmsAddon: false,
    });
    expect(afterPolicy).toMatchObject({
      allowed: false,
      senderRole: "business_ai",
      senderMode: "platform_phone",
      errorCode: null,
    });

    const { authed: starterAuthed, businessId: starterBusinessId } =
      await seedWorkspace(t, {
        subject: "billing-starter-addon",
        deploymentMode: "cloud",
      });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId: starterBusinessId,
        currentPlan: "starter",
        billingInterval: "monthly",
        polarCustomerId: "cus_starter",
      });
    });

    const beforeStarterAddon = await starterAuthed.query(api.billing.getStatus, {
      businessId: starterBusinessId,
    });

    expect(beforeStarterAddon).toMatchObject({
      plan: "starter",
      aiSmsEnabled: false,
      canPurchaseAiSmsAddon: true,
    });

    await t.run(async (ctx: TestContext) => {
      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", starterBusinessId))
        .unique();

      if (!account) {
        throw new Error("Expected starter billing account to exist.");
      }

      await ctx.db.patch(account._id, {
        activeAddons: ["ai_sms"],
      });
    });

    const afterStarterAddon = await starterAuthed.query(api.billing.getStatus, {
      businessId: starterBusinessId,
    });
    const starterPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId: starterBusinessId,
      capability: "ai",
    });

    expect(afterStarterAddon).toMatchObject({
      plan: "starter",
      aiSmsEnabled: true,
      monthlyChargeCents: 3_500,
      canPurchaseAiSmsAddon: false,
    });
    expect(starterPolicy).toMatchObject({
      allowed: false,
      senderRole: "business_ai",
      senderMode: "platform_phone",
      errorCode: null,
    });
  });

  it("keeps hosted alerts on the platform sender while AI SMS compliance is pending", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-hosted-pending-compliance",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        activeAddons: ["ai_sms"],
      });
      const phoneNumberId = await seedBusinessPhoneNumber(ctx, {
        businessId,
        e164: "+14165550122",
        twilioPhoneSid: "PN-pending-compliance",
      });
      await seedSmsComplianceRegistration(ctx, {
        businessId,
        status: "pending_review",
        approvedPhoneNumberId: phoneNumberId,
      });
    });

    const alertPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "alert",
    });
    const aiPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "ai",
    });

    expect(alertPolicy).toMatchObject({
      allowed: true,
      senderRole: "platform_alert",
      senderMode: "platform_phone",
      complianceStatus: "pending_review",
      errorCode: null,
    });
    expect(aiPolicy).toMatchObject({
      allowed: false,
      senderRole: "business_ai",
      senderMode: "platform_phone",
      complianceStatus: "pending_review",
      errorCode: null,
    });
  });

  it("routes approved hosted AI SMS through the business messaging service", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-hosted-approved-compliance",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        activeAddons: ["ai_sms"],
      });
      const phoneNumberId = await seedBusinessPhoneNumber(ctx, {
        businessId,
        e164: "+14165550133",
        twilioPhoneSid: "PN-approved-compliance",
      });
      await seedSmsComplianceRegistration(ctx, {
        businessId,
        status: "approved",
        approvedPhoneNumberId: phoneNumberId,
        twilioMessagingServiceSid: "MG-approved-compliance",
      });
    });

    const alertPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "alert",
    });
    const aiPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "ai",
    });
    const status = await authed.query(api.billing.getStatus, { businessId });

    expect(alertPolicy).toMatchObject({
      allowed: true,
      senderRole: "platform_alert",
      senderMode: "business_messaging_service",
      fromPhoneNumber: "+14165550133",
      twilioMessagingServiceSid: "MG-approved-compliance",
      complianceStatus: "approved",
      errorCode: null,
    });
    expect(aiPolicy).toMatchObject({
      allowed: true,
      senderRole: "business_ai",
      senderMode: "business_messaging_service",
      fromPhoneNumber: "+14165550133",
      twilioMessagingServiceSid: "MG-approved-compliance",
      complianceStatus: "approved",
      errorCode: null,
    });
    expect(status).toMatchObject({
      aiSmsEnabled: true,
      aiSmsReady: true,
    });
  });

  it("falls back to the platform route when the approved business sender is no longer active", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-hosted-inactive-approved-sender",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        activeAddons: ["ai_sms"],
      });
      const approvedPhoneNumberId = await seedBusinessPhoneNumber(ctx, {
        businessId,
        e164: "+14165550134",
        twilioPhoneSid: "PN-inactive-approved-sender",
      });
      await seedBusinessPhoneNumber(ctx, {
        businessId,
        e164: "+14165550135",
        twilioPhoneSid: "PN-active-alternate-sender",
      });
      await seedSmsComplianceRegistration(ctx, {
        businessId,
        status: "approved",
        approvedPhoneNumberId,
        twilioMessagingServiceSid: "MG-inactive-approved-sender",
      });
      await ctx.db.patch(approvedPhoneNumberId, {
        status: "inactive",
      });
    });

    const alertPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "alert",
    });
    const aiPolicy = await t.query(internal.billing.getSmsCapabilityPolicy, {
      businessId,
      capability: "ai",
    });

    expect(alertPolicy).toMatchObject({
      allowed: true,
      senderRole: "platform_alert",
      senderMode: "platform_phone",
      complianceStatus: "approved",
      errorCode: null,
    });
    expect(alertPolicy.twilioMessagingServiceSid).toBeUndefined();
    expect(aiPolicy).toMatchObject({
      allowed: false,
      senderRole: "business_ai",
      senderMode: "platform_phone",
      complianceStatus: "approved",
      errorCode: null,
    });
    expect(aiPolicy.fromPhoneNumber).toBeUndefined();
    expect(aiPolicy.twilioMessagingServiceSid).toBeUndefined();
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
      alertSmsSegmentsIncluded: 200,
      alertSmsSegmentsRemaining: 195,
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
      voiceSecondsRemaining: 1_200,
      alertSmsSegmentsRemaining: 0,
      outboundCallAttemptsRemaining: 0,
      voiceBlocked: false,
      alertSmsBlocked: true,
      outboundCallAttemptsBlocked: true,
    });
    expect(alertPolicy).toMatchObject({
      allowed: false,
      senderRole: "platform_alert",
      senderMode: "platform_phone",
      errorCode: "alert_sms_limit_reached",
    });
    expect(voicePolicy).toEqual({
      allowed: true,
      errorCode: null,
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
      voiceSecondsUsed: 1_800,
      voiceBlocked: true,
    });
  });

  it("rejects a blocked voice call before creating contact or call records", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-voice-blocked-start",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await ctx.db.insert("billing_usage_months", {
        businessId,
        periodKey: "2026-04",
        planAtSnapshot: "free_cloud",
        voiceSecondsUsed: 1_800,
        voiceSecondsIncluded: 1_800,
        voiceBlocked: true,
        lastRecordedAt: "2026-04-12T14:00:00.000Z",
      });
    });

    await expect(
      t.mutation(internal.voice.runtime.startCall, {
        businessId,
        twilioCallSid: "CA-blocked-start",
        from: "+14165550123",
        to: "+14165550999",
        startedAt: "2026-04-12T14:00:30.000Z",
      }),
    ).rejects.toThrow("voice_limit_reached");

    const persistedState = await t.run(async (ctx: TestContext) => {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_business_id_and_phone", (q) =>
          q.eq("businessId", businessId).eq("phone", "+14165550123"),
        )
        .unique();
      const call = await ctx.db
        .query("calls")
        .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", "CA-blocked-start"))
        .unique();
      return { contact, call };
    });

    expect(persistedState).toEqual({
      contact: null,
      call: null,
    });
  });

  it("allows a duplicate active voice start after the initial free cloud reservation", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-voice-start-idempotent",
      deploymentMode: "cloud",
    });

    const initialStart = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-free-cloud-active-duplicate",
      from: "+14165550123",
      to: "+14165550999",
      startedAt: "2026-04-12T14:00:00.000Z",
    });
    const duplicateStart = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-free-cloud-active-duplicate",
      gatewaySessionId: "gateway-session-after-reservation",
      from: "+14165550123",
      to: "+14165550999",
      startedAt: "2026-04-12T14:00:01.000Z",
    });

    const persistedState = await t.run(async (ctx: TestContext) => {
      const call = await ctx.db.get(initialStart.callId);
      const usageMonth = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      const usageEvents = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q.eq("businessId", businessId).eq("sourceKey", `voice:${String(initialStart.callId)}`),
        )
        .collect();
      return { call, usageMonth, usageEvents };
    });

    expect(duplicateStart).toEqual({
      callId: initialStart.callId,
      conversationId: initialStart.conversationId,
      blocked: false,
      contactId: initialStart.contactId,
    });
    expect(persistedState.call).toMatchObject({
      status: "in_progress",
      gatewaySessionId: "gateway-session-after-reservation",
    });
    expect(persistedState.usageMonth).toMatchObject({
      voiceSecondsUsed: 1_800,
      voiceBlocked: true,
    });
    expect(persistedState.usageEvents).toHaveLength(1);
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
      voiceSecondsUsed: 1_800,
      voiceBlocked: true,
      lastRecordedAt: "2026-04-12T14:00:00.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      quantity: 1_800,
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

  it("exempts reserved voice calls under ten seconds from included usage", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-voice-short-call",
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
      quantity: 9,
      recordedAt: "2026-04-12T14:00:09.000Z",
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
      voiceSecondsUsed: 0,
      voiceBlocked: false,
      lastRecordedAt: "2026-04-12T14:00:09.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      quantity: 0,
      recordedAt: "2026-04-12T14:00:09.000Z",
    });
  });

  it("counts voice calls at the ten-second billing boundary", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-voice-ten-second-call",
      deploymentMode: "cloud",
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const usageResult = await t.mutation(internal.billing.recordVoiceUsage, {
      businessId,
      callId: anchors.callId,
      quantity: 10,
      recordedAt: "2026-04-12T14:00:10.000Z",
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
      voiceSecondsUsed: 10,
      voiceBlocked: false,
      lastRecordedAt: "2026-04-12T14:00:10.000Z",
    });
    expect(usageState.usageEvent).toMatchObject({
      quantity: 10,
      recordedAt: "2026-04-12T14:00:10.000Z",
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

  it("re-checks hosted alert SMS quota after a released notification retries", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-free-alert-retry-quota",
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
      await ctx.db.insert("billing_usage_months", {
        businessId,
        periodKey: "2026-04",
        planAtSnapshot: "free_cloud",
        alertSmsSegmentsUsed: 9,
        alertSmsSegmentsIncluded: 10,
        alertSmsBlocked: false,
        lastRecordedAt: "2026-04-12T14:00:00.000Z",
      });
      return { ...seeded, secondNotificationId };
    });

    const firstReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      estimatedSegments: 1,
      recordedAt: "2026-04-12T14:01:00.000Z",
    });
    await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      quantity: 0,
      recordedAt: "2026-04-12T14:01:30.000Z",
    });
    const secondReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.secondNotificationId,
      estimatedSegments: 1,
      recordedAt: "2026-04-12T14:02:00.000Z",
    });
    const retriedReservation = await t.mutation(internal.billing.reserveAlertSmsUsage, {
      businessId,
      notificationId: anchors.notificationId,
      estimatedSegments: 1,
      recordedAt: "2026-04-12T14:02:30.000Z",
    });

    expect(firstReservation).toMatchObject({
      allowed: true,
      errorCode: null,
    });
    expect(secondReservation).toMatchObject({
      allowed: true,
      errorCode: null,
    });
    expect(retriedReservation).toEqual({
      allowed: false,
      errorCode: "alert_sms_limit_reached",
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
      const phoneNumberId = await seedBusinessPhoneNumber(ctx, {
        businessId,
        e164: "+14165550144",
        twilioPhoneSid: "PN-pro-overages",
      });
      await seedSmsComplianceRegistration(ctx, {
        businessId,
        status: "approved",
        approvedPhoneNumberId: phoneNumberId,
        twilioMessagingServiceSid: "MG-pro-overages",
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
      voiceSecondsRemaining: 24_600,
      alertSmsSegmentsRemaining: 145,
      outboundCallAttemptsRemaining: 75,
      voiceBlocked: false,
      alertSmsBlocked: false,
      outboundCallAttemptsBlocked: false,
    });
    expect(alertPolicy).toMatchObject({
      allowed: true,
      senderRole: "platform_alert",
      senderMode: "business_messaging_service",
      twilioMessagingServiceSid: "MG-pro-overages",
      errorCode: null,
    });
    expect(aiPolicy).toMatchObject({
      allowed: true,
      senderRole: "business_ai",
      senderMode: "business_messaging_service",
      twilioMessagingServiceSid: "MG-pro-overages",
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

  it("sends zero metered voice quantity for Pro calls under ten seconds", async () => {
    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";

    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-pro-short-voice",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_short_voice",
      });
    });
    const anchors = await t.run(async (ctx: TestContext) => {
      return await seedUsageAnchors(ctx, { businessId });
    });

    const usageResult = await t.mutation(internal.billing.recordVoiceUsage, {
      businessId,
      callId: anchors.callId,
      quantity: 9,
      recordedAt: "2026-04-12T15:00:09.000Z",
    });
    const payload = await t.query(internal.billing.getUsageSyncPayload, {
      usageEventId: usageResult.usageEventId,
    });

    const usageEvent = await t.run(async (ctx: TestContext) => {
      return await ctx.db.get(usageResult.usageEventId);
    });

    expect(usageResult.syncNeeded).toBe(true);
    expect(usageEvent).toMatchObject({
      quantity: 0,
      syncStatus: "pending",
    });
    expect(payload).toMatchObject({
      usageKind: "voice_seconds",
      quantity: 0,
      polarQuantity: 0,
      sourceKey: `voice:${String(anchors.callId)}`,
    });
  });

  it("syncs only monthly overage usage to Polar for annual hosted plans", async () => {
    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";

    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-annual-monthly-overage",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "starter",
        billingInterval: "annual",
        polarCustomerId: "cus_annual_monthly_usage",
      });
    });

    const firstUsage = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      sourceKey: "alert_sms:annual:first",
      quantity: 40,
      recordedAt: "2026-04-12T15:00:00.000Z",
    });
    const secondUsage = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      sourceKey: "alert_sms:annual:second",
      quantity: 15,
      recordedAt: "2026-04-12T15:05:00.000Z",
    });

    const [firstPayload, secondPayload, state] = await Promise.all([
      t.query(internal.billing.getUsageSyncPayload, {
        usageEventId: firstUsage.usageEventId,
      }),
      t.query(internal.billing.getUsageSyncPayload, {
        usageEventId: secondUsage.usageEventId,
      }),
      t.run(async (ctx: TestContext) => {
        const usageMonth = await ctx.db
          .query("billing_usage_months")
          .withIndex("by_business_id_and_period_key", (q) =>
            q.eq("businessId", businessId).eq("periodKey", "2026-04"),
          )
          .unique();
        const firstEvent = await ctx.db.get(firstUsage.usageEventId);
        const secondEvent = await ctx.db.get(secondUsage.usageEventId);
        return { firstEvent, secondEvent, usageMonth };
      }),
    ]);

    expect(state.usageMonth).toMatchObject({
      alertSmsSegmentsUsed: 55,
      alertSmsSegmentsIncluded: 50,
      alertSmsSegmentsBillableUsed: 5,
    });
    expect(state.firstEvent).toMatchObject({
      billingIntervalAtRecordTime: "annual",
      billableQuantity: 0,
    });
    expect(state.secondEvent).toMatchObject({
      billingIntervalAtRecordTime: "annual",
      billableQuantity: 5,
    });
    expect(firstPayload).toMatchObject({
      quantity: 40,
      billableQuantity: 0,
      polarQuantity: 0,
    });
    expect(secondPayload).toMatchObject({
      quantity: 15,
      billableQuantity: 5,
      polarQuantity: 5,
    });
  });

  it("records negative annual billable adjustments when usage corrections reduce overage", async () => {
    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";

    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-annual-negative-adjustment",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "starter",
        billingInterval: "annual",
        polarCustomerId: "cus_annual_negative_adjustment",
      });
    });

    const firstUsage = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      sourceKey: "alert_sms:annual:correction:first",
      quantity: 60,
      recordedAt: "2026-04-12T15:00:00.000Z",
    });
    const secondUsage = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      sourceKey: "alert_sms:annual:correction:second",
      quantity: 10,
      recordedAt: "2026-04-12T15:05:00.000Z",
    });
    await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      sourceKey: "alert_sms:annual:correction:first",
      quantity: 40,
      recordedAt: "2026-04-12T15:10:00.000Z",
    });

    const [firstPayload, secondPayload, state] = await Promise.all([
      t.query(internal.billing.getUsageSyncPayload, {
        usageEventId: firstUsage.usageEventId,
      }),
      t.query(internal.billing.getUsageSyncPayload, {
        usageEventId: secondUsage.usageEventId,
      }),
      t.run(async (ctx: TestContext) => {
        const usageMonth = await ctx.db
          .query("billing_usage_months")
          .withIndex("by_business_id_and_period_key", (q) =>
            q.eq("businessId", businessId).eq("periodKey", "2026-04"),
          )
          .unique();
        const firstEvent = await ctx.db.get(firstUsage.usageEventId);
        const secondEvent = await ctx.db.get(secondUsage.usageEventId);
        return { firstEvent, secondEvent, usageMonth };
      }),
    ]);

    expect(state.usageMonth).toMatchObject({
      alertSmsSegmentsUsed: 50,
      alertSmsSegmentsBillableUsed: 0,
    });
    expect(state.firstEvent).toMatchObject({
      quantity: 40,
      billableQuantity: -10,
    });
    expect(state.secondEvent).toMatchObject({
      quantity: 10,
      billableQuantity: 10,
    });
    expect(firstPayload).toMatchObject({
      quantity: 40,
      billableQuantity: -10,
      polarQuantity: -10,
    });
    expect(secondPayload).toMatchObject({
      quantity: 10,
      billableQuantity: 10,
      polarQuantity: 10,
    });
  });

  it("keeps syncing full usage to Polar for monthly hosted plans", async () => {
    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";

    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-monthly-credit-offset",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "starter",
        billingInterval: "monthly",
        polarCustomerId: "cus_monthly_usage",
      });
    });

    const usage = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      sourceKey: "alert_sms:monthly:first",
      quantity: 15,
      recordedAt: "2026-04-12T15:00:00.000Z",
    });
    const payload = await t.query(internal.billing.getUsageSyncPayload, {
      usageEventId: usage.usageEventId,
    });

    expect(payload).toMatchObject({
      quantity: 15,
      billableQuantity: 15,
      polarQuantity: 15,
    });
  });

  it("resets stale annual billable quantities when an event is re-recorded on a monthly plan", async () => {
    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";

    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-monthly-rerecord-clears-annual-billable",
      deploymentMode: "cloud",
    });

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "starter",
        billingInterval: "annual",
        polarCustomerId: "cus_rerecord_interval",
      });
    });

    const firstUsage = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      sourceKey: "alert_sms:rerecord:first",
      quantity: 55,
      recordedAt: "2026-04-12T15:00:00.000Z",
    });

    await t.run(async (ctx: TestContext) => {
      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
      if (!account) {
        throw new Error("Missing seeded billing account.");
      }
      await ctx.db.patch(account._id, {
        billingInterval: "monthly",
      });
    });

    const updatedUsage = await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId,
      sourceKey: "alert_sms:rerecord:first",
      quantity: 55,
      recordedAt: "2026-04-12T15:00:00.000Z",
    });
    const payload = await t.query(internal.billing.getUsageSyncPayload, {
      usageEventId: updatedUsage.usageEventId,
    });
    const { usageEvent, usageMonth } = await t.run(async (ctx: TestContext) => {
      const usageEvent = await ctx.db.get(firstUsage.usageEventId);
      const usageMonth = await ctx.db
        .query("billing_usage_months")
        .withIndex("by_business_id_and_period_key", (q) =>
          q.eq("businessId", businessId).eq("periodKey", "2026-04"),
        )
        .unique();
      return { usageEvent, usageMonth };
    });

    expect(updatedUsage.usageEventId).toBe(firstUsage.usageEventId);
    expect(usageEvent).toMatchObject({
      billingIntervalAtRecordTime: "monthly",
      billableQuantity: 55,
    });
    expect(usageMonth).toMatchObject({
      alertSmsSegmentsUsed: 55,
      alertSmsSegmentsBillableUsed: 0,
    });
    expect(payload).toMatchObject({
      quantity: 55,
      billableQuantity: 55,
      polarQuantity: 55,
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
    expect(enqueuePostHogProviderExceptionBestEffortMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "polar",
        error: expect.any(Error),
        operation: "polar_usage_event_ingest",
        businessId,
        distinctId: `system:business:${String(businessId)}`,
        groupKey: `business:${String(businessId)}`,
        properties: expect.objectContaining({
          usageKind: "voice_seconds",
          quantity: 61,
          attemptNumber: 1,
          retryScheduled: true,
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

  it("reuses an existing Polar customer when checkout email already exists", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-existing",
      deploymentMode: "cloud",
    });
    const billingKey = getBillingKey(businessId);
    const duplicateEmailError = Object.assign(
      new Error("A customer with this email address already exists."),
      {
        detail: [
          {
            loc: ["body", "email"],
            msg: "A customer with this email address already exists.",
            type: "value_error",
            input: "billing-existing@example.com",
          },
        ],
      },
    );

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.SITE_URL = "https://app.example.com";

    polarCustomersCreateMock.mockRejectedValueOnce(duplicateEmailError);
    polarCustomersListMock.mockResolvedValueOnce({
      result: {
        items: [
          {
            id: "cus_existing",
            externalId: null,
            email: "billing-existing@example.com",
            type: "team",
            name: "Existing Customer",
          },
        ],
      },
    });
    polarCustomersUpdateMock.mockResolvedValueOnce({
      id: "cus_existing",
      externalId: billingKey,
      email: "billing-existing@example.com",
      type: "team",
      name: "Billing Owner",
    });
    polarCheckoutsCreateMock.mockResolvedValueOnce({
      id: "checkout_existing",
      url: "https://polar.sh/checkout/existing",
    });

    const result = await authed.action(api.billing.startCheckout, {
      businessId,
      target: "pro",
    });

    expect(result.url).toBe("https://polar.sh/checkout/existing");
    expect(polarCustomersListMock).toHaveBeenCalledWith({
      email: "billing-existing@example.com",
      limit: 1,
    });
    expect(polarCustomersUpdateMock).toHaveBeenCalledWith({
      id: "cus_existing",
      customerUpdate: {
        externalId: billingKey,
        type: "team",
        name: "Billing Owner",
      },
    });
    expect(polarCheckoutsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_existing",
        products: ["prod_pro"],
        successUrl:
          "https://app.example.com/settings/plan?checkout=success&checkout_target=pro&billing_interval=monthly",
        returnUrl: "https://app.example.com/settings/plan",
        embedOrigin: "https://app.example.com",
        metadata: expect.objectContaining({
          billingKey,
          businessId: String(businessId),
          checkoutTarget: "pro",
          billingInterval: "monthly",
        }),
      }),
    );

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.polarCustomerId).toBe("cus_existing");
    expect(account?.polarCustomerExternalId).toBe(billingKey);

    const status = await authed.query(api.billing.getStatus, { businessId });
    expect(status.hasCustomerPortalAccess).toBe(false);
    await expect(
      authed.action(api.billing.openPortal, {
        businessId,
      }),
    ).rejects.toThrow("A paid subscription is required before opening the customer portal.");
  });

  it("applies the configured referral discount for eligible referred checkout", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-referred-checkout",
      deploymentMode: "cloud",
      onboardingStage: "plan",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_REFERRAL_DISCOUNT_ID = "discount_referral_5";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      const affiliateUserId = await ctx.db.insert("users", {
        authSubject: "affiliate-referrer",
        email: "affiliate@example.com",
        displayName: "Affiliate Partner",
      });
      await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "partner-code",
        status: "active",
        createdAt: "2026-04-15T12:00:00.000Z",
        updatedAt: "2026-04-15T12:00:00.000Z",
      });
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "free_cloud",
        polarCustomerId: "cus_referred",
      });
    });

    polarCheckoutsCreateMock.mockResolvedValueOnce({
      id: "checkout_referred",
      url: "https://polar.sh/checkout/referred",
    });

    const result = await authed.action(api.billing.startCheckout, {
      businessId,
      target: "pro",
      referralCode: "Partner Code",
      source: "onboarding",
    });

    expect(result.url).toBe("https://polar.sh/checkout/referred");
    expect(polarCheckoutsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_referred",
        products: ["prod_pro"],
        discountId: "discount_referral_5",
        allowDiscountCodes: false,
        metadata: expect.objectContaining({
          businessId: String(businessId),
          checkoutTarget: "pro",
          referralCode: "partner-code",
          referralDiscountPercent: 5,
        }),
      }),
    );
    const attribution = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("affiliate_attributions")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(attribution).toMatchObject({
      businessId,
      referralCode: "partner-code",
    });
  });

  it("applies the referral discount for attributed free customers who upgrade later", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId, userId } = await seedWorkspace(t, {
      subject: "billing-attributed-upgrade",
      deploymentMode: "cloud",
      onboardingStage: "completed",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_REFERRAL_DISCOUNT_ID = "discount_referral_5";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      const affiliateUserId = await ctx.db.insert("users", {
        authSubject: "affiliate-existing-referrer",
        email: "existing-affiliate@example.com",
        displayName: "Existing Affiliate",
      });
      const affiliateProfileId = await ctx.db.insert("affiliate_profiles", {
        userId: affiliateUserId,
        referralCode: "existing-partner",
        status: "active",
        createdAt: "2026-04-15T12:00:00.000Z",
        updatedAt: "2026-04-15T12:00:00.000Z",
      });
      await ctx.db.insert("affiliate_attributions", {
        affiliateProfileId,
        businessId,
        referredUserId: userId,
        referralCode: "existing-partner",
        source: "via",
        attributedAt: "2026-04-15T12:00:00.000Z",
      });
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "free_cloud",
        polarCustomerId: "cus_attributed_upgrade",
      });
    });

    polarCheckoutsCreateMock.mockResolvedValueOnce({
      id: "checkout_attributed_upgrade",
      url: "https://polar.sh/checkout/attributed-upgrade",
    });

    await authed.action(api.billing.startCheckout, {
      businessId,
      target: "pro",
      referralCode: "stale-later-click",
    });

    expect(polarCheckoutsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        discountId: "discount_referral_5",
        metadata: expect.objectContaining({
          referralCode: "existing-partner",
          referralDiscountPercent: 5,
        }),
      }),
    );
  });

  it("updates the existing Starter subscription when upgrading to Pro", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-starter-to-pro-upgrade",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_ANNUAL_PRODUCT_ID = "prod_pro_annual";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "starter",
        billingInterval: "monthly",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_starter",
        proSubscriptionProductId: "prod_starter_monthly",
      });
    });

    polarSubscriptionsUpdateMock.mockResolvedValueOnce({
      id: "sub_starter",
      customerId: "cus_expected",
      productId: "prod_pro_annual",
      prices: [{ id: "price_pro_annual" }],
      status: "active",
      currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-15T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      checkoutId: null,
      customer: {
        externalId: getBillingKey(businessId),
        email: "billing-starter-to-pro-upgrade@example.com",
        name: "Billing Owner",
      },
      metadata: {},
    });

    const result = await authed.action(api.billing.startCheckout, {
      businessId,
      target: "pro",
      billingInterval: "annual",
    });

    expect(result.url).toBe("https://app.example.com/settings/plan");
    expect(polarSubscriptionsUpdateMock).toHaveBeenCalledWith({
      id: "sub_starter",
      subscriptionUpdate: {
        productId: "prod_pro_annual",
        prorationBehavior: "prorate",
      },
    });
    expect(polarCheckoutsCreateMock).not.toHaveBeenCalled();

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("pro");
    expect(account?.billingInterval).toBe("annual");
    expect(account?.proSubscriptionId).toBe("sub_starter");
    expect(account?.proSubscriptionProductId).toBe("prod_pro_annual");
    expect(account?.proSubscriptionPriceId).toBe("price_pro_annual");
  });

  it("preserves AI SMS when upgrading an existing Starter subscription to Pro", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-starter-ai-sms-to-pro-upgrade",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_ANNUAL_PRODUCT_ID = "prod_pro_annual";
    process.env.POLAR_PRO_ANNUAL_AI_SMS_PRODUCT_ID = "prod_pro_annual_ai_sms";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "starter",
        activeAddons: ["ai_sms"],
        billingInterval: "monthly",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_starter",
        proSubscriptionProductId: "prod_starter_ai_sms",
      });
    });

    polarSubscriptionsUpdateMock.mockResolvedValueOnce({
      id: "sub_starter",
      customerId: "cus_expected",
      productId: "prod_pro_annual_ai_sms",
      prices: [{ id: "price_pro_annual_ai_sms" }],
      status: "active",
      currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-15T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      checkoutId: null,
      customer: {
        externalId: getBillingKey(businessId),
        email: "billing-starter-ai-sms-to-pro-upgrade@example.com",
        name: "Billing Owner",
      },
      metadata: {},
    });

    const result = await authed.action(api.billing.startCheckout, {
      businessId,
      target: "pro",
      billingInterval: "annual",
    });

    expect(result.url).toBe("https://app.example.com/settings/plan");
    expect(polarSubscriptionsUpdateMock).toHaveBeenCalledWith({
      id: "sub_starter",
      subscriptionUpdate: {
        productId: "prod_pro_annual_ai_sms",
        prorationBehavior: "prorate",
      },
    });
    expect(polarCheckoutsCreateMock).not.toHaveBeenCalled();

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("pro");
    expect(account?.billingInterval).toBe("annual");
    expect(account?.activeAddons).toEqual(["ai_sms"]);
    expect(account?.proSubscriptionId).toBe("sub_starter");
    expect(account?.proSubscriptionProductId).toBe("prod_pro_annual_ai_sms");
    expect(account?.proSubscriptionPriceId).toBe("price_pro_annual_ai_sms");
  });

  it("does not create Pro checkout for a Starter account without a stored subscription", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-starter-missing-subscription",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_MONTHLY_PRODUCT_ID = "prod_pro_monthly";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "starter",
        billingInterval: "monthly",
        polarCustomerId: "cus_expected",
      });
    });

    await expect(
      authed.action(api.billing.startCheckout, {
        businessId,
        target: "pro",
      }),
    ).rejects.toThrow("An active Starter subscription is required before upgrading to Pro.");
    expect(polarSubscriptionsUpdateMock).not.toHaveBeenCalled();
    expect(polarCheckoutsCreateMock).not.toHaveBeenCalled();
  });

  it("starts AI SMS checkout with the one-time setup product", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-ai-sms-checkout-bundle",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID = "prod_ai_sms_setup";
    process.env.POLAR_PRO_AI_SMS_PRODUCT_ID = "prod_pro_ai_sms";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_ai_sms",
      });
    });

    polarCheckoutsCreateMock.mockResolvedValueOnce({
      id: "checkout_ai_sms",
      url: "https://polar.sh/checkout/ai-sms",
    });

    const result = await authed.action(api.billing.startCheckout, {
      businessId,
      target: "ai_sms",
    });

    expect(result.url).toBe("https://polar.sh/checkout/ai-sms");
    expect(polarCheckoutsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_ai_sms",
        products: ["prod_ai_sms_setup"],
        successUrl:
          "https://app.example.com/settings/plan?checkout=success&checkout_target=ai_sms",
        returnUrl: "https://app.example.com/settings/plan",
        embedOrigin: "https://app.example.com",
        metadata: expect.objectContaining({
          businessId: String(businessId),
          checkoutTarget: "ai_sms",
        }),
      }),
    );
  });

  it("rejects duplicate-email Polar customers linked to another billing key", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-customer-linked-elsewhere",
      deploymentMode: "cloud",
    });
    const staleBillingKey = "business:stale_business";
    const duplicateEmailError = Object.assign(
      new Error("A customer with this email address already exists."),
      {
        detail: [
          {
            loc: ["body", "email"],
            msg: "A customer with this email address already exists.",
            type: "value_error",
            input: "billing-customer-linked-elsewhere@example.com",
          },
        ],
      },
    );

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.SITE_URL = "https://app.example.com";

    polarCustomersCreateMock.mockRejectedValueOnce(duplicateEmailError);
    polarCustomersListMock.mockResolvedValueOnce({
      result: {
        items: [
          {
            id: "cus_existing",
            externalId: staleBillingKey,
            email: "billing-customer-linked-elsewhere@example.com",
            type: "team",
            name: "Existing Customer",
          },
        ],
      },
    });

    await expect(
      authed.action(api.billing.startCheckout, {
        businessId,
        target: "pro",
      }),
    ).rejects.toThrow("A customer with this email address already exists.");
    expect(polarCustomersUpdateMock).not.toHaveBeenCalled();
    expect(polarCheckoutsCreateMock).not.toHaveBeenCalled();

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account).toBeNull();
  });

  it("does not sync customer-session subscriptions for a different Polar customer", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-session-token-mismatch",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "free_cloud",
        polarCustomerId: "cus_expected",
      });
    });

    polarCustomerPortalSubscriptionsListMock.mockReturnValueOnce(
      polarListPages([
        [
          {
            id: "sub_other",
            customerId: "cus_other",
            productId: "prod_pro",
            prices: [{ id: "price_pro" }],
            status: "active",
            currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-05-15T00:00:00.000Z"),
            cancelAtPeriodEnd: false,
            checkoutId: "checkout_other",
            customer: {
              externalId: "business:other_business",
              email: "other@example.com",
              name: "Other Customer",
            },
            metadata: {},
          },
        ],
      ]),
    );

    const result = await authed.action(api.billing.refreshCheckoutStatus, {
      businessId,
      customerSessionToken: "polar_cst_wrong_customer",
    });

    expect(result).toEqual({
      synced: false,
      subscriptionId: null,
    });
    expect(polarCustomerPortalSubscriptionsListMock).toHaveBeenCalledWith(
      { customerSession: "polar_cst_wrong_customer" },
      {
        active: true,
        limit: 10,
      },
    );

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("free_cloud");
    expect(account?.proSubscriptionId).toBeUndefined();
  });

  it("prefers Polar customer external ID over stale subscription metadata", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-stale-subscription-metadata",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "free_cloud",
        polarCustomerId: "cus_expected",
      });
    });

    polarCustomerPortalSubscriptionsListMock.mockReturnValueOnce(
      polarListPages([
        [
          {
            id: "sub_stale_metadata",
            customerId: "cus_expected",
            productId: "prod_pro",
            prices: [{ id: "price_pro" }],
            status: "active",
            currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-05-15T00:00:00.000Z"),
            cancelAtPeriodEnd: false,
            checkoutId: "checkout_stale_metadata",
            customer: {
              externalId: "business:canonical_customer_business",
              email: "canonical@example.com",
              name: "Canonical Customer",
            },
            metadata: {
              billingKey: getBillingKey(businessId),
              businessId: String(businessId),
            },
          },
        ],
      ]),
    );

    await expect(
      authed.action(api.billing.refreshCheckoutStatus, {
        businessId,
        customerSessionToken: "polar_cst_stale_metadata",
      }),
    ).rejects.toThrow("Polar subscription belongs to a different business.");

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("free_cloud");
    expect(account?.proSubscriptionId).toBeUndefined();
  });

  it("uses customer-session subscriptions instead of stale checkout subscription ids", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-stale-checkout-return",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "free_cloud",
        polarCustomerId: "cus_expected",
      });
      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
      if (!account) {
        throw new Error("Expected billing account.");
      }
      await ctx.db.patch(account._id, {
        checkoutId: "checkout_old",
      });
    });

    polarCustomerPortalSubscriptionsListMock.mockReturnValueOnce(
      polarListPages([
        [
          {
            id: "sub_new",
            customerId: "cus_expected",
            productId: "prod_pro",
            prices: [{ id: "price_pro" }],
            status: "active",
            currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-05-15T00:00:00.000Z"),
            cancelAtPeriodEnd: false,
            checkoutId: "checkout_new",
            customer: {
              externalId: getBillingKey(businessId),
              email: "billing-stale-checkout-return@example.com",
              name: "Billing Owner",
            },
            metadata: {},
          },
        ],
      ]),
    );

    const result = await authed.action(api.billing.refreshCheckoutStatus, {
      businessId,
      customerSessionToken: "polar_cst_active_return",
      target: "pro",
    });

    expect(result).toEqual({
      synced: true,
      subscriptionId: "sub_new",
    });
    expect(polarCheckoutsGetMock).not.toHaveBeenCalled();
    expect(polarSubscriptionsGetMock).not.toHaveBeenCalled();
    expect(polarCustomerPortalSubscriptionsListMock).toHaveBeenCalledWith(
      { customerSession: "polar_cst_active_return" },
      {
        active: true,
        productId: "prod_pro",
        limit: 10,
      },
    );

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("pro");
    expect(account?.proSubscriptionId).toBe("sub_new");
    expect(account?.checkoutId).toBe("checkout_new");
  });

  it("ignores inactive hosted plan webhooks for replaced subscriptions", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-stale-inactive-subscription-webhook",
      deploymentMode: "cloud",
    });

    process.env.POLAR_STARTER_MONTHLY_PRODUCT_ID = "prod_starter_monthly";
    process.env.POLAR_PRO_MONTHLY_PRODUCT_ID = "prod_pro_monthly";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        billingInterval: "monthly",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_current_pro",
        proSubscriptionProductId: "prod_pro_monthly",
      });
    });

    await t.mutation(internal.billing.syncSubscriptionFromWebhook, {
      businessId,
      billingKey: getBillingKey(businessId),
      polarCustomerId: "cus_expected",
      polarCustomerExternalId: getBillingKey(businessId),
      billingContactEmail: "owner@example.com",
      billingContactName: "Billing Owner",
      subscriptionId: "sub_old_starter",
      subscriptionProductId: "prod_starter_monthly",
      subscriptionPriceId: "price_old_starter",
      subscriptionState: "canceled",
      currentPeriodStart: "2026-03-15T00:00:00.000Z",
      currentPeriodEnd: "2026-04-15T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      lastWebhookEventType: "subscription.canceled",
      lastSyncedAt: "2026-04-15T12:00:00.000Z",
    });

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });

    expect(account?.currentPlan).toBe("pro");
    expect(account?.billingInterval).toBe("monthly");
    expect(account?.subscriptionState).toBe("active");
    expect(account?.proSubscriptionId).toBe("sub_current_pro");
    expect(account?.proSubscriptionProductId).toBe("prod_pro_monthly");
  });

  it("clears the billing interval when the current paid subscription becomes inactive", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-current-inactive-subscription-webhook",
      deploymentMode: "cloud",
    });

    process.env.POLAR_PRO_ANNUAL_PRODUCT_ID = "prod_pro_annual";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        billingInterval: "annual",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_current_pro",
        proSubscriptionProductId: "prod_pro_annual",
      });
    });

    await t.mutation(internal.billing.syncSubscriptionFromWebhook, {
      businessId,
      billingKey: getBillingKey(businessId),
      polarCustomerId: "cus_expected",
      polarCustomerExternalId: getBillingKey(businessId),
      billingContactEmail: "owner@example.com",
      billingContactName: "Billing Owner",
      subscriptionId: "sub_current_pro",
      subscriptionProductId: "prod_pro_annual",
      subscriptionPriceId: "price_pro_annual",
      subscriptionState: "canceled",
      currentPeriodStart: "2026-03-15T00:00:00.000Z",
      currentPeriodEnd: "2026-04-15T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      lastWebhookEventType: "subscription.canceled",
      lastSyncedAt: "2026-04-15T12:00:00.000Z",
    });

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });

    expect(account?.currentPlan).toBe("free_cloud");
    expect(account?.billingInterval).toBeUndefined();
    expect(account?.subscriptionState).toBe("canceled");

    const status = await authed.query(api.billing.getStatus, { businessId });
    expect(status.plan).toBe("free_cloud");
    expect(status.billingInterval).toBeNull();
    expect(status.monthlyChargeCents).toBe(0);
    expect(status.billingPeriodChargeCents).toBe(0);
  });

  it("does not sync an unscoped customer-session token into a fresh workspace", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-unscoped-session-token",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";

    const result = await authed.action(api.billing.refreshCheckoutStatus, {
      businessId,
      customerSessionToken: "polar_cst_unscoped",
    });

    expect(result).toEqual({
      synced: false,
      subscriptionId: null,
    });
    expect(polarCustomerPortalSubscriptionsListMock).not.toHaveBeenCalled();

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account).toBeNull();
  });

  it("uses checkout target metadata when reconciling upgraded AI SMS subscriptions", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-ai-sms-session-token",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_PRO_AI_SMS_PRODUCT_ID = "prod_pro_ai_sms";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_pro",
      });
      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
      if (!account) {
        throw new Error("Expected billing account.");
      }
      await ctx.db.patch(account._id, {
        checkoutId: "checkout_ai_sms",
      });
    });

    polarCheckoutsGetMock.mockResolvedValueOnce({
      id: "checkout_ai_sms",
      customerId: "cus_expected",
      subscriptionId: null,
      metadata: {
        checkoutTarget: "ai_sms",
        businessId: String(businessId),
        billingKey: getBillingKey(businessId),
      },
    });
    polarCustomerPortalSubscriptionsListMock.mockReturnValueOnce(
      polarListPages([
        [
          {
            id: "sub_ai_sms",
            customerId: "cus_expected",
            productId: "prod_pro_ai_sms",
            prices: [{ id: "price_ai_sms" }],
            status: "active",
            currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-05-15T00:00:00.000Z"),
            cancelAtPeriodEnd: false,
            checkoutId: "checkout_ai_sms",
            customer: {
              externalId: getBillingKey(businessId),
              email: "billing-ai-sms-session-token@example.com",
              name: "Billing Owner",
            },
            metadata: {},
          },
        ],
      ]),
    );

    const result = await authed.action(api.billing.refreshCheckoutStatus, {
      businessId,
      customerSessionToken: "polar_cst_ai_sms",
    });

    expect(result).toEqual({
      synced: true,
      subscriptionId: "sub_ai_sms",
    });
    expect(polarCustomerPortalSubscriptionsListMock).toHaveBeenCalledWith(
      { customerSession: "polar_cst_ai_sms" },
      {
        active: true,
        productId: "prod_pro_ai_sms",
        limit: 10,
      },
    );

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("pro");
    expect(account?.activeAddons).toEqual(["ai_sms"]);
    expect(account?.proSubscriptionId).toBe("sub_ai_sms");
    expect(account?.proSubscriptionProductId).toBe("prod_pro_ai_sms");
    expect(account?.aiSmsSubscriptionId).toBeUndefined();
  });

  it("updates the existing Pro subscription after the AI SMS setup payment is confirmed", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-ai-sms-setup-upgrade",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_PRO_AI_SMS_PRODUCT_ID = "prod_pro_ai_sms";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_pro",
        proSubscriptionProductId: "prod_pro",
      });
    });

    polarSubscriptionsUpdateMock.mockResolvedValueOnce({
      id: "sub_pro",
      customerId: "cus_expected",
      productId: "prod_pro_ai_sms",
      prices: [{ id: "price_pro_ai_sms" }],
      status: "active",
      currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-15T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      checkoutId: null,
      customer: {
        externalId: getBillingKey(businessId),
        email: "billing-ai-sms-setup-upgrade@example.com",
        name: "Billing Owner",
      },
      metadata: {},
    });

    const upgraded = await t.action(
      internal.billing.upgradeAiSmsSubscriptionAfterSetupPayment,
      { businessId },
    );

    expect(upgraded).toBe(true);
    expect(polarSubscriptionsUpdateMock).toHaveBeenCalledWith({
      id: "sub_pro",
      subscriptionUpdate: {
        productId: "prod_pro_ai_sms",
        prorationBehavior: "prorate",
      },
    });

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("pro");
    expect(account?.activeAddons).toEqual(["ai_sms"]);
    expect(account?.proSubscriptionId).toBe("sub_pro");
    expect(account?.proSubscriptionProductId).toBe("prod_pro_ai_sms");
    expect(account?.proSubscriptionPriceId).toBe("price_pro_ai_sms");
    expect(account?.aiSmsSubscriptionId).toBeUndefined();
  });

  it("updates an existing Starter subscription after the AI SMS setup payment is confirmed", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-starter-ai-sms-setup-upgrade",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_STARTER_MONTHLY_PRODUCT_ID = "prod_starter_monthly";
    process.env.POLAR_STARTER_MONTHLY_AI_SMS_PRODUCT_ID = "prod_starter_ai_sms";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "starter",
        billingInterval: "monthly",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_starter",
        proSubscriptionProductId: "prod_starter_monthly",
      });
    });

    polarSubscriptionsUpdateMock.mockResolvedValueOnce({
      id: "sub_starter",
      customerId: "cus_expected",
      productId: "prod_starter_ai_sms",
      prices: [{ id: "price_starter_ai_sms" }],
      status: "active",
      currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-15T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      checkoutId: null,
      customer: {
        externalId: getBillingKey(businessId),
        email: "billing-starter-ai-sms-setup-upgrade@example.com",
        name: "Billing Owner",
      },
      metadata: {},
    });

    const upgraded = await t.action(
      internal.billing.upgradeAiSmsSubscriptionAfterSetupPayment,
      { businessId },
    );

    expect(upgraded).toBe(true);
    expect(polarSubscriptionsUpdateMock).toHaveBeenCalledWith({
      id: "sub_starter",
      subscriptionUpdate: {
        productId: "prod_starter_ai_sms",
        prorationBehavior: "prorate",
      },
    });

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("starter");
    expect(account?.billingInterval).toBe("monthly");
    expect(account?.activeAddons).toEqual(["ai_sms"]);
    expect(account?.proSubscriptionId).toBe("sub_starter");
    expect(account?.proSubscriptionProductId).toBe("prod_starter_ai_sms");
    expect(account?.proSubscriptionPriceId).toBe("price_starter_ai_sms");
  });

  it("preserves annual Pro billing when AI SMS setup upgrades the subscription", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-annual-pro-ai-sms-setup-upgrade",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_ANNUAL_PRODUCT_ID = "prod_pro_annual";
    process.env.POLAR_PRO_ANNUAL_AI_SMS_PRODUCT_ID = "prod_pro_annual_ai_sms";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        billingInterval: "annual",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_pro_annual",
        proSubscriptionProductId: "prod_pro_annual",
      });
    });

    polarSubscriptionsUpdateMock.mockResolvedValueOnce({
      id: "sub_pro_annual",
      customerId: "cus_expected",
      productId: "prod_pro_annual_ai_sms",
      prices: [{ id: "price_pro_annual_ai_sms" }],
      status: "active",
      currentPeriodStart: new Date("2026-04-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2027-04-15T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      checkoutId: null,
      customer: {
        externalId: getBillingKey(businessId),
        email: "billing-annual-pro-ai-sms-setup-upgrade@example.com",
        name: "Billing Owner",
      },
      metadata: {},
    });

    const upgraded = await t.action(
      internal.billing.upgradeAiSmsSubscriptionAfterSetupPayment,
      { businessId },
    );

    expect(upgraded).toBe(true);
    expect(polarSubscriptionsUpdateMock).toHaveBeenCalledWith({
      id: "sub_pro_annual",
      subscriptionUpdate: {
        productId: "prod_pro_annual_ai_sms",
        prorationBehavior: "prorate",
      },
    });

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("pro");
    expect(account?.billingInterval).toBe("annual");
    expect(account?.activeAddons).toEqual(["ai_sms"]);
    expect(account?.proSubscriptionId).toBe("sub_pro_annual");
    expect(account?.proSubscriptionProductId).toBe("prod_pro_annual_ai_sms");
    expect(account?.proSubscriptionPriceId).toBe("price_pro_annual_ai_sms");
  });

  it("syncs the AI SMS upgrade when the Polar SDK rejects a successful update response", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { businessId } = await seedWorkspace(t, {
      subject: "billing-ai-sms-setup-response-validation",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_PRO_AI_SMS_PRODUCT_ID = "prod_pro_ai_sms";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_expected",
        proSubscriptionId: "sub_pro",
        proSubscriptionProductId: "prod_pro",
      });
    });

    polarSubscriptionsUpdateMock.mockRejectedValueOnce({
      name: "ResponseValidationError",
      message: "Response validation failed",
      statusCode: 200,
      pretty: () => "Response validation failed",
      rawValue: {
        id: "sub_pro",
        customer_id: "cus_expected",
        product_id: "prod_pro_ai_sms",
        prices: [{ id: "price_pro_ai_sms" }],
        status: "active",
        current_period_start: "2026-04-15T00:00:00.000Z",
        current_period_end: "2026-05-15T00:00:00.000Z",
        cancel_at_period_end: false,
        checkout_id: null,
        customer: {
          external_id: getBillingKey(businessId),
          email: "billing-ai-sms-setup-response-validation@example.com",
          name: "Billing Owner",
        },
        metadata: {},
      },
    });

    const upgraded = await t.action(
      internal.billing.upgradeAiSmsSubscriptionAfterSetupPayment,
      { businessId },
    );

    expect(upgraded).toBe(true);

    const account = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(account?.currentPlan).toBe("pro");
    expect(account?.activeAddons).toEqual(["ai_sms"]);
    expect(account?.proSubscriptionId).toBe("sub_pro");
    expect(account?.proSubscriptionProductId).toBe("prod_pro_ai_sms");
    expect(account?.proSubscriptionPriceId).toBe("price_pro_ai_sms");
    expect(account?.aiSmsSubscriptionId).toBeUndefined();
  });

  it("preserves portal access for legacy paid Polar accounts without subscription ids", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-legacy-paid-portal",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_legacy",
      });
    });

    const status = await authed.query(api.billing.getStatus, { businessId });
    expect(status.hasCustomerPortalAccess).toBe(true);

    polarMembersListMock.mockResolvedValueOnce(
      polarListPages([
        [
          {
            id: "mem_legacy_owner",
            customerId: "cus_legacy",
            email: "billing-legacy-paid-portal@example.com",
            name: "Billing Owner",
            externalId: null,
            role: "owner",
          },
        ],
      ]),
    );
    polarCustomerSessionsCreateMock.mockResolvedValueOnce({
      customerPortalUrl: "https://polar.sh/customer-portal/session",
    });

    const portal = await authed.action(api.billing.openPortal, { businessId });
    expect(portal.url).toBe("https://polar.sh/customer-portal/session");
    expect(polarMembersListMock).toHaveBeenCalledWith({
      customerId: "cus_legacy",
      limit: 100,
    });
    expect(polarCustomerSessionsCreateMock).toHaveBeenCalledWith({
      customerId: "cus_legacy",
      memberId: "mem_legacy_owner",
      returnUrl: "https://app.example.com/settings/plan",
    });
  });

  it("creates a Polar billing member before opening the customer portal", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId, userId } = await seedWorkspace(t, {
      subject: "billing-created-portal-member",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_created_member",
      });
    });

    polarMembersListMock.mockResolvedValueOnce(polarListPages([[]]));
    polarMembersCreateMock.mockResolvedValueOnce({
      id: "mem_created",
      customerId: "cus_created_member",
      email: "billing-created-portal-member@example.com",
      name: "Billing Owner",
      externalId: String(userId),
      role: "billing_manager",
    });
    polarCustomerSessionsCreateMock.mockResolvedValueOnce({
      customerPortalUrl: "https://polar.sh/customer-portal/session-created",
    });

    const portal = await authed.action(api.billing.openPortal, { businessId });

    expect(portal.url).toBe("https://polar.sh/customer-portal/session-created");
    expect(polarMembersCreateMock).toHaveBeenCalledWith({
      customerId: "cus_created_member",
      email: "billing-created-portal-member@example.com",
      name: "Billing Owner",
      externalId: String(userId),
      role: "billing_manager",
    });
    expect(polarCustomerSessionsCreateMock).toHaveBeenCalledWith({
      customerId: "cus_created_member",
      externalMemberId: String(userId),
      returnUrl: "https://app.example.com/settings/plan",
    });
  });

  it("promotes reused Polar members before opening the customer portal", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId, userId } = await seedWorkspace(t, {
      subject: "billing-promote-portal-member",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_promote_member",
      });
    });

    polarMembersListMock.mockResolvedValueOnce(
      polarListPages([
        [
          {
            id: "mem_regular",
            customerId: "cus_promote_member",
            email: "billing-promote-portal-member@example.com",
            name: "Billing Owner",
            externalId: String(userId),
            role: "member",
          },
        ],
      ]),
    );
    polarMembersUpdateMock.mockResolvedValueOnce({
      id: "mem_regular",
      customerId: "cus_promote_member",
      email: "billing-promote-portal-member@example.com",
      name: "Billing Owner",
      externalId: String(userId),
      role: "billing_manager",
    });
    polarCustomerSessionsCreateMock.mockResolvedValueOnce({
      customerPortalUrl: "https://polar.sh/customer-portal/session-promoted",
    });

    const portal = await authed.action(api.billing.openPortal, { businessId });

    expect(portal.url).toBe("https://polar.sh/customer-portal/session-promoted");
    expect(polarMembersUpdateMock).toHaveBeenCalledWith({
      id: "mem_regular",
      memberUpdate: {
        role: "billing_manager",
      },
    });
    expect(polarCustomerSessionsCreateMock).toHaveBeenCalledWith({
      customerId: "cus_promote_member",
      externalMemberId: String(userId),
      returnUrl: "https://app.example.com/settings/plan",
    });
  });

  it("does not create a portal member with another billing contact's email", async () => {
    const t = convexTest(schema, convexModules);
    registerPolarComponent(t as unknown as Parameters<typeof registerPolarComponent>[0]);
    const { authed, businessId, userId } = await seedWorkspace(t, {
      subject: "billing-portal-member-no-email",
      deploymentMode: "cloud",
    });

    process.env.POLAR_ORGANIZATION_TOKEN = "polar-test-token";
    process.env.SITE_URL = "https://app.example.com";

    await t.run(async (ctx: TestContext) => {
      await ctx.db.patch(userId, { email: undefined });
      await seedBillingAccount(ctx, {
        businessId,
        currentPlan: "pro",
        polarCustomerId: "cus_no_member_email",
      });
    });

    polarMembersListMock.mockResolvedValueOnce(polarListPages([[]]));

    await expect(authed.action(api.billing.openPortal, { businessId })).rejects.toThrow(
      "A billing member email is required before opening the customer portal.",
    );
    expect(polarMembersCreateMock).not.toHaveBeenCalled();
    expect(polarCustomerSessionsCreateMock).not.toHaveBeenCalled();
  });

  it("requires admin access for billing checkout and portal actions", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, {
      subject: "billing-viewer",
      deploymentMode: "cloud",
      role: "viewer",
    });

    process.env.POLAR_PRO_PRODUCT_ID = "prod_pro";
    process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID = "prod_ai_sms_setup";
    process.env.POLAR_PRO_AI_SMS_PRODUCT_ID = "prod_pro_ai_sms";
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
