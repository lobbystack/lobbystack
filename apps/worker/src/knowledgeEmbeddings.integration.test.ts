import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { businesses, createDatabaseClient, knowledgeChunks, knowledgeDocuments, type Database } from "@lobbystack/db";
import { embeddingInputsForChunk, hashContent } from "@lobbystack/domain";
import { createEmbeddingProvider, EMBEDDING_DIMENSIONS } from "@lobbystack/providers/ai/embeddingProvider";

import { handleJob } from "./handlers";
import { embedKnowledgeChunks, enqueueStaleKnowledgeEmbeddings, type KnowledgeEmbeddingProvider } from "./knowledgeEmbeddings";

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
    const add = vi.fn(async (_name: string, _job: { businessId: string }, options: { jobId: string; deduplication: { id: string } }) => ({ id: options.jobId }));
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

  it("splits an oversized chunk once when two fingerprints embed the same source row", async () => {
    const businessId = randomUUID();
    const worker = createDatabaseClient("lobbystack_worker", {
      DATABASE_URL: testUrl!,
      LOBBYSTACK_WORKER_PASSWORD: process.env.LOBBYSTACK_WORKER_PASSWORD ?? "worker",
    });
    const legacyText = "hour ".repeat(2_000).trim();
    const parts = embeddingInputsForChunk(legacyText);
    expect(parts).toHaveLength(2);
    const tail = "Services";
    let markCurrentRead!: () => void;
    let releaseCurrent!: () => void;
    const currentRead = new Promise<void>((resolve) => { markCurrentRead = resolve; });
    const currentWrite = new Promise<void>((resolve) => { releaseCurrent = resolve; });
    const embedPrevious = vi.fn<KnowledgeEmbeddingProvider["embed"]>(async (texts) => {
      await currentRead;
      return texts.map(() => vector(0.25));
    });
    const embedCurrent = vi.fn<KnowledgeEmbeddingProvider["embed"]>(async (texts) => {
      markCurrentRead();
      await currentWrite;
      return texts.map(() => vector(0.5));
    });
    const repair = (embeddingFingerprint: string, embed: KnowledgeEmbeddingProvider["embed"]) => {
      const jobId = randomUUID();
      const job: JobEnvelope = {
        jobId, type: "knowledge.reembedBusiness", queue: "bulk", businessId,
        payload: { fingerprint: embeddingFingerprint }, trace: {}, idempotencyKey: jobId, scheduled: false,
      };
      return handleJob(job, { domain: { db: worker.db }, embeddings: { embeddingFingerprint, embed } });
    };
    const repairs: Array<ReturnType<typeof repair>> = [];
    try {
      await client!.db.transaction(async (tx) => {
        await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Concurrent repair", timezone: "UTC", businessType: "test", telemetryEnabled: false });
        const [document] = await tx.insert(knowledgeDocuments).values({ businessId, sourceType: "text", title: "Legacy chunks", status: "indexed" }).returning({ id: knowledgeDocuments.id });
        await tx.insert(knowledgeChunks).values([legacyText, tail].map((content, sequence) => ({
          businessId, documentId: document!.id, content, sequence, contentHash: hashContent(content),
          embedding: vector(0.125), embeddingFingerprint: "legacy", embeddingStatus: "completed",
        })));
      });
      const previous = repair("previous", embedPrevious);
      const current = repair("current", embedCurrent);
      repairs.push(previous, current);
      // Both jobs are past the initial scan before the first writeback. The
      // current repair writes second, when its oversized source is stale.
      await Promise.race(repairs);
      expect(embedPrevious.mock.calls[0]?.[0]).toEqual([tail, ...parts]);
      expect(embedCurrent.mock.calls[0]?.[0]).toEqual([tail, ...parts]);
      releaseCurrent();
      await current;

      const chunks = await client!.db.select({
        content: knowledgeChunks.content,
        sequence: knowledgeChunks.sequence,
        embedding: knowledgeChunks.embedding,
        embeddingFingerprint: knowledgeChunks.embeddingFingerprint,
        embeddingStatus: knowledgeChunks.embeddingStatus,
      }).from(knowledgeChunks).where(eq(knowledgeChunks.businessId, businessId)).orderBy(knowledgeChunks.sequence);
      expect(chunks).toEqual([...parts, tail].map((content, sequence) => ({
        content, sequence, embedding: vector(0.5), embeddingFingerprint: "current", embeddingStatus: "completed",
      })));
    } finally {
      markCurrentRead();
      releaseCurrent();
      await Promise.allSettled(repairs);
      await worker.pool.end();
      await client!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  }, 15_000);
});
