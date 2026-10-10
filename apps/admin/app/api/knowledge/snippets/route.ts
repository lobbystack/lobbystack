import { NextResponse } from "next/server";

import { createKnowledgeSnippet, listKnowledgeSnippets } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json({ snippets: await listKnowledgeSnippets(domain, { userId, businessId }) }));

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = input as { title?: string; content?: string; tags?: string[]; priority?: number; active?: boolean };
  if (!body.title?.trim() || !body.content?.trim()) return jsonError("title and content are required.", 400);
  const snippetId = await createKnowledgeSnippet(domain, { userId, businessId, title: body.title, content: body.content, ...(body.tags ? { tags: body.tags } : {}), ...(body.priority === undefined ? {} : { priority: body.priority }), ...(body.active === undefined ? {} : { active: body.active }) });
  return NextResponse.json({ snippetId }, { status: 201 });
});
