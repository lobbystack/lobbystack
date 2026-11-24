import { randomUUID } from "node:crypto";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { checkKnowledgeStorageLimit, chunkText, embeddingInputsForChunk, hashContent, indexDocumentText, markKnowledgeDocumentFailed, recordAiGenerationEvent } from "@lobbystack/domain";
import type { KnowledgeEmbeddingProvider } from "./knowledgeEmbeddings";

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  lookup: vi.fn(async (..._args: unknown[]) => [] as Array<{ content: string; contentHash: string; embedding: number[] }>),
  scan: vi.fn(async () => [] as Array<{ id: string; documentId: string; sequence: number; content: string }>),
  update: vi.fn(async (..._args: unknown[]) => undefined),
  insert: vi.fn(async (..._args: unknown[]) => undefined),
  transactionActive: false,
}));

function transaction(scope: { businessId: string; actorType: string }) {
  const dialect = new PgDialect();
  return {
    selectDistinctOn: (_keys: unknown, _fields: unknown) => ({
      from: () => ({ where: (filter: SQL) => mocks.lookup(scope, dialect.sqlToQuery(filter).params) }),
    }),
    select(fields: Record<string, unknown>) {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: () => query,
        orderBy: () => query,
        for: async () => [],
        limit: () => "objectKey" in fields
          ? Promise.resolve([{ objectKey: "business/knowledge/scan.pdf", contentType: "application/pdf" }])
          : mocks.scan(),
      };
      return query;
    },
    update: () => ({ set: (values: unknown) => ({ where: (filter: SQL) => {
      const params = dialect.sqlToQuery(filter).params;
      const result = mocks.update(values, params);
      return Object.assign(result, { returning: async () => { await result; return [{ id: params[0] }]; } });
    } }) }),
    insert: () => ({ values: mocks.insert }),
  };
}

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  withBusinessTransaction: async (_db: unknown, scope: Parameters<typeof transaction>[0], callback: (tx: ReturnType<typeof transaction>) => unknown) => {
    mocks.transactionActive = true;
    try {
      return await callback(transaction(scope));
    } finally {
      mocks.transactionActive = false;
    }
  },
}));
vi.mock("@lobbystack/domain", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/domain")>(),
  markKnowledgeDocumentFailed: vi.fn(async () => true),
  checkKnowledgeStorageLimit: vi.fn(),
  indexDocumentText: vi.fn(),
  recordAiGenerationEvent: vi.fn(async () => "usage"),
  recordProductEvent: vi.fn(),
}));
vi.mock("./documentExtraction", () => ({ extractDocumentTextInThread: mocks.extract }));

import { handleJob } from "./handlers";

afterEach(() => { vi.resetAllMocks(); });

function job(businessId: string, documentId: string): JobEnvelope {
  return { jobId: randomUUID(), type: "knowledge.extractDocument", queue: "bulk", businessId, payload: { documentId }, trace: {}, idempotencyKey: `knowledge:${documentId}`, scheduled: false };
}

function testEmbeddings(embeddingFingerprint?: string) {
  const embed = vi.fn<KnowledgeEmbeddingProvider["embed"]>(async (values, onUsage) => {
    expect(mocks.transactionActive).toBe(false);
    await onUsage?.({ provider: "openai", model: "text-embedding-3-large", inputTokens: values.length, latencyMs: 5 });
    return values.map((_, index) => new Array<number>(1536).fill(index + 1));
  });
  return { ...(embeddingFingerprint ? { embeddingFingerprint } : {}), embed };
}

const domain = { db: {} as never };
const storage = { getObject: vi.fn(async () => new Uint8Array([1])) } as never;

describe("knowledge.extractDocument", () => {
  it("marks the document failed once the last attempt cannot extract its text", async () => {
    const businessId = randomUUID();
    const documentId = randomUUID();
    const dependencies = { domain: { db: {} as never }, storage: { getObject: vi.fn(async () => new Uint8Array([1])) } as never };
    mocks.extract.mockRejectedValue(new Error("Invalid PDF structure."));

    await expect(handleJob(job(businessId, documentId), dependencies, { isFinalAttempt: false })).rejects.toThrow("Invalid PDF structure.");
    expect(markKnowledgeDocumentFailed).not.toHaveBeenCalled();

    await expect(handleJob(job(businessId, documentId), dependencies, { isFinalAttempt: true })).rejects.toThrow("Invalid PDF structure.");
    expect(markKnowledgeDocumentFailed).toHaveBeenCalledWith(dependencies.domain, { businessId, documentId, error: "We couldn't read the text in this document." });
  });

  it("fails a document over the plan's text limit before paying to embed it", async () => {
    const businessId = randomUUID();
    const documentId = randomUUID();
    const embeddings = { embed: vi.fn(), embeddingFingerprint: "revision-1" };
    const dependencies = { domain: { db: {} as never }, storage: { getObject: vi.fn(async () => new Uint8Array([1])) } as never, embeddings };
    mocks.extract.mockResolvedValue("Staff list");
    vi.mocked(checkKnowledgeStorageLimit).mockResolvedValue("Knowledge storage limit reached. 5 MB of text is included on this plan.");

    await expect(handleJob(job(businessId, documentId), dependencies, { isFinalAttempt: false })).resolves.toEqual({ status: "completed", entityId: `${documentId}:0` });
    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(markKnowledgeDocumentFailed).toHaveBeenCalledWith(dependencies.domain, { businessId, documentId, error: "Knowledge storage limit reached. 5 MB of text is included on this plan." });
  });

  it("reuses embeddings for the same business and embedding fingerprint, then restores chunk order", async () => {
    const businessId = randomUUID();
    const otherBusinessId = randomUUID();
    const documentId = randomUUID();
    const texts = ["# Hours", "# Services", "# Hours", "# Contact", "# Services"];
    const originalText = texts.join("\n");
    let indexedRows: Array<{ content: string; contentHash: string; embedding: number[]; businessId: string; embeddingFingerprint: string | undefined }> = [];
    mocks.lookup.mockImplementation(async (_scope, params) => indexedRows.filter((row) => {
      const [lookupBusinessId, embeddingFingerprint, status] = params as unknown[];
      const [, texts] = (params as unknown[]).slice(-3) as [string[], string[], number];
      return row.businessId === lookupBusinessId && row.embeddingFingerprint === embeddingFingerprint && status === "completed" && texts.includes(row.content);
    }));
    vi.mocked(indexDocumentText).mockImplementation(async (_domain, input) => {
      const chunks = chunkText(input.text);
      indexedRows = chunks.map((content, index) => ({ content, contentHash: hashContent(content), embedding: input.embeddings[index]!, businessId: input.businessId, embeddingFingerprint: input.embeddingFingerprint }));
      return { chunkCount: chunks.length };
    });
    const importText = async (text: string, tenant: string, embeddingFingerprint: string) => {
      const embeddings = testEmbeddings(embeddingFingerprint);
      mocks.extract.mockResolvedValue(text);
      await handleJob(job(tenant, documentId), { domain, storage, embeddings });
      return embeddings.embed.mock.calls.map(([values]) => values);
    };

    expect(await importText(originalText, businessId, "revision-1")).toEqual([["# Hours", "# Services", "# Contact"]]);
    expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith(
      { businessId, actorType: "worker" },
      [businessId, "revision-1", "completed", ...["# Hours", "# Services", "# Contact"].map(hashContent),
        ["# Hours", "# Services", "# Contact"].map(hashContent), ["# Hours", "# Services", "# Contact"], 1536],
    );
    expect(indexedRows.map((row) => row.embedding[0])).toEqual([1, 2, 1, 3, 2]);
    expect(recordAiGenerationEvent).toHaveBeenCalledExactlyOnceWith(domain, expect.objectContaining({ operation: "knowledge.embed", inputTokens: 3, businessId }));
    vi.mocked(recordAiGenerationEvent).mockClear();
    expect(await importText(originalText, businessId, "revision-1")).toEqual([]);
    expect(recordAiGenerationEvent).not.toHaveBeenCalled();
    expect(await importText(originalText.replace("# Contact", "# Pricing"), businessId, "revision-1")).toEqual([["# Pricing"]]);
    expect(await importText(originalText, businessId, "revision-2")).toEqual([["# Hours", "# Services", "# Contact"]]);
    expect(await importText(originalText, otherBusinessId, "revision-2")).toEqual([["# Hours", "# Services", "# Contact"]]);
  });

  it("deduplicates without an embedding fingerprint and records provider usage even when chunk writeback fails", async () => {
    const businessId = randomUUID();
    const embeddings = testEmbeddings();
    mocks.extract.mockResolvedValue("# Hours\n# Hours\n# Services");
    vi.mocked(indexDocumentText).mockRejectedValue(new Error("write failed"));

    await expect(handleJob(job(businessId, randomUUID()), { domain, storage, embeddings })).rejects.toThrow("write failed");
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(embeddings.embed.mock.calls.map(([values]) => values)).toEqual([["# Hours", "# Services"]]);
    expect(recordAiGenerationEvent).toHaveBeenCalledExactlyOnceWith(domain, expect.objectContaining({ operation: "knowledge.embed", inputTokens: 2, businessId }));
  });

  it("treats a hash match with different text or an invalid stored vector as a miss", async () => {
    const businessId = randomUUID();
    const embeddings = testEmbeddings("revision-1");
    mocks.extract.mockResolvedValue("# Hours\n# Services\n# Contact");
    mocks.lookup.mockResolvedValue([
      { content: "# Different", contentHash: hashContent("# Hours"), embedding: new Array<number>(1536).fill(1) },
      { content: "# Services", contentHash: hashContent("# Services"), embedding: new Array<number>(1536).fill(0) },
      { content: "# Contact", contentHash: hashContent("# Contact"), embedding: new Array<number>(1536).fill(Infinity) },
    ]);
    vi.mocked(indexDocumentText).mockResolvedValue({ chunkCount: 3 });

    await handleJob(job(businessId, randomUUID()), { domain, storage, embeddings });
    expect(embeddings.embed.mock.calls.map(([values]) => values)).toEqual([["# Hours", "# Services", "# Contact"]]);
  });
});

describe("knowledge.reembedBusiness", () => {
  it("pairs each split part with its vector when the input rows arrive in ascending sequence", async () => {
    const businessId = randomUUID();
    const documentId = randomUUID();
    const legacyText = "hour ".repeat(2_000).trim();
    const parts = embeddingInputsForChunk(legacyText);
    expect(parts).toHaveLength(2);
    const [first, second] = parts;
    mocks.scan.mockResolvedValueOnce([
      { id: "first", documentId, sequence: 0, content: legacyText },
      { id: "last", documentId, sequence: 1, content: "Services" },
    ]).mockResolvedValueOnce([]);
    const embeddings = testEmbeddings("revision-2");
    mocks.lookup.mockResolvedValue([{ content: "Services", contentHash: hashContent("Services"), embedding: new Array<number>(1536).fill(7) }]);

    const result = await handleJob({ ...job(businessId, documentId), type: "knowledge.reembedBusiness" }, { domain, embeddings });
    expect(result).toEqual({ status: "completed", entityId: `${businessId}:2` });
    expect(embeddings.embed.mock.calls.map(([values]) => values)).toEqual([[first, second]]);
    const writes = mocks.update.mock.calls.filter(([values]) => "embedding" in (values as object));
    expect(writes).toEqual([
      [expect.objectContaining({ embedding: new Array<number>(1536).fill(7), embeddingFingerprint: "revision-2" }), ["last", businessId, 1, "Services"]],
      [expect.objectContaining({ content: first, embedding: new Array<number>(1536).fill(1), embeddingFingerprint: "revision-2" }), ["first", businessId, 0, legacyText]],
    ]);
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ content: second, documentId, sequence: 1, embedding: new Array<number>(1536).fill(2) }));
    expect(recordAiGenerationEvent).toHaveBeenCalledExactlyOnceWith(domain, expect.objectContaining({ operation: "knowledge.embed", inputTokens: 2, businessId }));
  });
});
