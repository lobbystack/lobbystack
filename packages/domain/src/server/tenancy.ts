import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, ne, or, sql } from "drizzle-orm";

import { enqueueOutbox, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { businessInvitations, businessMemberships, businesses, receptionistProfiles, staff, users } from "@lobbystack/db";
import { defaultAppointmentChangePolicy, normalizeAuthEmail } from "@lobbystack/shared";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export type BusinessRole = "business_owner" | "business_admin" | "scheduler" | "viewer";

export type CreateBusinessInput = {
  userId: string;
  name: string;
  slug?: string;
  timezone: string;
  businessType: string;
  deploymentMode?: string;
};

function cleanSlug(slug: string): string {
  const result = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (result.length < 2 || result.length > 120) {
    throw Object.assign(new Error("Business slug must be between 2 and 120 characters."), { status: 400 });
  }
  return result;
}

// Each business adds recurring worker jobs, so one account cannot create them without bound.
const maxOwnedBusinesses = 10;

export async function createBusiness(
  context: DomainContext,
  input: CreateBusinessInput,
): Promise<{ businessId: string; membershipId: string }> {
  const businessId = randomUUID();
  const generatedSlug = input.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96).replace(/-$/, "") || "business";
  const baseSlug = input.slug === undefined ? generatedSlug : cleanSlug(input.slug);
  return await withBusinessTransaction(context.db, {
    userId: input.userId,
    businessId,
    actorType: "system",
  }, async (tx) => {
    // Lock the user row so concurrent creates by the same account count each other.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update");
    const owned = await tx.execute<{ count: number }>(sql`select count(*)::int as count from app.list_user_businesses(${input.userId}) where role = 'business_owner'`);
    if ((owned.rows[0]?.count ?? 0) >= maxOwnedBusinesses) {
      throw Object.assign(new Error(`Too many workspaces. One account can own up to ${maxOwnedBusinesses}.`), { status: 403 });
    }
    let business: { id: string } | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const insert = tx.insert(businesses).values({
        id: businessId,
        name: input.name.trim(),
        slug: attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(6).toString("hex")}`,
        timezone: input.timezone,
        businessType: input.businessType,
        deploymentMode: input.deploymentMode ?? "cloud",
        onboardingStage: "website",
      });
      // Only generated slugs are replaceable. Target this constraint explicitly
      // so unrelated insert failures still roll back the transaction.
      [business] = await (input.slug === undefined ? insert.onConflictDoNothing({ target: businesses.slug }) : insert).returning({ id: businesses.id });
      if (business) break;
    }
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
    // Booking assigns every appointment to a staff member. Businesses that don't
    // manage a team get one hidden member that stands for the business itself.
    await tx.insert(staff).values({ businessId, name: input.name.trim(), timezone: input.timezone });
    await tx.insert(receptionistProfiles).values({
      businessId,
      greeting: `Thanks for calling ${input.name.trim()}.`,
      tone: "warm and direct",
      summary: `${input.name.trim()} uses LobbyStack to answer calls.`,
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
): Promise<Array<{ businessId: string; name: string; slug: string; role: string; active: boolean; timezone: string; businessType: string; defaultLocale: string; websiteUrl: string | null; onboardingStage: string; createdAt: string }>> {
  return await withBusinessTransaction(db, { userId, actorType: "operator" }, async (tx) => {
    const [user] = await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId)).limit(1);
    const rows = await tx.execute<{ businessId: string; name: string; slug: string; role: string; timezone: string; businessType: string; defaultLocale: string; websiteUrl: string | null; onboardingStage: string; createdAt: Date }>(sql`select business_id as "businessId", name, slug, role, timezone, business_type as "businessType", default_locale as "defaultLocale", website_url as "websiteUrl", onboarding_stage as "onboardingStage", created_at as "createdAt" from app.list_user_businesses(${userId})`);
    return rows.rows.map((row) => ({ ...row, active: row.businessId === user?.activeBusinessId, createdAt: new Date(row.createdAt).toISOString() }));
  });
}

export async function updateBusiness(
  context: DomainContext,
  input: { userId: string; businessId: string; name?: string; timezone?: string; businessType?: string; defaultLocale?: string; websiteUrl?: string | null },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await updateBusinessInTransaction(tx, input);
  });
}

/** Updates basic business fields. Callers authorize first. */
export async function updateBusinessInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; name?: string; timezone?: string; businessType?: string; defaultLocale?: string; websiteUrl?: string | null },
): Promise<void> {
  const values = { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}), ...(input.businessType !== undefined ? { businessType: input.businessType.trim() } : {}), ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale.trim() } : {}), ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}), updatedAt: new Date() };
  if (Object.keys(values).length === 1) throw new Error("At least one business field is required.");
  const [business] = await tx.update(businesses).set(values).where(eq(businesses.id, input.businessId)).returning({ id: businesses.id });
  if (!business) throw new Error("Business not found.");
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
  // Exactly one plain address: mail transports send a comma or semicolon list to every recipient.
  if (!/^[^\s@,;:<>()"]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(normalizedEmail)) {
    throw Object.assign(new Error("Enter one valid email address."), { status: 400 });
  }
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
      email: normalizedEmail,
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
        email: normalizedEmail,
        token,
        template: "invitation",
        // Invitations may go to someone without an account preference. Let the
        // compatibility entry point negotiate their locale before redirecting.
        url: `${process.env.APP_BASE_URL ?? "http://localhost"}/accept-invite?token=${encodeURIComponent(token)}`,
      },
    });
  });
  return { invitationId, token };
}

export async function acceptInvitation(
  context: DomainContext,
  input: { userId: string; tokenHash: string; email: string | null | undefined; emailVerified: boolean | null | undefined },
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
    // A forwarded or leaked link must not let a different account join.
    if (!input.emailVerified || !input.email || normalizeAuthEmail(input.email) !== invitation.normalizedEmail) {
      throw Object.assign(new Error("Sign in with the verified email address this invitation was sent to."), { status: 403 });
    }
    // Claim the invitation before joining, so a second accept of the same token fails.
    const [claimed] = await tx.update(businessInvitations).set({ status: "accepted", acceptedByUserId: input.userId, acceptedAt: new Date(), updatedAt: new Date() }).where(and(eq(businessInvitations.id, invitation.id), eq(businessInvitations.status, "pending"))).returning({ id: businessInvitations.id });
    if (!claimed) {
      throw new Error("Invitation is invalid or expired.");
    }
    // An active member keeps their role, so an owner who accepts a viewer invite stays owner.
    const [joined] = await tx.insert(businessMemberships).values({
      businessId: invitation.businessId,
      userId: input.userId,
      role: invitation.role,
      status: "active",
    }).onConflictDoUpdate({
      target: [businessMemberships.businessId, businessMemberships.userId],
      set: { role: invitation.role, status: "active", updatedAt: new Date() },
      setWhere: ne(businessMemberships.status, "active"),
    }).returning({ role: businessMemberships.role });
    const role = joined?.role ?? (await tx.select({ role: businessMemberships.role }).from(businessMemberships).where(and(eq(businessMemberships.businessId, invitation.businessId), eq(businessMemberships.userId, input.userId))).limit(1))[0]!.role;
    return { businessId: invitation.businessId, role };
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
    const membership = (await tx.select({ role: businessMemberships.role, userId: businessMemberships.userId }).from(businessMemberships).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active"))).limit(1))[0];
    if (!membership) throw new Error("Membership not found.");
    if (membership.role === "business_owner") {
      const owners = await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(and(eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.role, "business_owner"), eq(businessMemberships.status, "active")));
      if (owners.length <= 1) throw new Error("The final owner cannot be removed.");
    }
    // RLS hides the member's users row from the app role; this function returns their email.
    const email = (await tx.execute<{ email: string }>(sql`select email from app.list_business_members(${input.businessId}::uuid) where membership_id = ${input.membershipId}::uuid`)).rows[0]?.email;
    await tx.update(businessMemberships).set({ status: "removed", updatedAt: new Date() }).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")));
    // Pending invitations the member sent (the inviter gets the token) or received would let them back in.
    await tx.update(businessInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(businessInvitations.businessId, input.businessId), eq(businessInvitations.status, "pending"), or(eq(businessInvitations.invitedByUserId, membership.userId), email ? eq(businessInvitations.normalizedEmail, normalizeAuthEmail(email)) : undefined)));
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
