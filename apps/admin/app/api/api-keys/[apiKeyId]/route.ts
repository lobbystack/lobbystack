import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { revokeApiKey } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ apiKeyId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { apiKeyId } = await params;
    if (!isUuid(apiKeyId)) return NextResponse.json({ error: "apiKeyId must be a UUID.", code: "invalid_request" }, { status: 400 });
    const revoked = await revokeApiKey(createDomainContext(), { userId: session.user.id, businessId, apiKeyId });
    return revoked ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "API key not found.", code: "not_found" }, { status: 404 });
  } catch (error) { return asApiResponse(error); }
}
