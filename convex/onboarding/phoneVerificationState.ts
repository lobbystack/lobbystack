import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

function sortAttemptsDescending(
  attempts: Array<Doc<"onboarding_phone_verifications">>,
): Array<Doc<"onboarding_phone_verifications">> {
  return [...attempts].sort((left, right) => right.updatedAt - left.updatedAt);
}

export const getLatestVerificationAttempt = internalQuery({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const attempts = await ctx.db
      .query("onboarding_phone_verifications")
      .withIndex("by_business_id_and_user_id", (q) =>
        q.eq("businessId", args.businessId).eq("userId", args.userId),
      )
      .collect();

    return sortAttemptsDescending(attempts)[0] ?? null;
  },
});

export const getLatestApprovedVerificationAttemptForPhone = internalQuery({
  args: {
    userId: v.id("users"),
    phoneE164: v.string(),
  },
  handler: async (ctx, args) => {
    const attempts = await ctx.db
      .query("onboarding_phone_verifications")
      .withIndex("by_phone_e164", (q) => q.eq("phoneE164", args.phoneE164))
      .collect();

    return (
      sortAttemptsDescending(attempts).find(
        (attempt) => attempt.userId === args.userId && attempt.status === "approved",
      ) ?? null
    );
  },
});

export const saveVerificationAttempt = internalMutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    phoneE164: v.string(),
    countryCode: v.string(),
    lineType: v.optional(v.string()),
    verificationSid: v.string(),
    status: v.string(),
    startedAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    approvedAt: v.optional(v.number()),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempts = await ctx.db
      .query("onboarding_phone_verifications")
      .withIndex("by_business_id_and_user_id", (q) =>
        q.eq("businessId", args.businessId).eq("userId", args.userId),
      )
      .collect();

    const [latest, ...stale] = sortAttemptsDescending(attempts);
    for (const staleAttempt of stale) {
      await ctx.db.delete(staleAttempt._id);
    }

    const patch = {
      phoneE164: args.phoneE164,
      countryCode: args.countryCode,
      ...(args.lineType ? { lineType: args.lineType } : {}),
      verificationSid: args.verificationSid,
      status: args.status,
      startedAt: args.startedAt,
      updatedAt: args.updatedAt,
      expiresAt: args.expiresAt,
      ...(args.approvedAt !== undefined ? { approvedAt: args.approvedAt } : {}),
      attemptCount: args.attemptCount,
      ...(args.lastError ? { lastError: args.lastError } : {}),
    };

    if (latest) {
      await ctx.db.patch(latest._id, patch);
      return latest._id;
    }

    return await ctx.db.insert("onboarding_phone_verifications", {
      businessId: args.businessId,
      userId: args.userId,
      ...patch,
    });
  },
});

export const markVerificationApproved = internalMutation({
  args: {
    attemptId: v.id("onboarding_phone_verifications"),
    userId: v.id("users"),
    businessId: v.id("businesses"),
    phoneE164: v.string(),
    approvedAt: v.number(),
    attemptCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.attemptId, {
      status: "approved",
      approvedAt: args.approvedAt,
      updatedAt: args.approvedAt,
      attemptCount: args.attemptCount,
      lastError: undefined,
    });

    await ctx.db.patch(args.userId, {
      phone: args.phoneE164,
      phoneVerificationTime: args.approvedAt,
    });

    await ctx.db.patch(args.businessId, {
      onboardingStage: "website",
    });
  },
});

export const updateVerificationAttemptStatus = internalMutation({
  args: {
    attemptId: v.id("onboarding_phone_verifications"),
    status: v.string(),
    updatedAt: v.number(),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.attemptId, {
      status: args.status,
      updatedAt: args.updatedAt,
      attemptCount: args.attemptCount,
      ...(args.lastError ? { lastError: args.lastError } : {}),
    });
  },
});
