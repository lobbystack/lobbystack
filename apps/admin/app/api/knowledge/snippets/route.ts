import { NextResponse } from "next/server";

import { createKnowledgeSnippet, listKnowledgeSnippets } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, jsonError, readJson, requireApiSession, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    return NextResponse.json({ snippets: await listKnowledgeSnippets(createDomainContext(), { userId: session.user.id, businessId }) });
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const body = await readJson(request) as { title?: string; content?: string; tags?: string[]; priority?: number; active?: boolean };
    if (!businessId || !body.title?.trim() || !body.content?.trim()) return jsonError("businessId, title, and content are required.", 400);
    const snippetId = await createKnowledgeSnippet(createDomainContext(), { userId: session.user.id, businessId, title: body.title, content: body.content, ...(body.tags ? { tags: body.tags } : {}), ...(body.priority === undefined ? {} : { priority: body.priority }), ...(body.active === undefined ? {} : { active: body.active }) });
    return NextResponse.json({ snippetId }, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
