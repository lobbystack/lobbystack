import { NextResponse } from "next/server";

import { listPartnerOAuthGrants } from "@lobbystack/domain";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// The console's MCP connections, under its API keys: MCP clients a person on the team
// connected to the partner with OAuth. Owners and admins see every one;
// anyone else sees their own.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json({ grants: await listPartnerOAuthGrants(domain, actor) }));
