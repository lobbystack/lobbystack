import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { revokeApiKey, updateApiKey } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const DELETE = operatorRoute<{ apiKeyId: string }>(async ({ userId, businessId, domain }, { apiKeyId }) => {
  if (!isUuid(apiKeyId)) return NextResponse.json({ error: "apiKeyId must be a UUID.", code: "invalid_request" }, { status: 400 });
  const revoked = await revokeApiKey(domain, { userId, businessId, apiKeyId });
  return revoked ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "API key not found.", code: "not_found" }, { status: 404 });
});

/** Changes a key's name and scopes. The key itself stays the same. Owners and admins only, as for making one. */
export const PATCH = operatorRoute<{ apiKeyId: string }>(async ({ userId, businessId, body, domain }, { apiKeyId }) => {
  if (!isUuid(apiKeyId)) return NextResponse.json({ error: "apiKeyId must be a UUID.", code: "invalid_request" }, { status: 400 });
  const apiKey = await updateApiKey(domain, { userId, businessId, apiKeyId, name: typeof body.name === "string" ? body.name : "", scopes: body.scopes });
  return apiKey ? NextResponse.json({ apiKey }) : NextResponse.json({ error: "API key not found.", code: "not_found" }, { status: 404 });
});
