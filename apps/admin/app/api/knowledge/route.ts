import { asc, eq, getTableColumns, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { knowledgeDocuments } from "@lobbystack/db";
import { createKnowledgeDocument, websiteImportSummarySql, withWebsiteImportHealth, type WebsiteImportClock } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

type WebsiteImportRow = { id: string; status: string; websiteUrl: string; importedCount: number; indexedCount: number; documentCount: number; crawlFinishedCount: number | null; crawlTotalCount: number | null } & WebsiteImportClock;

// A document's websiteImport.stalled says its crawl should be running but stopped moving.
export const GET = operatorRoute(async ({ businessId, transaction }) => {
  const documents = await transaction(async (tx) => await tx.select({ ...getTableColumns(knowledgeDocuments), websiteImport: sql<WebsiteImportRow | null>`${websiteImportSummarySql()}`, textContent: sql<string>`coalesce((select left(preview.content, 500) from knowledge_chunks as preview where preview.document_id = knowledge_documents.id and preview.business_id = knowledge_documents.business_id order by preview.sequence limit 1), '')` }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId)).orderBy(asc(knowledgeDocuments.title)));
  const now = Date.now();
  return NextResponse.json({ documents: documents.map((document) => ({ ...document, websiteImport: withWebsiteImportHealth(document.websiteImport, now) })) });
});

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = input as { title?: string; sourceType?: string; sourceUrl?: string; onboarding?: boolean; agentId?: string };
  if (!body.title || !body.sourceType) return jsonError("title and sourceType are required.", 400);
  if (body.agentId !== undefined && !isUuid(body.agentId)) return jsonError("agentId must be an agent's id.", 400);
  try {
    return NextResponse.json({ documentId: await createKnowledgeDocument(domain, { userId, businessId, title: body.title, sourceType: body.sourceType, onboarding: body.onboarding === true, ...(body.sourceUrl ? { sourceUrl: body.sourceUrl } : {}), ...(body.agentId ? { agentId: body.agentId } : {}) }) }, { status: 201 });
  } catch (error) {
    // The dashboard names the agent in its own language.
    const conflict = error as { code?: string; agentName?: string | null };
    if (conflict.code === "knowledge_website_in_agent") return NextResponse.json({ error: (error as Error).message, code: conflict.code, agentName: conflict.agentName ?? null }, { status: 409 });
    throw error;
  }
});
