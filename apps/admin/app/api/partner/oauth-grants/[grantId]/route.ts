import { NextResponse } from "next/server";

import { revokePartnerOAuthGrant } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

/** Disconnects an agency connection and revokes its tokens at once. Owners and admins disconnect anyone's; anyone else only their own. */
export const DELETE = partnerRoute<{ grantId: string }>(async ({ actor, domain }, { grantId }) => {
  if (!grantId || grantId.length > 200) return jsonError("grantId is invalid.", 400, "invalid_request");
  if (!await revokePartnerOAuthGrant(domain, actor, { grantId })) return jsonError("Connection not found.", 404, "not_found");
  return NextResponse.json({ ok: true });
});
