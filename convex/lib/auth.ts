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
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  return await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .unique();
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
  const existing = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .unique();

  if (existing) {
    return existing;
  }

  const userId = await ctx.db.insert("users", {
    authSubject: identity.subject,
    ...(identity.email !== undefined ? { email: identity.email } : {}),
    ...(identity.name !== undefined ? { displayName: identity.name } : {}),
  });
  const created = await ctx.db.get(userId);
  if (!created) {
    throw new Error("Failed to create user.");
  }
  return created;
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
