"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { type ActionCtx } from "../_generated/server";
import { getTwilioClient, requireTwilioVerifyServiceSid } from "../lib/node/twilioClient";
import { normalizeOnboardingStage } from "../lib/onboardingStage";
import { assertVerificationSendAllowed } from "./abuse";

import { observedAction as action } from "../telemetry/observedFunctions";
type TwilioLookupResult = {
  phoneNumber: string;
  countryCode: string;
  valid: boolean;
  validationErrors?: string[];
  lineTypeIntelligence?: {
    type?: string | null;
    errorCode?: number | null;
  };
};

type TwilioVerificationResult = {
  sid: string;
  status: string;
};

type TwilioVerificationCheckResult = {
  status: string;
};

type StartPhoneVerificationResult = {
  status: "pending";
  phoneE164: string;
  countryCode: string;
};

type CheckPhoneVerificationResult =
  | {
      status: "approved";
      phoneE164: string;
    }
  | {
      status: "pending";
      message: string;
    };

const VERIFICATION_RESEND_COOLDOWN_MS = 30_000;
const SUPPORTED_VERIFICATION_COUNTRIES = new Set(["US", "CA", "GB"]);

function normalizeLineType(lineType: string | null | undefined): string | undefined {
  const normalized = lineType?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function assertSupportedVerificationCountry(countryCode: string): void {
  if (!SUPPORTED_VERIFICATION_COUNTRIES.has(countryCode.trim().toUpperCase())) {
    throw new Error("We currently support US, Canadian, and UK mobile numbers.");
  }
}

function buildVerificationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "We couldn't verify that mobile number right now.";
}

async function assertOnboardingAccess(ctx: ActionCtx, businessId: Id<"businesses">): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }
  const authUserId = await getAuthUserId(ctx);

  await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId ? { authUserId: String(authUserId) } : {}),
  });
}

async function requireBusinessScopedAuthenticatedUser(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }

  const authUserId = await getAuthUserId(ctx);
  const user = await ctx.runQuery(internal.users.getAuthenticatedUserForBusiness, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId ? { authUserId: String(authUserId) } : {}),
  });
  if (!user) {
    throw new Error("User profile not initialized.");
  }

  return user;
}

async function requireBusinessInPhoneVerificationStage(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const business = await ctx.runQuery(internal.businesses.admin.getBusinessById, {
    businessId,
  });
  if (!business) {
    throw new Error("Business not found.");
  }
  const stage = normalizeOnboardingStage(business.onboardingStage);
  if (stage !== "verify_phone" && stage !== "verify_phone_code") {
    throw new Error("Phone verification is no longer available for this business.");
  }
}

export const startPhoneVerification = action({
  args: {
    businessId: v.id("businesses"),
    phoneE164: v.string(),
  },
  handler: async (ctx, args): Promise<StartPhoneVerificationResult> => {
    await assertOnboardingAccess(ctx, args.businessId);
    await requireBusinessInPhoneVerificationStage(ctx, args.businessId);
    const user = await requireBusinessScopedAuthenticatedUser(ctx, args.businessId);
    await assertVerificationSendAllowed(ctx, {
      businessId: args.businessId,
      userId: user._id,
      phoneE164: args.phoneE164,
    });

    try {
      const client = getTwilioClient();
      const verifyServiceSid = requireTwilioVerifyServiceSid();
      const lookup: TwilioLookupResult = await client.lookups.v2
        .phoneNumbers(args.phoneE164)
        .fetch({
          fields: "line_type_intelligence",
        });

      if (!lookup.valid) {
        throw new Error("Enter a valid mobile number in international format.");
      }
      assertSupportedVerificationCountry(lookup.countryCode);

      const lineType = normalizeLineType(lookup.lineTypeIntelligence?.type);
      if (lineType && lineType !== "mobile") {
        throw new Error("Enter a real mobile number that can receive SMS verification.");
      }

      const latestAttempt = await ctx.runQuery(
        internal.onboarding.phoneVerificationState.getLatestVerificationAttempt,
        {
          businessId: args.businessId,
          userId: user._id,
        },
      );
      const now = Date.now();

      if (
        latestAttempt &&
        latestAttempt.phoneE164 === lookup.phoneNumber &&
        latestAttempt.status !== "approved" &&
        now - latestAttempt.updatedAt < VERIFICATION_RESEND_COOLDOWN_MS
      ) {
        throw new Error("We just sent a verification code. Please wait a moment before retrying.");
      }

      const verification: TwilioVerificationResult = await client.verify.v2
        .services(verifyServiceSid)
        .verifications.create({
          to: lookup.phoneNumber,
          channel: "sms",
        });

      await ctx.runMutation(internal.onboarding.phoneVerificationState.saveVerificationAttempt, {
        businessId: args.businessId,
        userId: user._id,
        phoneE164: lookup.phoneNumber,
        countryCode: lookup.countryCode,
        ...(lineType ? { lineType } : {}),
        verificationSid: verification.sid,
        status: verification.status,
        startedAt: now,
        updatedAt: now,
        expiresAt: now + 10 * 60 * 1000,
        attemptCount: 0,
      });

      // Advance to the OTP entry stage so a refresh resumes on the
      // code-entry screen instead of the phone-input screen.
      await ctx.runMutation(internal.businesses.admin.advanceOnboardingStage, {
        businessId: args.businessId,
        onboardingStage: "verify_phone_code",
      });

      return {
        status: "pending" as const,
        phoneE164: lookup.phoneNumber,
        countryCode: lookup.countryCode,
      };
    } catch (error) {
      throw new Error(buildVerificationErrorMessage(error));
    }
  },
});

export const reuseVerifiedPhoneForOnboarding = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<{ status: "approved"; phoneE164: string }> => {
    await assertOnboardingAccess(ctx, args.businessId);
    await requireBusinessInPhoneVerificationStage(ctx, args.businessId);
    const user = await requireBusinessScopedAuthenticatedUser(ctx, args.businessId);

    if (!user.phone || !user.phoneVerificationTime) {
      throw new Error("Verify your mobile number before continuing.");
    }

    const latestApprovedAttempt = await ctx.runQuery(
      internal.onboarding.phoneVerificationState.getLatestApprovedVerificationAttemptForPhone,
      {
        userId: user._id,
        phoneE164: user.phone,
      },
    );
    if (!latestApprovedAttempt || latestApprovedAttempt.phoneE164 !== user.phone) {
      throw new Error("Verify your mobile number before continuing.");
    }

    await ctx.runMutation(internal.onboarding.phoneVerificationState.saveVerificationAttempt, {
      businessId: args.businessId,
      userId: user._id,
      phoneE164: user.phone,
      countryCode: latestApprovedAttempt.countryCode,
      ...(latestApprovedAttempt.lineType ? { lineType: latestApprovedAttempt.lineType } : {}),
      verificationSid: `reused:${String(args.businessId)}:${latestApprovedAttempt._id}`,
      status: "approved",
      startedAt: user.phoneVerificationTime,
      updatedAt: user.phoneVerificationTime,
      expiresAt: user.phoneVerificationTime + 10 * 60 * 1000,
      approvedAt: user.phoneVerificationTime,
      attemptCount: 1,
    });

    // Skip the OTP entry sub-stage because the user already has a verified
    // phone on file from a previous onboarding session.
    await ctx.runMutation(internal.businesses.admin.advanceOnboardingStage, {
      businessId: args.businessId,
      onboardingStage: "phone_number",
    });

    return {
      status: "approved" as const,
      phoneE164: user.phone,
    };
  },
});

export const resendPhoneVerification = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<StartPhoneVerificationResult> => {
    await assertOnboardingAccess(ctx, args.businessId);
    await requireBusinessInPhoneVerificationStage(ctx, args.businessId);
    const user = await requireBusinessScopedAuthenticatedUser(ctx, args.businessId);
    const attempt: Doc<"onboarding_phone_verifications"> | null = await ctx.runQuery(
      internal.onboarding.phoneVerificationState.getLatestVerificationAttempt,
      {
        businessId: args.businessId,
        userId: user._id,
      },
    );

    if (!attempt) {
      throw new Error("Start verification again before requesting a new code.");
    }

    const now = Date.now();
    if (now - attempt.updatedAt < VERIFICATION_RESEND_COOLDOWN_MS) {
      throw new Error("Please wait a moment before requesting another code.");
    }

    await assertVerificationSendAllowed(ctx, {
      businessId: args.businessId,
      userId: user._id,
      phoneE164: attempt.phoneE164,
    });

    try {
      const client = getTwilioClient();
      const verifyServiceSid = requireTwilioVerifyServiceSid();
      const verification: TwilioVerificationResult = await client.verify.v2
        .services(verifyServiceSid)
        .verifications.create({
          to: attempt.phoneE164,
          channel: "sms",
        });

      await ctx.runMutation(internal.onboarding.phoneVerificationState.saveVerificationAttempt, {
        businessId: args.businessId,
        userId: user._id,
        phoneE164: attempt.phoneE164,
        countryCode: attempt.countryCode,
        ...(attempt.lineType ? { lineType: attempt.lineType } : {}),
        verificationSid: verification.sid,
        status: verification.status,
        startedAt: now,
        updatedAt: now,
        expiresAt: now + 10 * 60 * 1000,
        attemptCount: 0,
      });

      return {
        status: "pending" as const,
        phoneE164: attempt.phoneE164,
        countryCode: attempt.countryCode,
      };
    } catch (error) {
      throw new Error(buildVerificationErrorMessage(error));
    }
  },
});

export const checkPhoneVerification = action({
  args: {
    businessId: v.id("businesses"),
    phoneE164: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args): Promise<CheckPhoneVerificationResult> => {
    await assertOnboardingAccess(ctx, args.businessId);
    await requireBusinessInPhoneVerificationStage(ctx, args.businessId);
    const user = await requireBusinessScopedAuthenticatedUser(ctx, args.businessId);
    const attempt: Doc<"onboarding_phone_verifications"> | null = await ctx.runQuery(
      internal.onboarding.phoneVerificationState.getLatestVerificationAttempt,
      {
        businessId: args.businessId,
        userId: user._id,
      },
    );

    if (!attempt || attempt.phoneE164 !== args.phoneE164) {
      throw new Error("Start verification again before entering a code.");
    }

    if (attempt.status === "approved") {
      return {
        status: "approved" as const,
        phoneE164: attempt.phoneE164,
      };
    }

    try {
      const client = getTwilioClient();
      const verifyServiceSid = requireTwilioVerifyServiceSid();
      const result: TwilioVerificationCheckResult = await client.verify.v2
        .services(verifyServiceSid)
        .verificationChecks.create({
          verificationSid: attempt.verificationSid,
          code: args.code.trim(),
        });

      const nextAttemptCount = attempt.attemptCount + 1;
      const now = Date.now();

      if (result.status === "approved") {
        await ctx.runMutation(internal.onboarding.phoneVerificationState.markVerificationApproved, {
          attemptId: attempt._id,
          userId: user._id,
          businessId: args.businessId,
          phoneE164: attempt.phoneE164,
          approvedAt: now,
          attemptCount: nextAttemptCount,
        });

        return {
          status: "approved" as const,
          phoneE164: attempt.phoneE164,
        };
      }

      const message = "That verification code is invalid or expired. Try requesting a new one.";
      await ctx.runMutation(
        internal.onboarding.phoneVerificationState.updateVerificationAttemptStatus,
        {
          attemptId: attempt._id,
          status: result.status,
          updatedAt: now,
          attemptCount: nextAttemptCount,
          lastError: message,
        },
      );

      return {
        status: "pending" as const,
        message,
      };
    } catch (error) {
      throw new Error(buildVerificationErrorMessage(error));
    }
  },
});
