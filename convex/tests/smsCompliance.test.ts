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
  role: "business_owner" | "business_admin" | "scheduler" | "viewer" = "business_owner",
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
      role,
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

  it("requires an explicit approved phone number when multiple active SMS lines exist", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-multi-number");

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550175",
        twilioPhoneSid: "PN-sms-compliance-multi-number-1",
      });
      await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550176",
        twilioPhoneSid: "PN-sms-compliance-multi-number-2",
      });
    });

    await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "low_volume",
      draft: buildValidDraft(),
    });

    await expect(
      authed.action(api.smsCompliance.startRegistration, {
        businessId,
      }),
    ).rejects.toThrow(
      "Choose which active SMS-enabled business phone number should be registered for hosted AI SMS before continuing 10DLC registration.",
    );
    expect(syncRegistrationMock).not.toHaveBeenCalled();
  });

  it("requires admin access to read SMS compliance status", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(
      t,
      "sms-compliance-viewer-read",
      "viewer",
    );

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550179",
        twilioPhoneSid: "PN-sms-compliance-viewer-read",
      });
    });

    await expect(
      authed.query(api.smsCompliance.getStatus, {
        businessId,
      }),
    ).rejects.toThrow("Billing management requires admin access.");
  });

  it("requires admin access to save or submit SMS compliance registration", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(
      t,
      "sms-compliance-viewer-write",
      "viewer",
    );

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550180",
        twilioPhoneSid: "PN-sms-compliance-viewer-write",
      });
    });

    await expect(
      authed.mutation(api.smsCompliance.saveComplianceForm, {
        businessId,
        trafficTier: "low_volume",
        draft: buildValidDraft(),
      }),
    ).rejects.toThrow("Billing management requires admin access.");

    await expect(
      authed.action(api.smsCompliance.startRegistration, {
        businessId,
      }),
    ).rejects.toThrow("Billing management requires admin access.");
    expect(syncRegistrationMock).not.toHaveBeenCalled();
  });

  it("uses the selected approved phone number when multiple active SMS lines exist", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(
      t,
      "sms-compliance-selected-number",
    );

    const selectedPhoneNumberId = await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550177",
        twilioPhoneSid: "PN-sms-compliance-selected-number-1",
      });
      return await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550178",
        twilioPhoneSid: "PN-sms-compliance-selected-number-2",
      });
    });

    await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "mixed",
      approvedPhoneNumberId: selectedPhoneNumberId,
      draft: buildValidDraft(),
    });
    syncRegistrationMock.mockResolvedValue({
      status: "pending_review",
      trafficTier: "mixed",
      twilioCustomerProfileSid: "BU-selected-number",
      twilioTrustProductSid: "TP-selected-number",
      twilioBrandRegistrationSid: "BN-selected-number",
      twilioMessagingServiceSid: "MG-selected-number",
      twilioCampaignSid: "QE-selected-number",
      lastSubmittedAt: "2026-04-17T14:00:00.000Z",
      lastSyncedAt: "2026-04-17T14:00:00.000Z",
    });

    await authed.action(api.smsCompliance.startRegistration, {
      businessId,
    });
    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(status).toMatchObject({
      status: "pending_review",
      approvedPhoneNumberId: selectedPhoneNumberId,
      approvedPhoneNumberE164: "+14165550178",
      twilioMessagingServiceSid: "MG-selected-number",
    });
  });

  it("rejects public-company submissions that omit stock metadata", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(
      t,
      "sms-compliance-public-company-stock-required",
    );

    const phoneNumberId = await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      return await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550182",
        twilioPhoneSid: "PN-sms-compliance-public-company-stock-required",
      });
    });

    await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "low_volume",
      approvedPhoneNumberId: phoneNumberId,
      draft: {
        ...buildValidDraft(),
        companyType: "public",
        brandContactEmail: "investor.relations@example.com",
      },
    });

    await expect(
      authed.action(api.smsCompliance.startRegistration, {
        businessId,
      }),
    ).rejects.toThrow("Stock exchange is required.");
    expect(syncRegistrationMock).not.toHaveBeenCalled();
  });

  it("rejects draft edits after submission has started", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-read-only-after-submit");

    const phoneNumberId = await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      return await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550181",
        twilioPhoneSid: "PN-sms-compliance-read-only-after-submit",
      });
    });

    const saved = await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "low_volume",
      approvedPhoneNumberId: phoneNumberId,
      draft: buildValidDraft(),
    });

    await t.run(async (ctx: TestContext) => {
      await ctx.db.patch(saved.registrationId, {
        status: "pending_review",
      });
    });

    await expect(
      authed.mutation(api.smsCompliance.saveComplianceForm, {
        businessId,
        trafficTier: "mixed",
        approvedPhoneNumberId: phoneNumberId,
        draft: {
          ...buildValidDraft(),
          businessName: "Updated After Submission",
        },
      }),
    ).rejects.toThrow(
      "10DLC registration can't be edited after submission starts. Refresh status instead.",
    );

    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(status).toMatchObject({
      status: "pending_review",
      trafficTier: "low_volume",
      draft: expect.objectContaining({
        businessName: "Acme Clinic LLC",
      }),
    });
  });

  it("clears stale failure details when a failed draft is edited", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-clear-failure");

    const phoneNumberId = await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      return await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550182",
        twilioPhoneSid: "PN-sms-compliance-clear-failure",
      });
    });

    const saved = await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "low_volume",
      approvedPhoneNumberId: phoneNumberId,
      draft: buildValidDraft(),
    });

    await t.run(async (ctx: TestContext) => {
      await ctx.db.patch(saved.registrationId, {
        status: "failed",
        failureCode: "campaign_rejected",
        failureMessage: "Campaign rejected by TCR.",
        pendingAction: {
          type: "campaign_review",
          message: "Campaign rejected by TCR.",
        },
      });
    });

    await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "mixed",
      approvedPhoneNumberId: phoneNumberId,
      draft: {
        ...buildValidDraft(),
        campaignDescription: "Updated compliance copy after the rejection.",
      },
    });

    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(status).toMatchObject({
      status: "collecting_info",
      trafficTier: "mixed",
      draft: expect.objectContaining({
        campaignDescription: "Updated compliance copy after the rejection.",
      }),
    });
    expect(status.failureCode).toBeUndefined();
    expect(status.failureMessage).toBeUndefined();
    expect(status.pendingAction).toBeUndefined();
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

  it("reports platform routing when the approved sender is no longer active", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(
      t,
      "sms-compliance-inactive-approved-sender",
    );

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      const approvedPhoneNumberId = await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550184",
        twilioPhoneSid: "PN-sms-compliance-inactive-approved-sender",
      });
      await ctx.db.insert("sms_compliance_registrations", {
        businessId,
        status: "approved",
        customerType: "direct_customer",
        brandKind: "standard_business",
        trafficTier: "low_volume",
        draft: buildValidDraft(),
        approvedPhoneNumberId,
        twilioMessagingServiceSid: "MG-sms-compliance-inactive-approved-sender",
      });
      await ctx.db.patch(approvedPhoneNumberId, {
        status: "inactive",
      });
    });

    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(status).toMatchObject({
      status: "approved",
      senderMode: "platform_phone",
      alertsUseBusinessSender: false,
      aiSmsReady: false,
      twilioMessagingServiceSid: "MG-sms-compliance-inactive-approved-sender",
    });
  });

  it("allows replacing the approved phone number while OTP verification is pending", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(
      t,
      "sms-compliance-pending-brand-number-change",
    );

    const { activeReplacementPhoneNumberId, inactiveApprovedPhoneNumberId } = await t.run(
      async (ctx: TestContext) => {
        await seedBillingAccount(ctx, businessId);
        const inactiveApprovedPhoneNumberId = await seedSmsPhoneNumber(ctx, {
          businessId,
          e164: "+14165550185",
          twilioPhoneSid: "PN-sms-compliance-pending-brand-old",
        });
        const activeReplacementPhoneNumberId = await seedSmsPhoneNumber(ctx, {
          businessId,
          e164: "+14165550186",
          twilioPhoneSid: "PN-sms-compliance-pending-brand-new",
        });

        const registrationId = await ctx.db.insert("sms_compliance_registrations", {
          businessId,
          status: "pending_brand_verification",
          customerType: "direct_customer",
          brandKind: "standard_business",
          trafficTier: "low_volume",
          draft: buildValidDraft(),
          approvedPhoneNumberId: inactiveApprovedPhoneNumberId,
          pendingAction: {
            type: "brand_contact_email_otp",
            message: "Complete the brand contact email verification code.",
          },
        });

        await ctx.db.patch(inactiveApprovedPhoneNumberId, {
          status: "inactive",
        });

        return {
          registrationId,
          activeReplacementPhoneNumberId,
          inactiveApprovedPhoneNumberId,
        };
      },
    );

    const saved = await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "mixed",
      approvedPhoneNumberId: activeReplacementPhoneNumberId,
      draft: {
        ...buildValidDraft(),
        businessName: "Ignored Draft Change While OTP Pending",
      },
    });

    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(saved).toMatchObject({
      status: "pending_brand_verification",
    });
    expect(status).toMatchObject({
      status: "pending_brand_verification",
      approvedPhoneNumberId: activeReplacementPhoneNumberId,
      approvedPhoneNumberE164: "+14165550186",
      draft: expect.objectContaining({
        businessName: "Acme Clinic LLC",
      }),
    });
    expect(status.approvedPhoneNumberId).not.toBe(inactiveApprovedPhoneNumberId);
  });

  it("allows replacing an approved sender after the current number becomes inactive", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(
      t,
      "sms-compliance-approved-number-recovery",
    );

    const { activeReplacementPhoneNumberId } = await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      const inactiveApprovedPhoneNumberId = await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550187",
        twilioPhoneSid: "PN-sms-compliance-approved-old",
      });
      const activeReplacementPhoneNumberId = await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550188",
        twilioPhoneSid: "PN-sms-compliance-approved-new",
      });
      await ctx.db.insert("sms_compliance_registrations", {
        businessId,
        status: "approved",
        customerType: "direct_customer",
        brandKind: "standard_business",
        trafficTier: "low_volume",
        draft: buildValidDraft(),
        approvedPhoneNumberId: inactiveApprovedPhoneNumberId,
        twilioMessagingServiceSid: "MG-sms-compliance-approved-recovery",
      });
      await ctx.db.patch(inactiveApprovedPhoneNumberId, {
        status: "inactive",
      });

      return { activeReplacementPhoneNumberId };
    });

    const saved = await authed.mutation(api.smsCompliance.saveComplianceForm, {
      businessId,
      trafficTier: "low_volume",
      approvedPhoneNumberId: activeReplacementPhoneNumberId,
      draft: buildValidDraft(),
    });
    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(saved).toMatchObject({
      status: "pending_review",
    });
    expect(status).toMatchObject({
      status: "pending_review",
      senderMode: "platform_phone",
      approvedPhoneNumberId: activeReplacementPhoneNumberId,
      approvedPhoneNumberE164: "+14165550188",
      aiSmsReady: false,
      pendingAction: {
        type: "phone_number_association",
        message:
          "Refresh the 10DLC registration to attach the new business phone number to the Messaging Service.",
      },
    });
  });

  it("keeps approved registrations approved when refresh throws before syncing", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-refresh-approved");

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      const approvedPhoneNumberId = await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550183",
        twilioPhoneSid: "PN-sms-compliance-refresh-approved",
      });
      await ctx.db.insert("sms_compliance_registrations", {
        businessId,
        status: "approved",
        customerType: "direct_customer",
        brandKind: "standard_business",
        trafficTier: "low_volume",
        draft: buildValidDraft(),
        approvedPhoneNumberId,
        twilioMessagingServiceSid: "MG-refresh-approved",
      });
    });
    syncRegistrationMock.mockRejectedValueOnce(
      new Error("The approved business phone number is no longer active."),
    );

    const result = await authed.action(api.smsCompliance.refreshStatus, {
      businessId,
    });
    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(result).toMatchObject({
      status: "approved",
    });
    expect(syncRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "refresh",
      }),
    );
    expect(status).toMatchObject({
      status: "approved",
      twilioMessagingServiceSid: "MG-refresh-approved",
    });
    expect(status.failureCode).toBeUndefined();
    expect(status.failureMessage).toBeUndefined();
    expect(status.pendingAction).toBeUndefined();
  });

  it("keeps suspended registrations suspended when refresh throws before syncing", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-refresh-suspended");

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      const approvedPhoneNumberId = await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550184",
        twilioPhoneSid: "PN-sms-compliance-refresh-suspended",
      });
      await ctx.db.insert("sms_compliance_registrations", {
        businessId,
        status: "suspended",
        customerType: "direct_customer",
        brandKind: "standard_business",
        trafficTier: "low_volume",
        draft: buildValidDraft(),
        approvedPhoneNumberId,
        twilioMessagingServiceSid: "MG-refresh-suspended",
        failureCode: "brand_suspended",
        failureMessage: "Twilio suspended this 10DLC brand.",
        pendingAction: {
          type: "manual_review",
          message: "Twilio suspended this 10DLC brand. Contact support before retrying.",
        },
      });
    });
    syncRegistrationMock.mockRejectedValueOnce(new Error("Twilio timeout"));

    const result = await authed.action(api.smsCompliance.refreshStatus, {
      businessId,
    });
    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(result).toMatchObject({
      status: "suspended",
    });
    expect(syncRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "refresh",
      }),
    );
    expect(status).toMatchObject({
      status: "suspended",
      twilioMessagingServiceSid: "MG-refresh-suspended",
      failureCode: "brand_suspended",
      failureMessage: "Twilio suspended this 10DLC brand.",
      pendingAction: {
        type: "manual_review",
        message: "Twilio suspended this 10DLC brand. Contact support before retrying.",
      },
    });
  });

  it("marks pending registrations as failed when refresh throws before syncing", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId } = await seedWorkspace(t, "sms-compliance-refresh-failure");

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      const approvedPhoneNumberId = await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550189",
        twilioPhoneSid: "PN-sms-compliance-refresh-failure",
      });
      await ctx.db.insert("sms_compliance_registrations", {
        businessId,
        status: "pending_review",
        customerType: "direct_customer",
        brandKind: "standard_business",
        trafficTier: "low_volume",
        draft: buildValidDraft(),
        approvedPhoneNumberId,
        twilioBrandRegistrationSid: "BN-refresh-failure",
        twilioMessagingServiceSid: "MG-refresh-failure",
        twilioCampaignSid: "QE-refresh-failure",
      });
    });
    syncRegistrationMock.mockRejectedValueOnce(new Error("Twilio timeout"));

    const result = await authed.action(api.smsCompliance.refreshStatus, {
      businessId,
    });
    const status = await authed.query(api.smsCompliance.getStatus, { businessId });

    expect(result).toMatchObject({
      status: "failed",
    });
    expect(status).toMatchObject({
      status: "failed",
      failureCode: "twilio_sync_failed",
      failureMessage: "Twilio timeout",
      pendingAction: {
        type: "manual_review",
        message: "Twilio timeout",
      },
    });
  });

  it("rejects status refreshes from users outside the workspace", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedWorkspace(t, "sms-compliance-refresh-target");
    const { authed: outsider } = await seedWorkspace(
      t,
      "sms-compliance-refresh-outsider",
    );

    await t.run(async (ctx: TestContext) => {
      await seedBillingAccount(ctx, businessId);
      const approvedPhoneNumberId = await seedSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550174",
        twilioPhoneSid: "PN-sms-compliance-refresh-target",
      });
      await ctx.db.insert("sms_compliance_registrations", {
        businessId,
        status: "approved",
        customerType: "direct_customer",
        brandKind: "standard_business",
        trafficTier: "low_volume",
        draft: buildValidDraft(),
        approvedPhoneNumberId,
        twilioMessagingServiceSid: "MG-refresh-target",
      });
    });

    await expect(
      outsider.action(api.smsCompliance.refreshStatus, {
        businessId,
      }),
    ).rejects.toThrow("You do not have access to this business.");
    expect(syncRegistrationMock).not.toHaveBeenCalled();
  });
});
