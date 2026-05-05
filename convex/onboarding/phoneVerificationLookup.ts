import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireMembership } from "../lib/auth";
import { ensureCurrentUser } from "../lib/auth";

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
    const user = await ensureCurrentUserReadable(ctx);
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

async function ensureCurrentUserReadable(ctx: QueryCtx) {
  // `ensureCurrentUser` accepts a writer context and may patch the user
  // doc; in a query context we only need to *read* the user. Inline a
  // narrow read-only resolver that mirrors `requireCurrentUser` semantics.
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }
  // Use the stable subject lookup index to find the user. This avoids the
  // patch logic (which is only available with a writer context) and keeps
  // the query side-effect free.
  const direct = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .unique();
  if (direct) {
    return direct;
  }
  // ensureCurrentUser is a no-op outside writer contexts; fall through.
  void ensureCurrentUser;
  return null;
}
