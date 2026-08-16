import { NextResponse } from "next/server";

import { cancelKnowledgeDocument, deleteKnowledgeDocument, retryKnowledgeDocument } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const body = await readJson(request) as { action?: string };
    const { documentId } = await params;
    if (body.action === "retry") await retryKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId, documentId });
    else if (body.action === "cancel") await cancelKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId, documentId });
    else return NextResponse.json({ error: "action must be retry or cancel." }, { status: 400 });
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
