import { getAuthUserId } from "@convex-dev/auth/server";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type CredentialsDbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type CredentialsAuthCtx =
  | Pick<QueryCtx, "auth" | "db">
  | Pick<MutationCtx, "auth" | "db">;

export async function getPasswordAccountForUser(
  ctx: CredentialsDbCtx,
  userId: Id<"users">,
): Promise<Doc<"authAccounts"> | null> {
  return await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "password"),
    )
    .unique();
}

export async function resolveUserForPasswordCredentials(
  ctx: CredentialsDbCtx,
  input: {
    authSubject: string;
    authUserId?: string | null;
  },
): Promise<{
  user: Doc<"users"> | null;
  passwordAccount: Doc<"authAccounts"> | null;
}> {
  const authUserId = input.authUserId
    ? await ctx.db.normalizeId("users", input.authUserId)
    : null;
  const authUser = authUserId ? await ctx.db.get(authUserId) : null;
  const legacyUser = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", input.authSubject))
    .unique();
  const [authPasswordAccount, legacyPasswordAccount] = await Promise.all([
    authUser ? getPasswordAccountForUser(ctx, authUser._id) : Promise.resolve(null),
    legacyUser && legacyUser._id !== authUser?._id
      ? getPasswordAccountForUser(ctx, legacyUser._id)
      : Promise.resolve(null),
  ]);

  return {
    user:
      authPasswordAccount || !legacyPasswordAccount ? (authUser ?? legacyUser) : legacyUser,
    passwordAccount: authPasswordAccount ?? legacyPasswordAccount,
  };
}

export async function resolveCurrentUserForPasswordCredentials(
  ctx: CredentialsAuthCtx,
): Promise<{
  user: Doc<"users"> | null;
  passwordAccount: Doc<"authAccounts"> | null;
}> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return {
      user: null,
      passwordAccount: null,
    };
  }

  const authUserId = await getAuthUserId(ctx);
  return await resolveUserForPasswordCredentials(ctx, {
    authSubject: identity.subject,
    ...(authUserId ? { authUserId: String(authUserId) } : {}),
  });
}
