import { convexTest, type TestConvex } from "convex-test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const {
  lookupFetchMock,
  verificationCreateMock,
  verificationCheckCreateMock,
} = vi.hoisted(() => ({
  lookupFetchMock: vi.fn(),
  verificationCreateMock: vi.fn(),
  verificationCheckCreateMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const twilioFactory = Object.assign(
    vi.fn(() => ({
      lookups: {
        v2: {
          phoneNumbers: () => ({
            fetch: lookupFetchMock,
          }),
        },
      },
      verify: {
        v2: {
          services: () => ({
            verifications: {
              create: verificationCreateMock,
            },
            verificationChecks: {
              create: verificationCheckCreateMock,
            },
          }),
        },
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

type ConvexHarness = TestConvex<typeof schema>;

const convexModules = modules;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const originalTwilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

async function seedBusinessOwner(t: ConvexHarness) {
  const subject = "onboarding-phone-verify-owner";

  const { businessId, userId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: "onboarding-phone-verification-business",
      name: "Onboarding Phone Verification Business",
      timezone: "America/Toronto",
      defaultLocale: "en",
      onboardingStage: "verify_phone",
      businessType: "clinic",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: subject,
      email: "owner@example.com",
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

async function listVerificationAttempts(
  t: ConvexHarness,
  businessId: Id<"businesses">,
): Promise<Array<Doc<"onboarding_phone_verifications">>> {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("onboarding_phone_verifications")
      .withIndex("by_business_id_and_user_id", (q) => q.eq("businessId", businessId))
      .collect();
  });
}

describe("onboarding phone verification actions", () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA123";

    vi.clearAllMocks();
    lookupFetchMock.mockResolvedValue({
      phoneNumber: "+15817484609",
      countryCode: "CA",
      valid: true,
      lineTypeIntelligence: {
        type: "mobile",
      },
    });
    verificationCreateMock.mockResolvedValue({
      sid: "VE123",
      status: "pending",
    });
    verificationCheckCreateMock.mockResolvedValue({
      status: "approved",
    });
  });

  afterAll(() => {
    process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
    process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
    process.env.TWILIO_VERIFY_SERVICE_SID = originalTwilioVerifyServiceSid;
  });

  it("starts phone verification and stores the normalized verified-phone context", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    const result = await authed.action(api.onboarding.phoneVerification.startPhoneVerification, {
      businessId,
      phoneE164: "+1 (581) 748-4609",
    });

    expect(lookupFetchMock).toHaveBeenCalledWith({
      fields: "line_type_intelligence",
    });
    expect(verificationCreateMock).toHaveBeenCalledWith({
      to: "+15817484609",
      channel: "sms",
    });
    expect(result).toEqual({
      status: "pending",
      phoneE164: "+15817484609",
      countryCode: "CA",
    });

    const attempts = await listVerificationAttempts(t, businessId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      phoneE164: "+15817484609",
      countryCode: "CA",
      verificationSid: "VE123",
      status: "pending",
      lineType: "mobile",
    });
  });

  it("marks the user phone verified and advances onboarding after a valid code", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    await authed.action(api.onboarding.phoneVerification.startPhoneVerification, {
      businessId,
      phoneE164: "+15817484609",
    });

    const result = await authed.action(api.onboarding.phoneVerification.checkPhoneVerification, {
      businessId,
      phoneE164: "+15817484609",
      code: "123456",
    });

    expect(verificationCheckCreateMock).toHaveBeenCalledWith({
      verificationSid: "VE123",
      code: "123456",
    });
    expect(result).toEqual({
      status: "approved",
      phoneE164: "+15817484609",
    });

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.onboardingStage).toBe("phone_number");

    const currentUser = await authed.query(api.users.current, {});
    expect(currentUser?.phone).toBe("+15817484609");
    expect(currentUser?.phoneVerificationTime).toEqual(expect.any(Number));
  });

  it("rejects non-mobile numbers when lookup identifies them", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    lookupFetchMock.mockResolvedValueOnce({
      phoneNumber: "+14165550123",
      countryCode: "CA",
      valid: true,
      lineTypeIntelligence: {
        type: "landline",
      },
    });

    await expect(
      authed.action(api.onboarding.phoneVerification.startPhoneVerification, {
        businessId,
        phoneE164: "+14165550123",
      }),
    ).rejects.toThrow("Enter a real mobile number that can receive SMS verification.");
  });

  it("keeps onboarding on verify_phone when the submitted code is invalid", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    verificationCheckCreateMock.mockResolvedValueOnce({
      status: "pending",
    });

    await authed.action(api.onboarding.phoneVerification.startPhoneVerification, {
      businessId,
      phoneE164: "+15817484609",
    });

    const result = await authed.action(api.onboarding.phoneVerification.checkPhoneVerification, {
      businessId,
      phoneE164: "+15817484609",
      code: "000000",
    });

    expect(result).toEqual({
      status: "pending",
      message: "That verification code is invalid or expired. Try requesting a new one.",
    });

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.onboardingStage).toBe("verify_phone");
  });

  it("refuses to start verification once the business leaves verify_phone", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    await t.run(async (ctx) => {
      await ctx.db.patch(businessId, {
        onboardingStage: "phone_number",
      });
    });

    await expect(
      authed.action(api.onboarding.phoneVerification.startPhoneVerification, {
        businessId,
        phoneE164: "+15817484609",
      }),
    ).rejects.toThrow("Phone verification is no longer available for this business.");
  });

  it("refuses to approve a code once the business leaves verify_phone", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    await authed.action(api.onboarding.phoneVerification.startPhoneVerification, {
      businessId,
      phoneE164: "+15817484609",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(businessId, {
        onboardingStage: "completed",
      });
    });

    await expect(
      authed.action(api.onboarding.phoneVerification.checkPhoneVerification, {
        businessId,
        phoneE164: "+15817484609",
        code: "123456",
      }),
    ).rejects.toThrow("Phone verification is no longer available for this business.");
  });

  it("lets already verified owners skip repeat verification for a new business", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject, userId } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        phone: "+15817484609",
        phoneVerificationTime: 1_700_000_000_000,
      });
    });

    const result = await authed.action(
      api.onboarding.phoneVerification.reuseVerifiedPhoneForOnboarding,
      {
        businessId,
      },
    );

    expect(result).toEqual({
      status: "approved",
      phoneE164: "+15817484609",
    });

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.onboardingStage).toBe("phone_number");
  });
});
