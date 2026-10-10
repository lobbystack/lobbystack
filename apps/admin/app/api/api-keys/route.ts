import { NextResponse } from "next/server";

import { createApiKey, listApiKeys } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json({ keys: await listApiKeys(domain, { userId, businessId }) }));

/** Owners and admins only. The response carries the plaintext key once. */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const created = await createApiKey(domain, { userId, businessId, name: typeof body.name === "string" ? body.name : "", scopes: body.scopes });
  return NextResponse.json(created, { status: 201 });
});
