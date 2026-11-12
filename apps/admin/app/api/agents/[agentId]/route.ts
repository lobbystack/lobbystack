import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { archiveAgent, getAgent, readAgentSettingsChange, requireActiveAgentInTransaction, saveAgentSettingsInTransaction } from "@lobbystack/domain";
import { businesses } from "@lobbystack/db";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { agentId: string };

const agentId = z.uuid();
const archiveSchema = z.object({ reassignToAgentId: z.uuid().optional() });

// Language, timezone, currency and the summary belong to the workspace, which /api/agent still saves.
const workspaceFields = ["locale", "teamLocale", "timezone", "currency", "summary", "regenerateSummary"];

export const GET = operatorRoute<Params>(async ({ userId, businessId, domain }, params) => NextResponse.json(await getAgent(domain, { userId, businessId, agentId: agentId.parse(params.agentId) })));

/** Saves one agent's settings, with the same field rules as /api/agent. */
export const PATCH = operatorRoute<Params>(async ({ businessId, body, transaction }, params) => {
  const id = agentId.parse(params.agentId);
  const field = workspaceFields.find((name) => typeof body === "object" && body !== null && name in body);
  if (field) throw jsonError(`${field} belongs to the workspace.`, 400);
  const { name, patch } = readAgentSettingsChange(body);
  return NextResponse.json(await transaction(async (tx) => {
    await requireActiveAgentInTransaction(tx, businessId, id);
    const business = (await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
    if (!business) throw jsonError("Business not found.", 404);
    const profile = await saveAgentSettingsInTransaction(tx, { businessId, agentId: id, businessName: business.name, name, patch });
    if (!profile) throw jsonError("Agent could not be saved.", 500);
    return { profile };
  }, { minimumRole: "business_admin" }));
});

/** Archives the agent. Its channels move to `reassignToAgentId`, or to the default agent. */
export const DELETE = operatorRoute<Params>(async ({ userId, businessId, body, domain }, params) => {
  const input = archiveSchema.parse(body ?? {});
  return NextResponse.json(await archiveAgent(domain, { userId, businessId, agentId: agentId.parse(params.agentId), ...(input.reassignToAgentId ? { reassignToAgentId: input.reassignToAgentId } : {}) }));
});
