import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";

type EmailClaimReaderCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type EmailClaimWriterCtx = Pick<MutationCtx, "db">;

export type AuthEmailClaimAvailability = {
  authAccountClaimed: boolean;
  userEmailClaimed: boolean;
};

async function getAuthEmailClaim(
  ctx: EmailClaimReaderCtx,
  input: {
    provider: string;
    normalizedEmail: string;
  },
) {
  return await ctx.db
    .query("auth_email_claims")
    .withIndex("by_provider_and_normalized_email", (q) =>
      q.eq("provider", input.provider).eq("normalizedEmail", input.normalizedEmail),
    )
    .unique();
}

async function getUserEmailClaim(
  ctx: EmailClaimReaderCtx,
  normalizedEmail: string,
) {
  return await ctx.db
    .query("user_email_claims")
    .withIndex("by_normalized_email", (q) =>
      q.eq("normalizedEmail", normalizedEmail),
    )
    .unique();
}

export async function getAuthEmailClaimAvailability(
  ctx: EmailClaimReaderCtx,
  input: {
    provider: string;
    normalizedEmail: string;
    currentAccountId?: Id<"authAccounts">;
    currentUserId?: Id<"users">;
  },
): Promise<AuthEmailClaimAvailability> {
  const [authClaim, userClaim] = await Promise.all([
    getAuthEmailClaim(ctx, input),
    getUserEmailClaim(ctx, input.normalizedEmail),
  ]);

  return {
    authAccountClaimed: Boolean(
      authClaim &&
        (!input.currentAccountId || authClaim.accountId !== input.currentAccountId),
    ),
    userEmailClaimed: Boolean(
      userClaim && (!input.currentUserId || userClaim.userId !== input.currentUserId),
    ),
  };
}

export async function assertAuthEmailClaimAvailable(
  ctx: EmailClaimReaderCtx,
  input: {
    provider: string;
    normalizedEmail: string;
    currentAccountId?: Id<"authAccounts">;
    currentUserId?: Id<"users">;
  },
): Promise<void> {
  const availability = await getAuthEmailClaimAvailability(ctx, input);
  if (availability.authAccountClaimed || availability.userEmailClaimed) {
    throw new Error("An account with that email already exists.");
  }
}

export async function replaceAuthEmailClaimsForAccount(
  ctx: EmailClaimWriterCtx,
  input: {
    provider: string;
    normalizedEmail: string;
    accountId: Id<"authAccounts">;
    userId: Id<"users">;
  },
): Promise<void> {
  await assertAuthEmailClaimAvailable(ctx, {
    provider: input.provider,
    normalizedEmail: input.normalizedEmail,
    currentAccountId: input.accountId,
    currentUserId: input.userId,
  });

  const existingAccountClaims = await ctx.db
    .query("auth_email_claims")
    .withIndex("by_account_id", (q) => q.eq("accountId", input.accountId))
    .collect();
  for (const claim of existingAccountClaims) {
    if (
      claim.provider !== input.provider ||
      claim.normalizedEmail !== input.normalizedEmail
    ) {
      await ctx.db.delete(claim._id);
    }
  }

  const existingUserClaims = await ctx.db
    .query("user_email_claims")
    .withIndex("by_user_id", (q) => q.eq("userId", input.userId))
    .collect();
  for (const claim of existingUserClaims) {
    if (claim.normalizedEmail !== input.normalizedEmail) {
      await ctx.db.delete(claim._id);
    }
  }

  const authClaim = await getAuthEmailClaim(ctx, input);
  if (authClaim) {
    await ctx.db.patch(authClaim._id, {
      accountId: input.accountId,
      userId: input.userId,
    });
  } else {
    await ctx.db.insert("auth_email_claims", {
      provider: input.provider,
      normalizedEmail: input.normalizedEmail,
      accountId: input.accountId,
      userId: input.userId,
    });
  }

  const userClaim = await getUserEmailClaim(ctx, input.normalizedEmail);
  if (userClaim) {
    await ctx.db.patch(userClaim._id, { userId: input.userId });
  } else {
    await ctx.db.insert("user_email_claims", {
      normalizedEmail: input.normalizedEmail,
      userId: input.userId,
    });
  }
}

export const getAvailability = internalQuery({
  args: {
    provider: v.string(),
    normalizedEmail: v.string(),
    currentAccountId: v.optional(v.id("authAccounts")),
    currentUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<AuthEmailClaimAvailability> => {
    return await getAuthEmailClaimAvailability(ctx, args);
  },
});

export const replaceForAccount = internalMutation({
  args: {
    provider: v.string(),
    normalizedEmail: v.string(),
    accountId: v.id("authAccounts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await replaceAuthEmailClaimsForAccount(ctx, args);
    return null;
  },
});
