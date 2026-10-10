import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { revokeOAuthGrant } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** Revokes a connected app: the grant and every token issued under it. */
export const DELETE = operatorRoute<{ grantId: string }>(async ({ userId, businessId, domain }, { grantId }) => {
  if (!isUuid(grantId)) return NextResponse.json({ error: "grantId must be a UUID.", code: "invalid_request" }, { status: 400 });
  const revoked = await revokeOAuthGrant(domain, { userId, businessId, grantId });
  return revoked ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Connected app not found.", code: "not_found" }, { status: 404 });
});
