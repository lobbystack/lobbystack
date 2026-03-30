import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const {
  createIncomingPhoneNumberMock,
  listLocalNumbersMock,
  listTollFreeNumbersMock,
  scheduleSnapshotRefreshMock,
} = vi.hoisted(() => ({
  createIncomingPhoneNumberMock: vi.fn(),
  listLocalNumbersMock: vi.fn(),
  listTollFreeNumbersMock: vi.fn(),
  scheduleSnapshotRefreshMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const incomingPhoneNumbers = Object.assign(
    vi.fn(() => ({
      update: vi.fn(),
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
  };
});

type ConvexHarness = TestConvex<typeof schema>;

const convexModules = modules;
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalVoiceGatewayBaseUrl = process.env.VOICE_GATEWAY_BASE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

const quebecCityContext = {
  countryCode: "CA",
  regionCode: "QC",
  city: "Quebec City",
  metroKey: "quebec_city",
  confidence: 0.95,
  source: "cloudflare" as const,
  timezone: "America/Toronto",
};

async function seedBusinessOwner(t: ConvexHarness) {
  const subject = "onboarding-phone-owner";

  const { businessId } = await t.run(async (ctx) => {
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

    return { businessId };
  });

  return { businessId, subject };
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
    createIncomingPhoneNumberMock.mockResolvedValue({
      sid: "PN-default",
      smsUrl: "https://example.convex.site/twilio/sms/inbound",
      voiceUrl: "https://voice.example.com/twilio/voice/inbound",
    });
  });

  it("prefers the inferred metro area-code cluster for the first suggestion", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
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
        if (args.areaCode === 418) {
          return [
            {
              phoneNumber: "+14185550101",
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
      context: quebecCityContext,
    });

    expect(listLocalNumbersMock).toHaveBeenNthCalledWith(1, {
      countryCode: "CA",
      args: {
        areaCode: 418,
        limit: 10,
        smsEnabled: true,
        voiceEnabled: true,
      },
    });
    expect(result.suggestion).toMatchObject({
      e164: "+14185550101",
      selectionContext: {
        mode: "area_code",
        areaCode: "418",
        countryCode: "CA",
      },
    });
  });

  it("searches toll-free inventory in the inferred country", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    listTollFreeNumbersMock.mockResolvedValue([
      {
        phoneNumber: "+18885550101",
        isoCountry: "CA",
      },
    ]);

    const result = await authed.action(api.onboarding.phoneNumbers.searchAvailableNumbers, {
      businessId,
      context: quebecCityContext,
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

  it("does not auto-suggest a random country-wide number when confidence is only timezone-based", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    listLocalNumbersMock.mockResolvedValue([
      {
        phoneNumber: "+12494687985",
        locality: "Barrie",
        region: "ON",
        isoCountry: "CA",
      },
    ]);

    const result = await authed.action(api.onboarding.phoneNumbers.getInitialNumberSuggestion, {
      businessId,
      context: {
        countryCode: "CA",
        confidence: 0.45,
        source: "timezone",
        timezone: "America/Toronto",
      },
    });

    expect(result.suggestion).toBeNull();
  });

  it("claims the selected number, persists it, and completes onboarding", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    createIncomingPhoneNumberMock.mockResolvedValueOnce({
      sid: "PN-claim-success",
      smsUrl: "https://example.convex.site/twilio/sms/inbound",
      voiceUrl: "https://voice.example.com/twilio/voice/inbound",
    });

    const result = await authed.action(api.onboarding.phoneNumbers.claimOnboardingNumber, {
      businessId,
      context: quebecCityContext,
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

  it("returns refreshed alternatives when the selected number is no longer available", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
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
      context: quebecCityContext,
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
});
