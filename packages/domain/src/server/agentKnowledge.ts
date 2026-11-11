import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { agentKnowledgeExclusions, enqueueOutbox, knowledgeDocuments, knowledgeSnippets, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import { groupWebsiteDocuments, knowledgeSources, websitePages, websiteSource, type KnowledgeDocumentRow, type KnowledgeSnippetRow, type KnowledgeSource, type WebsiteGroup, type WebsiteImportSummary } from "../knowledgeSources";
import { requireActiveAgentInTransaction } from "./agents";
import { enqueueKnowledgeDerivedRefresh } from "./businessHours";
import type { DomainContext } from "./context";
import { deleteKnowledgeDocumentInTransaction, deleteKnowledgeSnippetInTransaction, deleteWebsiteKnowledgeInTransaction, retryKnowledgeDocumentInTransaction } from "./knowledge";

/** The rows of one scope: shared (agentId null) or one agent's own. */
async function loadDocuments(tx: DatabaseTransaction, businessId: string, ownerAgentId: string | null): Promise<KnowledgeDocumentRow[]> {
  const rows = await tx.select({
    id: knowledgeDocuments.id,
    title: knowledgeDocuments.title,
    sourceType: knowledgeDocuments.sourceType,
    sourceUrl: knowledgeDocuments.sourceUrl,
    status: knowledgeDocuments.status,
    error: knowledgeDocuments.error,
    active: knowledgeDocuments.active,
    sourceActive: knowledgeDocuments.sourceActive,
    agentId: knowledgeDocuments.agentId,
    websiteDocumentId: knowledgeDocuments.websiteDocumentId,
    processingProgress: knowledgeDocuments.processingProgress,
    revision: knowledgeDocuments.revision,
    storageObjectId: knowledgeDocuments.storageObjectId,
    mimeType: knowledgeDocuments.mimeType,
    createdAt: knowledgeDocuments.createdAt,
    updatedAt: knowledgeDocuments.updatedAt,
    preview: sql<string>`coalesce((select left(preview.content, 500) from knowledge_chunks as preview where preview.document_id = knowledge_documents.id and preview.business_id = knowledge_documents.business_id order by preview.sequence limit 1), '')`,
    websiteImport: sql<WebsiteImportSummary | null>`(select json_build_object('id', ingestion.id, 'status', ingestion.status, 'websiteUrl', ingestion.website_url, 'importedCount', ingestion.imported_count, 'indexedCount', ingestion.indexed_count, 'documentCount', ingestion.indexed_count, 'crawlFinishedCount', nullif(ingestion.imported_count, 0), 'crawlTotalCount', nullif(ingestion.imported_count, 0)) from website_ingestion_jobs ingestion where ingestion.root_document_id = knowledge_documents.id and ingestion.business_id = knowledge_documents.business_id limit 1)`,
  }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), ownerAgentId ? eq(knowledgeDocuments.agentId, ownerAgentId) : isNull(knowledgeDocuments.agentId)));
  return rows.map((row) => ({ ...row, hasContent: row.preview.trim().length > 0 }));
}

async function loadSnippets(tx: DatabaseTransaction, businessId: string, ownerAgentId: string | null): Promise<KnowledgeSnippetRow[]> {
  return await tx.select({ id: knowledgeSnippets.id, title: knowledgeSnippets.title, content: knowledgeSnippets.content, tags: knowledgeSnippets.tags, priority: knowledgeSnippets.priority, active: knowledgeSnippets.active, agentId: knowledgeSnippets.agentId, createdAt: knowledgeSnippets.createdAt, updatedAt: knowledgeSnippets.updatedAt })
    .from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, businessId), ownerAgentId ? eq(knowledgeSnippets.agentId, ownerAgentId) : isNull(knowledgeSnippets.agentId)));
}

async function loadExclusions(tx: DatabaseTransaction, businessId: string, agentId: string) {
  const rows = await tx.select({ documentId: agentKnowledgeExclusions.documentId, snippetId: agentKnowledgeExclusions.snippetId, scope: agentKnowledgeExclusions.scope }).from(agentKnowledgeExclusions).where(and(eq(agentKnowledgeExclusions.businessId, businessId), eq(agentKnowledgeExclusions.agentId, agentId)));
  return {
    sources: new Set(rows.flatMap((row) => row.scope === "source" ? [row.documentId ?? row.snippetId!] : [])),
    pages: new Set(rows.flatMap((row) => row.scope === "page" && row.documentId ? [row.documentId] : [])),
  };
}

function withAgentSwitch(source: KnowledgeSource, group: WebsiteGroup | undefined, off: Set<string>): KnowledgeSource {
  const ids = group ? group.heads.map((row) => row.id) : [source.id];
  return { ...source, agentActive: !ids.some((id) => off.has(id)) };
}

/**
 * The knowledge sources a page lists, one row each. Without agentId, the
 * business's shared sources. With one, that agent's own sources and the shared
 * ones, each shared row saying whether it's on for that agent.
 */
export async function listKnowledgeSources(context: DomainContext, input: { userId: string; businessId: string; agentId?: string | undefined }): Promise<{ own: KnowledgeSource[]; shared: KnowledgeSource[] }> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const sharedDocuments = await loadDocuments(tx, input.businessId, null);
    const shared = knowledgeSources(sharedDocuments, await loadSnippets(tx, input.businessId, null));
    if (!input.agentId) return { own: [], shared };
    await requireActiveAgentInTransaction(tx, input.businessId, input.agentId);
    const own = knowledgeSources(await loadDocuments(tx, input.businessId, input.agentId), await loadSnippets(tx, input.businessId, input.agentId));
    const { sources: off } = await loadExclusions(tx, input.businessId, input.agentId);
    const groups = new Map(groupWebsiteDocuments(sharedDocuments).map((group) => [group.primary.id, group]));
    return { own, shared: shared.map((source) => withAgentSwitch(source, groups.get(source.id), off)) };
  });
}

export type KnowledgePage = { id: string; title: string; sourceUrl: string | null; status: string; error: string | null; active: boolean; preview: string; createdAt: string; updatedAt: string; removable: boolean; agentActive?: boolean };

/** The website a document belongs to, among the documents of its scope. */
async function websiteGroupOf(tx: DatabaseTransaction, businessId: string, documentId: string): Promise<{ group: WebsiteGroup; agentId: string | null } | null> {
  const [document] = await tx.select({ agentId: knowledgeDocuments.agentId, sourceType: knowledgeDocuments.sourceType }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, documentId), eq(knowledgeDocuments.businessId, businessId))).limit(1);
  if (!document || document.sourceType !== "website") return null;
  const group = groupWebsiteDocuments(await loadDocuments(tx, businessId, document.agentId)).find((candidate) => candidate.members.some((row) => row.id === documentId));
  return group ? { group, agentId: document.agentId } : null;
}

/**
 * A website's pages, for its dialog. With agentId, each shared page says
 * whether it's on for that agent. An import document is the website's
 * address, so only its other pages can be removed.
 */
export async function listWebsitePages(context: DomainContext, input: { userId: string; businessId: string; documentId: string; agentId?: string | undefined }): Promise<{ source: KnowledgeSource; pages: KnowledgePage[] }> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const found = await websiteGroupOf(tx, input.businessId, input.documentId);
    if (!found) throw Object.assign(new Error("Website not found."), { status: 404, code: "not_found" });
    if (input.agentId) await requireActiveAgentInTransaction(tx, input.businessId, input.agentId);
    if (found.agentId && found.agentId !== input.agentId) throw Object.assign(new Error("Website not found."), { status: 404, code: "not_found" });
    const exclusions = input.agentId && !found.agentId ? await loadExclusions(tx, input.businessId, input.agentId) : null;
    const source = websiteSource(found.group);
    const pages = websitePages(found.group).map((row): KnowledgePage => ({
      id: row.id, title: row.title, sourceUrl: row.sourceUrl, status: row.status, error: row.error, active: row.active, preview: row.preview,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), removable: !row.websiteImport,
      ...(exclusions ? { agentActive: !exclusions.pages.has(row.id) } : {}),
    }));
    return { source: exclusions ? withAgentSwitch(source, found.group, exclusions.sources) : source, pages };
  });
}

export const knowledgeActions = ["delete", "disable", "enable", "reimport", "agent_disable", "agent_enable"] as const;
export type KnowledgeAction = typeof knowledgeActions[number];
export const knowledgeItemTypes = ["website", "file", "page", "snippet"] as const;
export type KnowledgeItem = { type: typeof knowledgeItemTypes[number]; id: string };

function badRequest(message: string, code = "invalid_request"): Error {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound(): Error {
  return Object.assign(new Error("Knowledge source not found."), { status: 404, code: "not_found" });
}

type ResolvedItem =
  | { type: "website"; group: WebsiteGroup; agentId: string | null }
  | { type: "file" | "page"; id: string; agentId: string | null }
  | { type: "snippet"; id: string; agentId: string | null };

async function resolveItem(tx: DatabaseTransaction, businessId: string, item: KnowledgeItem): Promise<ResolvedItem> {
  if (item.type === "snippet") {
    const [row] = await tx.select({ id: knowledgeSnippets.id, agentId: knowledgeSnippets.agentId }).from(knowledgeSnippets).where(and(eq(knowledgeSnippets.id, item.id), eq(knowledgeSnippets.businessId, businessId))).limit(1);
    if (!row) throw notFound();
    return { type: "snippet", id: row.id, agentId: row.agentId };
  }
  if (item.type === "website") {
    const found = await websiteGroupOf(tx, businessId, item.id);
    if (!found) throw notFound();
    return { type: "website", group: found.group, agentId: found.agentId };
  }
  const [row] = await tx.select({ id: knowledgeDocuments.id, agentId: knowledgeDocuments.agentId, sourceType: knowledgeDocuments.sourceType }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, item.id), eq(knowledgeDocuments.businessId, businessId))).limit(1);
  if (!row || (item.type === "page") !== (row.sourceType === "website")) throw notFound();
  return { type: item.type, id: row.id, agentId: row.agentId };
}

async function setExcluded(tx: DatabaseTransaction, input: { businessId: string; agentId: string; documentId?: string; snippetId?: string; scope: "source" | "page"; excluded: boolean }): Promise<void> {
  if (input.excluded) {
    await tx.insert(agentKnowledgeExclusions).values({ businessId: input.businessId, agentId: input.agentId, documentId: input.documentId ?? null, snippetId: input.snippetId ?? null, scope: input.scope }).onConflictDoNothing();
    return;
  }
  await tx.delete(agentKnowledgeExclusions).where(and(
    eq(agentKnowledgeExclusions.businessId, input.businessId),
    eq(agentKnowledgeExclusions.agentId, input.agentId),
    eq(agentKnowledgeExclusions.scope, input.scope),
    input.documentId ? eq(agentKnowledgeExclusions.documentId, input.documentId) : eq(agentKnowledgeExclusions.snippetId, input.snippetId!),
  ));
}

/**
 * Applies one action to several sources or pages at once. delete, disable,
 * enable and reimport act on the business's shared sources, or on agentId's
 * own when it's given. agent_disable and agent_enable turn shared sources or
 * pages off or on for agentId alone. Re-import skips anything but websites.
 * Returns how many items it changed.
 */
export async function applyKnowledgeAction(context: DomainContext, input: { userId: string; businessId: string; action: KnowledgeAction; items: KnowledgeItem[]; agentId?: string | undefined }): Promise<{ changed: number }> {
  if (!input.items.length) throw badRequest("Choose at least one source.");
  if (input.items.length > 200) throw badRequest("Choose at most 200 sources at once.");
  const forAgent = input.action === "agent_disable" || input.action === "agent_enable";
  if (forAgent && !input.agentId) throw badRequest("agentId is required to turn knowledge off or on for an agent.");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (input.agentId) await requireActiveAgentInTransaction(tx, input.businessId, input.agentId);
    const owner = forAgent ? null : input.agentId ?? null;
    const items: ResolvedItem[] = [];
    for (const item of input.items) {
      const resolved = await resolveItem(tx, input.businessId, item);
      // Another scope's sources stay out of reach, as if they didn't exist.
      if (resolved.agentId !== owner) throw notFound();
      items.push(resolved);
    }
    let changed = 0;
    let derived = false;
    for (const item of items) {
      if (forAgent) {
        const excluded = input.action === "agent_disable";
        const target = (fields: { documentId?: string; snippetId?: string; scope: "source" | "page" }) => setExcluded(tx, { businessId: input.businessId, agentId: input.agentId!, excluded, ...fields });
        if (item.type === "website") for (const head of item.group.heads) await target({ documentId: head.id, scope: "source" });
        else if (item.type === "snippet") await target({ snippetId: item.id, scope: "source" });
        else await target({ documentId: item.id, scope: item.type === "page" ? "page" : "source" });
        changed += 1;
        continue;
      }
      if (input.action === "reimport") {
        if (item.type !== "website") continue;
        await retryKnowledgeDocumentInTransaction(tx, { businessId: input.businessId, documentId: item.group.primary.id });
        changed += 1;
        continue;
      }
      if (input.action === "delete") {
        if (item.type === "website") {
          await deleteWebsiteKnowledgeInTransaction(tx, { businessId: input.businessId, documentId: item.group.primary.id });
          // Pages a crawl brought in from another host go with their website.
          const left = await tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, input.businessId), inArray(knowledgeDocuments.id, item.group.members.map((row) => row.id))));
          for (const row of left) await deleteKnowledgeDocumentInTransaction(tx, { businessId: input.businessId, documentId: row.id });
        } else if (item.type === "snippet") await deleteKnowledgeSnippetInTransaction(tx, { businessId: input.businessId, snippetId: item.id });
        else await deleteKnowledgeDocumentInTransaction(tx, { businessId: input.businessId, documentId: item.id });
        changed += 1;
        continue;
      }
      const active = input.action === "enable";
      if (item.type === "website") await tx.update(knowledgeDocuments).set({ sourceActive: active, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.businessId, input.businessId), inArray(knowledgeDocuments.id, item.group.heads.map((row) => row.id))));
      else if (item.type === "snippet") await tx.update(knowledgeSnippets).set({ active, updatedAt: new Date() }).where(and(eq(knowledgeSnippets.businessId, input.businessId), eq(knowledgeSnippets.id, item.id)));
      else await tx.update(knowledgeDocuments).set({ active, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.id, item.id)));
      derived = true;
      changed += 1;
    }
    if (changed && input.action !== "reimport") {
      const batchId = randomUUID();
      await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "business", aggregateId: input.businessId, dedupeKey: `knowledge:batch:${batchId}`, payload: { businessId: input.businessId, reason: forAgent ? "agent_knowledge_changed" : "document_activity_changed" } });
      if (derived) await enqueueKnowledgeDerivedRefresh(tx, { businessId: input.businessId, reason: "document_activity_changed" });
    }
    return { changed };
  });
}
