import { NextResponse } from "next/server";

import { changePartnerMemberRole, invitePartnerMember, listPartnerTeam, removePartnerMember, revokePartnerInvitation } from "@lobbystack/domain";
import { isPartnerRole, isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// The partner console's Team page. Every change goes through a partner
// operation, which checks the actor's role itself.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json(await listPartnerTeam(domain, actor)));

export const POST = partnerRoute(async ({ actor, userId, body, domain }) => {
  if (typeof body.email !== "string" || !body.email.trim()) return jsonError("email is required.", 400);
  if (!isPartnerRole(body.role)) return jsonError("role is invalid.", 400);
  // Each invitation sends an email, so cap how many one account can send.
  const limit = await enforceFixedWindow([fixedWindowLimit("partner-team-invite", "user-hour", userId, 20, 60 * 60, "rate_limit_user_hour")]);
  if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many invitations. Try again later." : "Invitation abuse protection is unavailable.", limit.status, limit.status === 429 ? "rate_limited" : "rate_limit_unavailable");
  return NextResponse.json(await invitePartnerMember(domain, actor, { email: body.email, role: body.role }), { status: 201 });
});

export const PATCH = partnerRoute(async ({ actor, body, domain }) => {
  if (!isUuid(body.memberId)) return jsonError("memberId must be a UUID.", 400);
  if (!isPartnerRole(body.role)) return jsonError("role is invalid.", 400);
  await changePartnerMemberRole(domain, actor, { memberId: body.memberId, role: body.role });
  return NextResponse.json({ ok: true });
});

export const DELETE = partnerRoute(async ({ actor, body, domain }) => {
  if (!body.memberId && !body.invitationId) return jsonError("A memberId or invitationId is required.", 400);
  if (!isUuid(body.memberId ?? body.invitationId)) return jsonError("memberId or invitationId must be a UUID.", 400);
  if (body.memberId) await removePartnerMember(domain, actor, { memberId: body.memberId as string });
  else await revokePartnerInvitation(domain, actor, { invitationId: body.invitationId as string });
  return NextResponse.json({ ok: true });
});
