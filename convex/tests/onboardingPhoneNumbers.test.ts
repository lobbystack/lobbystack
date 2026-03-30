import { v } from "convex/values";
import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import schema from "../schema";
import { modules } from "../test.setup";

const {
  createIncomingPhoneNumberMock,
  removeIncomingPhoneNumberMock,
  listLocalNumbersMock,
  listTollFreeNumbersMock,
  scheduleSnapshotRefreshMock,
  setOnboardingStageFailureMessageMock,
} = vi.hoisted(() => ({
  createIncomingPhoneNumberMock: vi.fn(),
  removeIncomingPhoneNumberMock: vi.fn(),
  listLocalNumbersMock: vi.fn(),
  listTollFreeNumbersMock: vi.fn(),
  scheduleSnapshotRefreshMock: vi.fn(),
  setOnboardingStageFailureMessageMock: vi.fn<() => string | null>(),
}));

vi.mock("twilio", () => {
  const incomingPhoneNumbers = Object.assign(
    vi.fn(() => ({
      update: vi.fn(),
      remove: removeIncomingPhoneNumberMock,
    })),
    {
      create: createIncomingPhoneNumberMock,
    },
  );

  const twilioFactory = Object.assign(
    vi.fn(() => ({
      availablePhoneNumbers: (countryCode: string) => ({
        local: {
          list: (args: unknown) => listLocalNumbersMock({ countryCode, args }),
        },
        tollFree: {
          list: (args: unknown) => listTollFreeNumbersMock({ countryCode, args }),
        },
      }),
      incomingPhoneNumbers,
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
    setOnboardingStage: internalMutation({
      args: {
        businessId: v.id("businesses"),
        onboardingStage: v.string(),
      },
      handler: async (ctx, args) => {
        const failureMessage = setOnboardingStageFailureMessageMock();
        if (failureMessage) {
          throw new Error(failureMessage);
        }

        await ctx.db.patch(args.businessId, {
          onboardingStage: args.onboardingStage,
        });
        return args.onboardingStage;
      },
    }),
  };
});

type ConvexHarness = TestConvex<typeof schema>;

const convexModules = modules;
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalVoiceGatewayBaseUrl = process.env.VOICE_GATEWAY_BASE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

async function seedBusinessOwner(t: ConvexHarness) {
  const subject = "onboarding-phone-owner";

  const { businessId, userId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: "onboarding-phone-number-business",
      name: "Onboarding Phone Number Business",
      timezone: "America/Toronto",
      defaultLocale: "en",
      onboardingStage: "phone_number",
      businessType: "clinic",
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
      status: "active",
    });

    return { businessId, userId };
  });

  return { businessId, subject, userId };
}

async function seedVerifiedPhone(input: {
  t: ConvexHarness;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  phoneE164: string;
  countryCode: string;
}) {
  await input.t.run(async (ctx) => {
    await ctx.db.patch(input.userId, {
      phone: input.phoneE164,
      phoneVerificationTime: Date.now(),
    });
    await ctx.db.insert("onboarding_phone_verifications", {
      businessId: input.businessId,
      userId: input.userId,
      phoneE164: input.phoneE164,
      countryCode: input.countryCode,
      verificationSid: "VE-approved",
      status: "approved",
      startedAt: Date.now() - 1000,
      updatedAt: Date.now() - 500,
      expiresAt: Date.now() + 600000,
      approvedAt: Date.now() - 500,
      attemptCount: 1,
    });
  });
}

async function listBusinessPhoneNumbers(
  t: ConvexHarness,
  businessId: Id<"businesses">,
): Promise<Array<Doc<"phone_numbers">>> {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("phone_numbers")
      .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
      .collect();
  });
}

describe("onboarding phone-number actions", () => {
  beforeEach(() => {
    process.env.CONVEX_SITE_URL = "https://example.convex.site";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
    process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";

    vi.clearAllMocks();
    scheduleSnapshotRefreshMock.mockResolvedValue(null);
    listLocalNumbersMock.mockResolvedValue([]);
    listTollFreeNumbersMock.mockResolvedValue([]);
    removeIncomingPhoneNumberMock.mockResolvedValue(true);
    setOnboardingStageFailureMessageMock.mockReturnValue(null);
    createIncomingPhoneNumberMock.mockResolvedValue({
      sid: "PN-default",
      smsUrl: "https://example.convex.site/twilio/sms/inbound",
      voiceUrl: "https://voice.example.com/twilio/voice/inbound",
    });
  });

  it("prefers the inferred metro area-code cluster for the first suggestion", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    listLocalNumbersMock.mockImplementation(
      async ({
        args,
      }: {
        countryCode: string;
        args: {
          areaCode?: number;
          limit: number;
          smsEnabled: boolean;
          voiceEnabled: boolean;
        };
      }) => {
        if (args.areaCode === 581) {
          return [
            {
              phoneNumber: "+15815550101",
              locality: "Quebec City",
              region: "QC",
              isoCountry: "CA",
            },
          ];
        }

        return [];
      },
    );

    const result = await authed.action(api.onboarding.phoneNumbers.getInitialNumberSuggestion, {
      businessId,
    });

    expect(listLocalNumbersMock).toHaveBeenNthCalledWith(1, {
      countryCode: "CA",
      args: {
        areaCode: 581,
        limit: 10,
        smsEnabled: true,
        voiceEnabled: true,
      },
    });
    expect(result.market).toMatchObject({
      areaCode: "581",
      metroKey: "quebec_city",
    });
    expect(result.suggestion).toMatchObject({
      e164: "+15815550101",
      selectionContext: {
        mode: "area_code",
        areaCode: "581",
        countryCode: "CA",
      },
    });
  });

  it("searches toll-free inventory in the inferred country", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    listTollFreeNumbersMock.mockResolvedValue([
      {
        phoneNumber: "+18885550101",
        isoCountry: "CA",
      },
    ]);

    const result = await authed.action(api.onboarding.phoneNumbers.searchAvailableNumbers, {
      businessId,
      mode: "toll_free",
      limit: 5,
    });

    expect(listTollFreeNumbersMock).toHaveBeenCalledWith({
      countryCode: "CA",
      args: {
        limit: 5,
        smsEnabled: true,
        voiceEnabled: true,
      },
    });
    expect(result.selectionContext).toEqual({
      mode: "toll_free",
      countryCode: "CA",
    });
    expect(result.numbers[0]).toMatchObject({
      e164: "+18885550101",
      kind: "toll_free",
    });
  });

  it("allows city searches outside the verified region when the user overrides the suggested city", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    await authed.action(api.onboarding.phoneNumbers.searchAvailableNumbers, {
      businessId,
      mode: "city",
      city: "Toronto",
      limit: 5,
    });

    expect(listLocalNumbersMock).toHaveBeenCalledWith({
      countryCode: "CA",
      args: {
        inLocality: "Toronto",
        limit: 5,
        smsEnabled: true,
        voiceEnabled: true,
      },
    });
  });

  it("returns an empty result for blank area-code searches without calling Twilio", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    const result = await authed.action(api.onboarding.phoneNumbers.searchAvailableNumbers, {
      businessId,
      mode: "area_code",
      areaCode: "   ",
      limit: 5,
    });

    expect(listLocalNumbersMock).not.toHaveBeenCalled();
    expect(result.selectionContext).toEqual({
      mode: "area_code",
      countryCode: "CA",
      areaCode: "",
    });
    expect(result.numbers).toEqual([]);
  });

  it("uses the verified phone area code instead of unrelated geo hints", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    listLocalNumbersMock.mockImplementation(async ({ args }: { countryCode: string; args: { areaCode?: number } }) => {
      if (args.areaCode === 581) {
        return [
          {
            phoneNumber: "+15815550101",
            locality: "Quebec City",
            region: "QC",
            isoCountry: "CA",
          },
        ];
      }

      if (args.areaCode === 437) {
        return [
          {
            phoneNumber: "+14375250420",
            locality: "Toronto",
            region: "ON",
            isoCountry: "CA",
          },
        ];
      }

      return [];
    });

    const result = await authed.action(api.onboarding.phoneNumbers.getInitialNumberSuggestion, {
      businessId,
    });

    expect(result.suggestion?.e164).toBe("+15815550101");
  });

  it("claims the selected number, persists it, and completes onboarding", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    createIncomingPhoneNumberMock.mockResolvedValueOnce({
      sid: "PN-claim-success",
      smsUrl: "https://example.convex.site/twilio/sms/inbound",
      voiceUrl: "https://voice.example.com/twilio/voice/inbound",
    });

    const result = await authed.action(api.onboarding.phoneNumbers.claimOnboardingNumber, {
      businessId,
      e164: "+14185550123",
      selectionContext: {
        mode: "area_code",
        countryCode: "CA",
        areaCode: "418",
      },
    });

    expect(createIncomingPhoneNumberMock).toHaveBeenCalledWith({
      friendlyName: `business:${String(businessId)}`,
      phoneNumber: "+14185550123",
      smsMethod: "POST",
      smsUrl: "https://example.convex.site/twilio/sms/inbound",
      voiceMethod: "POST",
      voiceUrl: "https://voice.example.com/twilio/voice/inbound",
    });
    expect(result).toMatchObject({
      status: "claimed",
      e164: "+14185550123",
    });

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.onboardingStage).toBe("completed");

    const phoneNumbers = await listBusinessPhoneNumbers(t, businessId);
    expect(phoneNumbers).toHaveLength(1);
    expect(phoneNumbers[0]).toMatchObject({
      e164: "+14185550123",
      twilioPhoneSid: "PN-claim-success",
      voiceWebhookStatus: "synced",
      smsWebhookStatus: "synced",
      voiceWebhookTargetUrl: "https://voice.example.com/twilio/voice/inbound",
      smsWebhookTargetUrl: "https://example.convex.site/twilio/sms/inbound",
    });
  });

  it("rejects claims once onboarding is no longer on the phone-number step", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    await t.run(async (ctx) => {
      await ctx.db.patch(businessId, {
        onboardingStage: "completed",
      });
    });

    await expect(
      authed.action(api.onboarding.phoneNumbers.claimOnboardingNumber, {
        businessId,
        e164: "+14185550123",
        selectionContext: {
          mode: "area_code",
          countryCode: "CA",
          areaCode: "418",
        },
      }),
    ).rejects.toThrow("Phone-number onboarding has already been completed for this business.");

    expect(createIncomingPhoneNumberMock).not.toHaveBeenCalled();
  });

  it("returns refreshed alternatives when the selected number is no longer available", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    createIncomingPhoneNumberMock.mockRejectedValueOnce(new Error("Number already taken"));
    listLocalNumbersMock.mockImplementation(
      async ({
        args,
      }: {
        countryCode: string;
        args: {
          areaCode?: number;
          limit: number;
          smsEnabled: boolean;
          voiceEnabled: boolean;
        };
      }) => {
        if (args.areaCode === 418) {
          return [
            {
              phoneNumber: "+14185550999",
              locality: "Quebec City",
              region: "QC",
              isoCountry: "CA",
            },
          ];
        }

        return [];
      },
    );

    const result = await authed.action(api.onboarding.phoneNumbers.claimOnboardingNumber, {
      businessId,
      e164: "+14185550123",
      selectionContext: {
        mode: "area_code",
        countryCode: "CA",
        areaCode: "418",
      },
    });

    expect(result).toMatchObject({
      status: "unavailable",
      message: "The selected phone number is no longer available.",
    });
    if (result.status !== "unavailable") {
      throw new Error("Expected an unavailable result.");
    }
    expect(result.alternatives).toMatchObject([
      {
        e164: "+14185550999",
      },
    ]);

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.onboardingStage).toBe("phone_number");
    expect(await listBusinessPhoneNumbers(t, businessId)).toHaveLength(0);
  });

  it("releases the purchased Twilio number if local persistence fails", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    await t.run(async (ctx) => {
      await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550123",
        twilioPhoneSid: "PN-existing",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        voiceWebhookStatus: "synced",
        smsWebhookStatus: "synced",
      });
    });

    createIncomingPhoneNumberMock.mockResolvedValueOnce({
      sid: "PN-needs-cleanup",
      smsUrl: "https://example.convex.site/twilio/sms/inbound",
      voiceUrl: "https://voice.example.com/twilio/voice/inbound",
    });

    const result = await authed.action(api.onboarding.phoneNumbers.claimOnboardingNumber, {
      businessId,
      e164: "+14185550123",
      selectionContext: {
        mode: "area_code",
        countryCode: "CA",
        areaCode: "418",
      },
    });

    expect(result).toEqual({
      status: "failed",
      message: "The phone number +14185550123 is already mapped to a business.",
    });
    expect(removeIncomingPhoneNumberMock).toHaveBeenCalledTimes(1);
    expect(await listBusinessPhoneNumbers(t, businessId)).toHaveLength(1);
  });

  it("rolls back the saved phone row if a later onboarding step fails", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    createIncomingPhoneNumberMock.mockResolvedValueOnce({
      sid: "PN-post-save-failure",
      smsUrl: "https://example.convex.site/twilio/sms/inbound",
      voiceUrl: "https://voice.example.com/twilio/voice/inbound",
    });
    setOnboardingStageFailureMessageMock.mockReturnValueOnce(
      "Failed to complete onboarding after the number was saved.",
    );

    const result = await authed.action(api.onboarding.phoneNumbers.claimOnboardingNumber, {
      businessId,
      e164: "+14185550123",
      selectionContext: {
        mode: "area_code",
        countryCode: "CA",
        areaCode: "418",
      },
    });

    expect(result).toEqual({
      status: "failed",
      message: "Failed to complete onboarding after the number was saved.",
    });
    expect(removeIncomingPhoneNumberMock).toHaveBeenCalledTimes(1);
    expect(await listBusinessPhoneNumbers(t, businessId)).toHaveLength(0);
  });

  it("surfaces non-availability provisioning errors even when the refreshed list changes", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    await seedVerifiedPhone({
      t,
      businessId,
      userId,
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const authed = t.withIdentity({ subject });

    createIncomingPhoneNumberMock.mockRejectedValueOnce(
      new Error("VOICE_GATEWAY_BASE_URL is required for Twilio voice webhook configuration."),
    );
    listLocalNumbersMock.mockImplementation(
      async ({
        args,
      }: {
        countryCode: string;
        args: {
          areaCode?: number;
          limit: number;
          smsEnabled: boolean;
          voiceEnabled: boolean;
        };
      }) => {
        if (args.areaCode === 418) {
          return [
            {
              phoneNumber: "+14185550999",
              locality: "Quebec City",
              region: "QC",
              isoCountry: "CA",
            },
          ];
        }

        return [];
      },
    );

    const result = await authed.action(api.onboarding.phoneNumbers.claimOnboardingNumber, {
      businessId,
      e164: "+14185550123",
      selectionContext: {
        mode: "area_code",
        countryCode: "CA",
        areaCode: "418",
      },
    });

    expect(result).toEqual({
      status: "failed",
      message: "VOICE_GATEWAY_BASE_URL is required for Twilio voice webhook configuration.",
    });
    expect(await listBusinessPhoneNumbers(t, businessId)).toHaveLength(0);
  });
});
