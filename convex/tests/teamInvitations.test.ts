import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendTransactionalEmailMock } = vi.hoisted(() => ({
  sendTransactionalEmailMock: vi.fn(async () => ({ messageId: "test-message" })),
}));

vi.mock("../lib/providers/email", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
  getTransactionalEmailConfig: vi.fn(() => ({
    fromAddress: "test@example.com",
    resendOptions: { apiKey: "test-key", testMode: true },
  })),
  renderTransactionalEmail: vi.fn(),
}));

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  generateTeamInvitationToken,
  hashTeamInvitationToken,
  TEAM_INVITATION_MAX_AGE_SECONDS,
} from "../lib/teamInvitation";
import { modules } from "../test.setup";

const convexModules = modules;

type ConvexHarness = TestConvex<typeof schema>;
type TestRunFunction = Parameters<ConvexHarness["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

async function insertBusiness(
  ctx: TestContext,
  input: { slug: string; name?: string },
): Promise<Id<"businesses">> {
  return await ctx.db.insert("businesses", {
    slug: input.slug,
    name: input.name ?? "Team Invite Business",
    timezone: "America/Toronto",
    businessType: "clinic",
    defaultLocale: "en",
    deploymentMode: "manual",
    status: "active",
  });
}

async function seedMember(
  t: ConvexHarness,
  input: {
    subject: string;
    email: string;
    role: "business_owner" | "business_admin" | "viewer";
    businessSlug?: string;
  },
) {
  const seeded = await t.run(async (ctx: TestContext) => {
    const businessId = await insertBusiness(ctx, {
      slug: input.businessSlug ?? `team-invite-${input.subject}`,
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: input.email,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: input.role,
      status: "active",
    });
    await ctx.db.insert("user_email_claims", {
      normalizedEmail: input.email,
      userId,
    });

    return { businessId, userId };
  });

  return {
    ...seeded,
    authed: t.withIdentity({ subject: input.subject, email: input.email }),
  };
}

async function createPendingInvite(
  t: ConvexHarness,
  input: {
    businessId: Id<"businesses">;
    invitedByUserId: Id<"users">;
    email: string;
    role: "viewer" | "business_admin";
    token?: string;
    expirationTime?: number;
  },
) {
  const token = input.token ?? generateTeamInvitationToken();
  const tokenHash = await hashTeamInvitationToken(token);
  const invitationId = await t.mutation(internal.businesses.members.upsertPendingInvitation, {
    businessId: input.businessId,
    email: input.email,
    role: input.role,
    tokenHash,
    expirationTime: input.expirationTime ?? Date.now() + TEAM_INVITATION_MAX_AGE_SECONDS * 1000,
    invitedByUserId: input.invitedByUserId,
  });

  return { token, invitationId: invitationId.invitationId };
}

describe("team invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists active members and pending invitations for workspace members", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, userId, authed } = await seedMember(t, {
      subject: "team-invite-admin",
      email: "admin@example.com",
      role: "business_owner",
    });

    const { invitationId } = await createPendingInvite(t, {
      businessId,
      invitedByUserId: userId,
      email: "viewer@example.com",
      role: "viewer",
    });

    const team = await authed.query(api.businesses.members.listTeam, { businessId });

    expect(team.members).toHaveLength(1);
    expect(team.members[0]).toMatchObject({
      userId,
      email: "admin@example.com",
      role: "business_owner",
    });
    expect(team.pendingInvitations).toEqual([
      expect.objectContaining({
        invitationId,
        email: "viewer@example.com",
        role: "viewer",
        status: "pending",
      }),
    ]);
  });

  it("blocks non-admin members from revoking invitations", async () => {
    const t = convexTest(schema, convexModules);
    const businessId = await t.run(async (ctx: TestContext) => {
      const businessId = await insertBusiness(ctx, {
        slug: "team-invite-revoke-business",
      });
      const ownerId = await ctx.db.insert("users", {
        authSubject: "team-invite-owner",
        email: "owner@example.com",
      });
      const viewerId = await ctx.db.insert("users", {
        authSubject: "team-invite-viewer",
        email: "viewer-member@example.com",
      });
      await ctx.db.insert("business_memberships", {
        businessId,
        userId: ownerId,
        role: "business_owner",
        status: "active",
      });
      await ctx.db.insert("business_memberships", {
        businessId,
        userId: viewerId,
        role: "viewer",
        status: "active",
      });
      return businessId;
    });

    const ownerUserId = await t.run(async (ctx: TestContext) => {
      const owner = await ctx.db
        .query("users")
        .withIndex("by_auth_subject", (q) => q.eq("authSubject", "team-invite-owner"))
        .unique();
      return owner!._id;
    });

    const { invitationId } = await createPendingInvite(t, {
      businessId,
      invitedByUserId: ownerUserId,
      email: "new-viewer@example.com",
      role: "viewer",
    });

    await expect(
      t.withIdentity({ subject: "team-invite-viewer", email: "viewer-member@example.com" }).mutation(
        api.businesses.members.revokeInvitation,
        {
          businessId,
          invitationId,
        },
      ),
    ).rejects.toThrow("Tenant admin access required.");
  });

  it("rejects inviting an existing active member", async () => {
    const t = convexTest(schema, convexModules);
    const seeded = await t.run(async (ctx: TestContext) => {
      const businessId = await insertBusiness(ctx, {
        slug: "team-invite-duplicate-business",
      });
      const adminId = await ctx.db.insert("users", {
        authSubject: "team-invite-existing-admin",
        email: "existing-admin@example.com",
      });
      const memberId = await ctx.db.insert("users", {
        authSubject: "team-invite-existing-member",
        email: "existing-member@example.com",
      });
      await ctx.db.insert("user_email_claims", {
        normalizedEmail: "existing-member@example.com",
        userId: memberId,
      });
      await ctx.db.insert("business_memberships", {
        businessId,
        userId: adminId,
        role: "business_owner",
        status: "active",
      });
      await ctx.db.insert("business_memberships", {
        businessId,
        userId: memberId,
        role: "viewer",
        status: "active",
      });
      return { businessId, adminId };
    });

    const tokenHash = await hashTeamInvitationToken("duplicate-token");
    await expect(
      t.mutation(internal.businesses.members.upsertPendingInvitation, {
        businessId: seeded.businessId,
        email: "existing-member@example.com",
        role: "viewer",
        tokenHash,
        expirationTime: Date.now() + TEAM_INVITATION_MAX_AGE_SECONDS * 1000,
        invitedByUserId: seeded.adminId,
      }),
    ).rejects.toThrow("This person is already a member of this workspace.");
  });

  it("accepts a pending invitation for the invited email", async () => {
    const t = convexTest(schema, convexModules);
    const admin = await seedMember(t, {
      subject: "team-invite-accept-admin",
      email: "accept-admin@example.com",
      role: "business_owner",
    });

    const inviteeSubject = "team-invite-accept-invitee";
    const inviteeEmail = "accept-invitee@example.com";
    await t.run(async (ctx: TestContext) => {
      const inviteeId = await ctx.db.insert("users", {
        authSubject: inviteeSubject,
        email: inviteeEmail,
      });
      await ctx.db.insert("user_email_claims", {
        normalizedEmail: inviteeEmail,
        userId: inviteeId,
      });
    });

    const { token } = await createPendingInvite(t, {
      businessId: admin.businessId,
      invitedByUserId: admin.userId,
      email: inviteeEmail,
      role: "business_admin",
    });

    const result = await t.withIdentity({ subject: inviteeSubject, email: inviteeEmail }).mutation(
      api.businesses.members.acceptInvitation,
      { token },
    );

    expect(result).toEqual({
      businessId: admin.businessId,
      alreadyMember: false,
    });

    const persisted = await t.run(async (ctx: TestContext) => {
      const invitee = await ctx.db
        .query("users")
        .withIndex("by_auth_subject", (q) => q.eq("authSubject", inviteeSubject))
        .unique();
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_user_id_and_business_id", (q) =>
          q.eq("userId", invitee!._id).eq("businessId", admin.businessId),
        )
        .unique();
      const invitation = (await ctx.db
        .query("business_invitations")
        .withIndex("by_business_id_and_email", (q) =>
          q.eq("businessId", admin.businessId).eq("email", inviteeEmail),
        )
        .collect()).find((row) => row.status === "accepted");

      return { invitee, membership, invitation };
    });

    expect(persisted.membership).toMatchObject({
      role: "business_admin",
      status: "active",
    });
    expect(persisted.invitee?.activeBusinessId).toBe(admin.businessId);
    expect(persisted.invitation).toMatchObject({
      status: "accepted",
      acceptedByUserId: persisted.invitee?._id,
    });
  });

  it("switches active workspace when an existing user accepts an invitation", async () => {
    const t = convexTest(schema, convexModules);
    const admin = await seedMember(t, {
      subject: "team-invite-switch-admin",
      email: "switch-admin@example.com",
      role: "business_owner",
    });

    const inviteeSubject = "team-invite-switch-invitee";
    const inviteeEmail = "switch-invitee@example.com";
    const existingBusinessId = await t.run(async (ctx: TestContext) => {
      const existingBusinessId = await insertBusiness(ctx, {
        slug: "team-invite-existing-business",
        name: "Existing Business",
      });
      const inviteeId = await ctx.db.insert("users", {
        authSubject: inviteeSubject,
        email: inviteeEmail,
        activeBusinessId: existingBusinessId,
      });
      await ctx.db.insert("user_email_claims", {
        normalizedEmail: inviteeEmail,
        userId: inviteeId,
      });
      await ctx.db.insert("business_memberships", {
        businessId: existingBusinessId,
        userId: inviteeId,
        role: "business_owner",
        status: "active",
      });
      return existingBusinessId;
    });

    const { token } = await createPendingInvite(t, {
      businessId: admin.businessId,
      invitedByUserId: admin.userId,
      email: inviteeEmail,
      role: "viewer",
    });

    await t.withIdentity({ subject: inviteeSubject, email: inviteeEmail }).mutation(
      api.businesses.members.acceptInvitation,
      { token },
    );

    const invitee = await t.run(async (ctx: TestContext) => {
      return await ctx.db
        .query("users")
        .withIndex("by_auth_subject", (q) => q.eq("authSubject", inviteeSubject))
        .unique();
    });

    expect(invitee?.activeBusinessId).toBe(admin.businessId);
    expect(invitee?.activeBusinessId).not.toBe(existingBusinessId);
  });

  it("rejects acceptance when signed-in email does not match the invitation", async () => {
    const t = convexTest(schema, convexModules);
    const admin = await seedMember(t, {
      subject: "team-invite-mismatch-admin",
      email: "mismatch-admin@example.com",
      role: "business_owner",
    });

    const { token } = await createPendingInvite(t, {
      businessId: admin.businessId,
      invitedByUserId: admin.userId,
      email: "invited@example.com",
      role: "viewer",
    });

    await t.run(async (ctx: TestContext) => {
      await ctx.db.insert("users", {
        authSubject: "team-invite-mismatch-user",
        email: "other@example.com",
      });
    });

    await expect(
      t
        .withIdentity({ subject: "team-invite-mismatch-user", email: "other@example.com" })
        .mutation(api.businesses.members.acceptInvitation, { token }),
    ).rejects.toThrow(
      "Sign in with the email address that received this invitation before accepting.",
    );
  });

  it("sends invitation email from tenant admin action", async () => {
    const previousSiteUrl = process.env.SITE_URL;
    process.env.SITE_URL = "https://app.example.com";

    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedMember(t, {
      subject: "team-invite-send-admin",
      email: "send-admin@example.com",
      role: "business_owner",
    });

    try {
      await authed.action(api.businesses.members.sendInvitation, {
        businessId,
        email: "new-member@example.com",
        role: "viewer",
      });

      expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          template: "team_invitation",
          to: "new-member@example.com",
        }),
      );
    } finally {
      if (previousSiteUrl === undefined) {
        delete process.env.SITE_URL;
      } else {
        process.env.SITE_URL = previousSiteUrl;
      }
    }
  });

  it("removes an active non-owner member", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedMember(t, {
      subject: "team-invite-remove-admin",
      email: "remove-admin@example.com",
      role: "business_owner",
    });

    const viewer = await t.run(async (ctx: TestContext) => {
      const userId = await ctx.db.insert("users", {
        authSubject: "team-invite-remove-viewer",
        email: "viewer@example.com",
      });
      const membershipId = await ctx.db.insert("business_memberships", {
        businessId,
        userId,
        role: "viewer",
        status: "active",
      });
      return { membershipId };
    });

    await authed.mutation(api.businesses.members.removeMember, {
      businessId,
      membershipId: viewer.membershipId,
    });

    const team = await authed.query(api.businesses.members.listTeam, { businessId });
    expect(team.members).toHaveLength(1);
    expect(team.members[0]?.email).toBe("remove-admin@example.com");
  });
});
