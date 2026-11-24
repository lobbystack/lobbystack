import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

import { knowledgeChunks, listReembedBusinesses, withBusinessTransaction, type Database } from "@lobbystack/db";
import { hashContent, recordAiGenerationEvent, type DomainContext, type DurableAiUsage } from "@lobbystack/domain";
import { enqueueJob } from "@lobbystack/jobs";
import { EMBEDDING_DIMENSIONS, type OpenAiCompatibleEmbeddingProvider } from "@lobbystack/providers/ai/embeddingProvider";
import { getMeter } from "@lobbystack/telemetry/node";

const embeddingDuration = getMeter("lobbystack-rag").createHistogram("rag.embedding.duration_ms", { unit: "ms" });
const LOOKUP_BATCH_SIZE = 1_000;

export type KnowledgeEmbeddingProvider = Pick<OpenAiCompatibleEmbeddingProvider, "embed"> & {
  readonly embeddingFingerprint?: string;
};

export async function enqueueStaleKnowledgeEmbeddings(db: Database, queue: Parameters<typeof enqueueJob>[0], fingerprint: string) {
  for (const businessId of await listReembedBusinesses(db, fingerprint)) {
    const deduplicationId = `knowledge-reembed:${businessId}:${fingerprint}`;
    await enqueueJob(queue, {
      type: "knowledge.reembedBusiness",
      businessId,
      payload: { fingerprint },
      // Deduplicate unfinished jobs across replicas. A completed job must not block a later repair.
      idempotencyKey: `${deduplicationId}:${randomUUID()}`,
      deduplicationId,
    });
  }
}

function isValidVector(vector: number[] | null | undefined): vector is number[] {
  if (vector?.length !== EMBEDDING_DIMENSIONS) return false;
  for (const value of vector) {
    if (!Number.isFinite(value)) return false;
  }
  return vector.some((value) => value !== 0);
}

/** Returns one vector per chunk in input order. */
export async function embedKnowledgeChunks(
  domain: DomainContext,
  provider: KnowledgeEmbeddingProvider,
  businessId: string,
  chunks: readonly string[],
): Promise<number[][]> {
  if (chunks.length === 0) return [];

  const uniqueTexts = [...new Set(chunks)];
  const vectorsByText = new Map<string, number[]>();
  const { embeddingFingerprint } = provider;
  if (embeddingFingerprint) await withBusinessTransaction(domain.db, { businessId, actorType: "worker" }, async (tx) => {
    for (let start = 0; start < uniqueTexts.length; start += LOOKUP_BATCH_SIZE) {
      const texts = uniqueTexts.slice(start, start + LOOKUP_BATCH_SIZE);
      const hashes = texts.map(hashContent);
      const rows = await tx.selectDistinctOn([knowledgeChunks.contentHash, knowledgeChunks.content], {
        content: knowledgeChunks.content,
        embedding: knowledgeChunks.embedding,
      }).from(knowledgeChunks).where(and(
        eq(knowledgeChunks.businessId, businessId),
        eq(knowledgeChunks.embeddingFingerprint, embeddingFingerprint),
        eq(knowledgeChunks.embeddingStatus, "completed"),
        inArray(knowledgeChunks.contentHash, hashes),
        sql`(${knowledgeChunks.contentHash}, ${knowledgeChunks.content}) in (
          select * from unnest(${sql.param(hashes)}::text[], ${sql.param(texts)}::text[])
        )`,
        sql`vector_dims(${knowledgeChunks.embedding}) = ${EMBEDDING_DIMENSIONS} and vector_norm(${knowledgeChunks.embedding}) > 0`,
      ));
      for (const { content, embedding } of rows) {
        if (isValidVector(embedding)) vectorsByText.set(content, embedding);
      }
    }
  });

  const textsToEmbed = uniqueTexts.filter((text) => !vectorsByText.has(text));
  if (textsToEmbed.length === 0) return chunks.map((text) => vectorsByText.get(text)!);

  const startedAt = performance.now();
  let usage: DurableAiUsage | undefined;
  let embeddings: number[][];
  try {
    embeddings = await provider.embed(textsToEmbed, (reported) => { usage = reported; });
    embeddingDuration.record(performance.now() - startedAt, { provider: usage?.provider ?? "unknown" });
  } finally {
    if (usage) {
      await recordAiGenerationEvent(domain, { ...usage, businessId, operation: "knowledge.embed" }).catch(() => undefined);
    }
  }

  if (embeddings.length !== textsToEmbed.length) throw new Error("Knowledge embedding provider returned an incomplete result.");
  for (const [index, text] of textsToEmbed.entries()) {
    const vector = embeddings[index];
    if (!isValidVector(vector)) throw new Error("Knowledge embedding provider returned an incompatible vector.");
    vectorsByText.set(text, vector);
  }

  return chunks.map((text) => vectorsByText.get(text)!);
}
