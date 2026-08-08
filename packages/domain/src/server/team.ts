import { createHash, randomBytes } from "node:crypto";

import { businesses, invitations, memberships } from "@lobbystack/db";
import { and, eq, isNull } from "drizzle-orm";

import { recordAuditLog } from "./audit";
import {
  enqueueSideEffect,
  getAppPool,
  getDispatcherPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

const INVITATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function invitationUrl(token: string): string {
  const baseUrl =
    process.env.APP_BASE_URL?.trim() ?? process.env.BETTER_AUTH_URL?.trim() ?? "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(token)}`;
}

function assertRole(role: string) {
  if (!["admin", "member", "owner"].includes(role)) {
    throw new Error("Invitations support admin, member, and owner roles");
  }
}

export async function listTeam(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const members = await db
        .select({
          membershipId: memberships.id,
          userId: memberships.userId,
          role: memberships.role,
          joinedAt: memberships.joinedAt,
        })
        .from(memberships)
        .where(
          and(eq(memberships.businessId, input.businessId), eq(memberships.status, "active")),
        );

      const pendingInvitations = await db
        .select({
          id: invitations.id,
          email: invitations.email,
          role: invitations.role,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(
          and(
            eq(invitations.businessId, input.businessId),
            isNull(invitations.revokedAt),
            isNull(invitations.acceptedAt),
          ),
        );

      return { members, pendingInvitations };
    },
  );
}

export async function createTeamInvitation(input: {
  businessId: string;
  userId: string;
  email: string;
  role: string;
  pool?: TransactionContext["pool"];
}) {
  assertRole(input.role);
  const email = normalizeEmail(input.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("A valid invitation email is required");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_MAX_AGE_MS);

  const result = await withDomainTransaction(
    {
      businessId: input.businessId,
      userId: input.userId,
      actorType: "user",
      pool: input.pool ?? getAppPool(),
    },
    async (db) => {
      const [business] = await db
        .select({ name: businesses.name })
        .from(businesses)
        .where(eq(businesses.id, input.businessId))
        .limit(1);

      if (!business) {
        throw new Error("Workspace was not found");
      }

      const [existing] = await db
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.businessId, input.businessId),
            eq(invitations.email, email),
            isNull(invitations.revokedAt),
            isNull(invitations.acceptedAt),
          ),
        )
        .limit(1);

      const invitation = existing
        ? (
            await db
              .update(invitations)
              .set({
                role: input.role,
                tokenHash,
                expiresAt,
                invitedByUserId: input.userId,
                updatedAt: new Date(),
              })
              .where(eq(invitations.id, existing.id))
              .returning({ id: invitations.id })
          )[0]
        : (
            await db
              .insert(invitations)
              .values({
                businessId: input.businessId,
                email,
                role: input.role,
                tokenHash,
                expiresAt,
                invitedByUserId: input.userId,
              })
              .returning({ id: invitations.id })
          )[0];

      if (!invitation) {
        throw new Error("Invitation was not created");
      }

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "email.send",
        payload: {
          to: email,
          purpose: "team_invitation",
          url: invitationUrl(token),
          businessName: business.name,
          role: input.role,
        },
        dedupeKey: `team-invitation:${invitation.id}:${tokenHash}`,
      });

      await recordAuditLog({
        db,
        businessId: input.businessId,
        actorUserId: input.userId,
        actorType: "user",
        action: "team.invitation_sent",
        resourceType: "invitation",
        resourceId: invitation.id,
        metadataJson: { email, role: input.role },
      });

      return { invitationId: invitation.id };
    },
  );

  return result;
}

export async function revokeTeamInvitation(input: {
  businessId: string;
  invitationId: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [updated] = await db
        .update(invitations)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.businessId, input.businessId),
            isNull(invitations.revokedAt),
          ),
        )
        .returning({ id: invitations.id });

      if (!updated) {
        throw new Error("Pending invitation was not found");
      }

      await recordAuditLog({
        db,
        businessId: input.businessId,
        actorType: "user",
        action: "team.invitation_revoked",
        resourceType: "invitation",
        resourceId: input.invitationId,
      });
    },
  );
}

export async function previewTeamInvitation(input: {
  token: string;
  pool?: TransactionContext["pool"];
}) {
  const token = input.token.trim();
  if (!token) {
    return null;
  }

  return withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      const [row] = await db
        .select({
          email: invitations.email,
          role: invitations.role,
          expiresAt: invitations.expiresAt,
          acceptedAt: invitations.acceptedAt,
          revokedAt: invitations.revokedAt,
          businessName: businesses.name,
        })
        .from(invitations)
        .innerJoin(businesses, eq(businesses.id, invitations.businessId))
        .where(eq(invitations.tokenHash, hashInvitationToken(token)))
        .limit(1);

      if (!row) {
        return null;
      }

      const status = row.revokedAt
        ? "revoked"
        : row.acceptedAt
          ? "accepted"
          : row.expiresAt.getTime() <= Date.now()
            ? "expired"
            : "pending";

      return {
        status,
        email: row.email,
        role: row.role,
        businessName: status === "pending" ? row.businessName : null,
        expired: row.expiresAt.getTime() <= Date.now(),
      };
    },
  );
}

export async function acceptTeamInvitation(input: {
  token: string;
  email: string;
  userId: string;
  pool?: TransactionContext["pool"];
}) {
  const token = input.token.trim();
  const email = normalizeEmail(input.email);
  if (!token) {
    throw new Error("Invalid or expired invitation link");
  }

  return withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db, client) => {
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, hashInvitationToken(token)))
        .limit(1);

      if (
        !invitation ||
        invitation.revokedAt ||
        invitation.acceptedAt ||
        invitation.expiresAt.getTime() <= Date.now()
      ) {
        throw new Error("Invalid or expired invitation link");
      }

      if (invitation.email !== email) {
        throw new Error("Sign in with the email address that received this invitation");
      }

      await client.query(`SELECT set_config('app.business_id', $1, true)`, [invitation.businessId]);

      const [existing] = await db
        .select({ id: memberships.id, status: memberships.status })
        .from(memberships)
        .where(
          and(
            eq(memberships.businessId, invitation.businessId),
            eq(memberships.userId, input.userId),
          ),
        )
        .limit(1);

      if (existing?.status === "active") {
        await db
          .update(invitations)
          .set({ acceptedAt: new Date(), updatedAt: new Date() })
          .where(eq(invitations.id, invitation.id));

        return { businessId: invitation.businessId, alreadyMember: true };
      }

      if (existing) {
        await db
          .update(memberships)
          .set({ role: invitation.role, status: "active", updatedAt: new Date() })
          .where(eq(memberships.id, existing.id));
      } else {
        await db.insert(memberships).values({
          businessId: invitation.businessId,
          userId: input.userId,
          role: invitation.role,
          status: "active",
          joinedAt: new Date(),
        });
      }

      await db
        .update(invitations)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      return { businessId: invitation.businessId, alreadyMember: false };
    },
  );
}
