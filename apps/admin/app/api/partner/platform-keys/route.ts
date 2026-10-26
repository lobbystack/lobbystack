import { NextResponse } from "next/server";

import { createPartnerPlatformKey, listPartnerPlatformKeys } from "@lobbystack/domain";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// The partner console's API keys page. The partner operations let only
// owners and admins read, make and revoke the partner's platform keys.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json({ keys: await listPartnerPlatformKeys(domain, actor) }));

/** The response carries the key once; the partner keeps only its hash. */
export const POST = partnerRoute(async ({ actor, body, domain }) => {
  const created = await createPartnerPlatformKey(domain, actor, { name: typeof body.name === "string" ? body.name : "", scopes: body.scopes });
  return NextResponse.json(created, { status: 201 });
});
