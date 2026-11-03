import { NextResponse } from "next/server";

import { loadTestWindowAgentInTransaction } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";

import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** What the test window shows for an agent, or the default agent without ?agentId=. */
export const GET = operatorRoute(async ({ request, businessId, transaction }) => {
  const agentId = new URL(request.url).searchParams.get("agentId") ?? undefined;
  if (agentId && !isUuid(agentId)) throw jsonError("agentId must be a UUID.", 400, "invalid_request");
  const agent = await transaction((tx) => loadTestWindowAgentInTransaction(tx, { businessId, agentId }), { minimumRole: "business_admin" });
  if (!agent) throw jsonError("Agent not found.", 404, "agent_not_found");
  return NextResponse.json(agent);
});
