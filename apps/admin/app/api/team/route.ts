import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businessInvitations } from "@lobbystack/db";
import { inviteMember, removeMember, revokeInvitation } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { asApiResponse, businessIdFromRequest, jsonError, readJson, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";

export const dynamic = "force-dynamic";

const roles = ["business_admin", "scheduler", "viewer"] as const;
type InviteRole = (typeof roles)[number];

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [members, invitations] = await Promise.all([
        // RLS hides other users' rows from the app role, so read members through this function.
        tx.execute<{ joinedAt: string }>(sql`select membership_id as "membershipId", user_id as "userId", name, email, role, status, joined_at as "joinedAt" from app.list_business_members(${businessId}::uuid)`),
        tx.select({ invitationId: businessInvitations.id, email: businessInvitations.email, role: businessInvitations.role, status: businessInvitations.status, expiresAt: businessInvitations.expiresAt, invitedAt: businessInvitations.createdAt }).from(businessInvitations).where(eq(businessInvitations.businessId, businessId)),
      ]);
      // Raw queries return Postgres timestamp text, which Safari's Date can't parse; send ISO like invitedAt.
      return { members: members.rows.map((member) => ({ ...member, joinedAt: new Date(member.joinedAt).toISOString() })), invitations };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const body = await readJson(request) as { membershipId?: string; invitationId?: string };
    if (!businessId || (!body.membershipId && !body.invitationId)) return jsonError("businessId and a membershipId or invitationId are required.", 400);
    if (!isUuid(body.membershipId || body.invitationId)) return jsonError("membershipId or invitationId must be a UUID.", 400);
    if (body.membershipId) await removeMember(createDomainContext(), { userId: session.user.id, businessId, membershipId: body.membershipId });
    else await revokeInvitation(createDomainContext(), { userId: session.user.id, businessId, invitationId: body.invitationId! });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonError("An invitation object is required.", 400);
    const input = body as Record<string, unknown>;
    const businessId = typeof input.businessId === "string" ? input.businessId : businessIdFromRequest(request);
    if (!businessId) return jsonError("A businessId is required.", 400);
    if (!isUuid(businessId)) return jsonError("businessId must be a UUID.", 400);
    if (typeof input.email !== "string" || !input.email.trim()) return jsonError("email is required.", 400);
    if (typeof input.role !== "string" || !roles.includes(input.role as InviteRole)) return jsonError("role is invalid.", 400);
    // Each invite sends an email, so cap how many one account can send.
    const limit = await enforceFixedWindow([fixedWindowLimit("team-invite", "user-hour", session.user.id, 20, 60 * 60, "rate_limit_user_hour")]);
    if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many invitations. Try again later." : "Invitation abuse protection is unavailable.", limit.status);
    return NextResponse.json(await inviteMember(createDomainContext(), { userId: session.user.id, businessId, email: input.email, role: input.role as InviteRole }), { status: 201 });
  } catch (error) {
    return asApiResponse(error);
  }
}
