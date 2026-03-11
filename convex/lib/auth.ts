import { getAuthUserId } from "@convex-dev/auth/server";
import type { IndexRangeBuilder } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Identity = NonNullable<Awaited<ReturnType<QueryCtx["auth"]["getUserIdentity"]>>>;

type ReaderAuthContext = Pick<QueryCtx, "auth" | "db"> | Pick<MutationCtx, "auth" | "db">;
type WriterAuthContext = Pick<MutationCtx, "auth" | "db">;
type DatabaseReader = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function getUserByAuthSubject(
  ctx: DatabaseReader,
  authSubject: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", authSubject))
    .unique();
}

async function listMembershipsForUser(
  ctx: DatabaseReader,
  userId: Id<"users">,
): Promise<Array<Doc<"business_memberships">>> {
  return await ctx.db
    .query("business_memberships")
    .withIndex("by_user_id_and_business_id", (q) => q.eq("userId", userId))
    .collect();
}

function buildUserPatch(input: {
  identity: Identity;
  current: Doc<"users">;
  legacy?: Doc<"users"> | null;
}): Partial<Doc<"users">> {
  const { identity, current, legacy } = input;
  const patch: Partial<Doc<"users">> = {};

  if (current.authSubject !== identity.subject) {
    patch.authSubject = identity.subject;
  }

  const email = identity.email ?? current.email ?? legacy?.email;
  if (email !== undefined && current.email !== email) {
    patch.email = email;
  }

  const displayName = identity.name ?? current.displayName ?? legacy?.displayName;
  if (displayName !== undefined && current.displayName !== displayName) {
    patch.displayName = displayName;
  }

  const name = identity.name ?? current.name ?? legacy?.name;
  if (name !== undefined && current.name !== name) {
    patch.name = name;
  }

  if (current.image === undefined && legacy?.image !== undefined) {
    patch.image = legacy.image;
  }
  if (
    current.emailVerificationTime === undefined &&
    legacy?.emailVerificationTime !== undefined
  ) {
    patch.emailVerificationTime = legacy.emailVerificationTime;
  }
  if (current.phone === undefined && legacy?.phone !== undefined) {
    patch.phone = legacy.phone;
  }
  if (
    current.phoneVerificationTime === undefined &&
    legacy?.phoneVerificationTime !== undefined
  ) {
    patch.phoneVerificationTime = legacy.phoneVerificationTime;
  }
  if (current.isAnonymous === undefined && legacy?.isAnonymous !== undefined) {
    patch.isAnonymous = legacy.isAnonymous;
  }
  if (current.activeBusinessId === undefined && legacy?.activeBusinessId !== undefined) {
    patch.activeBusinessId = legacy.activeBusinessId;
  }
  if (current.platformRole === undefined && legacy?.platformRole !== undefined) {
    patch.platformRole = legacy.platformRole;
  }

  return patch;
}

async function migrateLegacyUser(
  ctx: WriterAuthContext,
  input: {
    identity: Identity;
    current: Doc<"users">;
    legacy: Doc<"users">;
  },
): Promise<Doc<"users">> {
  const { identity, current, legacy } = input;
  const currentMemberships = await listMembershipsForUser(ctx, current._id);
  const currentBusinessIds = new Set(
    currentMemberships.map((membership) => String(membership.businessId)),
  );
  const legacyMemberships = await listMembershipsForUser(ctx, legacy._id);

  for (const membership of legacyMemberships) {
    if (currentBusinessIds.has(String(membership.businessId))) {
      continue;
    }

    await ctx.db.patch(membership._id, { userId: current._id });
  }

  const previewSessions = (
    await Promise.all(
      legacyMemberships.map((membership) =>
        ctx.db
          .query("preview_sessions")
          .withIndex(
            "by_business_id_and_user_id",
            (q: IndexRangeBuilder<Doc<"preview_sessions">, ["businessId", "userId"]>) =>
              q.eq("businessId", membership.businessId).eq("userId", legacy._id),
          )
          .collect(),
      ),
    )
  ).flat();
  for (const previewSession of previewSessions) {
    await ctx.db.patch(previewSession._id, { userId: current._id });
  }

  const patch = buildUserPatch({ identity, current, legacy });
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(current._id, patch);
  }

  await ctx.db.patch(legacy._id, {
    authSubject: `legacy:${String(legacy._id)}`,
  });

  return (await ctx.db.get(current._id)) ?? current;
}

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

  const authUserId = await getAuthUserId(ctx);
  const authUser = authUserId ? await ctx.db.get(authUserId) : null;
  const legacyUser = await getUserByAuthSubject(ctx, identity.subject);

  if (!legacyUser || (authUser && authUser._id === legacyUser._id)) {
    return authUser ?? legacyUser;
  }

  if (!authUser) {
    return legacyUser;
  }

  const [authMemberships, legacyMemberships] = await Promise.all([
    listMembershipsForUser(ctx, authUser._id),
    listMembershipsForUser(ctx, legacyUser._id),
  ]);

  if (legacyMemberships.length > 0 && authMemberships.length === 0) {
    return legacyUser;
  }

  return authUser;
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
  const legacy = await getUserByAuthSubject(ctx, identity.subject);

  if (!existing) {
    if (legacy) {
      return legacy;
    }
    throw new Error(
      `User profile not initialized for authenticated identity ${identity.subject}.`,
    );
  }

  if (legacy && legacy._id !== existing._id) {
    return await migrateLegacyUser(ctx, {
      identity,
      current: existing,
      legacy,
    });
  }

  const patch = buildUserPatch({ identity, current: existing });
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(existing._id, patch);
    return (await ctx.db.get(existing._id)) ?? existing;
  }

  return existing;
}

export async function requireMembership(
  ctx: ReaderAuthContext,
  businessId: Id<"businesses">,
): Promise<Doc<"business_memberships">> {
  const user = await requireCurrentUser(ctx);
  const membership =
    (await listMembershipsForUser(ctx, user._id)).find(
      (candidate) => candidate.businessId === businessId,
    ) ?? null;

  if (!membership || membership.status !== "active") {
    throw new Error("You do not have access to this business.");
  }
  return membership;
}
