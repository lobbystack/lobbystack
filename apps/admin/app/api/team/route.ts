import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businessInvitations } from "@lobbystack/db";
import { inviteMember, removeMember, revokeInvitation } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const roles = ["business_admin", "scheduler", "viewer"] as const;
type InviteRole = (typeof roles)[number];

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const [members, invitations] = await Promise.all([
    // RLS hides other users' rows from the app role, so read members through this function.
    tx.execute<{ joinedAt: string }>(sql`select membership_id as "membershipId", user_id as "userId", name, email, role, status, joined_at as "joinedAt" from app.list_business_members(${businessId}::uuid)`),
    tx.select({ invitationId: businessInvitations.id, email: businessInvitations.email, role: businessInvitations.role, status: businessInvitations.status, expiresAt: businessInvitations.expiresAt, invitedAt: businessInvitations.createdAt }).from(businessInvitations).where(eq(businessInvitations.businessId, businessId)),
  ]);
  // Raw queries return Postgres timestamp text, which Safari's Date can't parse; send ISO like invitedAt.
  return { members: members.rows.map((member) => ({ ...member, joinedAt: new Date(member.joinedAt).toISOString() })), invitations };
})));

export const DELETE = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = input as { membershipId?: string; invitationId?: string };
  if (!body.membershipId && !body.invitationId) return jsonError("A membershipId or invitationId is required.", 400);
  if (!isUuid(body.membershipId || body.invitationId)) return jsonError("membershipId or invitationId must be a UUID.", 400);
  if (body.membershipId) await removeMember(domain, { userId, businessId, membershipId: body.membershipId });
  else await revokeInvitation(domain, { userId, businessId, invitationId: body.invitationId! });
  return NextResponse.json({ ok: true });
});

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  if (typeof input.email !== "string" || !input.email.trim()) return jsonError("email is required.", 400);
  if (typeof input.role !== "string" || !roles.includes(input.role as InviteRole)) return jsonError("role is invalid.", 400);
  // Each invite sends an email, so cap how many one account can send.
  const limit = await enforceFixedWindow([fixedWindowLimit("team-invite", "user-hour", userId, 20, 60 * 60, "rate_limit_user_hour")]);
  if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many invitations. Try again later." : "Invitation abuse protection is unavailable.", limit.status);
  return NextResponse.json(await inviteMember(domain, { userId, businessId, email: input.email, role: input.role as InviteRole }), { status: 201 });
});
