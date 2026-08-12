import { createHash } from "node:crypto";

import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";

import { agentRules, businessContextSnapshots, businessHours, businesses, closures, enqueueOutbox, knowledgeChunks, knowledgeDocuments, knowledgeSnippets, receptionistProfiles, services, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { BusinessContextSnapshot } from "@lobbystack/shared";
import { buildBusinessContextSnapshot } from "../snapshot";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { normalizeWebsiteSourceUrl } from "./knowledgeUrl";
import { getMeter } from "@lobbystack/telemetry/node";

const ragMeter = getMeter("lobbystack-rag");
const searchDuration = ragMeter.createHistogram("rag.search.duration_ms", { unit: "ms" });
const searchResultCount = ragMeter.createHistogram("rag.search.result_count", { unit: "{result}" });
const snapshotRefreshDuration = ragMeter.createHistogram("rag.snapshot_refresh.duration_ms", { unit: "ms" });

export { normalizeWebsiteSourceUrl } from "./knowledgeUrl";

export function chunkText(text: string, options: { maxCharacters?: number; overlap?: number } = {}): string[] {
  const maxCharacters = options.maxCharacters ?? 1800;
  const overlap = Math.min(options.overlap ?? 180, Math.floor(maxCharacters / 2));
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + maxCharacters);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createKnowledgeDocument(
  context: DomainContext,
  input: { userId: string; businessId: string; title: string; sourceType: string; sourceUrl?: string; storageObjectId?: string },
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
    await enqueueOutbox(tx, {
      topic: isWebsite ? "knowledge.crawlWebsite" : "knowledge.extractDocument",
      businessId: input.businessId,
      aggregateType: "knowledge_document",
      aggregateId: document.id,
      dedupeKey: isWebsite ? `knowledge:${document.id}:crawl` : `knowledge:${document.id}:extract`,
      payload: isWebsite ? { url: sourceUrl, documentId: document.id } : { documentId: document.id },
    });
    return document.id;
  });
}

export async function indexDocumentText(
  context: DomainContext,
  input: { businessId: string; documentId: string; text: string; embeddings: number[][] },
): Promise<{ chunkCount: number }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const document = (await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1))[0];
    if (!document) {
      throw new Error("Knowledge document not found.");
    }
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
      })));
    }
    await tx.update(knowledgeDocuments).set({ status: "indexed", processingProgress: 100, contentHash: hashContent(input.text), revision: document.revision + 1, updatedAt: new Date() }).where(eq(knowledgeDocuments.id, input.documentId));
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "knowledge_document",
      aggregateId: input.documentId,
      dedupeKey: `knowledge:${input.documentId}:progress:${document.revision + 1}`,
      payload: { type: "document.progressed", entityId: input.documentId, progress: 100 },
    });
    return { chunkCount: chunks.length };
  });
}

async function markKnowledgeDocumentFailedInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; documentId: string },
  revision: number,
  error: string,
): Promise<void> {
  await tx.update(knowledgeDocuments).set({ status: "error", processingProgress: 0, error, revision: revision + 1, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId)));
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
  input: { businessId: string; documentId: string; error?: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const document = (await tx.select({ revision: knowledgeDocuments.revision }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1))[0];
    if (!document) return false;
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
  const startedAt = performance.now();
  const results = await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: input.userId ? "operator" : "worker" }, async (tx) => {
    if (input.userId) {
      await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId });
    }
    const terms = input.query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
    if (terms.length === 0) {
      return [];
    }
    if (context.embeddings) {
      try {
        const [embedding] = await context.embeddings.embed([input.query]);
        if (embedding?.length) {
          const vector = JSON.stringify(embedding);
          const vectorRows = await tx.execute<{ chunk_id: string; title: string; content: string }>(sql`
            SELECT chunks.id AS chunk_id, documents.title, chunks.content
            FROM knowledge_chunks AS chunks
            INNER JOIN knowledge_documents AS documents ON documents.id = chunks.document_id
            WHERE chunks.business_id = ${input.businessId}
              AND chunks.embedding IS NOT NULL
            ORDER BY chunks.embedding <=> ${vector}::vector
            LIMIT ${input.limit ?? 4}
          `);
          if (vectorRows.rows.length > 0) {
            return vectorRows.rows.map((row) => ({ chunkId: row.chunk_id, title: row.title, content: row.content }));
          }
        }
      } catch {
        // Keyword retrieval remains available when the embedding provider is unavailable.
      }
    }
    const rows = await tx.select({ chunkId: knowledgeChunks.id, title: knowledgeDocuments.title, content: knowledgeChunks.content }).from(knowledgeChunks).innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id)).where(and(eq(knowledgeChunks.businessId, input.businessId), ...terms.map((term) => ilike(knowledgeChunks.content, `%${term}%`)))).orderBy(desc(knowledgeDocuments.updatedAt)).limit(input.limit ?? 4);
    return rows;
  });
  searchDuration.record(performance.now() - startedAt, { operation: "knowledge.search" });
  searchResultCount.record(results.length, { operation: "knowledge.search" });
  return results;
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
  const version = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [business, profile] = await Promise.all([
      tx.select().from(businesses).where(eq(businesses.id, input.businessId)).limit(1),
      tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1),
    ]);
    if (!business[0]) {
      throw new Error("Business not found.");
    }
    const [hours, closureRows, serviceRows, ruleRows, snippets] = await Promise.all([
      tx.select().from(businessHours).where(eq(businessHours.businessId, input.businessId)).orderBy(asc(businessHours.dayOfWeek)),
      tx.select().from(closures).where(eq(closures.businessId, input.businessId)).orderBy(asc(closures.startsAt)),
      tx.select().from(services).where(and(eq(services.businessId, input.businessId), eq(services.active, true))).orderBy(asc(services.name)),
      tx.select().from(agentRules).where(and(eq(agentRules.businessId, input.businessId), eq(agentRules.active, true))).orderBy(asc(agentRules.sortOrder)),
      tx.select().from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, input.businessId), eq(knowledgeSnippets.active, true))).orderBy(desc(knowledgeSnippets.priority)).limit(8),
    ]);
    const currentProfile = profile[0];
    const version = `${Date.now()}`;
    const snapshot = buildBusinessContextSnapshot({
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
      summary: currentProfile?.summary ?? business[0].name,
      hours: hours.map((row) => ({ dayOfWeek: row.dayOfWeek, openMinutes: row.openMinutes, closeMinutes: row.closeMinutes })),
      closures: closureRows.map((row) => ({ startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), reason: row.reason })),
      services: serviceRows.map((row) => ({ id: row.id, name: row.name, durationMinutes: row.durationMinutes, ...(row.description ? { description: row.description } : {}) })),
      rules: ruleRows.map((row) => ({ id: row.id, title: row.title, content: row.content, order: row.sortOrder })),
      snippets: snippets.map((row) => ({ id: row.id, title: row.title, content: row.content, tags: row.tags, priority: row.priority })),
      transferPolicy: { mode: currentProfile?.transferMode === "always" ? "always" : "on_request", ...(currentProfile?.transferNumber ? { transferNumber: currentProfile.transferNumber } : {}) },
    });
    await tx.insert(businessContextSnapshots).values({ businessId: input.businessId, version, snapshot: snapshot as unknown as Record<string, unknown> });
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
  snapshotRefreshDuration.record(performance.now() - startedAt, { operation: "snapshot.refresh" });
  return version;
}
