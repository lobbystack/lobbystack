import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { knowledgeChunks, withBusinessTransaction } from "@lobbystack/db";
import { hashContent, recordAiGenerationEvent, type DomainContext, type DurableAiUsage } from "@lobbystack/domain";
import { EMBEDDING_DIMENSIONS, type OpenAiCompatibleEmbeddingProvider } from "@lobbystack/providers/ai/embeddingProvider";
import { getMeter } from "@lobbystack/telemetry/node";

const embeddingDuration = getMeter("lobbystack-rag").createHistogram("rag.embedding.duration_ms", { unit: "ms" });
const LOOKUP_BATCH_SIZE = 1_000;

export type KnowledgeEmbeddingProvider = Pick<OpenAiCompatibleEmbeddingProvider, "embed"> & {
  readonly embeddingFingerprint?: string;
};

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
    const hashesByText = new Map(uniqueTexts.map((text) => [text, hashContent(text)]));
    const hashes = [...new Set(hashesByText.values())];
    for (let start = 0; start < hashes.length; start += LOOKUP_BATCH_SIZE) {
      const rows = await tx.select({
        content: knowledgeChunks.content,
        contentHash: knowledgeChunks.contentHash,
        embedding: knowledgeChunks.embedding,
      }).from(knowledgeChunks).where(and(
        eq(knowledgeChunks.businessId, businessId),
        eq(knowledgeChunks.embeddingFingerprint, embeddingFingerprint),
        eq(knowledgeChunks.embeddingStatus, "completed"),
        isNotNull(knowledgeChunks.embedding),
        inArray(knowledgeChunks.contentHash, hashes.slice(start, start + LOOKUP_BATCH_SIZE)),
      ));
      for (const { content, contentHash, embedding } of rows) {
        if (hashesByText.get(content) !== contentHash || vectorsByText.has(content)) continue;
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
