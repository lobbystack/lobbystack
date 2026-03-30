import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { resolveCurrentUserForPasswordCredentials } from "./lib/accountCredentials";

async function resolveAuthenticatedUserIdForBusiness(args: {
  authSubject: string;
  authUserId?: string;
  businessId: Id<"businesses">;
  ctx: QueryCtx;
}): Promise<Id<"users"> | null> {
  const authUserId = args.authUserId
    ? await args.ctx.db.normalizeId("users", args.authUserId)
    : null;
  const authUser = authUserId ? await args.ctx.db.get(authUserId) : null;
  const legacyUser = await args.ctx.db
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
    args.ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", authUser._id).eq("businessId", args.businessId),
      )
      .unique(),
    args.ctx.db
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
}

async function resolveAuthenticatedUserDocForBusiness(args: {
  authSubject: string;
  authUserId?: string;
  businessId: Id<"businesses">;
  ctx: QueryCtx;
}): Promise<Doc<"users"> | null> {
  const resolvedUserId = await resolveAuthenticatedUserIdForBusiness(args);
  if (resolvedUserId) {
    const resolvedUser = await args.ctx.db.get(resolvedUserId);
    if (resolvedUser) {
      return resolvedUser;
    }
  }

  return await getCurrentUser(args.ctx);
}

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
    return await resolveAuthenticatedUserIdForBusiness({
      ctx,
      businessId: args.businessId,
      authSubject: args.authSubject,
      ...(args.authUserId ? { authUserId: args.authUserId } : {}),
    });
  },
});

export const getAuthenticatedUserForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
    authSubject: v.string(),
    authUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await resolveAuthenticatedUserDocForBusiness({
      ctx,
      businessId: args.businessId,
      authSubject: args.authSubject,
      ...(args.authUserId ? { authUserId: args.authUserId } : {}),
    });
  },
});
