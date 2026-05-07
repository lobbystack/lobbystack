import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { requireMembership } from "../lib/auth";

type LatestAttemptArgs = {
  businessId: Id<"businesses">;
};

/**
 * Public query that returns the latest phone-verification attempt for the
 * authenticated user + business. Used by the OTP entry screen to pre-fill
 * the masked phone number after a refresh — without requiring the user to
 * re-enter their mobile number from scratch.
 */
export const getLatestPhoneVerificationAttempt = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (
    ctx: QueryCtx,
    args: LatestAttemptArgs,
  ): Promise<{ phoneE164: string; status: string } | null> => {
    await requireMembership(ctx, args.businessId);
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    const attempts = await ctx.db
      .query("onboarding_phone_verifications")
      .withIndex("by_business_id_and_user_id", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id),
      )
      .collect();

    if (attempts.length === 0) {
      return null;
    }

    const latest = attempts.reduce((acc, attempt) =>
      attempt.updatedAt > acc.updatedAt ? attempt : acc,
    );

    return {
      phoneE164: latest.phoneE164,
      status: latest.status,
    };
  },
});
