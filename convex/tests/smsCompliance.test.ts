import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

const { syncRegistrationMock } = vi.hoisted(() => ({
  syncRegistrationMock: vi.fn(),
}));

vi.mock("../integrations/twilioA2p.ts", async () => {
  const actual = await vi.importActual<typeof import("../integrations/twilioA2p")>(
    "../integrations/twilioA2p.ts",
  );
  const { internalAction } = await import("../_generated/server");
  const { v } = await import("convex/values");

  return {
    ...actual,
    syncRegistration: internalAction({
      args: {
        registrationId: v.id("sms_compliance_registrations"),
        mode: v.union(v.literal("submit"), v.literal("refresh")),
      },
      handler: async (_ctx, args) => {
        return await syncRegistrationMock(args);
      },
    }),
  };
});

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getBillingKey } from "../lib/billing";
import type { SmsComplianceDraft } from "../lib/smsCompliance";
import schema from "../schema";
import { modules } from "../test.setup";

type ConvexHarness = TestConvex<typeof schema>;
type TestRunFunction = Parameters<ConvexHarness["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = modules;

afterEach(() => {
  vi.clearAllMocks();
});

async function seedWorkspace(
  t: ConvexHarness,
  subject: string,
): Promise<{
  authed: ReturnType<ConvexHarness["withIdentity"]>;
  businessId: Id<"businesses">;
}> {
  const seeded = await t.run(async (ctx: TestContext) => {
    const businessId: Id<"businesses"> = await ctx.db.insert("businesses", {
      slug: `sms-compliance-${subject}`,
      name: "SMS Compliance Test Workspace",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "cloud",
      status: "active",
    });
    const userId: Id<"users"> = await ctx.db.insert("users", {
      authSubject: subject,
      email: `${subject}@example.com`,
      displayName: "SMS Compliance Owner",
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });

    return { businessId };
  });

  return {
    ...seeded,
    authed: t.withIdentity({ subject }),
  };
}

async function seedBillingAccount(
  ctx: TestContext,
  businessId: Id<"businesses">,
): Promise<void> {
  await ctx.db.insert("billing_accounts", {
    businessId,
    billingKey: getBillingKey(businessId),
    currentPlan: "pro",
    activeAddons: ["ai_sms"],
    subscriptionState: "active",
    billingContactEmail: "owner@example.com",
    billingContactName: "SMS Compliance Owner",
    lastSyncedAt: "2026-04-17T12:00:00.000Z",
  });
}

async function seedSmsPhoneNumber(
  ctx: TestContext,
  input: {
    businessId: Id<"businesses">;
    e164: string;
    twilioPhoneSid: string;
  },
): Promise<Id<"phone_numbers">> {
  return await ctx.db.insert("phone_numbers", {
    businessId: input.businessId,
    e164: input.e164,
    twilioPhoneSid: input.twilioPhoneSid,
    voiceEnabled: true,
    smsEnabled: true,
    status: "active",
  });
}

function buildValidDraft(): SmsComplianceDraft {
  return {
    businessName: "Acme Clinic LLC",
    businessType: "Corporation",
    businessIndustry: "HEALTHCARE",
    businessRegistrationIdentifier: "EIN",
    businessRegistrationNumber: "12-3456789",
    websiteUrl: "https://example.com",
    businessRegionsOfOperation: ["USA_AND_CANADA"],
    companyType: "private",
    brandContactEmail: "ops@example.com",
    campaignDescription: "Appointment alerts and AI SMS replies.",
    messageFlow: "Customers opt in via online booking forms and intake paperwork.",
    sampleMessages: [
      "Acme Clinic: your appointment is tomorrow at 2 PM.",
      "Acme Clinic: reply YES to confirm or STOP to unsubscribe.",
    ],
    hasEmbeddedLinks: false,
    hasEmbeddedPhone: true,
    optInMessage: "Reply START to opt in.",
    optOutMessage: "Reply STOP to unsubscribe.",
    helpMessage: "Reply HELP for support.",
    optInKeywords: ["START"],
    optOutKeywords: ["STOP"],
    helpKeywords: ["HELP"],
    address: {
      customerName: "Acme Clinic LLC",
      street: "123 Main Street",
      city: "Toronto",
      region: "ON",
      postalCode: "M5V 2T6",
      isoCountry: "CA",
    },
    authorizedRepresentative: {
      firstName: "Jordan",
      lastName: "Lee",
      businessTitle: "Operations Manager",
      jobPosition: "Director",
      phoneNumber: "+14165550188",
      email: "jordan@example.com",
    },
  };
}

describe("smsCompliance", () => {
  it("reports setup required for hosted AI SMS workspaces until approval", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-setup-required");

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550170",
        twilioPhoneSid: "PN-sms-compliance-setup-required",
      });
    });

    const status = await authed.query(api.smsCompliance.getStatus, { businessId });
    const campaignOptions = await authed.query(api.smsCompliance.getCampaignOptions, {});

    expect(status).toMatchObject({
      applicable: true,
      aiSmsCommerciallyEnabled: true,
      alertsUseBusinessSender: false,
      aiSmsReady: false,
      setupRequired: true,
      senderMode: "platform_phone",
      status: "not_started",
      trafficTier: "low_volume",
    });
    expect(campaignOptions).toEqual([
      {
        value: "low_volume",
        twilioUsecaseCode: "LOW_VOLUME",
        recommended: true,
      },
      {
        value: "mixed",
        twilioUsecaseCode: "MIXED",
        recommended: false,
      },
    ]);
  });

  it("starts registration, stores a submission snapshot, and remains on the platform sender while pending review", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-start");

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550171",
        twilioPhoneSid: "PN-sms-compliance-start",
      });
    });
    await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "mixed",
      draft: buildValidDraft(),
    });
    syncRegistrationMock.mockResolvedValue({
      status: "pending_review",
      trafficTier: "mixed",
      twilioCustomerProfileSid: "BU-pending-review",
      twilioTrustProductSid: "TP-pending-review",
      twilioBrandRegistrationSid: "BN-pending-review",
      twilioMessagingServiceSid: "MG-pending-review",
      twilioCampaignSid: "QE-pending-review",
      brandContactEmail: "ops@example.com",
      lastSubmittedAt: "2026-04-17T15:00:00.000Z",
      lastSyncedAt: "2026-04-17T15:00:00.000Z",
    });

    const result = await authed.action(api.smsCompliance.startRegistration, {
      businessId,
    });
    const status = await authed.query(api.smsCompliance.getStatus, { businessId });
    const submission = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("sms_compliance_submissions")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });

    expect(result).toMatchObject({
      status: "pending_review",
    });
    expect(syncRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "submit",
      }),
    );
    expect(status).toMatchObject({
      status: "pending_review",
      senderMode: "platform_phone",
      trafficTier: "mixed",
      setupRequired: false,
      alertsUseBusinessSender: false,
      aiSmsReady: false,
      twilioMessagingServiceSid: "MG-pending-review",
    });
    expect(submission).toMatchObject({
      status: "pending_review",
      resultStatus: "pending_review",
      trafficTier: "mixed",
      twilioBrandRegistrationSid: "BN-pending-review",
      twilioMessagingServiceSid: "MG-pending-review",
      snapshot: {
        trafficTier: "mixed",
        draft: expect.objectContaining({
          businessName: "Acme Clinic LLC",
        }),
      },
    });
  });

  it("resumes OTP-gated registration and cuts over to the business messaging service after approval", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-resume");

    const phoneNumberId = await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      return await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550172",
        twilioPhoneSid: "PN-sms-compliance-resume",
      });
    });
    const saved = await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "low_volume",
      draft: buildValidDraft(),
    });
    await t.run(async (ctx: TestContext) => {
      await ctx.db.patch(saved.registrationId, {
        status: "pending_brand_verification",
        approvedPhoneNumberId: phoneNumberId,
        pendingAction: {
          type: "brand_contact_email_otp",
          message: "Enter the verification code sent to ops@example.com.",
        },
      });
    });
    syncRegistrationMock.mockResolvedValue({
      status: "approved",
      trafficTier: "low_volume",
      approvedPhoneNumberId: phoneNumberId,
      twilioMessagingServiceSid: "MG-approved",
      twilioCampaignSid: "QE-approved",
      twilioBrandRegistrationSid: "BN-approved",
      lastSubmittedAt: "2026-04-17T16:00:00.000Z",
      lastSyncedAt: "2026-04-17T16:15:00.000Z",
    });

    const result = await authed.action(api.smsCompliance.resumeRegistration, {
      businessId,
    });
    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(result).toMatchObject({
      status: "approved",
    });
    expect(syncRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "submit",
      }),
    );
    expect(status).toMatchObject({
      status: "approved",
      senderMode: "business_messaging_service",
      alertsUseBusinessSender: true,
      aiSmsReady: true,
      approvedPhoneNumberE164: "+14165550172",
      twilioMessagingServiceSid: "MG-approved",
    });
  });

  it("refreshes registration state and surfaces campaign rejection without cutting over traffic", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-refresh");

    const phoneNumberId = await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      return await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550173",
        twilioPhoneSid: "PN-sms-compliance-refresh",
      });
    });
    const saved = await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "low_volume",
      draft: buildValidDraft(),
    });
    await t.run(async (ctx: TestContext) => {
      await ctx.db.patch(saved.registrationId, {
        status: "pending_review",
        approvedPhoneNumberId: phoneNumberId,
        twilioMessagingServiceSid: "MG-refresh",
      });
    });
    syncRegistrationMock.mockResolvedValue({
      status: "failed",
      trafficTier: "low_volume",
      approvedPhoneNumberId: phoneNumberId,
      twilioMessagingServiceSid: "MG-refresh",
      failureCode: "campaign_rejected",
      failureMessage: "Campaign rejected by TCR.",
      pendingAction: {
        type: "campaign_review",
        message: "Campaign rejected by TCR.",
      },
      lastSyncedAt: "2026-04-17T17:00:00.000Z",
    });

    const result = await authed.action(api.smsCompliance.refreshStatus, {
      businessId,
    });
    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(result).toMatchObject({
      status: "failed",
    });
    expect(syncRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "refresh",
      }),
    );
    expect(status).toMatchObject({
      status: "failed",
      senderMode: "platform_phone",
      alertsUseBusinessSender: false,
      aiSmsReady: false,
      failureCode: "campaign_rejected",
      failureMessage: "Campaign rejected by TCR.",
      pendingAction: {
        type: "campaign_review",
        message: "Campaign rejected by TCR.",
      },
      twilioMessagingServiceSid: "MG-refresh",
    });
  });
});
