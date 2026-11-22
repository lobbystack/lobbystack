import { and, eq, inArray } from "drizzle-orm";
import { knowledgeChunks, withBusinessTransaction } from "@lobbystack/db";
import { hashContent, recordAiGenerationEvent, type DomainContext, type DurableAiUsage } from "@lobbystack/domain";
import { EMBEDDING_DIMENSIONS } from "@lobbystack/providers/ai/embeddingProvider";
import { getMeter } from "@lobbystack/telemetry/node";

const embeddingDuration = getMeter("lobbystack-rag").createHistogram("rag.embedding.duration_ms", { unit: "ms" });
const lookupBatchSize = 1000;

export type KnowledgeEmbeddingProvider = {
  fingerprint?: string;
  embed(values: string[], onUsage?: (usage: DurableAiUsage) => Promise<void> | void): Promise<number[][]>;
};

function isUsableEmbedding(embedding: number[] | null | undefined): embedding is number[] {
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) return false;
  let nonzero = false;
  for (const value of embedding) {
    if (!Number.isFinite(value)) return false;
    nonzero ||= value !== 0;
  }
  return nonzero;
}

export async function embedKnowledgeChunks(
  domain: DomainContext,
  provider: KnowledgeEmbeddingProvider,
  businessId: string,
  chunks: string[],
): Promise<number[][]> {
  const uniqueTexts = [...new Set(chunks)];
  const vectors = new Map<string, number[]>();
  const { fingerprint } = provider;
  if (fingerprint && uniqueTexts.length > 0) {
    const hashesByText = new Map(uniqueTexts.map((text) => [text, hashContent(text)]));
    const hashes = [...new Set(hashesByText.values())];
    await withBusinessTransaction(domain.db, { businessId, actorType: "worker" }, async (tx) => {
      for (let start = 0; start < hashes.length; start += lookupBatchSize) {
        const rows = await tx.select({ content: knowledgeChunks.content, contentHash: knowledgeChunks.contentHash, embedding: knowledgeChunks.embedding })
          .from(knowledgeChunks)
          .where(and(
            eq(knowledgeChunks.businessId, businessId),
            eq(knowledgeChunks.embeddingFingerprint, fingerprint),
            eq(knowledgeChunks.embeddingStatus, "completed"),
            inArray(knowledgeChunks.contentHash, hashes.slice(start, start + lookupBatchSize)),
          ));
        for (const row of rows) {
          if (hashesByText.get(row.content) === row.contentHash && isUsableEmbedding(row.embedding)) {
            vectors.set(row.content, row.embedding);
          }
        }
      }
    });
  }

  const misses = uniqueTexts.filter((text) => !vectors.has(text));
  if (misses.length > 0) {
    const startedAt = performance.now();
    let usage: DurableAiUsage | undefined;
    let embeddings: number[][];
    try {
      embeddings = await provider.embed(misses, (reported) => { usage = reported; });
      embeddingDuration.record(performance.now() - startedAt, { provider: usage?.provider ?? "unknown" });
    } finally {
      if (usage) {
        await recordAiGenerationEvent(domain, { ...usage, businessId, operation: "knowledge.embed" }).catch(() => undefined);
      }
    }
    if (embeddings.length !== misses.length) throw new Error("Knowledge embedding provider returned an incomplete result.");
    for (const [index, text] of misses.entries()) {
      const embedding = embeddings[index];
      if (!isUsableEmbedding(embedding)) throw new Error("Knowledge embedding provider returned an incompatible vector.");
      vectors.set(text, embedding);
    }
  }
  return chunks.map((text) => vectors.get(text)!);
}
