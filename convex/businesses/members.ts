import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { normalizeAuthEmail } from "../../packages/shared/src/auth";
import {
  ensureCurrentUser,
  requireMembership,
  requireTenantAdminAccess,
  requireTenantAdminMembership,
} from "../lib/auth";
import {
  assertInvitableTeamRole,
  generateTeamInvitationToken,
  hashTeamInvitationToken,
  sendTeamInvitationEmail,
  TEAM_INVITATION_MAX_AGE_SECONDS,
} from "../lib/teamInvitation";
import {
  observedAction as action,
  observedInternalMutation as internalMutation,
  observedMutation as mutation,
} from "../telemetry/observedFunctions";

type ReaderCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function findUserIdByNormalizedEmail(
  ctx: ReaderCtx,
  normalizedEmail: string,
): Promise<Id<"users"> | null> {
  const emailClaim = await ctx.db
    .query("user_email_claims")
    .withIndex("by_normalized_email", (q) => q.eq("normalizedEmail", normalizedEmail))
    .unique();
  if (emailClaim) {
    return emailClaim.userId;
  }

  const users = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", normalizedEmail))
    .take(5);
  return users[0]?._id ?? null;
}

async function getActiveMembershipForUser(
  ctx: ReaderCtx,
  businessId: Id<"businesses">,
  userId: Id<"users">,
): Promise<Doc<"business_memberships"> | null> {
  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_user_id_and_business_id", (q) =>
      q.eq("userId", userId).eq("businessId", businessId),
    )
    .unique();
  if (!membership || membership.status !== "active") {
    return null;
  }
  return membership;
}

async function assertInviteeNotActiveMember(
  ctx: ReaderCtx,
  businessId: Id<"businesses">,
  normalizedEmail: string,
): Promise<void> {
  const userId = await findUserIdByNormalizedEmail(ctx, normalizedEmail);
  if (!userId) {
    return;
  }

  const membership = await getActiveMembershipForUser(ctx, businessId, userId);
  if (membership) {
    throw new Error("This person is already a member of this workspace.");
  }
}

function displayNameForUser(user: Doc<"users"> | null): string | null {
  if (!user) {
    return null;
  }
  return user.displayName ?? user.name ?? null;
}

function formatMember(user: Doc<"users"> | null, membership: Doc<"business_memberships">) {
  return {
    membershipId: membership._id,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    name: displayNameForUser(user),
    email: user?.email ?? null,
    joinedAt: membership._creationTime,
  };
}

function formatInvitation(invitation: Doc<"business_invitations">) {
  return {
    invitationId: invitation._id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expirationTime: invitation.expirationTime,
    invitedAt: invitation._creationTime,
  };
}

async function getPendingInvitationByEmail(
  ctx: ReaderCtx,
  businessId: Id<"businesses">,
  normalizedEmail: string,
): Promise<Doc<"business_invitations"> | null> {
  const invitations = await ctx.db
    .query("business_invitations")
    .withIndex("by_business_id_and_email", (q) =>
      q.eq("businessId", businessId).eq("email", normalizedEmail),
    )
    .collect();

  return invitations.find((invitation) => invitation.status === "pending") ?? null;
}

async function getLatestInvitationByEmail(
  ctx: ReaderCtx,
  businessId: Id<"businesses">,
  normalizedEmail: string,
): Promise<Doc<"business_invitations"> | null> {
  const invitations = await ctx.db
    .query("business_invitations")
    .withIndex("by_business_id_and_email", (q) =>
      q.eq("businessId", businessId).eq("email", normalizedEmail),
    )
    .collect();

  if (invitations.length === 0) {
    return null;
  }

  return invitations.sort((left, right) => right._creationTime - left._creationTime)[0] ?? null;
}

async function getInvitationByTokenHash(
  ctx: ReaderCtx,
  tokenHash: string,
): Promise<Doc<"business_invitations"> | null> {
  return await ctx.db
    .query("business_invitations")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
}

function assertInvitationAcceptable(invitation: Doc<"business_invitations">): void {
  if (invitation.status !== "pending") {
    throw new Error("This invitation is no longer valid.");
  }
  if (invitation.expirationTime <= Date.now()) {
    throw new Error("This invitation has expired.");
  }
}

export const listTeam = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();

    const members = [];
    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }
      const user = await ctx.db.get(membership.userId);
      members.push(formatMember(user, membership));
    }

    const pendingInvitations = await ctx.db
      .query("business_invitations")
      .withIndex("by_business_id_and_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "pending"),
      )
      .collect();

    return {
      members,
      pendingInvitations: pendingInvitations.map(formatInvitation),
    };
  },
});

export const previewInvitation = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      return null;
    }

    const tokenHash = await hashTeamInvitationToken(token);
    const invitation = await getInvitationByTokenHash(ctx, tokenHash);
    if (!invitation) {
      return null;
    }

    if (invitation.status !== "pending") {
      return {
        status: invitation.status,
        email: invitation.email,
        role: invitation.role,
        businessName: null,
        expired: invitation.expirationTime <= Date.now(),
      };
    }

    const business = await ctx.db.get(invitation.businessId);
    return {
      status: invitation.status,
      email: invitation.email,
      role: invitation.role,
      businessName: business?.name ?? null,
      expired: invitation.expirationTime <= Date.now(),
    };
  },
});

export const assertCanManageTeamInvitations = internalQuery({
  args: {
    businessId: v.id("businesses"),
    authSubject: v.string(),
    authUserId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ userId: Id<"users"> }> => {
    const user = await ctx.runQuery(internal.users.getAuthenticatedUserForBusiness, {
      businessId: args.businessId,
      authSubject: args.authSubject,
      ...(args.authUserId ? { authUserId: args.authUserId } : {}),
    });
    if (!user) {
      throw new Error("User profile not initialized.");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId),
      )
      .unique();
    if (!membership || membership.status !== "active") {
      throw new Error("You do not have access to this business.");
    }
    requireTenantAdminAccess(membership.role);

    return { userId: user._id };
  },
});

export const getInvitationSendContext = internalQuery({
  args: {
    businessId: v.id("businesses"),
    invitationId: v.id("business_invitations"),
    inviterUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [business, invitation, inviter] = await Promise.all([
      ctx.db.get(args.businessId),
      ctx.db.get(args.invitationId),
      ctx.db.get(args.inviterUserId),
    ]);

    if (!business || !invitation || invitation.businessId !== args.businessId) {
      throw new Error("Invitation not found.");
    }

    return {
      businessName: business.name,
      email: invitation.email,
      role: invitation.role,
      inviterName:
        displayNameForUser(inviter) ?? inviter?.email ?? "A team member",
    };
  },
});

export const upsertPendingInvitation = internalMutation({
  args: {
    businessId: v.id("businesses"),
    email: v.string(),
    role: v.string(),
    tokenHash: v.string(),
    expirationTime: v.number(),
    invitedByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    assertInvitableTeamRole(args.role);
    const normalizedEmail = normalizeAuthEmail(args.email);
    if (!normalizedEmail) {
      throw new Error("A valid email address is required.");
    }

    await assertInviteeNotActiveMember(ctx, args.businessId, normalizedEmail);

    const existingPending = await getPendingInvitationByEmail(
      ctx,
      args.businessId,
      normalizedEmail,
    );
    if (existingPending) {
      await ctx.db.patch(existingPending._id, {
        role: args.role,
        tokenHash: args.tokenHash,
        expirationTime: args.expirationTime,
        invitedByUserId: args.invitedByUserId,
        revokedAt: undefined,
        acceptedAt: undefined,
        acceptedByUserId: undefined,
        status: "pending",
      });
      return { invitationId: existingPending._id };
    }

    const reusableInvitation = await getLatestInvitationByEmail(
      ctx,
      args.businessId,
      normalizedEmail,
    );
    if (reusableInvitation) {
      await ctx.db.patch(reusableInvitation._id, {
        role: args.role,
        tokenHash: args.tokenHash,
        expirationTime: args.expirationTime,
        invitedByUserId: args.invitedByUserId,
        revokedAt: undefined,
        acceptedAt: undefined,
        acceptedByUserId: undefined,
        status: "pending",
      });
      return { invitationId: reusableInvitation._id };
    }

    const invitationId = await ctx.db.insert("business_invitations", {
      businessId: args.businessId,
      email: normalizedEmail,
      role: args.role,
      status: "pending",
      tokenHash: args.tokenHash,
      expirationTime: args.expirationTime,
      invitedByUserId: args.invitedByUserId,
    });

    return { invitationId };
  },
});

export const refreshInvitationToken = internalMutation({
  args: {
    invitationId: v.id("business_invitations"),
    businessId: v.id("businesses"),
    tokenHash: v.string(),
    expirationTime: v.number(),
    invitedByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.businessId !== args.businessId) {
      throw new Error("Invitation not found.");
    }
    if (invitation.status !== "pending") {
      throw new Error("Only pending invitations can be resent.");
    }

    await ctx.db.patch(args.invitationId, {
      tokenHash: args.tokenHash,
      expirationTime: args.expirationTime,
      invitedByUserId: args.invitedByUserId,
    });

    return null;
  },
});

export const revokeInvitation = mutation({
  args: {
    businessId: v.id("businesses"),
    invitationId: v.id("business_invitations"),
  },
  handler: async (ctx, args) => {
    await requireTenantAdminMembership(ctx, args.businessId);

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.businessId !== args.businessId) {
      throw new Error("Invitation not found.");
    }
    if (invitation.status !== "pending") {
      throw new Error("Only pending invitations can be revoked.");
    }

    await ctx.db.patch(args.invitationId, {
      status: "revoked",
      revokedAt: Date.now(),
    });

    return null;
  },
});

const WORKSPACE_OWNER_ROLES = new Set(["business_owner", "owner"]);

export const removeMember = mutation({
  args: {
    businessId: v.id("businesses"),
    membershipId: v.id("business_memberships"),
  },
  handler: async (ctx, args) => {
    const actorMembership = await requireTenantAdminMembership(ctx, args.businessId);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.businessId !== args.businessId) {
      throw new Error("Member not found.");
    }
    if (membership.status !== "active") {
      throw new Error("This person is not an active member.");
    }
    if (membership.userId === actorMembership.userId) {
      throw new Error("You cannot remove yourself from the workspace.");
    }
    if (WORKSPACE_OWNER_ROLES.has(membership.role)) {
      throw new Error("Workspace owners cannot be removed.");
    }

    await ctx.db.patch(args.membershipId, {
      status: "removed",
    });

    return null;
  },
});

export const sendInvitation = action({
  args: {
    businessId: v.id("businesses"),
    email: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args): Promise<{ invitationId: Id<"business_invitations"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required.");
    }

    const { userId }: { userId: Id<"users"> } = await ctx.runQuery(
      internal.businesses.members.assertCanManageTeamInvitations,
      {
        businessId: args.businessId,
        authSubject: identity.subject,
        authUserId: identity.tokenIdentifier,
      },
    );

    assertInvitableTeamRole(args.role);

    const token = generateTeamInvitationToken();
    const tokenHash = await hashTeamInvitationToken(token);
    const expirationTime = Date.now() + TEAM_INVITATION_MAX_AGE_SECONDS * 1000;

    const { invitationId }: { invitationId: Id<"business_invitations"> } =
      await ctx.runMutation(internal.businesses.members.upsertPendingInvitation, {
        businessId: args.businessId,
        email: args.email,
        role: args.role,
        tokenHash,
        expirationTime,
        invitedByUserId: userId,
      });

    const sendContext = await ctx.runQuery(internal.businesses.members.getInvitationSendContext, {
      businessId: args.businessId,
      invitationId,
      inviterUserId: userId,
    });

    await sendTeamInvitationEmail(ctx, {
      email: sendContext.email,
      businessName: sendContext.businessName,
      inviterName: sendContext.inviterName,
      role: sendContext.role,
      token,
    });

    return { invitationId };
  },
});

export const resendInvitation = action({
  args: {
    businessId: v.id("businesses"),
    invitationId: v.id("business_invitations"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required.");
    }

    const { userId }: { userId: Id<"users"> } = await ctx.runQuery(
      internal.businesses.members.assertCanManageTeamInvitations,
      {
        businessId: args.businessId,
        authSubject: identity.subject,
        authUserId: identity.tokenIdentifier,
      },
    );

    const token = generateTeamInvitationToken();
    const tokenHash = await hashTeamInvitationToken(token);
    const expirationTime = Date.now() + TEAM_INVITATION_MAX_AGE_SECONDS * 1000;

    await ctx.runMutation(internal.businesses.members.refreshInvitationToken, {
      invitationId: args.invitationId,
      businessId: args.businessId,
      tokenHash,
      expirationTime,
      invitedByUserId: userId,
    });

    const sendContext = await ctx.runQuery(internal.businesses.members.getInvitationSendContext, {
      businessId: args.businessId,
      invitationId: args.invitationId,
      inviterUserId: userId,
    });

    await sendTeamInvitationEmail(ctx, {
      email: sendContext.email,
      businessName: sendContext.businessName,
      inviterName: sendContext.inviterName,
      role: sendContext.role,
      token,
    });

    return null;
  },
});


export const acceptInvitation = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ensureCurrentUser(ctx);
    const token = args.token.trim();
    if (!token) {
      throw new Error("Invalid or expired invitation link.");
    }

    const tokenHash = await hashTeamInvitationToken(token);
    const invitation = await getInvitationByTokenHash(ctx, tokenHash);
    if (!invitation) {
      throw new Error("Invalid or expired invitation link.");
    }

    assertInvitationAcceptable(invitation);

    const identity = await ctx.auth.getUserIdentity();
    const identityEmail = identity?.email ? normalizeAuthEmail(identity.email) : null;
    const userEmail = user.email ? normalizeAuthEmail(user.email) : null;
    const effectiveEmail = identityEmail ?? userEmail;

    if (!effectiveEmail || effectiveEmail !== invitation.email) {
      throw new Error(
        "Sign in with the email address that received this invitation before accepting.",
      );
    }

    const existingMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", user._id).eq("businessId", invitation.businessId),
      )
      .unique();

    if (existingMembership?.status === "active") {
      await ctx.db.patch(invitation._id, {
        status: "accepted",
        acceptedAt: Date.now(),
        acceptedByUserId: user._id,
      });
      return {
        businessId: invitation.businessId,
        alreadyMember: true,
      };
    }

    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, {
        role: invitation.role,
        status: "active",
      });
    } else {
      await ctx.db.insert("business_memberships", {
        businessId: invitation.businessId,
        userId: user._id,
        role: invitation.role,
        status: "active",
      });
    }

    await ctx.db.patch(user._id, {
      activeBusinessId: invitation.businessId,
    });

    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedAt: Date.now(),
      acceptedByUserId: user._id,
    });

    return {
      businessId: invitation.businessId,
      alreadyMember: false,
    };
  },
});
