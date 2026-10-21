import { createHash } from "node:crypto";

import { and, asc, desc, eq, ilike, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";

import { agentRules, businessContextSnapshots, businessHours, businesses, closures, enqueueOutbox, knowledgeChunks, knowledgeDocuments, knowledgeSnippets, phoneNumbers, receptionistProfiles, services, staffServiceAssignments, storageObjects, websiteIngestionJobs, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { defaultGreeting, FULL_CRAWL_PAGE_LIMIT, getKnowledgeStorageLimitBytes, normalizeAppointmentChangePolicy, normalizeBookingMode, normalizeRuntimeLocale, normalizeTransferMode, ONBOARDING_CRAWL_PAGE_LIMIT, runtimeLocales, servicePriceFromColumns, type BusinessContextSnapshot } from "@lobbystack/shared";
import { buildBusinessContextSnapshot } from "../snapshot";
import { countKnowledgeTokens, fuseKnowledgeRanks, KNOWLEDGE_SEARCH_TOKEN_BUDGET, knowledgeLexicalQueries, knowledgeQueryTerms, withinKnowledgeBudget, type KnowledgePassage } from "../knowledgeRanking";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { normalizeWebsiteSourceUrl } from "./knowledgeUrl";
import { getMeter } from "@lobbystack/telemetry/node";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";
import { moveOnboardingStageInTransaction } from "./onboarding";
import { recordProductEventBestEffort } from "./productEvents";
import { enqueueKnowledgeDerivedRefresh } from "./businessHours";
import { listBookableEmployees, loadStaffSchedules } from "./employees";
import { resolveBusinessBillingPlan } from "./contentRetentionPolicy";
import { resolveSmsSender } from "./smsSender";

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

// The API reports a website's page limit, so its clients tell a sample from a full read by these.
export { FULL_CRAWL_PAGE_LIMIT, ONBOARDING_CRAWL_PAGE_LIMIT };

export async function createKnowledgeDocument(
  context: DomainContext,
  input: { userId: string; businessId: string; title: string; sourceType: string; sourceUrl?: string; onboarding?: boolean },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    // finalizeUpload creates the document for an uploaded file.
    if (input.sourceType !== "website") throw Object.assign(new Error('sourceType must be "website". Upload files with /api/uploads.'), { status: 400 });
    return await createKnowledgeDocumentInTransaction(tx, input);
  });
}

/**
 * Adds a website as a knowledge source and queues its crawl. The caller checks
 * who may do that. onboarding (or a business still on its website step) also
 * saves the URL as the business's website; onboarding or sample limit the
 * crawl to a sample of the site. Submitting a website that is already a
 * source returns that source.
 */
export async function createKnowledgeDocumentInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; title: string; sourceUrl?: string | undefined; onboarding?: boolean | undefined; sample?: boolean | undefined },
): Promise<string> {
  if (!input.sourceUrl) throw Object.assign(new Error("A website source URL is required."), { status: 400 });
  const sourceUrl = normalizeWebsiteSourceUrl(input.sourceUrl);
  const crawlLimit = input.onboarding || input.sample ? ONBOARDING_CRAWL_PAGE_LIMIT : FULL_CRAWL_PAGE_LIMIT;
  // Serialize website submissions so retries/revisited forms reuse the same import.
  const business = (await tx.select({ onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).for("update"))[0];
  if (input.onboarding || business?.onboardingStage === "website") {
    await tx.update(businesses).set({ websiteUrl: sourceUrl, updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
    if (business?.onboardingStage === "website") {
      await moveOnboardingStageInTransaction(tx, { businessId: input.businessId, from: "website", to: "knowledge" });
    }
  }
  const existing = (await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.sourceUrl, sourceUrl))).limit(1).for("update"))[0];
  if (existing) {
    // A retry of an onboarding submission is still onboarding: without the
    // limit it would fall back to the full crawl this sampling exists to defer.
    if (["cancelled", "error"].includes(existing.status)) await queueKnowledgeDocumentRetry(tx, { businessId: input.businessId, documentId: existing.id, crawlLimit }, existing);
    return existing.id;
  }
  const [document] = await tx.insert(knowledgeDocuments).values({
    businessId: input.businessId,
    title: input.title.trim(),
    sourceType: "website",
    sourceUrl,
    status: "processing",
  }).returning({ id: knowledgeDocuments.id });
  if (!document) {
    throw new Error("Knowledge document could not be created.");
  }
  const [ingestion] = await tx.insert(websiteIngestionJobs).values({ businessId: input.businessId, rootDocumentId: document.id, websiteUrl: sourceUrl, provider: "firecrawl", status: "queued", pageLimit: crawlLimit }).returning({ id: websiteIngestionJobs.id });
  await enqueueOutbox(tx, {
    topic: "knowledge.crawlWebsite",
    businessId: input.businessId,
    aggregateType: "knowledge_document",
    aggregateId: document.id,
    dedupeKey: `knowledge:${document.id}:crawl`,
    payload: { url: sourceUrl, documentId: document.id, revision: 0, websiteIngestionJobId: ingestion!.id, limit: crawlLimit },
  });
  return document.id;
}

export async function listKnowledgeSnippets(context: DomainContext, input: { userId: string; businessId: string }) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await tx.select().from(knowledgeSnippets).where(eq(knowledgeSnippets.businessId, input.businessId)).orderBy(desc(knowledgeSnippets.priority), asc(knowledgeSnippets.title));
  });
}

async function queueKnowledgeDocumentRetry(tx: DatabaseTransaction, input: { businessId: string; documentId: string; crawlLimit?: number | undefined }, document: Pick<typeof knowledgeDocuments.$inferSelect, "id" | "sourceType" | "sourceUrl" | "revision">): Promise<void> {
    await tx.update(knowledgeDocuments).set({ status: document.sourceType === "website" ? "processing" : "pending", processingProgress: 0, error: null, revision: sql`${knowledgeDocuments.revision} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId)));
    const retryLimit = input.crawlLimit ?? FULL_CRAWL_PAGE_LIMIT;
    const ingestion = document.sourceType === "website" && document.sourceUrl ? (await tx.insert(websiteIngestionJobs).values({ businessId: input.businessId, rootDocumentId: input.documentId, websiteUrl: document.sourceUrl, provider: "firecrawl", status: "queued", pageLimit: retryLimit }).onConflictDoUpdate({ target: websiteIngestionJobs.rootDocumentId, set: { status: "queued", importedCount: 0, indexedCount: 0, errorCount: 0, lastError: null, pageLimit: retryLimit, updatedAt: new Date() } }).returning({ id: websiteIngestionJobs.id }))[0] : undefined;
    await enqueueOutbox(tx, { topic: document.sourceType === "website" ? "knowledge.crawlWebsite" : "knowledge.extractDocument", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: input.documentId, dedupeKey: `knowledge:${input.documentId}:retry:${document.revision + 1}`, payload: document.sourceType === "website" && document.sourceUrl ? { documentId: input.documentId, url: document.sourceUrl, revision: document.revision + 1, websiteIngestionJobId: ingestion!.id, limit: retryLimit } : { documentId: input.documentId, revision: document.revision + 1 } });
}

export async function retryKnowledgeDocument(context: DomainContext, input: { userId: string; businessId: string; documentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (!(await retryKnowledgeDocumentInTransaction(tx, input))) throw new Error("Knowledge document not found.");
  });
}

/**
 * Queues a source's crawl or extraction again, crawling up to crawlLimit pages
 * (the full limit by default). False when the business has no such document.
 */
export async function retryKnowledgeDocumentInTransaction(tx: DatabaseTransaction, input: { businessId: string; documentId: string; crawlLimit?: number | undefined }): Promise<boolean> {
  const document = (await tx.select({ id: knowledgeDocuments.id, sourceType: knowledgeDocuments.sourceType, sourceUrl: knowledgeDocuments.sourceUrl, revision: knowledgeDocuments.revision }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update"))[0];
  if (!document) return false;
  await queueKnowledgeDocumentRetry(tx, input, document);
  return true;
}

/**
 * Reads the rest of a site that onboarding only sampled. Re-crawling at the
 * full limit replaces the partial import rather than adding a second copy.
 */
export async function expandWebsiteCrawl(context: DomainContext, input: { userId: string; businessId: string; documentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await expandWebsiteCrawlInTransaction(tx, input);
  });
}

export async function expandWebsiteCrawlInTransaction(tx: DatabaseTransaction, input: { businessId: string; documentId: string }): Promise<void> {
  const document = (await tx.select({ id: knowledgeDocuments.id, sourceType: knowledgeDocuments.sourceType, sourceUrl: knowledgeDocuments.sourceUrl, revision: knowledgeDocuments.revision }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update"))[0];
  if (!document) throw Object.assign(new Error("Knowledge document not found."), { status: 404 });
  if (document.sourceType !== "website" || !document.sourceUrl) throw Object.assign(new Error("Only a website import can be read further."), { status: 400 });
  await queueKnowledgeDocumentRetry(tx, { ...input, crawlLimit: FULL_CRAWL_PAGE_LIMIT }, document);
}

export async function setKnowledgeDocumentActive(context: DomainContext, input: { userId: string; businessId: string; documentId: string; active: boolean }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async tx => {
    await requireBusinessAdmin(tx, input);
    if (!await setKnowledgeDocumentActiveInTransaction(tx, input)) throw Object.assign(new Error("Knowledge document not found."), { status: 404 });
  });
}

/** Turns a document on or off for the receptionist. False when the business has no such document. Callers authorize first. */
export async function setKnowledgeDocumentActiveInTransaction(tx: DatabaseTransaction, input: { businessId: string; documentId: string; active: boolean }): Promise<boolean> {
  const [document] = await tx.update(knowledgeDocuments).set({ active: input.active, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).returning({ id: knowledgeDocuments.id });
  if (!document) return false;
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: input.documentId, dedupeKey: `knowledge:${input.documentId}:active:${Date.now()}`, payload: { businessId: input.businessId, reason: "document_activity_changed" } });
  await enqueueKnowledgeDerivedRefresh(tx, { businessId: input.businessId, reason: "document_activity_changed" });
  return true;
}

export async function cancelKnowledgeDocument(context: DomainContext, input: { userId: string; businessId: string; documentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await cancelKnowledgeDocumentInTransaction(tx, input);
  });
}

export async function cancelKnowledgeDocumentInTransaction(tx: DatabaseTransaction, input: { businessId: string; documentId: string }): Promise<void> {
  const [document] = await tx.update(knowledgeDocuments).set({ status: "cancelled", revision: sql`${knowledgeDocuments.revision} + 1`, error: "Cancelled by operator.", updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.status, "processing"))).returning({ id: knowledgeDocuments.id });
  if (!document) throw Object.assign(new Error("Only a processing knowledge document can be cancelled."), { status: 409 });
  await tx.update(websiteIngestionJobs).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.businessId, input.businessId), eq(websiteIngestionJobs.rootDocumentId, input.documentId)));
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
    if (!await deleteKnowledgeDocumentInTransaction(tx, input)) throw new Error("Knowledge document not found.");
  });
}

/** Deletes a document and its indexed text. False when the business has no such document. Callers authorize first. */
export async function deleteKnowledgeDocumentInTransaction(tx: DatabaseTransaction, input: { businessId: string; documentId: string }): Promise<boolean> {
  await tx.delete(knowledgeChunks).where(and(eq(knowledgeChunks.documentId, input.documentId), eq(knowledgeChunks.businessId, input.businessId)));
  const [document] = await tx.delete(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).returning({ id: knowledgeDocuments.id, storageObjectId: knowledgeDocuments.storageObjectId });
  if (!document) return false;
  // Downloads stop now; the retained-object sweep deletes the file within 15 minutes.
  if (document.storageObjectId) await tx.update(storageObjects).set({ retentionUntil: new Date(), updatedAt: new Date() }).where(and(eq(storageObjects.id, document.storageObjectId), eq(storageObjects.businessId, input.businessId)));
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: document.id, dedupeKey: `knowledge:${document.id}:deleted:${Date.now()}`, payload: { businessId: input.businessId, reason: "document_deleted" } });
  await enqueueKnowledgeDerivedRefresh(tx, { businessId: input.businessId, reason: "document_deleted" });
  return true;
}

function websiteHost(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).host.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

/** Deletes every imported page from the same website as the given page, and returns how many went. */
export async function deleteWebsiteKnowledge(context: DomainContext, input: { userId: string; businessId: string; documentId: string }): Promise<number> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [page] = await tx.select({ sourceType: knowledgeDocuments.sourceType, sourceUrl: knowledgeDocuments.sourceUrl }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1);
    if (!page) throw Object.assign(new Error("Knowledge document not found."), { status: 404, code: "not_found" });
    const host = page.sourceType === "website" ? websiteHost(page.sourceUrl) : null;
    if (!host) throw Object.assign(new Error("Only imported website pages can be deleted by website."), { status: 400 });
    // A crawled page being saved finishes first, and later ones wait until this commits.
    await lockKnowledgeStorage(tx, input.businessId);
    const pages = await tx.select({ id: knowledgeDocuments.id, sourceUrl: knowledgeDocuments.sourceUrl }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.sourceType, "website")));
    const ids = pages.filter((candidate) => websiteHost(candidate.sourceUrl) === host).map((candidate) => candidate.id);
    // A crawl of this website still running would bring the pages back. Cancelling its import, like
    // cancelKnowledgeDocument does, stops it at the next page; a deleted import stops it too.
    const crawls = (await tx.select({ id: websiteIngestionJobs.id, websiteUrl: websiteIngestionJobs.websiteUrl, rootDocumentId: websiteIngestionJobs.rootDocumentId }).from(websiteIngestionJobs)
      .where(and(eq(websiteIngestionJobs.businessId, input.businessId), notInArray(websiteIngestionJobs.status, ["completed", "failed", "cancelled"]))))
      .filter((crawl) => websiteHost(crawl.websiteUrl) === host || (crawl.rootDocumentId !== null && ids.includes(crawl.rootDocumentId)));
    if (crawls.length) {
      await tx.update(websiteIngestionJobs).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.businessId, input.businessId), inArray(websiteIngestionJobs.id, crawls.map((crawl) => crawl.id))));
      const imports = crawls.flatMap((crawl) => crawl.rootDocumentId && !ids.includes(crawl.rootDocumentId) ? [crawl.rootDocumentId] : []);
      if (imports.length) await tx.update(knowledgeDocuments).set({ status: "cancelled", revision: sql`${knowledgeDocuments.revision} + 1`, error: "Cancelled by operator.", updatedAt: new Date() }).where(and(eq(knowledgeDocuments.businessId, input.businessId), inArray(knowledgeDocuments.id, imports), eq(knowledgeDocuments.status, "processing")));
    }
    await tx.delete(knowledgeChunks).where(and(eq(knowledgeChunks.businessId, input.businessId), inArray(knowledgeChunks.documentId, ids)));
    await tx.delete(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, input.businessId), inArray(knowledgeDocuments.id, ids)));
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: input.documentId, dedupeKey: `knowledge:website:${input.documentId}:deleted:${Date.now()}`, payload: { businessId: input.businessId, reason: "document_deleted" } });
    await enqueueKnowledgeDerivedRefresh(tx, { businessId: input.businessId, reason: "document_deleted" });
    return ids.length;
  });
}

export async function createKnowledgeSnippet(
  context: DomainContext,
  input: { userId: string; businessId: string; title: string; content: string; tags?: string[]; priority?: number; active?: boolean },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return (await createKnowledgeSnippetInTransaction(tx, input)).id;
  });
}

/** Inserts a snippet and refreshes the receptionist snapshot. Callers authorize first. */
export async function createKnowledgeSnippetInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; title: string; content: string; tags?: string[]; priority?: number; active?: boolean },
): Promise<typeof knowledgeSnippets.$inferSelect> {
  const [snippet] = await tx.insert(knowledgeSnippets).values({ businessId: input.businessId, title: input.title.trim(), content: input.content.trim(), tags: input.tags ?? [], priority: input.priority ?? 0, active: input.active ?? true }).returning();
  if (!snippet) throw new Error("Knowledge snippet could not be created.");
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_snippet", aggregateId: snippet.id, dedupeKey: `knowledge-snippet:${snippet.id}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "snippet_created" } });
  await enqueueKnowledgeDerivedRefresh(tx, { businessId: input.businessId, reason: "snippet_created" });
  return snippet;
}

export async function updateKnowledgeSnippet(
  context: DomainContext,
  input: { userId: string; businessId: string; snippetId: string; title?: string; content?: string; tags?: string[]; priority?: number; active?: boolean },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (!await updateKnowledgeSnippetInTransaction(tx, input)) throw new Error("Knowledge snippet not found.");
  });
}

/** Changes the fields given and refreshes the receptionist snapshot. Null when the business has no such snippet. Callers authorize first. */
export async function updateKnowledgeSnippetInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; snippetId: string; title?: string | undefined; content?: string | undefined; tags?: string[] | undefined; priority?: number | undefined; active?: boolean | undefined },
): Promise<typeof knowledgeSnippets.$inferSelect | null> {
  const [snippet] = await tx.update(knowledgeSnippets).set({ ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.content !== undefined ? { content: input.content.trim() } : {}), tags: input.tags, priority: input.priority, active: input.active, updatedAt: new Date() }).where(and(eq(knowledgeSnippets.id, input.snippetId), eq(knowledgeSnippets.businessId, input.businessId))).returning();
  if (!snippet) return null;
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_snippet", aggregateId: snippet.id, dedupeKey: `knowledge-snippet:${snippet.id}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "snippet_updated" } });
  await enqueueKnowledgeDerivedRefresh(tx, { businessId: input.businessId, reason: "snippet_updated" });
  return snippet;
}

export async function deleteKnowledgeSnippet(context: DomainContext, input: { userId: string; businessId: string; snippetId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (!await deleteKnowledgeSnippetInTransaction(tx, input)) throw new Error("Knowledge snippet not found.");
  });
}

/** Deletes a snippet and refreshes the receptionist snapshot. False when the business has no such snippet. Callers authorize first. */
export async function deleteKnowledgeSnippetInTransaction(tx: DatabaseTransaction, input: { businessId: string; snippetId: string }): Promise<boolean> {
  const [snippet] = await tx.delete(knowledgeSnippets).where(and(eq(knowledgeSnippets.id, input.snippetId), eq(knowledgeSnippets.businessId, input.businessId))).returning({ id: knowledgeSnippets.id });
  if (!snippet) return false;
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_snippet", aggregateId: snippet.id, dedupeKey: `knowledge-snippet:${snippet.id}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "snippet_deleted" } });
  await enqueueKnowledgeDerivedRefresh(tx, { businessId: input.businessId, reason: "snippet_deleted" });
  return true;
}

type IndexDocumentInput = { businessId: string; documentId: string; text: string; embeddings: number[][]; embeddingFingerprint?: string };

type IndexDocumentResult = { chunkCount: number; indexed: boolean; documentId: string };

async function recordKnowledgeDocumentIndexed(context: DomainContext, input: { businessId: string; documentId: string }): Promise<void> {
  await recordProductEventBestEffort(context, {
    name: "knowledge.document_indexed",
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    actorType: "worker",
    properties: { documentId: input.documentId },
  });
}

/**
 * Makes indexing jobs for one business take turns, so each one's plan-limit
 * check sees the others' text. Take it before any document lock, in the order
 * createKnowledgeDocument and finalizeUpload use. NO KEY UPDATE leaves inserts
 * that reference the business, like transcripts, free to run.
 */
async function lockKnowledgeStorage(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId)).for("no key update");
}

async function knowledgeStorageLimitError(tx: DatabaseTransaction, input: { businessId: string; documentId: string; chunks: string[] }): Promise<string | undefined> {
  const limit = getKnowledgeStorageLimitBytes(await resolveBusinessBillingPlan(tx, input.businessId));
  if (limit === null) return undefined;
  const newBytes = input.chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk, "utf8"), 0);
  return await getKnowledgeStorageUsageBytes(tx, input.businessId, { excludeDocumentId: input.documentId }) + newBytes > limit ? knowledgeStorageLimitMessage(limit) : undefined;
}

/**
 * The plan-limit message when a document's text can't fit, so the worker can
 * fail it before paying to embed it. Indexing checks again under the lock.
 */
export async function checkKnowledgeStorageLimit(context: DomainContext, input: { businessId: string; documentId: string; text: string }): Promise<string | undefined> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, (tx) => knowledgeStorageLimitError(tx, { ...input, chunks: chunkText(input.text) }));
}

export async function indexDocumentText(context: DomainContext, input: IndexDocumentInput): Promise<{ chunkCount: number }> {
  const result = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await lockKnowledgeStorage(tx, input.businessId);
    return await indexDocumentTextInTransaction(tx, input);
  });
  if (result.indexed) await recordKnowledgeDocumentIndexed(context, { businessId: input.businessId, documentId: result.documentId });
  return { chunkCount: result.chunkCount };
}

/** Rebuild stored evidence without fetching the source or overwriting a concurrent edit. */
async function indexDocumentTextInTransaction(tx: DatabaseTransaction, input: IndexDocumentInput, preserveImport = false): Promise<IndexDocumentResult> {
    const document = (await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update"))[0];
    if (!document) {
      throw new Error("Knowledge document not found.");
    }
    if (document.status === "cancelled") return { chunkCount: 0, indexed: false, documentId: input.documentId };
    const chunks = chunkText(input.text);
    if (chunks.length === 0) {
      await markKnowledgeDocumentFailedInTransaction(tx, input, document.revision, "No readable text was extracted from the document.");
      throw new Error("No readable text was extracted from the document.");
    }
    if (input.embeddings.length !== chunks.length || input.embeddings.some((embedding) => embedding.length === 0)) {
      await markKnowledgeDocumentFailedInTransaction(tx, input, document.revision, "Knowledge embeddings are unavailable or incomplete.");
      throw new Error("Knowledge embeddings are unavailable or incomplete.");
    }
    const limitError = await knowledgeStorageLimitError(tx, { ...input, chunks });
    if (limitError) {
      // Retrying can't fit the text, so fail the document instead of throwing.
      await markKnowledgeDocumentFailedInTransaction(tx, input, document.revision, limitError);
      return { chunkCount: 0, indexed: false, documentId: input.documentId };
    }
    await tx.delete(knowledgeChunks).where(and(eq(knowledgeChunks.documentId, input.documentId), eq(knowledgeChunks.businessId, input.businessId)));
    const rows = chunks.map((content, sequence) => ({
      businessId: input.businessId,
      documentId: input.documentId,
      sequence,
      content,
      contentHash: hashContent(content),
      embedding: input.embeddings[sequence]!,
      ...(input.embeddingFingerprint ? { embeddingFingerprint: input.embeddingFingerprint } : {}),
      embeddingStatus: input.embeddingFingerprint ? "completed" : "pending",
      embeddingError: null,
    }));
    // A statement can bind at most 65,535 values, and each row binds 9.
    for (let start = 0; start < rows.length; start += 1000) {
      await tx.insert(knowledgeChunks).values(rows.slice(start, start + 1000));
    }
    await tx.update(knowledgeDocuments).set({ status: preserveImport ? "processing" : "indexed", processingProgress: 100, contentHash: hashContent(input.text), revision: document.revision + (preserveImport ? 0 : 1), updatedAt: new Date() }).where(eq(knowledgeDocuments.id, input.documentId));
    if (!preserveImport) await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "knowledge_document", aggregateId: input.documentId, dedupeKey: `knowledge:${input.documentId}:snapshot:${document.revision + 1}`, payload: { businessId: input.businessId, reason: "document_indexed" } });
    if (!preserveImport) await enqueueKnowledgeDerivedRefresh(tx, { businessId: input.businessId, reason: "document_indexed" });
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "knowledge_document",
      aggregateId: input.documentId,
      dedupeKey: `knowledge:${input.documentId}:progress:${document.revision + 1}`,
      payload: { type: "document.progressed", entityId: input.documentId, progress: 100 },
    });
    return { chunkCount: chunks.length, indexed: !preserveImport, documentId: input.documentId };
}

/** Commit a crawled page only while its originating import is still current. */
export async function indexCrawledWebsitePage(context: DomainContext, input: IndexDocumentInput & { sourceRevision: number; sourceUrl: string; title: string }): Promise<{ chunkCount: number }> {
  const result = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx): Promise<IndexDocumentResult> => {
    await lockKnowledgeStorage(tx, input.businessId);
    const [source] = await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1).for("update");
    if (!source || source.status !== "processing" || source.revision !== input.sourceRevision) return { chunkCount: 0, indexed: false, documentId: input.documentId };
    const sourceUrl = normalizeWebsiteSourceUrl(input.sourceUrl, { keepQuery: true });
    const [page] = await tx.insert(knowledgeDocuments).values({ businessId: input.businessId, sourceType: "website", title: input.title, sourceUrl, status: "processing" }).onConflictDoUpdate({ target: [knowledgeDocuments.businessId, knowledgeDocuments.sourceUrl], set: { title: input.title, status: "processing", error: null, updatedAt: new Date() } }).returning({ id: knowledgeDocuments.id });
    if (!page) throw new Error("Website page could not be saved.");
    return await indexDocumentTextInTransaction(tx, { ...input, documentId: page.id }, page.id === source.id);
  });
  if (result.indexed) await recordKnowledgeDocumentIndexed(context, { businessId: input.businessId, documentId: result.documentId });
  return { chunkCount: result.chunkCount };
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
  const matches = withinKnowledgeBudget(candidates.filter(p => valid.has(p.chunkId)), KNOWLEDGE_SEARCH_TOKEN_BUDGET, p => JSON.stringify(p));
  for (let index = 0; index < matches.length; index += 1) {
    const p = matches[index]!;
    const neighbors = current.filter(row => row.documentId === p.documentId && row.sourceRevision === p.sourceRevision && Math.abs(row.sequence - p.sequence) <= 1).sort((a, b) => a.sequence - b.sequence);
    const expanded = { ...p, supportingChunkIds: neighbors.map(row => row.chunkId), content: neighbors.map(row => row.content).join("\n\n") };
    const proposed = matches.map((match, candidateIndex) => candidateIndex === index ? expanded : match);
    if (proposed.reduce((sum, match) => sum + countKnowledgeTokens(JSON.stringify(match) + "\n"), 0) <= KNOWLEDGE_SEARCH_TOKEN_BUDGET) matches[index] = expanded;
  }
  const failed = validationFailed || (lexicalResult.status === "rejected" && semanticResult.status === "rejected");
  const outcome = matches.length ? "found" as const : failed ? "unavailable" as const : "empty" as const;
  const durationMs = performance.now() - startedAt;
  searchDuration.record(durationMs, { operation: "knowledge.search", mode, outcome });
  searchResultCount.record(matches.length, { operation: "knowledge.search", mode, outcome });
  await recordProductEventBestEffort(context, {
    name: "knowledge.search_executed",
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    properties: { mode, outcome, resultCount: matches.length, durationMs, fallbackUsed: mode === "keyword", ...(input.callId ? { callId: input.callId } : {}), ...(input.turnId ? { turnId: input.turnId } : {}) },
  });
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
    const [hours, closureRows, serviceRows, ruleRows, snippets, documents, numbers, employeeRows, assignments] = await Promise.all([
      tx.select().from(businessHours).where(and(eq(businessHours.businessId, input.businessId), isNull(businessHours.staffId))).orderBy(asc(businessHours.dayOfWeek), asc(businessHours.openMinutes)),
      tx.select().from(closures).where(and(eq(closures.businessId, input.businessId), isNull(closures.staffId))).orderBy(asc(closures.startsAt)),
      tx.select().from(services).where(and(eq(services.businessId, input.businessId), eq(services.active, true))).orderBy(asc(services.name)),
      tx.select().from(agentRules).where(and(eq(agentRules.businessId, input.businessId), eq(agentRules.active, true))).orderBy(asc(agentRules.sortOrder), asc(agentRules.createdAt), asc(agentRules.id)),
      tx.select().from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, input.businessId), eq(knowledgeSnippets.active, true))).orderBy(desc(knowledgeSnippets.priority)).limit(8),
      tx.select({ title: knowledgeDocuments.title, sourceUrl: knowledgeDocuments.sourceUrl, tags: knowledgeDocuments.tags, revision: knowledgeDocuments.revision }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.active, true), eq(knowledgeDocuments.status, "indexed"))).orderBy(desc(knowledgeDocuments.updatedAt), asc(knowledgeDocuments.id)).limit(40),
      tx.select().from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"))).orderBy(desc(phoneNumbers.createdAt), asc(phoneNumbers.id)),
      listBookableEmployees(tx, input.businessId),
      tx.select({ staffId: staffServiceAssignments.staffId, serviceId: staffServiceAssignments.serviceId }).from(staffServiceAssignments).where(eq(staffServiceAssignments.businessId, input.businessId)),
    ]);
    const schedules = await loadStaffSchedules(tx, { businessId: input.businessId, staffIds: employeeRows.map((row) => row.staffId), timezone: business[0].timezone });
    const currentProfile = profile[0];
    const phoneNumber = numbers.find((number) => number.status === "active" && number.voiceEnabled)?.e164;
    // The number customer texts come from, so the agent offers texts only to
    // callers it can reach: the shared sender on cloud, the business's own
    // SMS number when self-hosted.
    const smsNumber = await resolveSmsSender(tx, input.businessId);
    const version = `${Date.now()}`;
    const defaultLocale = normalizeRuntimeLocale(business[0].defaultLocale);
    builtSnapshot = buildBusinessContextSnapshot({
      businessId: input.businessId,
      version,
      generatedAt: new Date().toISOString(),
      displayName: business[0].name,
      ...(business[0].legalName ? { legalName: business[0].legalName } : {}),
      timezone: business[0].timezone,
      defaultLocale,
      businessType: ["clinic", "repair_shop", "salon", "service_company"].includes(business[0].businessType) ? business[0].businessType as BusinessContextSnapshot["businessType"] : "other",
      telemetryEnabled: business[0].telemetryEnabled,
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(smsNumber ? { smsNumber } : {}),
      greeting: currentProfile?.greeting ?? defaultGreeting(business[0].name, defaultLocale),
      tone: currentProfile?.tone ?? "professional",
      bookingPolicy: currentProfile?.bookingPolicy ?? "Confirm availability before booking.",
      ...(currentProfile?.voiceInstructions ? { voiceInstructions: currentProfile.voiceInstructions } : {}),
      ...(currentProfile?.smsInstructions ? { smsInstructions: currentProfile.smsInstructions } : {}),
      ...(currentProfile?.chatInstructions ? { chatInstructions: currentProfile.chatInstructions } : {}),
      // A sign-up placeholder says nothing about the business, so prompts get no summary until AI or a person writes one.
      summary: currentProfile && currentProfile.summarySource !== "placeholder" ? currentProfile.summary : "",
      knowledgeDigest: withinKnowledgeBudget(documents, 1600, row => JSON.stringify(row)).map(row => JSON.stringify(row)).join("\n"),
      hours: hours.map((row) => ({ dayOfWeek: row.dayOfWeek, openMinutes: row.openMinutes, closeMinutes: row.closeMinutes })),
      closures: closureRows.map((row) => ({ startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), reason: row.reason })),
      services: serviceRows.map((row) => ({
        id: row.id, name: row.name, durationMinutes: row.durationMinutes,
        ...(row.description ? { description: row.description } : {}),
        ...(servicePriceFromColumns(row, business[0]!.currency) ? { price: servicePriceFromColumns(row, business[0]!.currency)! } : {}),
        ...(row.localizedNames ? { localizedNames: Object.fromEntries(runtimeLocales.flatMap((locale) => typeof row.localizedNames?.[locale] === "string" ? [[locale, row.localizedNames[locale]]] : [])) } : {}),
      })),
      rules: ruleRows.map((row) => ({ id: row.id, title: row.title, content: row.content, order: row.sortOrder })),
      employees: employeeRows.map((row) => {
        const assigned = new Set(assignments.filter((assignment) => assignment.staffId === row.staffId).map((assignment) => assignment.serviceId));
        const names = serviceRows.filter((service) => assigned.has(service.id)).map((service) => service.name);
        const { hours: ownHours, timeOff } = schedules.get(row.staffId)!;
        return { name: row.name, ...(names.length ? { services: names } : {}), ...(ownHours ? { hours: ownHours } : {}), ...(timeOff.length ? { timeOff } : {}) };
      }),
      snippets: snippets.map((row) => ({ id: row.id, title: row.title, content: row.content, tags: row.tags, priority: row.priority })),
      appointmentChangePolicy: normalizeAppointmentChangePolicy(currentProfile?.appointmentChangePolicy),
      bookingMode: normalizeBookingMode(currentProfile?.bookingMode),
      transferPolicy: { mode: normalizeTransferMode(currentProfile?.transferMode), ...(currentProfile?.transferNumber ? { transferNumber: currentProfile.transferNumber } : {}) },
    });
    await tx.insert(businessContextSnapshots).values({ businessId: input.businessId, version, snapshot: builtSnapshot as unknown as Record<string, unknown> });
    // Readers only use the newest row. now() is this transaction's start, the
    // generated_at just stored, so a newer refresh committed meanwhile is kept.
    await tx.delete(businessContextSnapshots).where(and(eq(businessContextSnapshots.businessId, input.businessId), lt(businessContextSnapshots.generatedAt, sql`now()`)));
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
  await recordProductEventBestEffort(context, {
    name: "business.snapshot_refreshed",
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    actorType: "worker",
    properties: {},
  });
  return version;
}

/**
 * Counts the indexed text the receptionist searches, in UTF-8 bytes. Uploaded
 * files don't count: a PDF's images and layout take space the agent never reads.
 */
export async function getKnowledgeStorageUsageBytes(tx: DatabaseTransaction, businessId: string, options: { excludeDocumentId?: string } = {}): Promise<number> {
  const [extracted] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${knowledgeChunks.content})), 0)` }).from(knowledgeChunks)
    .where(and(eq(knowledgeChunks.businessId, businessId), ...(options.excludeDocumentId ? [ne(knowledgeChunks.documentId, options.excludeDocumentId)] : [])));
  return Number(extracted?.bytes ?? 0);
}

export function knowledgeStorageLimitMessage(limitBytes: number): string {
  return `Knowledge storage limit reached. ${Math.ceil(limitBytes / 1024 / 1024)} MB of text is included on this plan.`;
}

/** Refuses new knowledge for a business whose plan already holds all the text it includes. */
export class KnowledgeStorageLimitError extends Error {
  constructor(limitBytes: number) {
    super(knowledgeStorageLimitMessage(limitBytes));
    this.name = "KnowledgeStorageLimitError";
  }
}
