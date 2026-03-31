import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server";
import { onboardingRateLimiter } from "../lib/components";

const SUCCESSFUL_CLAIMS_PER_DAY = 2;
const SUCCESSFUL_CLAIMS_PER_THIRTY_DAYS = 5;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const BUSINESS_BOOTSTRAP_RATE_LIMIT_MESSAGE =
  "Too many workspace creation attempts. Try again later.";
export const PHONE_VERIFICATION_RATE_LIMIT_MESSAGE =
  "Too many verification attempts. Try again later.";
export const NUMBER_SEARCH_RATE_LIMIT_MESSAGE =
  "Too many number searches. Try again shortly.";
export const NUMBER_CLAIM_RATE_LIMIT_MESSAGE =
  "Number provisioning limit reached for now. Contact support if you need more businesses today.";

type AbuseControlCtx = Pick<ActionCtx, "runMutation" | "runQuery"> | Pick<MutationCtx, "runMutation" | "runQuery">;

function normalizePhoneRateLimitKey(phoneE164: string): string {
  const trimmed = phoneE164.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return trimmed;
  }

  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function logOnboardingAbuseEvent(input: {
  limiter: string;
  decision: "allowed" | "blocked";
  reason: string;
  userId?: Id<"users">;
  businessId?: Id<"businesses">;
  phoneE164?: string;
}) {
  const payload = {
    scope: "onboarding_abuse_control",
    ...input,
  };

  if (input.decision === "blocked") {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.info(JSON.stringify(payload));
}

async function consumeRateLimit(input: {
  ctx: AbuseControlCtx;
  limiterName:
    | "onboardingBusinessBootstrapPerHour"
    | "onboardingBusinessBootstrapPerDay"
    | "onboardingVerificationSendPerUserPerHour"
    | "onboardingVerificationSendPerPhonePerHour"
    | "onboardingInventorySearchPerTenMinutes"
    | "onboardingInitialSuggestionPerTenMinutes"
    | "onboardingClaimAttemptPerHour";
  key: string;
  message: string;
  reason: string;
  userId?: Id<"users">;
  businessId?: Id<"businesses">;
  phoneE164?: string;
}) {
  const result = await onboardingRateLimiter.limit(input.ctx, input.limiterName, {
    key: input.key,
  });

  if (!result.ok) {
    logOnboardingAbuseEvent({
      limiter: input.limiterName,
      decision: "blocked",
      reason: input.reason,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.businessId ? { businessId: input.businessId } : {}),
      ...(input.phoneE164 ? { phoneE164: input.phoneE164 } : {}),
    });
    throw new Error(input.message);
  }
}

export const getSuccessfulClaimQuotaState = internalQuery({
  args: {
    userId: v.id("users"),
    purchasedAfterDay: v.number(),
    purchasedAfterThirtyDays: v.number(),
  },
  handler: async (ctx, args) => {
    const [dailyEvents, monthlyEvents] = await Promise.all([
      ctx.db
        .query("onboarding_number_claim_events")
        .withIndex("by_user_id_and_purchased_at", (q) =>
          q.eq("userId", args.userId).gte("purchasedAt", args.purchasedAfterDay),
        )
        .order("desc")
        .take(SUCCESSFUL_CLAIMS_PER_DAY),
      ctx.db
        .query("onboarding_number_claim_events")
        .withIndex("by_user_id_and_purchased_at", (q) =>
          q.eq("userId", args.userId).gte("purchasedAt", args.purchasedAfterThirtyDays),
        )
        .order("desc")
        .take(SUCCESSFUL_CLAIMS_PER_THIRTY_DAYS),
    ]);

    return {
      dailyCount: dailyEvents.length,
      monthlyCount: monthlyEvents.length,
    };
  },
});

export const recordSuccessfulClaimEvent = internalMutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    phoneNumberId: v.id("phone_numbers"),
    twilioPhoneSid: v.string(),
    purchasedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("onboarding_number_claim_events", args);
  },
});

export const deleteSuccessfulClaimEvent = internalMutation({
  args: {
    claimEventId: v.id("onboarding_number_claim_events"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.claimEventId);
    return null;
  },
});

export async function assertBootstrapAllowed(
  ctx: AbuseControlCtx,
  userId: Id<"users">,
): Promise<void> {
  const key = String(userId);
  await consumeRateLimit({
    ctx,
    limiterName: "onboardingBusinessBootstrapPerHour",
    key,
    message: BUSINESS_BOOTSTRAP_RATE_LIMIT_MESSAGE,
    reason: "rate_limit_hourly",
    userId,
  });
  await consumeRateLimit({
    ctx,
    limiterName: "onboardingBusinessBootstrapPerDay",
    key,
    message: BUSINESS_BOOTSTRAP_RATE_LIMIT_MESSAGE,
    reason: "rate_limit_daily",
    userId,
  });
}

export async function assertVerificationSendAllowed(
  ctx: AbuseControlCtx,
  input: {
    businessId: Id<"businesses">;
    userId: Id<"users">;
    phoneE164: string;
  },
): Promise<void> {
  await consumeRateLimit({
    ctx,
    limiterName: "onboardingVerificationSendPerUserPerHour",
    key: String(input.userId),
    message: PHONE_VERIFICATION_RATE_LIMIT_MESSAGE,
    reason: "rate_limit_user",
    userId: input.userId,
    businessId: input.businessId,
    phoneE164: input.phoneE164,
  });
  await consumeRateLimit({
    ctx,
    limiterName: "onboardingVerificationSendPerPhonePerHour",
    key: normalizePhoneRateLimitKey(input.phoneE164),
    message: PHONE_VERIFICATION_RATE_LIMIT_MESSAGE,
    reason: "rate_limit_destination_phone",
    userId: input.userId,
    businessId: input.businessId,
    phoneE164: input.phoneE164,
  });
}

export async function assertInitialSuggestionAllowed(
  ctx: AbuseControlCtx,
  input: {
    businessId: Id<"businesses">;
    userId: Id<"users">;
  },
): Promise<void> {
  await consumeRateLimit({
    ctx,
    limiterName: "onboardingInitialSuggestionPerTenMinutes",
    key: String(input.userId),
    message: NUMBER_SEARCH_RATE_LIMIT_MESSAGE,
    reason: "rate_limit_initial_suggestion",
    userId: input.userId,
    businessId: input.businessId,
  });
}

export async function assertInventorySearchAllowed(
  ctx: AbuseControlCtx,
  input: {
    businessId: Id<"businesses">;
    userId: Id<"users">;
  },
): Promise<void> {
  await consumeRateLimit({
    ctx,
    limiterName: "onboardingInventorySearchPerTenMinutes",
    key: String(input.userId),
    message: NUMBER_SEARCH_RATE_LIMIT_MESSAGE,
    reason: "rate_limit_inventory_search",
    userId: input.userId,
    businessId: input.businessId,
  });
}

export async function assertClaimAttemptAllowed(
  ctx: AbuseControlCtx,
  input: {
    businessId: Id<"businesses">;
    userId: Id<"users">;
  },
): Promise<void> {
  await consumeRateLimit({
    ctx,
    limiterName: "onboardingClaimAttemptPerHour",
    key: String(input.userId),
    message: NUMBER_CLAIM_RATE_LIMIT_MESSAGE,
    reason: "rate_limit_claim_attempt",
    userId: input.userId,
    businessId: input.businessId,
  });

  const now = Date.now();
  const quotaState = await ctx.runQuery(internal.onboarding.abuse.getSuccessfulClaimQuotaState, {
    userId: input.userId,
    purchasedAfterDay: now - 24 * 60 * 60 * 1000,
    purchasedAfterThirtyDays: now - THIRTY_DAYS_MS,
  });

  if (quotaState.dailyCount >= SUCCESSFUL_CLAIMS_PER_DAY) {
    logOnboardingAbuseEvent({
      limiter: "onboardingSuccessfulClaimsPerDay",
      decision: "blocked",
      reason: "daily_quota",
      userId: input.userId,
      businessId: input.businessId,
    });
    throw new Error(NUMBER_CLAIM_RATE_LIMIT_MESSAGE);
  }

  if (quotaState.monthlyCount >= SUCCESSFUL_CLAIMS_PER_THIRTY_DAYS) {
    logOnboardingAbuseEvent({
      limiter: "onboardingSuccessfulClaimsPerThirtyDays",
      decision: "blocked",
      reason: "monthly_quota",
      userId: input.userId,
      businessId: input.businessId,
    });
    throw new Error(NUMBER_CLAIM_RATE_LIMIT_MESSAGE);
  }
}

export function recordSuccessfulPurchaseLog(input: {
  businessId: Id<"businesses">;
  userId: Id<"users">;
  phoneE164: string;
}) {
  logOnboardingAbuseEvent({
    limiter: "onboardingSuccessfulPurchase",
    decision: "allowed",
    reason: "successful_purchase",
    userId: input.userId,
    businessId: input.businessId,
    phoneE164: input.phoneE164,
  });
}

export function normalizeInventorySearchLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 10;
  }

  return Math.min(20, Math.max(1, Math.trunc(limit)));
}
