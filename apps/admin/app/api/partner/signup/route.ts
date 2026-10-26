import { NextResponse } from "next/server";

import { hashPartnerToken, signUpPartner } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/**
 * Signs the signed-in account's company up as a partner, on the host's
 * domain. While signup is invite-only, the body carries the host's
 * invitation token from the link.
 */
export const POST = signedInRoute(async ({ session, userId, body, domain }) => {
  if (typeof body.name !== "string" || !body.name.trim()) return jsonError("name is required.", 400);
  if (body.subdomain !== undefined && typeof body.subdomain !== "string") return jsonError("subdomain must be a string.", 400);
  if (body.invitation !== undefined && typeof body.invitation !== "string") return jsonError("invitation must be a string.", 400);
  // Each signup reserves a name and a subdomain, so cap how many one account can make.
  const limit = await enforceFixedWindow([fixedWindowLimit("partner-signup", "user-day", userId, 5, 24 * 60 * 60, "rate_limit_user_day")]);
  if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many partner signups. Try again tomorrow." : "Signup abuse protection is unavailable.", limit.status, limit.status === 429 ? "rate_limited" : "rate_limit_unavailable");
  const invitation = typeof body.invitation === "string" && body.invitation.trim() ? body.invitation.trim() : undefined;
  return NextResponse.json(await signUpPartner(domain, {
    userId,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    name: body.name,
    ...(typeof body.subdomain === "string" && body.subdomain.trim() ? { subdomain: body.subdomain } : {}),
    ...(invitation ? { invitationTokenHash: hashPartnerToken(invitation) } : {}),
  }), { status: 201 });
});
