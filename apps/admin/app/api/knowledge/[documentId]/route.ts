import { NextResponse } from "next/server";

import { cancelKnowledgeDocument, deleteKnowledgeDocument, expandWebsiteCrawl, getKnowledgeDocumentContent, retryKnowledgeDocument, setKnowledgeDocumentActive } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute<{ documentId: string }>(async ({ userId, businessId, domain }, { documentId }) => {
  const result = await getKnowledgeDocumentContent(domain, { userId, businessId, documentId });
  if (!result) return jsonError("Knowledge document not found.", 404);
  return NextResponse.json(result);
});

export const PATCH = operatorRoute<{ documentId: string }>(async ({ userId, businessId, body, domain }, { documentId }) => {
  if (typeof body.active === "boolean") await setKnowledgeDocumentActive(domain, { userId, businessId, documentId, active: body.active });
  else if (body.action === "retry") await retryKnowledgeDocument(domain, { userId, businessId, documentId });
  else if (body.action === "cancel") await cancelKnowledgeDocument(domain, { userId, businessId, documentId });
  else if (body.action === "expand") await expandWebsiteCrawl(domain, { userId, businessId, documentId });
  else return jsonError("Provide active as a boolean, or action as retry, cancel, or expand.", 400);
  return NextResponse.json({ ok: true });
});

export const DELETE = operatorRoute<{ documentId: string }>(async ({ userId, businessId, domain }, { documentId }) => {
  await deleteKnowledgeDocument(domain, { userId, businessId, documentId });
  return NextResponse.json({ ok: true });
});
