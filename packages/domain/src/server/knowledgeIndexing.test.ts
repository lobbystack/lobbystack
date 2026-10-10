import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  plan: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: vi.fn(),
}));
vi.mock("../authz", async (original) => ({ ...(await original<typeof import("../authz")>()), requireBusinessAdmin: vi.fn() }));
vi.mock("./businessHours", async (original) => ({ ...(await original<typeof import("./businessHours")>()), enqueueKnowledgeDerivedRefresh: vi.fn() }));
vi.mock("./contentRetentionPolicy", async (original) => ({ ...(await original<typeof import("./contentRetentionPolicy")>()), resolveBusinessBillingPlan: mocks.plan }));
vi.mock("./productEvents", () => ({ recordProductEvent: vi.fn(), recordProductEventBestEffort: vi.fn() }));

import { businesses, knowledgeChunks, knowledgeDocuments, storageObjects } from "@lobbystack/db";
import { checkKnowledgeStorageLimit, createKnowledgeDocument, deleteKnowledgeDocument, indexCrawledWebsitePage, indexDocumentText } from "./knowledge";

type Query = { kind: "select" | "insert" | "update" | "delete"; table?: unknown; values?: Record<string, unknown>; set?: Record<string, unknown>; lock?: string };

const context = { db: {} as never };
let queries: Query[];

/** Records every query; awaiting one yields the rows `rowsFor` picks for it. */
function useTransaction(rowsFor: (query: Query) => unknown[]) {
  queries = [];
  const start = (kind: Query["kind"]) => (table?: unknown) => {
    const query: Query = kind === "select" ? { kind } : { kind, table };
    queries.push(query);
    const chain: unknown = new Proxy(function () {}, {
      get(_target, property) {
        if (property === "then") return (resolve: (rows: unknown[]) => unknown) => resolve(rowsFor(query));
        return (argument: unknown) => {
          if (property === "from") query.table = argument;
          if (property === "values") query.values = argument as Record<string, unknown>;
          if (property === "set") query.set = argument as Record<string, unknown>;
          if (property === "for") query.lock = argument as string;
          return chain;
        };
      },
    });
    return chain;
  };
  const tx = { select: start("select"), insert: start("insert"), update: start("update"), delete: start("delete") };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, run: (tx: unknown) => Promise<unknown>) => await run(tx));
}

/** An import in progress at revision 3; a crawled page gets an id from its URL. */
function crawlRows(query: Query): unknown[] {
  if (query.kind === "select" && query.table === knowledgeDocuments) return [{ id: "root", status: "processing", revision: 3 }];
  if (query.kind === "insert" && query.table === knowledgeDocuments) return [{ id: `page:${String(query.values?.sourceUrl)}` }];
  return [];
}

const page = { businessId: "biz_1", documentId: "root", text: "Open 9 to 5.", embeddings: [[0.1]], sourceRevision: 3, title: "Hours" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plan.mockResolvedValue("self_host");
});

describe("indexing crawled website pages", () => {
  it("keeps ?page_id= pages apart instead of saving them over the root", async () => {
    useTransaction(crawlRows);
    await indexCrawledWebsitePage(context, { ...page, sourceUrl: "https://example.com/?page_id=2" });
    await indexCrawledWebsitePage(context, { ...page, sourceUrl: "https://example.com/?page_id=7#top" });

    const saved = queries.filter((query) => query.kind === "insert" && query.table === knowledgeDocuments).map((query) => query.values?.sourceUrl);
    expect(saved).toEqual(["https://example.com/?page_id=2", "https://example.com/?page_id=7"]);
  });

  it("locks the business row before any document, so concurrent jobs see each other's text", async () => {
    useTransaction(crawlRows);
    await indexCrawledWebsitePage(context, { ...page, sourceUrl: "https://example.com/hours" });
    expect(queries[0]).toEqual({ kind: "select", table: businesses, lock: "no key update" });

    useTransaction(crawlRows);
    await indexDocumentText(context, { businessId: "biz_1", documentId: "upload", text: "Open 9 to 5.", embeddings: [[0.1]] });
    expect(queries[0]).toEqual({ kind: "select", table: businesses, lock: "no key update" });
  });
});

describe("indexing a large document", () => {
  it("writes its chunks in slices that stay under Postgres's bind limit", async () => {
    useTransaction(() => [{ id: "upload", status: "processing", revision: 1 }]);
    const sections = Array.from({ length: 2_500 }, (_, index) => `## Question ${index}\nAnswer ${index}.`);
    await indexDocumentText(context, { businessId: "biz_1", documentId: "upload", text: sections.join("\n\n"), embeddings: sections.map(() => [0.1]) });

    const inserts = queries.filter((query) => query.kind === "insert" && query.table === knowledgeChunks).map((query) => query.values as unknown as Array<{ sequence: number }>);
    expect(inserts.map((rows) => rows.length)).toEqual([1_000, 1_000, 500]);
    expect(inserts.flat().map((row) => row.sequence)).toEqual(sections.map((_, index) => index));
  });
});

describe("knowledge storage limit before embedding", () => {
  it("returns the plan's message when the text can't fit next to what is stored", async () => {
    mocks.plan.mockResolvedValue("free_cloud");
    useTransaction((query) => query.table === knowledgeChunks ? [{ bytes: 1024 * 1024 - 5 }] : []);
    await expect(checkKnowledgeStorageLimit(context, { businessId: "biz_1", documentId: "upload", text: "123456" })).resolves.toMatch(/^Knowledge storage limit reached\./);
    await expect(checkKnowledgeStorageLimit(context, { businessId: "biz_1", documentId: "upload", text: "12345" })).resolves.toBeUndefined();
  });
});

describe("deleting a knowledge document", () => {
  it("expires the uploaded file so downloads stop and the sweep deletes it", async () => {
    useTransaction((query) => query.kind === "delete" && query.table === knowledgeDocuments ? [{ id: "doc", storageObjectId: "object" }] : []);
    await deleteKnowledgeDocument(context, { userId: "user_1", businessId: "biz_1", documentId: "doc" });

    const expiry = queries.find((query) => query.kind === "update" && query.table === storageObjects)?.set?.retentionUntil;
    expect(expiry).toBeInstanceOf(Date);
    expect((expiry as Date).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("creating a knowledge document", () => {
  it("answers 400 for anything but a website", async () => {
    useTransaction(() => []);
    await expect(createKnowledgeDocument(context, { userId: "user_1", businessId: "biz_1", title: "Policy", sourceType: "upload" })).rejects.toMatchObject({ status: 400 });
    expect(queries.some((query) => query.kind === "insert")).toBe(false);
  });
});
