import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import {
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { observedInternalMutation as internalMutation } from "../telemetry/observedFunctions";
import { normalizeAuthEmail } from "../../packages/shared/src/auth";

type EmailClaimReaderCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type EmailClaimWriterCtx = Pick<MutationCtx, "db">;

export const AUTH_EMAIL_CLAIMS_BACKFILL_STATE_KEY = "password_claims_backfilled";

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

async function isAuthEmailClaimBackfillComplete(
  ctx: EmailClaimReaderCtx,
): Promise<boolean> {
  const state = await ctx.db
    .query("auth_email_claim_backfill_state")
    .withIndex("by_key", (q) =>
      q.eq("key", AUTH_EMAIL_CLAIMS_BACKFILL_STATE_KEY),
    )
    .unique();

  return state !== null;
}

async function getLegacyAuthEmailClaimAvailability(
  ctx: EmailClaimReaderCtx,
  input: {
    provider: string;
    normalizedEmail: string;
    currentAccountId?: Id<"authAccounts">;
    currentUserId?: Id<"users">;
    checkAuthAccounts: boolean;
    checkUsers: boolean;
  },
): Promise<AuthEmailClaimAvailability> {
  let authAccountClaimed = false;
  let userEmailClaimed = false;

  // Backfill safety net: steady-state checks use the indexed claim tables above,
  // but legacy documents may not have claim rows yet during rollout.
  if (input.checkAuthAccounts) {
    for await (const account of ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", input.provider))) {
      if (
        typeof account.providerAccountId === "string" &&
        normalizeAuthEmail(account.providerAccountId) === input.normalizedEmail &&
        (!input.currentAccountId || account._id !== input.currentAccountId)
      ) {
        authAccountClaimed = true;
        break;
      }
    }
  }

  if (input.checkUsers) {
    for await (const user of ctx.db.query("users")) {
      if (
        typeof user.email === "string" &&
        normalizeAuthEmail(user.email) === input.normalizedEmail &&
        (!input.currentUserId || user._id !== input.currentUserId)
      ) {
        userEmailClaimed = true;
        break;
      }
    }
  }

  return {
    authAccountClaimed,
    userEmailClaimed,
  };
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

  const authAccountClaimed = Boolean(
    authClaim &&
      (!input.currentAccountId || authClaim.accountId !== input.currentAccountId),
  );
  const userEmailClaimed = Boolean(
    userClaim && (!input.currentUserId || userClaim.userId !== input.currentUserId),
  );

  if (authAccountClaimed && userEmailClaimed) {
    return {
      authAccountClaimed,
      userEmailClaimed,
    };
  }

  if (await isAuthEmailClaimBackfillComplete(ctx)) {
    return {
      authAccountClaimed,
      userEmailClaimed,
    };
  }

  const legacyAvailability = await getLegacyAuthEmailClaimAvailability(ctx, {
    ...input,
    checkAuthAccounts: !authAccountClaimed,
    checkUsers: !userEmailClaimed,
  });
  return {
    authAccountClaimed: authAccountClaimed || legacyAvailability.authAccountClaimed,
    userEmailClaimed: userEmailClaimed || legacyAvailability.userEmailClaimed,
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

export async function ensureUserEmailClaimForUser(
  ctx: EmailClaimWriterCtx,
  input: {
    provider: string;
    normalizedEmail: string;
    userId: Id<"users">;
    currentAccountId?: Id<"authAccounts">;
  },
): Promise<boolean> {
  await assertAuthEmailClaimAvailable(ctx, {
    provider: input.provider,
    normalizedEmail: input.normalizedEmail,
    ...(input.currentAccountId ? { currentAccountId: input.currentAccountId } : {}),
    currentUserId: input.userId,
  });

  const userClaim = await getUserEmailClaim(ctx, input.normalizedEmail);
  if (userClaim) {
    return false;
  }

  await ctx.db.insert("user_email_claims", {
    normalizedEmail: input.normalizedEmail,
    userId: input.userId,
  });
  return true;
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
