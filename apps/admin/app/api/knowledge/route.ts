import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { knowledgeDocuments } from "@lobbystack/db";
import { createKnowledgeDocument } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => ({ documents: await tx.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId)).orderBy(asc(knowledgeDocuments.title)) }))); } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request) as { businessId?: string; title?: string; sourceType?: string; sourceUrl?: string };
    if (!body.businessId || !body.title || !body.sourceType) return NextResponse.json({ error: "businessId, title, and sourceType are required." }, { status: 400 });
    return NextResponse.json({ documentId: await createKnowledgeDocument(createDomainContext(), { userId: session.user.id, businessId: body.businessId, title: body.title, sourceType: body.sourceType, ...(body.sourceUrl ? { sourceUrl: body.sourceUrl } : {}) }) }, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
