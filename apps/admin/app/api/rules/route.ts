import { NextResponse } from "next/server";
import { z } from "zod";

import { createAgentRule, deleteAgentRule, listAgentRules, reorderAgentRules, updateAgentRule } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

const createSchema = z.object({ title: z.string().trim().min(1).max(160), content: z.string().trim().min(1).max(10_000), active: z.boolean().optional() });
const updateSchema = z.object({ ruleId: z.uuid(), title: z.string().trim().min(1).max(160).optional(), content: z.string().trim().min(1).max(10_000).optional(), active: z.boolean().optional() });
const reorderSchema = z.object({ ruleIds: z.array(z.uuid()).max(100) });
const deleteSchema = z.object({ ruleId: z.uuid() });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json(await listAgentRules(domain, { userId, businessId })));

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = createSchema.parse(input);
  return NextResponse.json(await createAgentRule(domain, { userId, businessId, title: body.title, content: body.content, ...(body.active === undefined ? {} : { active: body.active }) }), { status: 201 });
});

export const PATCH = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if ("ruleIds" in body) {
    const input = reorderSchema.parse(body);
    await reorderAgentRules(domain, { ...input, userId, businessId });
  } else {
    const input = updateSchema.parse(body);
    await updateAgentRule(domain, { userId, businessId, ruleId: input.ruleId, ...(input.title === undefined ? {} : { title: input.title }), ...(input.content === undefined ? {} : { content: input.content }), ...(input.active === undefined ? {} : { active: input.active }) });
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const input = deleteSchema.parse(body);
  await deleteAgentRule(domain, { ...input, userId, businessId });
  return NextResponse.json({ ok: true });
});
