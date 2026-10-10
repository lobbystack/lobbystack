import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { revokeApiKey } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const DELETE = operatorRoute<{ apiKeyId: string }>(async ({ userId, businessId, domain }, { apiKeyId }) => {
  if (!isUuid(apiKeyId)) return NextResponse.json({ error: "apiKeyId must be a UUID.", code: "invalid_request" }, { status: 400 });
  const revoked = await revokeApiKey(domain, { userId, businessId, apiKeyId });
  return revoked ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "API key not found.", code: "not_found" }, { status: 404 });
});
