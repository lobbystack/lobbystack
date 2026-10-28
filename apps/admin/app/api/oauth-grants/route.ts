import { NextResponse } from "next/server";

import { listOAuthGrants } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** MCP connections, under Settings > API keys: the MCP clients an owner or admin authorized for the active business. */
export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json({ grants: await listOAuthGrants(domain, { userId, businessId }) }));
