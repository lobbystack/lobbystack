import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  enqueueOutbox: vi.fn(),
  requireBusinessAdmin: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));

vi.mock("../authz", async (original) => ({
  ...(await original<typeof import("../authz")>()),
  requireBusinessAdmin: mocks.requireBusinessAdmin,
}));

/** Rows written to website_ingestion_jobs, so a test can read the recorded cap. */
const written: Record<string, unknown>[] = [];

function recordingBuilder(rows: Record<string, unknown>[]): unknown {
  const chain: unknown = new Proxy(function () {} as unknown as Record<string | symbol, unknown>, {
    get(_target, property) {
      if (property === "then") return (resolve: (value: unknown) => unknown) => resolve(rows);
      if (property === "values") return (value: Record<string, unknown>) => { if ("pageLimit" in value) written.push(value); return chain; };
      if (property === "onConflictDoUpdate") return (config: { set?: Record<string, unknown> }) => { if (config?.set && "pageLimit" in config.set) written.push(config.set); return chain; };
      return () => chain;
    },
    apply: () => chain,
  });
  return chain;
}

import { businesses } from "@lobbystack/db";

import { cancelKnowledgeDocument, createKnowledgeDocument, createKnowledgeDocumentInTransaction, deleteKnowledgeDocument, deleteKnowledgeSnippet, expandWebsiteCrawl, FULL_CRAWL_PAGE_LIMIT, ONBOARDING_CRAWL_PAGE_LIMIT, retryKnowledgeDocument, setKnowledgeDocumentActive, updateKnowledgeSnippet } from "./knowledge";

const context = { db: {} as never };

/** A drizzle builder: every method chains, and awaiting it yields these rows. */
function builder(rows: Record<string, unknown>[]): unknown {
  const chain: unknown = new Proxy(function () {} as unknown as Record<string | symbol, unknown>, {
    get(_target, property) {
      if (property === "then") return (resolve: (value: unknown) => unknown) => resolve(rows);
      return () => chain;
    },
    apply: () => chain,
  });
  return chain;
}

/**
 * Selects find nothing, so the code takes its create path rather than reusing an
 * existing import; inserts hand back the new row.
 */
function transactionReturning(rows: Record<string, unknown>[]) {
  return {
    select: () => builder([]),
    insert: () => builder(rows),
    update: () => builder([]),
    execute: () => builder([]),
  };
}

async function createWebsiteDocument(onboarding: boolean | undefined) {
  mocks.enqueueOutbox.mockClear();
  const tx = transactionReturning([{ id: "doc_1" }]);
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _input: unknown, run: (tx: unknown) => Promise<unknown>) => await run(tx));
  await createKnowledgeDocument(context, {
    userId: "user_1",
    businessId: "biz_1",
    title: "https://example.com",
    sourceType: "website",
    sourceUrl: "https://example.com",
    ...(onboarding === undefined ? {} : { onboarding }),
  });
  return mocks.enqueueOutbox.mock.calls.at(-1)?.[1] as { topic: string; payload: Record<string, unknown> } | undefined;
}

/**
 * The reuse path: the business is mid-onboarding and an earlier crawl of the
 * same URL failed, so the submission retries that document instead of making
 * another one.
 */
async function retryFailedWebsiteDocument(onboarding: boolean) {
  mocks.enqueueOutbox.mockClear();
  const selected = [
    [{ onboardingStage: "knowledge" }],
    [{ id: "doc_1", sourceType: "website", sourceUrl: "https://example.com", revision: 2, status: "error" }],
  ];
  let call = 0;
  const tx = {
    select: () => builder(selected[call++] ?? []),
    insert: () => builder([{ id: "job_1" }]),
    update: () => builder([]),
    execute: () => builder([]),
  };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _input: unknown, run: (tx: unknown) => Promise<unknown>) => await run(tx));
  await createKnowledgeDocument(context, {
    userId: "user_1",
    businessId: "biz_1",
    title: "https://example.com",
    sourceType: "website",
    sourceUrl: "https://example.com",
    onboarding,
  });
  return mocks.enqueueOutbox.mock.calls.at(-1)?.[1] as { topic: string; payload: Record<string, unknown> } | undefined;
}

describe("website crawl page limits", () => {
  it("samples a site during onboarding, because most people never finish and every page is billed", async () => {
    const job = await createWebsiteDocument(true);
    expect(job?.topic).toBe("knowledge.crawlWebsite");
    expect(job?.payload.limit).toBe(ONBOARDING_CRAWL_PAGE_LIMIT);
  });

  it("reads the whole site when the import is started from the dashboard", async () => {
    const job = await createWebsiteDocument(false);
    expect(job?.payload.limit).toBe(FULL_CRAWL_PAGE_LIMIT);
  });

  it("treats an unflagged import as a dashboard import", async () => {
    const job = await createWebsiteDocument(undefined);
    expect(job?.payload.limit).toBe(FULL_CRAWL_PAGE_LIMIT);
  });

  it("still samples when onboarding retries a crawl that failed", async () => {
    const job = await retryFailedWebsiteDocument(true);
    expect(job?.topic).toBe("knowledge.crawlWebsite");
    expect(job?.payload.limit).toBe(ONBOARDING_CRAWL_PAGE_LIMIT);
  });

  it("reads the whole site when the dashboard retries a crawl that failed", async () => {
    const job = await retryFailedWebsiteDocument(false);
    expect(job?.payload.limit).toBe(FULL_CRAWL_PAGE_LIMIT);
  });

  it("records the cap it crawled with, because the page count cannot tell a sample from a full read", async () => {
    written.length = 0;
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _input: unknown, run: (tx: unknown) => Promise<unknown>) => await run({
      select: () => recordingBuilder([]),
      insert: () => recordingBuilder([{ id: "doc_1" }]),
      update: () => recordingBuilder([]),
      execute: () => recordingBuilder([]),
    }));
    await createKnowledgeDocument(context, { userId: "user_1", businessId: "biz_1", title: "https://example.com", sourceType: "website", sourceUrl: "https://example.com", onboarding: true });
    expect(written.at(0)?.pageLimit).toBe(ONBOARDING_CRAWL_PAGE_LIMIT);
  });

  it("rewrites the cap when the operator asks for the rest, so the guide step stays done", async () => {
    written.length = 0;
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _input: unknown, run: (tx: unknown) => Promise<unknown>) => await run({
      select: () => recordingBuilder([{ id: "doc_1", sourceType: "website", sourceUrl: "https://example.com", revision: 1 }]),
      insert: () => recordingBuilder([{ id: "job_1" }]),
      update: () => recordingBuilder([]),
      execute: () => recordingBuilder([]),
    }));
    await expandWebsiteCrawl(context, { userId: "user_1", businessId: "biz_1", documentId: "doc_1" });
    // The expansion reuses the ingestion row, so the update has to carry the cap
    // too; leaving the sample value behind reopens the step after every read.
    expect(written.every(row => row.pageLimit === FULL_CRAWL_PAGE_LIMIT)).toBe(true);
    expect(written.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the onboarding sample well below the full read", () => {
    expect(ONBOARDING_CRAWL_PAGE_LIMIT).toBeLessThan(FULL_CRAWL_PAGE_LIMIT);
  });

  it("samples a site the API adds without making it the business's website", async () => {
    mocks.enqueueOutbox.mockClear();
    const updated: unknown[] = [];
    const selected = [[{ onboardingStage: "knowledge" }], []];
    let call = 0;
    const tx = {
      select: () => builder(selected[call++] ?? []),
      insert: () => builder([{ id: "doc_1" }]),
      update: (table: unknown) => { updated.push(table); return builder([]); },
      execute: () => builder([]),
    };
    await createKnowledgeDocumentInTransaction(tx as never, { businessId: "biz_1", title: "https://example.com", sourceUrl: "https://example.com", sample: true });
    const job = mocks.enqueueOutbox.mock.calls.at(-1)?.[1] as { topic: string; payload: Record<string, unknown> } | undefined;
    expect(job?.topic).toBe("knowledge.crawlWebsite");
    expect(job?.payload.limit).toBe(ONBOARDING_CRAWL_PAGE_LIMIT);
    expect(updated).not.toContain(businesses);
  });
});

describe("dashboard knowledge actions", () => {
  it.each([
    ["create", () => createKnowledgeDocument(context, { userId: "user_1", businessId: "biz_1", title: "https://example.com", sourceType: "website", sourceUrl: "https://example.com" })],
    ["retry", () => retryKnowledgeDocument(context, { userId: "user_1", businessId: "biz_1", documentId: "doc_1" })],
    ["expand", () => expandWebsiteCrawl(context, { userId: "user_1", businessId: "biz_1", documentId: "doc_1" })],
    ["cancel", () => cancelKnowledgeDocument(context, { userId: "user_1", businessId: "biz_1", documentId: "doc_1" })],
  ])("still checks the person is an owner or admin before they %s", async (_action, run) => {
    mocks.requireBusinessAdmin.mockReset();
    mocks.requireBusinessAdmin.mockRejectedValueOnce(Object.assign(new Error("You do not have access to this business."), { status: 403 }));
    const tx = transactionReturning([{ id: "doc_1" }]);
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _input: unknown, work: (tx: unknown) => Promise<unknown>) => await work(tx));
    await expect(run()).rejects.toMatchObject({ status: 403 });
    expect(mocks.requireBusinessAdmin).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: "user_1", businessId: "biz_1" }));
  });
});

describe("dashboard knowledge edits", () => {
  // Every statement finds nothing, as when the document or snippet is gone.
  const nothing = { select: () => builder([]), insert: () => builder([]), update: () => builder([]), delete: () => builder([]), execute: () => builder([]) };

  it.each([
    ["turns a document off", () => setKnowledgeDocumentActive(context, { userId: "user_1", businessId: "biz_1", documentId: "doc_1", active: false }), { message: "Knowledge document not found.", status: 404 }],
    ["deletes a document", () => deleteKnowledgeDocument(context, { userId: "user_1", businessId: "biz_1", documentId: "doc_1" }), { message: "Knowledge document not found." }],
    ["edits a snippet", () => updateKnowledgeSnippet(context, { userId: "user_1", businessId: "biz_1", snippetId: "snippet_1", title: "Parking" }), { message: "Knowledge snippet not found." }],
    ["deletes a snippet", () => deleteKnowledgeSnippet(context, { userId: "user_1", businessId: "biz_1", snippetId: "snippet_1" }), { message: "Knowledge snippet not found." }],
  ] as const)("checks the person is an owner or admin, and keeps its error, when it %s that isn't there", async (_action, run, expected) => {
    mocks.requireBusinessAdmin.mockReset();
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _input: unknown, work: (tx: unknown) => Promise<unknown>) => await work(nothing));
    const error = await run().then(() => null, (value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject(expected);
    // Only turning a document off answers 404; the others stay errors without a status, as before.
    if (!("status" in expected)) expect(error).not.toHaveProperty("status");
    expect(mocks.requireBusinessAdmin).toHaveBeenCalledWith(nothing, expect.objectContaining({ userId: "user_1", businessId: "biz_1" }));
  });
});
