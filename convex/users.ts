import { v } from "convex/values";

import { internalQuery, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { resolveCurrentUserForPasswordCredentials } from "./lib/accountCredentials";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const { user, passwordAccount } = await resolveCurrentUserForPasswordCredentials(ctx);
    if (!user) {
      return null;
    }

    if (!passwordAccount || passwordAccount.providerAccountId === user.email) {
      return user;
    }

    return {
      ...user,
      email: passwordAccount.providerAccountId,
    };
  },
});

export const resolveAuthenticatedUserForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
    authSubject: v.string(),
    authUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUserId = args.authUserId
      ? await ctx.db.normalizeId("users", args.authUserId)
      : null;
    const authUser = authUserId ? await ctx.db.get(authUserId) : null;
    const legacyUser = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", args.authSubject))
      .unique();

    if (!legacyUser || (authUser && authUser._id === legacyUser._id)) {
      return authUser?._id ?? legacyUser?._id ?? null;
    }

    if (!authUser) {
      return legacyUser._id;
    }

    const [authMembership, legacyMembership] = await Promise.all([
      ctx.db
        .query("business_memberships")
        .withIndex("by_user_id_and_business_id", (q) =>
          q.eq("userId", authUser._id).eq("businessId", args.businessId),
        )
        .unique(),
      ctx.db
        .query("business_memberships")
        .withIndex("by_user_id_and_business_id", (q) =>
          q.eq("userId", legacyUser._id).eq("businessId", args.businessId),
        )
        .unique(),
    ]);

    if (legacyMembership && !authMembership) {
      return legacyUser._id;
    }

    return authUser._id;
  },
});
