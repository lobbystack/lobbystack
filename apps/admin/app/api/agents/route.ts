import { NextResponse } from "next/server";
import { z } from "zod";

import { AGENT_NAME_MAX_LENGTH, createAgent, listAgents } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A new agent copies `copyFromAgentId`, or the default agent without one.
const createSchema = z.object({ name: z.string().trim().min(1).max(AGENT_NAME_MAX_LENGTH), copyFromAgentId: z.uuid().optional() });

export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json(await listAgents(domain, { userId, businessId })));

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const input = createSchema.parse(body);
  return NextResponse.json(await createAgent(domain, { userId, businessId, name: input.name, ...(input.copyFromAgentId ? { copyFromAgentId: input.copyFromAgentId } : {}) }), { status: 201 });
});
