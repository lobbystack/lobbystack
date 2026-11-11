import { NextResponse } from "next/server";
import { z } from "zod";

import { listKnowledgeSources } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const agentId = z.uuid().optional();

/** The knowledge a page lists, one row per source: the business's shared sources, plus an agent's own with ?agentId. */
export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const agent = agentId.parse(new URL(request.url).searchParams.get("agentId") ?? undefined);
  return NextResponse.json(await listKnowledgeSources(domain, { userId, businessId, ...(agent ? { agentId: agent } : {}) }));
});
