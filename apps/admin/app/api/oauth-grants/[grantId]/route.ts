import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { revokeOAuthGrant } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

/** Revokes a connected app: the grant and every token issued under it. */
export async function DELETE(request: Request, { params }: { params: Promise<{ grantId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { grantId } = await params;
    if (!isUuid(grantId)) return NextResponse.json({ error: "grantId must be a UUID.", code: "invalid_request" }, { status: 400 });
    const revoked = await revokeOAuthGrant(createDomainContext(), { userId: session.user.id, businessId, grantId });
    return revoked ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Connected app not found.", code: "not_found" }, { status: 404 });
  } catch (error) { return asApiResponse(error); }
}
