import { NextResponse } from "next/server";

import { cancelKnowledgeDocument, deleteKnowledgeDocument, expandWebsiteCrawl, getKnowledgeDocumentContent, retryKnowledgeDocument, setKnowledgeDocumentActive } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { documentId } = await params;
    const result = await getKnowledgeDocumentContent(createDomainContext(), { userId: session.user.id, businessId, documentId });
    if (!result) return jsonError("Knowledge document not found.", 404);
    return NextResponse.json(result);
  } catch (error) { return asApiResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { action?: string; active?: unknown };
    const { documentId } = await params;
    if (typeof body?.active === "boolean") await setKnowledgeDocumentActive(createDomainContext(), { userId: session.user.id, businessId, documentId, active: body.active });
    else if (body?.action === "retry") await retryKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId, documentId });
    else if (body?.action === "cancel") await cancelKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId, documentId });
    else if (body?.action === "expand") await expandWebsiteCrawl(createDomainContext(), { userId: session.user.id, businessId, documentId });
    else return jsonError("Provide active as a boolean, or action as retry, cancel, or expand.", 400);
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { documentId } = await params;
    await deleteKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId, documentId });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
