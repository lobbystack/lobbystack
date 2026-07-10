import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const { scheduleSnapshotRefreshMock, updateIncomingPhoneNumberMock } = vi.hoisted(() => ({
  scheduleSnapshotRefreshMock: vi.fn(),
  updateIncomingPhoneNumberMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const twilioFactory = Object.assign(
    vi.fn(() => ({
      incomingPhoneNumbers: (phoneNumberSid: string) => ({
        update: (args: {
          smsMethod?: string;
          smsUrl?: string;
          statusCallback?: string;
          statusCallbackMethod?: string;
          voiceMethod?: string;
          voiceUrl?: string;
        }) =>
          updateIncomingPhoneNumberMock({
            phoneNumberSid,
            args,
          }),
      }),
      messages: {
        create: vi.fn(),
      },
    })),
    {
      validateRequest: vi.fn(),
    },
  );

  return {
    default: twilioFactory,
  };
});

vi.mock("../businesses/admin.ts", async () => {
  const actual = await vi.importActual<typeof import("../businesses/admin")>(
    "../businesses/admin.ts",
  );

  return {
    ...actual,
    scheduleSnapshotRefresh: scheduleSnapshotRefreshMock,
  };
});

const convexModules = modules;
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalVoiceGatewayBaseUrl = process.env.VOICE_GATEWAY_BASE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
type ConvexHarness = TestConvex<typeof schema>;

async function seedBusinessOwner(
  t: ConvexHarness,
  input?: {
    membershipStatus?: "active" | "inactive";
    deploymentMode?: "cloud" | "manual";
    currentPlan?: "free_cloud" | "starter";
  },
) {
  const subject = "phone-number-owner";

  const { businessId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: "phone-number-save-business",
      name: "Phone Number Save Business",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: input?.deploymentMode ?? "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: subject,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: input?.membershipStatus ?? "active",
    });
    if (input?.currentPlan) {
      await ctx.db.insert("billing_accounts", {
        businessId,
        billingKey: `business:${String(businessId)}`,
        currentPlan: input.currentPlan,
        activeAddons: [],
        subscriptionState: input.currentPlan === "starter" ? "active" : "inactive",
        ...(input.currentPlan === "starter"
          ? { billingInterval: "monthly" as const }
          : {}),
        lastSyncedAt: "2026-07-09T12:00:00.000Z",
      });
    }

    return { businessId };
  });

  return { businessId, subject };
}

describe("Twilio SMS phone-number save flow", () => {
  beforeEach(() => {
    process.env.CONVEX_SITE_URL = "https://example.convex.site";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
    process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";

    vi.clearAllMocks();
    scheduleSnapshotRefreshMock.mockResolvedValue(null);
    updateIncomingPhoneNumberMock.mockImplementation(
      async ({
        phoneNumberSid,
        args,
      }: {
        phoneNumberSid: string;
        args: {
          smsMethod?: string;
          smsUrl?: string;
          statusCallback?: string;
          statusCallbackMethod?: string;
          voiceMethod?: string;
          voiceUrl?: string;
        };
      }) => ({
        sid: phoneNumberSid,
        smsUrl: args.smsUrl,
        voiceUrl: args.voiceUrl,
      }),
    );
  });

  it("registers the inbound SMS webhook when saving an active SMS number with a Twilio SID", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    const result = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550120",
      twilioPhoneSid: "PN1234567890",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });

    expect(result).toMatchObject({
      voiceWebhookStatus: "synced",
      smsWebhookStatus: "synced",
    });
    expect(updateIncomingPhoneNumberMock).toHaveBeenCalledWith({
      phoneNumberSid: "PN1234567890",
      args: {
        smsMethod: "POST",
        smsUrl: "https://example.convex.site/twilio/sms/inbound",
        statusCallback: "https://voice.example.com/twilio/voice/call-status",
        statusCallbackMethod: "POST",
        voiceMethod: "POST",
        voiceUrl: "https://voice.example.com/twilio/voice/inbound",
      },
    });

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    expect(configuration.phoneNumbers[0]).toMatchObject({
      e164: "+14165550120",
      voiceWebhookStatus: "synced",
      voiceWebhookTargetUrl: "https://voice.example.com/twilio/voice/inbound",
      smsWebhookStatus: "synced",
      smsWebhookTargetUrl: "https://example.convex.site/twilio/sms/inbound",
    });
  });

  it("rejects attaching a provider number to a hosted free-plan business", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t, {
      deploymentMode: "cloud",
      currentPlan: "free_cloud",
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.action(api.businesses.catalog.savePhoneNumber, {
        businessId,
        e164: "+14165550140",
        twilioPhoneSid: "PN-free-plan-bypass",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      }),
    ).rejects.toThrow("Upgrade to a paid plan");
  });

  it("rejects direct lifecycle changes for hosted provider numbers", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t, {
      deploymentMode: "cloud",
      currentPlan: "starter",
    });
    const authed = t.withIdentity({ subject });
    const created = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550141",
      twilioPhoneSid: "PN-hosted-lifecycle",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });

    await expect(
      authed.action(api.businesses.catalog.savePhoneNumber, {
        businessId,
        phoneNumberId: created.phoneNumberId as Id<"phone_numbers">,
        e164: "+14165550141",
        twilioPhoneSid: "PN-hosted-lifecycle",
        voiceEnabled: true,
        smsEnabled: true,
        status: "inactive",
      }),
    ).rejects.toThrow("dedicated number workflow");

    await expect(
      authed.action(api.businesses.catalog.savePhoneNumber, {
        businessId,
        phoneNumberId: created.phoneNumberId as Id<"phone_numbers">,
        e164: "+14165550141",
        twilioPhoneSid: null,
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      }),
    ).rejects.toThrow("dedicated number workflow");
  });

  it("clears provider webhooks when a Twilio-backed number becomes ineligible for sync", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    const withoutSid = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550121",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });
    const smsDisabled = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550122",
      twilioPhoneSid: "PN-disabled",
      voiceEnabled: false,
      smsEnabled: false,
      status: "active",
    });
    const inactive = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550123",
      twilioPhoneSid: "PN-inactive",
      voiceEnabled: false,
      smsEnabled: true,
      status: "inactive",
    });

    expect(withoutSid.voiceWebhookStatus).toBe("not_configured");
    expect(withoutSid.smsWebhookStatus).toBe("not_configured");
    expect(smsDisabled.voiceWebhookStatus).toBe("not_configured");
    expect(smsDisabled.smsWebhookStatus).toBe("not_configured");
    expect(inactive.voiceWebhookStatus).toBe("not_configured");
    expect(inactive.smsWebhookStatus).toBe("not_configured");
    expect(updateIncomingPhoneNumberMock).toHaveBeenCalledTimes(2);
    expect(updateIncomingPhoneNumberMock).toHaveBeenNthCalledWith(1, {
      phoneNumberSid: "PN-disabled",
      args: {
        smsUrl: "",
        statusCallback: "",
        voiceUrl: "",
      },
    });
    expect(updateIncomingPhoneNumberMock).toHaveBeenNthCalledWith(2, {
      phoneNumberSid: "PN-inactive",
      args: {
        smsUrl: "",
        statusCallback: "",
        voiceUrl: "",
      },
    });
  });

  it("lets operators clear a previously saved Twilio SID", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    const created = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550129",
      twilioPhoneSid: "PN-clear-me",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });

    const cleared = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      phoneNumberId: created.phoneNumberId as Id<"phone_numbers">,
      e164: "+14165550129",
      twilioPhoneSid: null,
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });

    expect(cleared.voiceWebhookStatus).toBe("not_configured");
    expect(cleared.smsWebhookStatus).toBe("not_configured");

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    expect(configuration.phoneNumbers[0]).toMatchObject({
      e164: "+14165550129",
      voiceWebhookStatus: "not_configured",
      smsWebhookStatus: "not_configured",
    });
    expect(configuration.phoneNumbers[0]?.twilioPhoneSid).toBeUndefined();
  });

  it("clears disabled webhook URLs both in Twilio and locally", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    const created = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550131",
      twilioPhoneSid: "PN-clear-webhook",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });

    updateIncomingPhoneNumberMock.mockClear();

    const updated = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      phoneNumberId: created.phoneNumberId as Id<"phone_numbers">,
      e164: "+14165550131",
      twilioPhoneSid: "PN-clear-webhook",
      voiceEnabled: false,
      smsEnabled: true,
      status: "active",
    });

    expect(updateIncomingPhoneNumberMock).toHaveBeenCalledWith({
      phoneNumberSid: "PN-clear-webhook",
      args: {
        smsMethod: "POST",
        smsUrl: "https://example.convex.site/twilio/sms/inbound",
        statusCallback: "",
        voiceUrl: "",
      },
    });
    expect(updated.voiceWebhookStatus).toBe("not_configured");
    expect(updated.smsWebhookStatus).toBe("synced");

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    expect(configuration.phoneNumbers[0]).toMatchObject({
      e164: "+14165550131",
      voiceWebhookStatus: "not_configured",
      smsWebhookStatus: "synced",
      smsWebhookTargetUrl: "https://example.convex.site/twilio/sms/inbound",
    });
    expect(configuration.phoneNumbers[0]?.voiceWebhookTargetUrl).toBeUndefined();
  });

  it("does not require voice gateway config for active SMS-only numbers", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    delete process.env.VOICE_GATEWAY_BASE_URL;

    const result = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550132",
      twilioPhoneSid: "PN-sms-only",
      voiceEnabled: false,
      smsEnabled: true,
      status: "active",
    });

    expect(result).toMatchObject({
      voiceWebhookStatus: "not_configured",
      smsWebhookStatus: "synced",
    });
    expect(updateIncomingPhoneNumberMock).toHaveBeenCalledWith({
      phoneNumberSid: "PN-sms-only",
      args: {
        smsMethod: "POST",
        smsUrl: "https://example.convex.site/twilio/sms/inbound",
        statusCallback: "",
        voiceUrl: "",
      },
    });
  });

  it("keeps the phone number saved and records a failed sync when Twilio registration fails", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });
    updateIncomingPhoneNumberMock.mockRejectedValueOnce(new Error("Twilio rejected the webhook"));

    const result = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550124",
      twilioPhoneSid: "PN-fail",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });

    expect(result).toMatchObject({
      voiceWebhookStatus: "failed",
      voiceWebhookLastError: "Twilio rejected the webhook",
      smsWebhookStatus: "failed",
      smsWebhookLastError: "Twilio rejected the webhook",
    });

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    expect(configuration.phoneNumbers[0]).toMatchObject({
      e164: "+14165550124",
      voiceWebhookStatus: "failed",
      voiceWebhookLastError: "Twilio rejected the webhook",
      smsWebhookStatus: "failed",
      smsWebhookLastError: "Twilio rejected the webhook",
    });

    const issues = await t.query(internal.integrations.twilioSmsDebug.listPhoneNumbersWithWebhookIssues, {
      businessId,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      e164: "+14165550124",
      smsWebhookStatus: "failed",
    });
  });

  it("can resync a previously failed phone-number webhook registration", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });
    updateIncomingPhoneNumberMock.mockRejectedValueOnce(new Error("Temporary Twilio error"));

    const failed = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550125",
      twilioPhoneSid: "PN-retry",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });

    expect(failed.smsWebhookStatus).toBe("failed");

    updateIncomingPhoneNumberMock.mockImplementationOnce(
      async ({
        phoneNumberSid,
        args,
      }: {
        phoneNumberSid: string;
        args: {
          smsMethod?: string;
          smsUrl?: string;
          statusCallback?: string;
          statusCallbackMethod?: string;
          voiceMethod?: string;
          voiceUrl?: string;
        };
      }) => ({
        sid: phoneNumberSid,
        smsUrl: args.smsUrl,
        voiceUrl: args.voiceUrl,
      }),
    );

    const resynced = await t.action(internal.businesses.catalog.syncPhoneNumberWebhooks, {
      phoneNumberId: failed.phoneNumberId as Id<"phone_numbers">,
    });

    expect(resynced).toMatchObject({
      phoneNumberId: failed.phoneNumberId,
      voiceWebhookStatus: "synced",
      smsWebhookStatus: "synced",
    });
  });

  it("preserves scheduled reclaim metadata when recording webhook sync", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedBusinessOwner(t);
    const reclaimScheduledAt = Date.now() - 1_000;
    const phoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14165550142",
        twilioPhoneSid: "PN-reclaim-webhook-sync",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt,
        reclaimReason: "free_plan",
      });
    });

    await t.mutation(internal.businesses.catalog.recordPhoneNumberWebhookSync, {
      phoneNumberId,
      voiceWebhookStatus: "synced",
      voiceWebhookTargetUrl: "https://voice.example.com/twilio/voice/inbound",
      smsWebhookStatus: "synced",
      smsWebhookTargetUrl: "https://example.convex.site/twilio/sms/inbound",
    });

    const phoneNumber = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneNumber).toMatchObject({
      reclaimScheduledAt,
      reclaimReason: "free_plan",
      voiceWebhookStatus: "synced",
      smsWebhookStatus: "synced",
    });
    const dueReclaims = await t.query(
      internal.businesses.catalog.listDuePhoneNumberReclaimsPage,
      {
        now: Date.now(),
        cursor: null,
        numItems: 10,
      },
    );
    expect(dueReclaims.page.map((entry) => entry._id)).toContain(phoneNumberId);
  });

  it("rejects phone-number updates for inactive memberships", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t, {
      membershipStatus: "inactive",
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.action(api.businesses.catalog.savePhoneNumber, {
        businessId,
        e164: "+14165550130",
        twilioPhoneSid: "PN-inactive-member",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      }),
    ).rejects.toThrow("You do not have access to this business.");
  });
});
