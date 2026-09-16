import { NextResponse } from "next/server";

import { cancelKnowledgeDocument, deleteKnowledgeDocument, getKnowledgeDocumentContent, retryKnowledgeDocument, setKnowledgeDocumentActive } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const { documentId } = await params;
    const result = await getKnowledgeDocumentContent(createDomainContext(), { userId: session.user.id, businessId, documentId });
    if (!result) return NextResponse.json({ error: "Knowledge document not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) { return asApiResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const body = await readJson(request) as { action?: string; active?: unknown };
    const { documentId } = await params;
    if (typeof body?.active === "boolean") await setKnowledgeDocumentActive(createDomainContext(), { userId: session.user.id, businessId, documentId, active: body.active });
    else if (body?.action === "retry") await retryKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId, documentId });
    else if (body?.action === "cancel") await cancelKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId, documentId });
    else return NextResponse.json({ error: "Provide active as a boolean, or action as retry or cancel." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const { documentId } = await params;
    await deleteKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId, documentId });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
