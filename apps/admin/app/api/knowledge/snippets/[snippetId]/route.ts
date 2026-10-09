import { NextResponse } from "next/server";

import { deleteKnowledgeSnippet, updateKnowledgeSnippet } from "@lobbystack/domain";
import { asApiResponse, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ snippetId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { title?: string; content?: string; tags?: string[]; priority?: number; active?: boolean };
    const { snippetId } = await params;
    await updateKnowledgeSnippet(createDomainContext(), { ...body, userId: session.user.id, businessId, snippetId });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ snippetId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { snippetId } = await params;
    await deleteKnowledgeSnippet(createDomainContext(), { userId: session.user.id, businessId, snippetId });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
