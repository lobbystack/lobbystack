import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { enqueueOutbox, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { businessInvitations, businessMemberships, businesses, receptionistProfiles, users } from "@lobbystack/db";
import { defaultAppointmentChangePolicy, normalizeAuthEmail } from "@lobbystack/shared";

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
      onboardingStage: "website",
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
    await tx.insert(receptionistProfiles).values({
      businessId,
      greeting: `Thanks for calling ${input.name.trim()}.`,
      tone: "warm and direct",
      summary: `${input.name.trim()} uses LobbyStack to handle calls and SMS.`,
      bookingPolicy: "Only confirm a booking after availability is checked.",
      voiceInstructions: "Sound calm, confident, and concise. Escalate urgent requests to a human when policy requires it.",
      smsInstructions: "Keep replies concise and friendly. Ask one follow-up question at a time.",
      transferMode: "on_request",
      appointmentChangePolicy: defaultAppointmentChangePolicy,
    });
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
): Promise<Array<{ businessId: string; name: string; slug: string; role: string; active: boolean; onboardingStage?: string }>> {
  const result = await withBusinessTransaction(db, { userId, actorType: "operator" }, async (tx) => {
    const [user] = await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId)).limit(1);
    const rows = await tx.execute(sql`select business_id, name, slug, role from app.list_user_businesses(${userId})`);
    const details = [];
    for (const row of rows.rows) {
      const businessId = String(row.business_id);
      await tx.execute(sql`select set_config('app.business_id', ${businessId}, true)`);
      const [detail] = await tx.select({
        id: businesses.id,
        timezone: businesses.timezone,
        businessType: businesses.businessType,
        defaultLocale: businesses.defaultLocale,
        websiteUrl: businesses.websiteUrl,
        onboardingStage: businesses.onboardingStage,
      }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      if (detail) details.push(detail);
    }
    return { activeBusinessId: user?.activeBusinessId ?? null, rows: rows.rows, details };
  });
  return result.rows.map((row) => { const detail = result.details.find((item) => item.id === String(row.business_id)); return { businessId: String(row.business_id), name: String(row.name), slug: String(row.slug), role: String(row.role), active: String(row.business_id) === result.activeBusinessId, ...(detail ? { timezone: detail.timezone, businessType: detail.businessType, defaultLocale: detail.defaultLocale, websiteUrl: detail.websiteUrl, onboardingStage: detail.onboardingStage } : {}) }; });
}

export async function updateBusiness(
  context: DomainContext,
  input: { userId: string; businessId: string; name?: string; timezone?: string; businessType?: string; defaultLocale?: string; websiteUrl?: string | null },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const values = { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}), ...(input.businessType !== undefined ? { businessType: input.businessType.trim() } : {}), ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale.trim() } : {}), ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}), updatedAt: new Date() };
    if (Object.keys(values).length === 1) throw new Error("At least one business field is required.");
    const [business] = await tx.update(businesses).set(values).where(eq(businesses.id, input.businessId)).returning({ id: businesses.id });
    if (!business) throw new Error("Business not found.");
  });
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

export async function previewInvitation(
  context: DomainContext,
  input: { tokenHash: string },
): Promise<{ businessName: string; email: string; expired: boolean; status: string } | null> {
  const resolved = await context.db.execute<{ business_id: string }>(sql`select app.resolve_business_by_invitation(${input.tokenHash}) as business_id`);
  const businessId = resolved.rows[0]?.business_id;
  if (!businessId) return null;
  return await withBusinessTransaction(context.db, { actorType: "system", businessId }, async (tx) => {
    const rows = await tx.select({
      businessName: businesses.name,
      email: businessInvitations.email,
      expiresAt: businessInvitations.expiresAt,
      status: businessInvitations.status,
    }).from(businessInvitations).innerJoin(businesses, eq(businesses.id, businessInvitations.businessId)).where(and(eq(businessInvitations.tokenHash, input.tokenHash), eq(businessInvitations.businessId, businessId))).limit(1);
    const invitation = rows[0];
    return invitation ? { businessName: invitation.businessName, email: invitation.email, expired: invitation.expiresAt <= new Date(), status: invitation.status } : null;
  });
}

export async function updateMemberRole(
  context: DomainContext,
  input: { userId: string; businessId: string; membershipId: string; role: Exclude<BusinessRole, "business_owner"> },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const membership = (await tx.select({ userId: businessMemberships.userId, role: businessMemberships.role }).from(businessMemberships).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active"))).limit(1))[0];
    if (!membership) throw new Error("Membership not found.");
    if (membership.role === "business_owner") {
      const owners = await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(and(eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.role, "business_owner"), eq(businessMemberships.status, "active")));
      if (owners.length <= 1) throw new Error("The final owner cannot be changed.");
    }
    await tx.update(businessMemberships).set({ role: input.role, updatedAt: new Date() }).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")));
  });
}

export async function removeMember(
  context: DomainContext,
  input: { userId: string; businessId: string; membershipId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const membership = (await tx.select({ role: businessMemberships.role }).from(businessMemberships).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active"))).limit(1))[0];
    if (!membership) throw new Error("Membership not found.");
    if (membership.role === "business_owner") {
      const owners = await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(and(eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.role, "business_owner"), eq(businessMemberships.status, "active")));
      if (owners.length <= 1) throw new Error("The final owner cannot be removed.");
    }
    await tx.update(businessMemberships).set({ status: "removed", updatedAt: new Date() }).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")));
  });
}

export async function revokeInvitation(
  context: DomainContext,
  input: { userId: string; businessId: string; invitationId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const changed = await tx.update(businessInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(businessInvitations.id, input.invitationId), eq(businessInvitations.businessId, input.businessId), eq(businessInvitations.status, "pending"))).returning({ id: businessInvitations.id });
    if (!changed.length) throw new Error("Invitation not found or already resolved.");
  });
}
