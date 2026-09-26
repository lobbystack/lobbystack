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

import { createKnowledgeDocument, FULL_CRAWL_PAGE_LIMIT, ONBOARDING_CRAWL_PAGE_LIMIT } from "./knowledge";

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

  it("keeps the onboarding sample well below the full read", () => {
    expect(ONBOARDING_CRAWL_PAGE_LIMIT).toBeLessThan(FULL_CRAWL_PAGE_LIMIT);
  });
});
