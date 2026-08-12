import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { enqueueOutbox, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { businessInvitations, businessMemberships, businesses, users } from "@lobbystack/db";
import { normalizeAuthEmail } from "@lobbystack/shared";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export type BusinessRole = "business_owner" | "business_admin" | "scheduler" | "viewer";

export type CreateBusinessInput = {
  userId: string;
  name: string;
  slug: string;
  timezone: string;
  businessType: string;
  deploymentMode?: string;
};

function cleanSlug(slug: string): string {
  const result = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (result.length < 2 || result.length > 120) {
    throw new Error("Business slug must be between 2 and 120 characters.");
  }
  return result;
}

export async function createBusiness(
  context: DomainContext,
  input: CreateBusinessInput,
): Promise<{ businessId: string; membershipId: string }> {
  const businessId = randomUUID();
  return await withBusinessTransaction(context.db, {
    userId: input.userId,
    businessId,
    actorType: "system",
  }, async (tx) => {
    const [business] = await tx.insert(businesses).values({
      id: businessId,
      name: input.name.trim(),
      slug: cleanSlug(input.slug),
      timezone: input.timezone,
      businessType: input.businessType,
      deploymentMode: input.deploymentMode ?? "cloud",
    }).returning({ id: businesses.id });
    if (!business) {
      throw new Error("Business could not be created.");
    }
    const [membership] = await tx.insert(businessMemberships).values({
      businessId,
      userId: input.userId,
      role: "business_owner",
      status: "active",
    }).returning({ id: businessMemberships.id });
    if (!membership) {
      throw new Error("Business owner membership could not be created.");
    }
    await tx.update(users).set({ activeBusinessId: businessId, updatedAt: new Date() }).where(eq(users.id, input.userId));
    await enqueueOutbox(tx, {
      topic: "snapshot.refresh",
      businessId,
      aggregateType: "business",
      aggregateId: businessId,
      dedupeKey: `business:${businessId}:snapshot:initial`,
      payload: { businessId, reason: "business_created" },
    });
    return { businessId, membershipId: membership.id };
  });
}

export async function listUserBusinesses(
  db: Database,
  userId: string,
): Promise<Array<{ businessId: string; name: string; slug: string; role: string; active: boolean }>> {
  const result = await withBusinessTransaction(db, { userId, actorType: "operator" }, async (tx) => {
    const [user] = await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId)).limit(1);
    const rows = await tx.execute(sql`select business_id, name, slug, role from app.list_user_businesses(${userId})`);
    return { activeBusinessId: user?.activeBusinessId ?? null, rows: rows.rows };
  });
  return result.rows.map((row) => ({ businessId: String(row.business_id), name: String(row.name), slug: String(row.slug), role: String(row.role), active: String(row.business_id) === result.activeBusinessId }));
}

export async function switchWorkspace(
  context: DomainContext,
  input: { userId: string; businessId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, {
    userId: input.userId,
    businessId: input.businessId,
    actorType: "operator",
  }, async (tx) => {
    await requireBusinessMembership(tx, input);
    await tx.update(users).set({ activeBusinessId: input.businessId, updatedAt: new Date() }).where(eq(users.id, input.userId));
  });
}

export async function inviteMember(
  context: DomainContext,
  input: { userId: string; businessId: string; email: string; role: BusinessRole },
): Promise<{ invitationId: string; token: string }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const normalizedEmail = normalizeAuthEmail(input.email);
  const invitationId = randomUUID();
  await withBusinessTransaction(context.db, {
    userId: input.userId,
    businessId: input.businessId,
    actorType: "operator",
  }, async (tx) => {
    await requireBusinessAdmin(tx, { userId: input.userId, businessId: input.businessId });
    await tx.insert(businessInvitations).values({
      id: invitationId,
      businessId: input.businessId,
      invitedByUserId: input.userId,
      email: input.email,
      normalizedEmail,
      role: input.role,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await enqueueOutbox(tx, {
      topic: "email.send",
      businessId: input.businessId,
      aggregateType: "business_invitation",
      aggregateId: invitationId,
      dedupeKey: `invitation:${invitationId}:send`,
      payload: {
        invitationId,
        email: input.email,
        token,
        template: "invitation",
        url: `${process.env.APP_BASE_URL ?? "http://localhost"}/accept-invite?token=${encodeURIComponent(token)}`,
      },
    });
  });
  return { invitationId, token };
}

export async function acceptInvitation(
  context: DomainContext,
  input: { userId: string; tokenHash: string },
): Promise<{ businessId: string; role: string }> {
  const resolved = await context.db.execute<{ business_id: string }>(sql`select app.resolve_business_by_invitation(${input.tokenHash}) as business_id`);
  const businessId = resolved.rows[0]?.business_id;
  if (!businessId) {
    throw new Error("Invitation is invalid or expired.");
  }
  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "system", businessId }, async (tx) => {
    const rows = await tx.select().from(businessInvitations).where(and(eq(businessInvitations.tokenHash, input.tokenHash), eq(businessInvitations.status, "pending"))).limit(1);
    const invitation = rows[0];
    if (!invitation || invitation.expiresAt <= new Date()) {
      throw new Error("Invitation is invalid or expired.");
    }
    await tx.insert(businessMemberships).values({
      businessId: invitation.businessId,
      userId: input.userId,
      role: invitation.role,
      status: "active",
    }).onConflictDoUpdate({
      target: [businessMemberships.businessId, businessMemberships.userId],
      set: { role: invitation.role, status: "active", updatedAt: new Date() },
    });
    await tx.update(businessInvitations).set({ status: "accepted", acceptedByUserId: input.userId, acceptedAt: new Date(), updatedAt: new Date() }).where(eq(businessInvitations.id, invitation.id));
    return { businessId: invitation.businessId, role: invitation.role };
  });
}
