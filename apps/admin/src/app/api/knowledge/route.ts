import { NextRequest } from "next/server";

import { createKnowledgeDocumentRequestSchema } from "@lobbystack/contracts";
import { createKnowledgeDocument, listKnowledgeDocuments } from "@lobbystack/domain/server";

import { errorResponse, jsonResponse, parseJsonBody } from "@/lib/api-helpers";
import { requireBusinessAccess, requireSession } from "@/lib/authorization";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return jsonResponse({ error: "businessId is required" }, { status: 400 });
    }
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    const documents = await listKnowledgeDocuments({ businessId });
    return jsonResponse({ documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = createKnowledgeDocumentRequestSchema.parse(await parseJsonBody(request));
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return jsonResponse({ error: "businessId is required" }, { status: 400 });
    }
    await requireBusinessAccess({ businessId, userId: session.userId, requireAdmin: true });
    const documentId = await createKnowledgeDocument({
      businessId,
      userId: session.userId,
      values: body,
    });
    return jsonResponse({ documentId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
