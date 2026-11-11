import { NextResponse } from "next/server";
import { z } from "zod";

import { createAgentRule, deleteAgentRule, listAgentRules, reorderAgentRules, updateAgentRule } from "@lobbystack/domain";
import { RULE_CONTENT_MAX_LENGTH, RULE_TITLE_MAX_LENGTH, ruleChannels, RULES_MAX } from "@lobbystack/shared";
import { operatorRoute } from "@/lib/operator-request";

// Rules belong to one agent. Without an agentId, the default agent's.
const agentId = z.uuid().optional();
// Null keeps a rule on every channel.
const channel = z.enum(ruleChannels).nullable().optional();
const createSchema = z.object({ agentId, title: z.string().trim().min(1).max(RULE_TITLE_MAX_LENGTH), content: z.string().trim().min(1).max(RULE_CONTENT_MAX_LENGTH), active: z.boolean().optional(), channel });
const updateSchema = z.object({ agentId, ruleId: z.uuid(), title: z.string().trim().min(1).max(RULE_TITLE_MAX_LENGTH).optional(), content: z.string().trim().min(1).max(RULE_CONTENT_MAX_LENGTH).optional(), active: z.boolean().optional(), channel });
const reorderSchema = z.object({ agentId, ruleIds: z.array(z.uuid()).max(RULES_MAX) });
const deleteSchema = z.object({ agentId, ruleId: z.uuid() });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scoped = (id: string | undefined) => (id ? { agentId: id } : {});

export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const id = agentId.parse(new URL(request.url).searchParams.get("agentId") ?? undefined);
  return NextResponse.json(await listAgentRules(domain, { userId, businessId, ...scoped(id) }));
});

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = createSchema.parse(input);
  return NextResponse.json(await createAgentRule(domain, { userId, businessId, ...scoped(body.agentId), title: body.title, content: body.content, ...(body.active === undefined ? {} : { active: body.active }), ...(body.channel === undefined ? {} : { channel: body.channel }) }), { status: 201 });
});

export const PATCH = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if ("ruleIds" in body) {
    const input = reorderSchema.parse(body);
    await reorderAgentRules(domain, { userId, businessId, ...scoped(input.agentId), ruleIds: input.ruleIds });
  } else {
    const input = updateSchema.parse(body);
    await updateAgentRule(domain, { userId, businessId, ...scoped(input.agentId), ruleId: input.ruleId, ...(input.title === undefined ? {} : { title: input.title }), ...(input.content === undefined ? {} : { content: input.content }), ...(input.active === undefined ? {} : { active: input.active }), ...(input.channel === undefined ? {} : { channel: input.channel }) });
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const input = deleteSchema.parse(body);
  await deleteAgentRule(domain, { userId, businessId, ...scoped(input.agentId), ruleId: input.ruleId });
  return NextResponse.json({ ok: true });
});
