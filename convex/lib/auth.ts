import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Identity = NonNullable<Awaited<ReturnType<QueryCtx["auth"]["getUserIdentity"]>>>;

type ReaderAuthContext = Pick<QueryCtx, "auth" | "db"> | Pick<MutationCtx, "auth" | "db">;
type WriterAuthContext = Pick<MutationCtx, "auth" | "db">;

export async function requireIdentity(ctx: ReaderAuthContext): Promise<Identity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }
  return identity;
}

export async function getCurrentUser(
  ctx: ReaderAuthContext,
): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }

  return await ctx.db.get(userId);
}

export async function requireCurrentUser(
  ctx: ReaderAuthContext,
): Promise<Doc<"users">> {
  await requireIdentity(ctx);
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error("User profile not initialized.");
  }
  return user;
}

export async function ensureCurrentUser(
  ctx: WriterAuthContext,
): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const authUserId = await getAuthUserId(ctx);
  const existing = authUserId ? await ctx.db.get(authUserId) : null;

  if (existing) {
    const patch: Partial<Doc<"users">> = {};

    if (identity.email !== undefined && existing.email !== identity.email) {
      patch.email = identity.email;
    }
    if (identity.name !== undefined && existing.displayName !== identity.name) {
      patch.displayName = identity.name;
      patch.name = identity.name;
    }
    if (
      existing.authSubject === undefined &&
      authUserId !== null
    ) {
      patch.authSubject = String(authUserId);
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
      return (await ctx.db.get(existing._id)) ?? existing;
    }

    return existing;
  }

  throw new Error(
    `User profile not initialized for authenticated identity ${identity.subject}.`,
  );
}

export async function requireMembership(
  ctx: ReaderAuthContext,
  businessId: Id<"businesses">,
): Promise<Doc<"business_memberships">> {
  const user = await requireCurrentUser(ctx);
  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_user_id_and_business_id", (q) =>
      q.eq("userId", user._id).eq("businessId", businessId),
    )
    .unique();

  if (!membership || membership.status !== "active") {
    throw new Error("You do not have access to this business.");
  }
  return membership;
}
