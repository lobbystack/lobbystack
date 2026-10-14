import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { websiteIngestionJobs } from "@lobbystack/db";
import { indexCrawledWebsitePage, markKnowledgeDocumentFailed } from "@lobbystack/domain";

const mocks = vi.hoisted(() => ({ updates: [] as Array<{ table: unknown; set: Record<string, unknown> }> }));

/** Every query chains; the import reads as in progress and every update matches a row. */
function query(table?: unknown): unknown {
  const chain: unknown = new Proxy(function () {}, {
    get(_target, property) {
      if (property === "then") return (resolve: (rows: unknown[]) => unknown) => resolve([{ id: "row", revision: 0, status: "processing" }]);
      if (property === "set") return (set: Record<string, unknown>) => { mocks.updates.push({ table, set }); return chain; };
      return () => chain;
    },
  });
  return chain;
}

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  enqueueOutbox: vi.fn(),
  withBusinessTransaction: async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: () => query(), update: (table: unknown) => query(table) }),
}));
vi.mock("@lobbystack/domain", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/domain")>(),
  enqueueKnowledgeDerivedRefresh: vi.fn(),
  indexCrawledWebsitePage: vi.fn(),
  markKnowledgeDocumentFailed: vi.fn(async () => true),
  recordAiGenerationEvent: vi.fn(async () => undefined),
}));

import { handleJob } from "./handlers";

afterEach(() => { vi.clearAllMocks(); mocks.updates.length = 0; });

function crawl(): { job: JobEnvelope; documentId: string; dependencies: Parameters<typeof handleJob>[1] & { crawler: { crawl: ReturnType<typeof vi.fn> } } } {
  const documentId = randomUUID();
  const crawler = { crawl: vi.fn(async () => [{ url: "https://example.com/", markdown: "Home" }, { url: "https://example.com/hours", markdown: "Open 9 to 5." }]) };
  const embeddings = { embed: vi.fn(async (values: string[]) => values.map(() => [0.1])) };
  return {
    documentId,
    job: { jobId: randomUUID(), type: "knowledge.crawlWebsite", queue: "bulk", businessId: randomUUID(), payload: { url: "https://example.com/", documentId, revision: 0, websiteIngestionJobId: randomUUID() }, trace: {}, idempotencyKey: `knowledge:${documentId}:crawl`, scheduled: false },
    dependencies: { domain: { db: {} as never }, crawler, embeddings } as never,
  };
}

describe("knowledge.crawlWebsite", () => {
  it("keeps the pages that indexed when another page fails, without crawling again", async () => {
    const { job, dependencies } = crawl();
    vi.mocked(indexCrawledWebsitePage).mockRejectedValueOnce(new Error("Embedding provider timed out.")).mockResolvedValueOnce({ chunkCount: 1 });

    await expect(handleJob(job, dependencies, { isFinalAttempt: false })).resolves.toMatchObject({ status: "completed" });
    expect(dependencies.crawler.crawl).toHaveBeenCalledTimes(1);
    expect(markKnowledgeDocumentFailed).not.toHaveBeenCalled();
    expect(mocks.updates.find((update) => update.table === websiteIngestionJobs && update.set.status === "completed")?.set).toMatchObject({ indexedCount: 1, errorCount: 1 });
  });

  it("retries the job when every page fails, since that points at an outage", async () => {
    const { job, dependencies } = crawl();
    vi.mocked(indexCrawledWebsitePage).mockRejectedValue(new Error("Embedding provider timed out."));

    await expect(handleJob(job, dependencies, { isFinalAttempt: false })).rejects.toThrow("Embedding provider timed out.");
    expect(markKnowledgeDocumentFailed).not.toHaveBeenCalled();
  });

  it("fails the import on the last attempt when no page indexed", async () => {
    const { job, documentId, dependencies } = crawl();
    vi.mocked(indexCrawledWebsitePage).mockRejectedValue(new Error("Embedding provider timed out."));

    await expect(handleJob(job, dependencies, { isFinalAttempt: true })).resolves.toMatchObject({ status: "completed" });
    expect(markKnowledgeDocumentFailed).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ documentId, error: "We couldn't index any page of this website." }));
  });
});
