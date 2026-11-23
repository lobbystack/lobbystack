import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { businesses, createDatabaseClient, knowledgeChunks, knowledgeDocuments, type Database } from "@lobbystack/db";
import { hashContent } from "@lobbystack/domain";
import { createEmbeddingProvider, EMBEDDING_DIMENSIONS } from "@lobbystack/providers/ai/embeddingProvider";

import { embedKnowledgeChunks, enqueueStaleKnowledgeEmbeddings } from "./knowledgeEmbeddings";

const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Knowledge embedding tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

const vector = (value: number) => Array<number>(EMBEDDING_DIMENSIONS).fill(value);

describe.skipIf(!client)("knowledge embedding reuse against PostgreSQL", () => {
  it("queues another repair for a business that writes stale vectors after a sweep", async () => {
    const businessId = randomUUID();
    const fingerprint = "current";
    const add = vi.fn(async (_name: string, job: { businessId: string }, _options: { jobId: string; deduplication: { id: string } }) => job);
    const queue = { name: "bulk", add } as unknown as Parameters<typeof enqueueStaleKnowledgeEmbeddings>[1];
    const repairs = () => add.mock.calls.filter(([, job]) => job.businessId === businessId);
    const rollback = new Error("rollback test fixture");

    await expect(client!.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Re-embedding test", timezone: "UTC", businessType: "test" });
      const [document] = await tx.insert(knowledgeDocuments).values({ businessId, sourceType: "text", title: "Late import", status: "indexed" }).returning({ id: knowledgeDocuments.id });
      const insertStaleChunk = (sequence: number) => tx.insert(knowledgeChunks).values({
        businessId, documentId: document!.id, sequence, content: "late chunk", contentHash: hashContent("late chunk"),
        embedding: vector(0.25), embeddingFingerprint: "previous", embeddingStatus: "completed",
      });
      const reconcile = async () => {
        await tx.execute(sql`set local session authorization lobbystack_dispatcher`);
        await enqueueStaleKnowledgeEmbeddings(db, queue, fingerprint);
        await tx.execute(sql`reset session authorization`);
      };
      await reconcile();
      expect(repairs()).toHaveLength(0);

      await insertStaleChunk(0);
      await reconcile();
      expect(repairs()).toHaveLength(1);

      await tx.update(knowledgeChunks).set({ embeddingFingerprint: fingerprint }).where(eq(knowledgeChunks.businessId, businessId));
      await insertStaleChunk(1);
      await reconcile();
      expect(repairs()).toHaveLength(2);
      const [first, second] = repairs();
      expect(second![2].deduplication).toEqual(first![2].deduplication);
      expect(second![2].jobId).not.toBe(first![2].jobId);
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it("reuses current vectors for the same business and ignores vectors from the previous pipeline and other businesses", async () => {
    const localId = randomUUID();
    const foreignId = randomUUID();
    const config = { baseURL: "https://api.openai.com/v1", model: "text-embedding-3-small", providerName: "openai", dimensions: EMBEDDING_DIMENSIONS, revision: "custom" };
    const legacyFingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
    const { embeddingFingerprint } = createEmbeddingProvider({ OPENAI_API_KEY: "test", AI_EMBEDDING_MODEL: config.model, AI_EMBEDDING_REVISION: config.revision })!;
    const rollback = new Error("rollback test fixture");
    await expect(client!.db.transaction(async (tx) => {
      const seed = async (businessId: string, chunks: Array<{ content: string; fingerprint: string; embedding?: number[] }>) => {
        await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Knowledge cache test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
        const [document] = await tx.insert(knowledgeDocuments).values({ businessId, sourceType: "text", title: "Cache test", status: "indexed" }).returning({ id: knowledgeDocuments.id });
        await tx.insert(knowledgeChunks).values(chunks.map(({ content, fingerprint, embedding = vector(0.25) }, sequence) => ({
          businessId, documentId: document!.id, sequence, content, contentHash: hashContent(content), embedding, embeddingFingerprint: fingerprint, embeddingStatus: "completed",
        })));
      };

      await seed(localId, [
        { content: "local hit", fingerprint: embeddingFingerprint, embedding: vector(0) },
        { content: "local hit", fingerprint: embeddingFingerprint },
        { content: "local hit", fingerprint: embeddingFingerprint },
        { content: "legacy miss", fingerprint: legacyFingerprint },
      ]);
      await seed(foreignId, [{ content: "foreign miss", fingerprint: embeddingFingerprint }]);

      await tx.execute(sql`set local role lobbystack_worker`);
      const embed = vi.fn(async (texts: string[]) => texts.map(() => vector(0.5)));
      const result = await embedKnowledgeChunks({ db: tx as unknown as Database }, { embed, embeddingFingerprint }, localId, ["legacy miss", "local hit", "foreign miss", "local hit"]);
      expect(embed).toHaveBeenCalledTimes(1);
      expect(embed.mock.calls[0]?.[0]).toEqual(["legacy miss", "foreign miss"]);
      expect(result).toEqual([vector(0.5), vector(0.25), vector(0.5), vector(0.25)]);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
