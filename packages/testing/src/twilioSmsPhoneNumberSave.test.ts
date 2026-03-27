import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const { scheduleSnapshotRefreshMock, updateIncomingPhoneNumberMock } = vi.hoisted(() => ({
  scheduleSnapshotRefreshMock: vi.fn(),
  updateIncomingPhoneNumberMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const twilioFactory = Object.assign(
    vi.fn(() => ({
      incomingPhoneNumbers: (phoneNumberSid: string) => ({
        update: (args: { smsMethod: string; smsUrl: string }) =>
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

vi.mock("../../../convex/businesses/admin.ts", async () => {
  const actual = await vi.importActual<typeof import("../../../convex/businesses/admin")>(
    "../../../convex/businesses/admin.ts",
  );

  return {
    ...actual,
    scheduleSnapshotRefresh: scheduleSnapshotRefreshMock,
  };
});

const convexModules = import.meta.glob("../../../convex/**/*.ts");
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
type ConvexHarness = TestConvex<typeof schema>;

async function seedBusinessOwner(
  t: ConvexHarness,
  input?: { membershipStatus?: "active" | "inactive" },
) {
  const subject = "phone-number-owner";

  const { businessId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: "phone-number-save-business",
      name: "Phone Number Save Business",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "manual",
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

    return { businessId };
  });

  return { businessId, subject };
}

describe("Twilio SMS phone-number save flow", () => {
  beforeEach(() => {
    process.env.CONVEX_SITE_URL = "https://example.convex.site";
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
        args: { smsMethod: string; smsUrl: string };
      }) => ({
        sid: phoneNumberSid,
        smsUrl: args.smsUrl,
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
      smsWebhookStatus: "synced",
    });
    expect(updateIncomingPhoneNumberMock).toHaveBeenCalledWith({
      phoneNumberSid: "PN1234567890",
      args: {
        smsMethod: "POST",
        smsUrl: "https://example.convex.site/twilio/sms/inbound",
      },
    });

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    expect(configuration.phoneNumbers[0]).toMatchObject({
      e164: "+14165550120",
      smsWebhookStatus: "synced",
      smsWebhookTargetUrl: "https://example.convex.site/twilio/sms/inbound",
    });
  });

  it("skips webhook registration when the number is not eligible for SMS sync", async () => {
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
      voiceEnabled: true,
      smsEnabled: false,
      status: "active",
    });
    const inactive = await authed.action(api.businesses.catalog.savePhoneNumber, {
      businessId,
      e164: "+14165550123",
      twilioPhoneSid: "PN-inactive",
      voiceEnabled: true,
      smsEnabled: true,
      status: "inactive",
    });

    expect(withoutSid.smsWebhookStatus).toBe("not_configured");
    expect(smsDisabled.smsWebhookStatus).toBe("not_configured");
    expect(inactive.smsWebhookStatus).toBe("not_configured");
    expect(updateIncomingPhoneNumberMock).not.toHaveBeenCalled();
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

    expect(cleared.smsWebhookStatus).toBe("not_configured");

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    expect(configuration.phoneNumbers[0]).toMatchObject({
      e164: "+14165550129",
      smsWebhookStatus: "not_configured",
    });
    expect(configuration.phoneNumbers[0]?.twilioPhoneSid).toBeUndefined();
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
      smsWebhookStatus: "failed",
      smsWebhookLastError: "Twilio rejected the webhook",
    });

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    expect(configuration.phoneNumbers[0]).toMatchObject({
      e164: "+14165550124",
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
        args: { smsMethod: string; smsUrl: string };
      }) => ({
        sid: phoneNumberSid,
        smsUrl: args.smsUrl,
      }),
    );

    const resynced = await t.action(internal.businesses.catalog.syncPhoneNumberSmsWebhook, {
      phoneNumberId: failed.phoneNumberId as Id<"phone_numbers">,
    });

    expect(resynced).toMatchObject({
      phoneNumberId: failed.phoneNumberId,
      smsWebhookStatus: "synced",
    });
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
