import { NextResponse } from "next/server";

import { acceptPartnerInvitation, hashPartnerToken } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** Joins a partner's team with the invitation in the link, as the signed-in account the invitation went to. */
export const POST = signedInRoute(async ({ session, userId, body, domain }) => {
  if (typeof body.token !== "string" || !body.token.trim()) return jsonError("An invitation token is required.", 400);
  return NextResponse.json(await acceptPartnerInvitation(domain, { userId, tokenHash: hashPartnerToken(body.token.trim()), email: session.user.email, emailVerified: session.user.emailVerified }));
});
