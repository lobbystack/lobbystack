import { NextResponse } from "next/server";

import { deleteKnowledgeSnippet, updateKnowledgeSnippet } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const PATCH = operatorRoute<{ snippetId: string }>(async ({ userId, businessId, body, domain }, { snippetId }) => {
  await updateKnowledgeSnippet(domain, { ...body as { title?: string; content?: string; tags?: string[]; priority?: number; active?: boolean }, userId, businessId, snippetId });
  return NextResponse.json({ ok: true });
});

export const DELETE = operatorRoute<{ snippetId: string }>(async ({ userId, businessId, domain }, { snippetId }) => {
  await deleteKnowledgeSnippet(domain, { userId, businessId, snippetId });
  return NextResponse.json({ ok: true });
});
