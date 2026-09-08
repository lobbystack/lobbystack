import { createHash } from "node:crypto";

import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";

import { agentRules, businessContextSnapshots, businessHours, businesses, closures, enqueueOutbox, knowledgeChunks, knowledgeDocuments, knowledgeSnippets, receptionistProfiles, services, storageObjects, websiteIngestionJobs, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { normalizeAppointmentChangePolicy, normalizeTransferMode, type BusinessContextSnapshot } from "@lobbystack/shared";
import { buildBusinessContextSnapshot } from "../snapshot";
import { fuseKnowledgeRanks, knowledgeLexicalQueries, knowledgeQueryTerms, withinKnowledgeBudget, type KnowledgePassage } from "../knowledgeRanking";
import { countKnowledgeTokens } from "@lobbystack/ai";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { normalizeWebsiteSourceUrl } from "./knowledgeUrl";
import { getMeter } from "@lobbystack/telemetry/node";
import { advanceOnboardingStageInTransaction } from "./onboarding";

const ragMeter = getMeter("lobbystack-rag");
const searchDuration = ragMeter.createHistogram("rag.search.duration_ms", { unit: "ms" });
const searchResultCount = ragMeter.createHistogram("rag.search.result_count", { unit: "{result}" });
const snapshotRefreshDuration = ragMeter.createHistogram("rag.snapshot_refresh.duration_ms", { unit: "ms" });

export { normalizeWebsiteSourceUrl } from "./knowledgeUrl";

export function chunkText(text: string, options: { maxCharacters?: number; overlap?: number } = {}): string[] {
  const maxCharacters = options.maxCharacters ?? 1800;
  if (!Number.isInteger(maxCharacters) || maxCharacters < 2 || (options.overlap ?? 180) < 0) throw new Error("Invalid chunk size or overlap.");
  const overlap = Math.min(options.overlap ?? 180, Math.floor(maxCharacters / 2));
  const normalized = text.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) {
    return [];
  }
  const chunks: string[] = [];
  // Keep Markdown sections separate, including headings in previously flattened imports.
  for (const section of normalized.split(/(?<=\s)(?=#{1,6} )/)) {
    const sectionText = section.trim();
    let start = 0;
    while (start < sectionText.length) {
      let end = Math.min(sectionText.length, start + maxCharacters);
      if (end < sectionText.length) {
        const boundary = sectionText.lastIndexOf("\n", end);
        const wordBoundary = sectionText.lastIndexOf(" ", end);
        if (boundary > start + maxCharacters / 2) end = boundary;
        else if (wordBoundary > start + maxCharacters / 2) end = wordBoundary;
      }
      const chunk = sectionText.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      if (end >= sectionText.length) {
        break;
      }
      start = Math.max(start + 1, end - overlap);
    }
  }
  return chunks;
}

export function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createKnowledgeDocument(
  context: DomainContext,
  input: { userId: string; businessId: string; title: string; sourceType: string; sourceUrl?: string; storageObjectId?: string; onboarding?: boolean },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const isWebsite = input.sourceType === "website";
    if (isWebsite && !input.sourceUrl) {
      throw new Error("A website source URL is required.");
    }
    if (!isWebsite && !input.storageObjectId) {
      throw new Error("A storage object is required for uploaded knowledge.");
    }
    const sourceUrl = isWebsite ? normalizeWebsiteSourceUrl(input.sourceUrl!) : input.sourceUrl;
    // Serialize website submissions so retries/revisited forms reuse the same import.
    const business = isWebsite
      ? (await tx.select({ onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).for("update"))[0]
      : undefined;
    if (isWebsite && (input.onboarding || business?.onboardingStage === "website")) {
      await tx.update(businesses).set({ websiteUrl: sourceUrl!, updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
      if (business?.onboardingStage === "website") {
        await advanceOnboardingStageInTransaction(tx, { userId: input.userId, businessId: input.businessId, from: "website", to: "knowledge" });
      }
    }
    if (isWebsite) {
      const existing = (await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.sourceUrl, sourceUrl!))).limit(1).for("update"))[0];
      if (existing) {
        if (["cancelled", "error"].includes(existing.status)) await queueKnowledgeDocumentRetry(tx, { businessId: input.businessId, documentId: existing.id }, existing);
        return existing.id;
      }
    }
    const [document] = await tx.insert(knowledgeDocuments).values({
      businessId: input.businessId,
      title: input.title.trim(),
      sourceType: input.sourceType,
      ...(sourceUrl !== undefined ? { sourceUrl } : {}),
      ...(input.storageObjectId !== undefined ? { storageObjectId: input.storageObjectId } : {}),
      status: isWebsite ? "processing" : "pending",
    }).returning({ id: knowledgeDocuments.id });
    if (!document) {
      throw new Error("Knowledge document could not be created.");
    }
    const ingestion = isWebsite ? (await tx.insert(websiteIngestionJobs).values({ businessId: input.businessId, rootDocumentId: document.id, websiteUrl: sourceUrl!, provider: "firecrawl", status: "queued" }).returning({ id: websiteIngestionJobs.id }))[0] : undefined;
    await enqueueOutbox(tx, {
      topic: isWebsite ? "knowledge.crawlWebsite" : "knowledge.extractDocument",
      businessId: input.businessId,
      aggregateType: "knowledge_document",
      aggregateId: document.id,
      dedupeKey: isWebsite ? `knowledge:${document.id}:crawl` : `knowledge:${document.id}:extract`,
      payload: isWebsite ? { url: sourceUrl, documentId: document.id, revision: 0, websiteIngestionJobId: ingestion!.id } : { documentId: document.id, revision: 0 },
    });
    return document.id;
  });
}

export async function listKnowledgeSnippets(context: DomainContext, input: { userId: string; businessId: string }) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await tx.select().from(knowledgeSnippets).where(eq(knowledgeSnippets.businessId, input.businessId)).orderBy(desc(knowledgeSnippets.priority), asc(knowledgeSnippets.title));
  });
}

async function queueKnowledgeDocumentRetry(tx: DatabaseTransaction, input: { businessId: string; documentId: string }, document: Pick<typeof knowledgeDocuments.$inferSelect, "id" | "sourceType" | "sourceUrl" | "revision">): Promise<void> {
    await tx.update(knowledgeDocuments).set({ status: document.sourceType === "website" ? "processing" : "pending", processingProgress: 0, error: null, revision: sql`${knowledgeDocuments.revision} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId)));
    const ingestion = document.sourceType === "website" && document.sourceUrl ? (await tx.insert(websiteIngestionJobs).values({ businessId: input.businessId, rootDocumentId: input.documentId, websiteUrl: document.sourceUrl, provider: "firecrawl", status: "queued" }).onConflictDoUpdate({ target: websiteIngestionJobs.rootDocumentId, set: { status: "queued", importedCount: 0, indexedCount: 0, errorCount: 0, lastError: null, updatedAt: new Date() } }).returning({ id: websiteIngestionJobs.id }))[0] : undefined;
    await enqueueOutbox(tx, { topic: document.sourceType === "website" ? "knowledge.crawlWebsite" : "knowledge.extractDocument", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: input.documentId, dedupeKey: `knowledge:${input.documentId}:retry:${document.revision + 1}`, payload: document.sourceType === "website" && document.sourceUrl ? { documentId: input.documentId, url: document.sourceUrl, revision: document.revision + 1, websiteIngestionJobId: ingestion!.id } : { documentId: input.documentId, revision: document.revision + 1 } });
}

export async function retryKnowledgeDocument(context: DomainContext, input: { userId: string; businessId: string; documentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const document = (await tx.select({ id: knowledgeDocuments.id, sourceType: knowledgeDocuments.sourceType, sourceUrl: knowledgeDocuments.sourceUrl, revision: knowledgeDocuments.revision }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update"))[0];
    if (!document) throw new Error("Knowledge document not found.");
    await queueKnowledgeDocumentRetry(tx, input, document);
  });
}

export async function setKnowledgeDocumentActive(context: DomainContext, input: { userId: string; businessId: string; documentId: string; active: boolean }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async tx => {
    await requireBusinessAdmin(tx, input);
    const [document] = await tx.update(knowledgeDocuments).set({ active: input.active, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).returning({ id: knowledgeDocuments.id });
    if (!document) throw Object.assign(new Error("Knowledge document not found."), { status: 404 });
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: input.documentId, dedupeKey: `knowledge:${input.documentId}:active:${Date.now()}`, payload: { businessId: input.businessId, reason: "document_activity_changed" } });
  });
}

export async function cancelKnowledgeDocument(context: DomainContext, input: { userId: string; businessId: string; documentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [document] = await tx.update(knowledgeDocuments).set({ status: "cancelled", revision: sql`${knowledgeDocuments.revision} + 1`, error: "Cancelled by operator.", updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.status, "processing"))).returning({ id: knowledgeDocuments.id });
    if (!document) throw Object.assign(new Error("Only a processing knowledge document can be cancelled."), { status: 409 });
    await tx.update(websiteIngestionJobs).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.businessId, input.businessId), eq(websiteIngestionJobs.rootDocumentId, input.documentId)));
  });
}

export async function getKnowledgeDocumentContent(context: DomainContext, input: { userId: string; businessId: string; documentId: string }): Promise<{ document: Record<string, unknown>; content: string } | null> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const document = (await tx.select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title, sourceType: knowledgeDocuments.sourceType, sourceUrl: knowledgeDocuments.sourceUrl, status: knowledgeDocuments.status, mimeType: knowledgeDocuments.mimeType, fileName: storageObjects.fileName, contentLength: storageObjects.contentLength, updatedAt: knowledgeDocuments.updatedAt }).from(knowledgeDocuments).leftJoin(storageObjects, eq(knowledgeDocuments.storageObjectId, storageObjects.id)).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1))[0];
    if (!document) return null;
    const chunks = await tx.select({ content: knowledgeChunks.content }).from(knowledgeChunks).where(and(eq(knowledgeChunks.documentId, input.documentId), eq(knowledgeChunks.businessId, input.businessId))).orderBy(asc(knowledgeChunks.sequence));
    return { document, content: chunks.map((chunk) => chunk.content.trim()).filter(Boolean).join("\n\n") };
  });
}

export async function deleteKnowledgeDocument(context: DomainContext, input: { userId: string; businessId: string; documentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await tx.delete(knowledgeChunks).where(and(eq(knowledgeChunks.documentId, input.documentId), eq(knowledgeChunks.businessId, input.businessId)));
    const [document] = await tx.delete(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).returning({ id: knowledgeDocuments.id });
    if (!document) throw new Error("Knowledge document not found.");
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: document.id, dedupeKey: `knowledge:${document.id}:deleted:${Date.now()}`, payload: { businessId: input.businessId, reason: "document_deleted" } });
  });
}

export async function createKnowledgeSnippet(
  context: DomainContext,
  input: { userId: string; businessId: string; title: string; content: string; tags?: string[]; priority?: number; active?: boolean },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [snippet] = await tx.insert(knowledgeSnippets).values({ businessId: input.businessId, title: input.title.trim(), content: input.content.trim(), tags: input.tags ?? [], priority: input.priority ?? 0, active: input.active ?? true }).returning({ id: knowledgeSnippets.id });
    if (!snippet) throw new Error("Knowledge snippet could not be created.");
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_snippet", aggregateId: snippet.id, dedupeKey: `knowledge-snippet:${snippet.id}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "snippet_created" } });
    return snippet.id;
  });
}

export async function updateKnowledgeSnippet(
  context: DomainContext,
  input: { userId: string; businessId: string; snippetId: string; title?: string; content?: string; tags?: string[]; priority?: number; active?: boolean },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [snippet] = await tx.update(knowledgeSnippets).set({ ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.content !== undefined ? { content: input.content.trim() } : {}), ...(input.tags !== undefined ? { tags: input.tags } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}), ...(input.active !== undefined ? { active: input.active } : {}), updatedAt: new Date() }).where(and(eq(knowledgeSnippets.id, input.snippetId), eq(knowledgeSnippets.businessId, input.businessId))).returning({ id: knowledgeSnippets.id });
    if (!snippet) throw new Error("Knowledge snippet not found.");
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_snippet", aggregateId: snippet.id, dedupeKey: `knowledge-snippet:${snippet.id}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "snippet_updated" } });
  });
}

export async function deleteKnowledgeSnippet(context: DomainContext, input: { userId: string; businessId: string; snippetId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [snippet] = await tx.delete(knowledgeSnippets).where(and(eq(knowledgeSnippets.id, input.snippetId), eq(knowledgeSnippets.businessId, input.businessId))).returning({ id: knowledgeSnippets.id });
    if (!snippet) throw new Error("Knowledge snippet not found.");
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_snippet", aggregateId: snippet.id, dedupeKey: `knowledge-snippet:${snippet.id}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "snippet_deleted" } });
  });
}

type IndexDocumentInput = { businessId: string; documentId: string; text: string; embeddings: number[][]; embeddingFingerprint?: string };

export async function indexDocumentText(context: DomainContext, input: IndexDocumentInput): Promise<{ chunkCount: number }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, (tx) => indexDocumentTextInTransaction(tx, input));
}

/** Rebuild stored evidence without fetching the source or overwriting a concurrent edit. */
export async function reindexStoredKnowledgeDocument(
  context: DomainContext,
  input: { businessId: string; documentId: string; expectedRevision: number },
): Promise<{ chunkCount: number }> {
  if (!context.embeddings) throw new Error("An embedding provider is required.");
  const actor = { businessId: input.businessId, actorType: "worker" as const };
  const text = await withBusinessTransaction(context.db, actor, async tx => {
    const document = (await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1))[0];
    if (!document || !document.active || document.status !== "indexed" || document.revision !== input.expectedRevision) throw new Error("Knowledge source changed or is not active and indexed.");
    const chunks = await tx.select({ content: knowledgeChunks.content }).from(knowledgeChunks).where(and(eq(knowledgeChunks.businessId, input.businessId), eq(knowledgeChunks.documentId, input.documentId))).orderBy(asc(knowledgeChunks.sequence));
    return chunks.map(chunk => chunk.content).join("\n\n");
  });
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error("No stored knowledge to reindex.");
  const embeddings = await context.embeddings.embed(chunks);
  return withBusinessTransaction(context.db, actor, async tx => {
    const document = (await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update"))[0];
    if (!document || !document.active || document.status !== "indexed" || document.revision !== input.expectedRevision) throw new Error("Knowledge source changed during reindexing.");
    return indexDocumentTextInTransaction(tx, { ...input, text, embeddings, ...(context.embeddings!.fingerprint ? { embeddingFingerprint: context.embeddings!.fingerprint } : {}) });
  });
}

async function indexDocumentTextInTransaction(tx: DatabaseTransaction, input: IndexDocumentInput, preserveImport = false): Promise<{ chunkCount: number }> {
    const document = (await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update"))[0];
    if (!document) {
      throw new Error("Knowledge document not found.");
    }
    if (document.status === "cancelled") return { chunkCount: 0 };
    const chunks = chunkText(input.text);
    if (chunks.length === 0) {
      await markKnowledgeDocumentFailedInTransaction(tx, input, document.revision, "No readable text was extracted from the document.");
      throw new Error("No readable text was extracted from the document.");
    }
    if (input.embeddings.length !== chunks.length || input.embeddings.some((embedding) => embedding.length === 0)) {
      await markKnowledgeDocumentFailedInTransaction(tx, input, document.revision, "Knowledge embeddings are unavailable or incomplete.");
      throw new Error("Knowledge embeddings are unavailable or incomplete.");
    }
    await tx.delete(knowledgeChunks).where(and(eq(knowledgeChunks.documentId, input.documentId), eq(knowledgeChunks.businessId, input.businessId)));
    if (chunks.length > 0) {
      await tx.insert(knowledgeChunks).values(chunks.map((content, sequence) => ({
        businessId: input.businessId,
        documentId: input.documentId,
        sequence,
        content,
        contentHash: hashContent(content),
        embedding: input.embeddings[sequence]!,
        ...(input.embeddingFingerprint ? { embeddingFingerprint: input.embeddingFingerprint } : {}),
        embeddingStatus: input.embeddingFingerprint ? "completed" : "pending",
        embeddingError: null,
      })));
    }
    await tx.update(knowledgeDocuments).set({ status: preserveImport ? "processing" : "indexed", processingProgress: 100, contentHash: hashContent(input.text), revision: document.revision + (preserveImport ? 0 : 1), updatedAt: new Date() }).where(eq(knowledgeDocuments.id, input.documentId));
    if (!preserveImport) await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: input.documentId, dedupeKey: `knowledge:${input.documentId}:snapshot:${document.revision + 1}`, payload: { businessId: input.businessId, reason: "document_indexed" } });
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "knowledge_document",
      aggregateId: input.documentId,
      dedupeKey: `knowledge:${input.documentId}:progress:${document.revision + 1}`,
      payload: { type: "document.progressed", entityId: input.documentId, progress: 100 },
    });
    return { chunkCount: chunks.length };
}

/** Commit a crawled page only while its originating import is still current. */
export async function indexCrawledWebsitePage(context: DomainContext, input: IndexDocumentInput & { sourceRevision: number; sourceUrl: string; title: string }): Promise<{ chunkCount: number }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [source] = await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update");
    if (!source || source.status !== "processing" || source.revision !== input.sourceRevision) return { chunkCount: 0 };
    const sourceUrl = normalizeWebsiteSourceUrl(input.sourceUrl);
    const [page] = await tx.insert(knowledgeDocuments).values({ businessId: input.businessId, sourceType: "website", title: input.title, sourceUrl, status: "processing" }).onConflictDoUpdate({ target: [knowledgeDocuments.businessId, knowledgeDocuments.sourceUrl], set: { title: input.title, status: "processing", error: null, updatedAt: new Date() } }).returning({ id: knowledgeDocuments.id });
    if (!page) throw new Error("Website page could not be saved.");
    return await indexDocumentTextInTransaction(tx, { ...input, documentId: page.id }, page.id === source.id);
  });
}

async function markKnowledgeDocumentFailedInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; documentId: string },
  revision: number,
  error: string,
): Promise<void> {
  await tx.update(knowledgeDocuments).set({ status: "error", processingProgress: 0, error, revision: revision + 1, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId)));
  await tx.update(websiteIngestionJobs).set({ status: "failed", errorCount: 1, lastError: error, updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.rootDocumentId, input.documentId), eq(websiteIngestionJobs.businessId, input.businessId)));
  await enqueueOutbox(tx, {
    topic: "realtime.publish",
    businessId: input.businessId,
    aggregateType: "knowledge_document",
    aggregateId: input.documentId,
    dedupeKey: `knowledge:${input.documentId}:error:${revision + 1}`,
    payload: { type: "document.progressed", entityId: input.documentId, progress: 0, status: "error", error },
  });
}

export async function markKnowledgeDocumentFailed(
  context: DomainContext,
  input: { businessId: string; documentId: string; error?: string; expectedRevision?: number },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const document = (await tx.select({ revision: knowledgeDocuments.revision, status: knowledgeDocuments.status }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update"))[0];
    if (!document || document.status === "cancelled" || (input.expectedRevision !== undefined && document.revision !== input.expectedRevision)) return false;
    await markKnowledgeDocumentFailedInTransaction(tx, input, document.revision, input.error ?? "Knowledge indexing failed.");
    return true;
  });
}

export async function upsertWebsiteDocument(
  context: DomainContext,
  input: { businessId: string; sourceUrl: string; title: string },
): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [document] = await tx.insert(knowledgeDocuments).values({
      businessId: input.businessId,
      sourceType: "website",
      title: input.title.trim() || input.sourceUrl,
      sourceUrl: input.sourceUrl,
      status: "processing",
      processingProgress: 0,
      error: null,
    }).onConflictDoUpdate({
      target: [knowledgeDocuments.businessId, knowledgeDocuments.sourceUrl],
      set: { title: input.title.trim() || input.sourceUrl, status: "processing", processingProgress: 0, error: null, updatedAt: new Date() },
    }).returning({ id: knowledgeDocuments.id });
    if (!document) throw new Error("Website knowledge document could not be created.");
    return document.id;
  });
}

export async function searchKnowledge(
  context: DomainContext,
  input: { userId?: string; businessId: string; query: string; limit?: number },
): Promise<Array<{ chunkId: string; title: string; content: string }>> {
  return (await searchKnowledgeEvidence(context, input)).matches;
}

export async function searchKnowledgeEvidence(
  context: DomainContext,
  input: { userId?: string; businessId: string; query: string; limit?: number; callId?: string; turnId?: string },
): Promise<{ matches: KnowledgePassage[]; mode: "hybrid" | "keyword"; outcome: "found" | "empty" | "unavailable"; failure?: "embedding_unavailable" | "search_unavailable"; durationMs: number }> {
  const startedAt = performance.now();
  const actor = { userId: input.userId, businessId: input.businessId, actorType: input.userId ? "operator" as const : "worker" as const };
  if (input.userId) await withBusinessTransaction(context.db, actor, tx => requireBusinessMembership(tx, { userId: input.userId!, businessId: input.businessId }));
  const query = input.query.trim().slice(0, 2000);
  const terms = knowledgeQueryTerms(query);
  const fields = sql`c.id AS "chunkId", c.document_id AS "documentId", d.title, c.content,
    d.source_url AS "sourceUrl", d.revision AS "sourceRevision", c.sequence`;
  const from = sql`FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id`;
  const select = sql`SELECT ${fields} ${from}`;
  const filters = sql`c.business_id = ${input.businessId} AND d.business_id = ${input.businessId}
    AND d.active = true AND d.status = 'indexed'`;
  const execute = (statement: ReturnType<typeof sql>) => withBusinessTransaction(context.db, actor, async tx => {
    await tx.execute(sql`SET LOCAL statement_timeout = '2000ms'`);
    return (await tx.execute<KnowledgePassage>(statement)).rows;
  });
  const { any: lexicalQuery, all: allTermsQuery } = knowledgeLexicalQueries(terms);
  const lexical = terms.length ? execute(sql`${select} WHERE ${filters}
    AND (to_tsvector('simple', c.content) @@ to_tsquery('simple', ${lexicalQuery})
      OR to_tsvector('simple', d.title) @@ to_tsquery('simple', ${lexicalQuery}))
    ORDER BY ts_rank_cd(to_tsvector('simple', d.title || ' ' || c.content), to_tsquery('simple', ${allTermsQuery})) DESC,
      ts_rank_cd(to_tsvector('simple', d.title || ' ' || c.content), to_tsquery('simple', ${lexicalQuery})) DESC, c.id LIMIT 12`) : Promise.resolve([]);
  const semantic = (async () => {
    if (!query || !context.embeddings) throw new Error("embedding_unavailable");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const [embedding] = await Promise.race([
        context.embeddings.embed([query]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("embedding_timeout")), 1800); }),
      ]);
      if (!embedding?.length || embedding.some(value => !Number.isFinite(value))) throw new Error("invalid_embedding");
      return await execute(sql`WITH eligible AS MATERIALIZED (SELECT ${fields}, c.embedding ${from} WHERE ${filters} AND c.embedding IS NOT NULL
        AND c.embedding_status = 'completed'
        ${context.embeddings.fingerprint ? sql`AND c.embedding_fingerprint = ${context.embeddings.fingerprint}` : sql``})
        SELECT "chunkId", "documentId", title, content, "sourceUrl", "sourceRevision", sequence FROM eligible
        ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector, "chunkId" LIMIT 12`);
    } finally { if (timer) clearTimeout(timer); }
  })();
  const [lexicalResult, semanticResult] = await Promise.allSettled([lexical, semantic]);
  const mode = semanticResult.status === "fulfilled" ? "hybrid" as const : "keyword" as const;
  const candidates = fuseKnowledgeRanks([
    lexicalResult.status === "fulfilled" ? lexicalResult.value : [],
    semanticResult.status === "fulfilled" ? semanticResult.value : [],
  ], Math.min(6, Math.max(1, input.limit ?? 6)));
  // Recheck revisions after parallel retrieval so an in-flight edit cannot label old chunks as current.
  let validationFailed = false;
  const current = candidates.length ? await execute(sql`${select} WHERE ${filters} AND (${sql.join(candidates.map(p => sql`(c.document_id = ${p.documentId} AND d.revision = ${p.sourceRevision} AND c.sequence BETWEEN ${p.sequence - 1} AND ${p.sequence + 1})`), sql` OR `)})`).catch(() => { validationFailed = true; return []; }) : [];
  const valid = new Map(current.map(p => [p.chunkId, p]));
  // Reserve the ranked primary passages first. Neighbors must not crowd out distinct candidates.
  const matches = withinKnowledgeBudget(candidates.filter(p => valid.has(p.chunkId)), 3000, p => JSON.stringify(p));
  for (let index = 0; index < matches.length; index += 1) {
    const p = matches[index]!;
    const neighbors = current.filter(row => row.documentId === p.documentId && row.sourceRevision === p.sourceRevision && Math.abs(row.sequence - p.sequence) <= 1).sort((a, b) => a.sequence - b.sequence);
    const expanded = { ...p, supportingChunkIds: neighbors.map(row => row.chunkId), content: neighbors.map(row => row.content).join("\n\n") };
    const proposed = matches.map((match, candidateIndex) => candidateIndex === index ? expanded : match);
    if (proposed.reduce((sum, match) => sum + countKnowledgeTokens(JSON.stringify(match) + "\n"), 0) <= 3000) matches[index] = expanded;
  }
  const failed = validationFailed || (lexicalResult.status === "rejected" && semanticResult.status === "rejected");
  const outcome = matches.length ? "found" as const : failed ? "unavailable" as const : "empty" as const;
  const durationMs = performance.now() - startedAt;
  searchDuration.record(durationMs, { operation: "knowledge.search", mode, outcome });
  searchResultCount.record(matches.length, { operation: "knowledge.search", mode, outcome });
  await context.telemetry?.track({
    name: "knowledge.search_executed", businessId: input.businessId,
    ...(input.callId ? { callId: input.callId } : {}),
    properties: { mode, outcome, resultCount: matches.length, durationMs, fallbackUsed: mode === "keyword", ...(input.turnId ? { turnId: input.turnId } : {}) },
  }).catch(() => undefined);
  return { matches, mode, outcome, durationMs, ...(failed ? { failure: "search_unavailable" as const } : semanticResult.status === "rejected" ? { failure: "embedding_unavailable" as const } : {}) };
}

export async function loadLatestBusinessSnapshot(
  context: DomainContext,
  input: { businessId: string },
): Promise<BusinessContextSnapshot | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx
      .select({ snapshot: businessContextSnapshots.snapshot })
      .from(businessContextSnapshots)
      .where(eq(businessContextSnapshots.businessId, input.businessId))
      .orderBy(desc(businessContextSnapshots.generatedAt))
      .limit(1);

    if (!row || typeof row.snapshot !== "object" || row.snapshot === null || Array.isArray(row.snapshot)) {
      return null;
    }

    return row.snapshot as BusinessContextSnapshot;
  });
}

export async function refreshBusinessSnapshot(
  context: DomainContext,
  input: { businessId: string },
): Promise<string> {
  const startedAt = performance.now();
  let builtSnapshot: BusinessContextSnapshot | undefined;
  const version = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [business, profile] = await Promise.all([
      tx.select().from(businesses).where(eq(businesses.id, input.businessId)).limit(1),
      tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1),
    ]);
    if (!business[0]) {
      throw new Error("Business not found.");
    }
    const [hours, closureRows, serviceRows, ruleRows, snippets, documents] = await Promise.all([
      tx.select().from(businessHours).where(eq(businessHours.businessId, input.businessId)).orderBy(asc(businessHours.dayOfWeek)),
      tx.select().from(closures).where(eq(closures.businessId, input.businessId)).orderBy(asc(closures.startsAt)),
      tx.select().from(services).where(and(eq(services.businessId, input.businessId), eq(services.active, true))).orderBy(asc(services.name)),
      tx.select().from(agentRules).where(and(eq(agentRules.businessId, input.businessId), eq(agentRules.active, true))).orderBy(asc(agentRules.sortOrder)),
      tx.select().from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, input.businessId), eq(knowledgeSnippets.active, true))).orderBy(desc(knowledgeSnippets.priority)).limit(8),
      tx.select({ title: knowledgeDocuments.title, sourceUrl: knowledgeDocuments.sourceUrl, tags: knowledgeDocuments.tags, revision: knowledgeDocuments.revision }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.active, true), eq(knowledgeDocuments.status, "indexed"))).orderBy(desc(knowledgeDocuments.updatedAt), asc(knowledgeDocuments.id)).limit(40),
    ]);
    const currentProfile = profile[0];
    const version = `${Date.now()}`;
    builtSnapshot = buildBusinessContextSnapshot({
      businessId: input.businessId,
      version,
      generatedAt: new Date().toISOString(),
      displayName: business[0].name,
      timezone: business[0].timezone,
      defaultLocale: business[0].defaultLocale === "fr" ? "fr" : "en",
      businessType: "other",
      greeting: currentProfile?.greeting ?? `Thank you for calling ${business[0].name}.`,
      tone: currentProfile?.tone ?? "professional",
      bookingPolicy: currentProfile?.bookingPolicy ?? "Confirm availability before booking.",
      ...(currentProfile?.voiceInstructions ? { voiceInstructions: currentProfile.voiceInstructions } : {}),
      ...(currentProfile?.smsInstructions ? { smsInstructions: currentProfile.smsInstructions } : {}),
      ...(currentProfile?.chatInstructions ? { chatInstructions: currentProfile.chatInstructions } : {}),
      summary: currentProfile?.summary ?? business[0].name,
      knowledgeDigest: withinKnowledgeBudget(documents, 1600, row => JSON.stringify(row)).map(row => JSON.stringify(row)).join("\n"),
      hours: hours.map((row) => ({ dayOfWeek: row.dayOfWeek, openMinutes: row.openMinutes, closeMinutes: row.closeMinutes })),
      closures: closureRows.map((row) => ({ startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), reason: row.reason })),
      services: serviceRows.map((row) => ({ id: row.id, name: row.name, durationMinutes: row.durationMinutes, ...(row.description ? { description: row.description } : {}) })),
      rules: ruleRows.map((row) => ({ id: row.id, title: row.title, content: row.content, order: row.sortOrder })),
      snippets: snippets.map((row) => ({ id: row.id, title: row.title, content: row.content, tags: row.tags, priority: row.priority })),
      appointmentChangePolicy: normalizeAppointmentChangePolicy(currentProfile?.appointmentChangePolicy),
      transferPolicy: { mode: normalizeTransferMode(currentProfile?.transferMode), ...(currentProfile?.transferNumber ? { transferNumber: currentProfile.transferNumber } : {}) },
    });
    await tx.insert(businessContextSnapshots).values({ businessId: input.businessId, version, snapshot: builtSnapshot as unknown as Record<string, unknown> });
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "business_context_snapshot",
      aggregateId: input.businessId,
      dedupeKey: `snapshot:${input.businessId}:${version}`,
      payload: { type: "knowledge.progressed", entityId: input.businessId, version },
    });
    return version;
  });
  if (context.snapshotCache && builtSnapshot) {
    await context.snapshotCache.set(input.businessId, builtSnapshot).catch(() => undefined);
  }
  snapshotRefreshDuration.record(performance.now() - startedAt, { operation: "snapshot.refresh" });
  return version;
}

/** Counts uploaded files and extracted text in the canonical PostgreSQL representation. */
export async function getKnowledgeStorageUsageBytes(tx: DatabaseTransaction, businessId: string): Promise<number> {
  const [files, extracted] = await Promise.all([
    tx.select({ bytes: sql<number>`coalesce(sum(${storageObjects.contentLength}), 0)` }).from(knowledgeDocuments)
      .innerJoin(storageObjects, and(eq(knowledgeDocuments.storageObjectId, storageObjects.id), eq(storageObjects.businessId, businessId)))
      .where(and(eq(knowledgeDocuments.businessId, businessId), sql`${storageObjects.status} <> 'deleted'`)),
    tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${knowledgeChunks.content})), 0)` }).from(knowledgeChunks)
      .where(eq(knowledgeChunks.businessId, businessId)),
  ]);
  return Number(files[0]?.bytes ?? 0) + Number(extracted[0]?.bytes ?? 0);
}
