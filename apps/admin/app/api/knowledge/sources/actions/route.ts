import { NextResponse } from "next/server";
import { z } from "zod";

import { applyKnowledgeAction, knowledgeActions, knowledgeItemTypes } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(knowledgeActions),
  items: z.array(z.object({ type: z.enum(knowledgeItemTypes), id: z.uuid() })).min(1).max(200),
  agentId: z.uuid().optional(),
});

/** Deletes, turns off or on, or re-imports several sources at once, for the business or for one agent. */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const input = actionSchema.parse(body);
  return NextResponse.json(await applyKnowledgeAction(domain, { userId, businessId, action: input.action, items: input.items, ...(input.agentId ? { agentId: input.agentId } : {}) }));
});
