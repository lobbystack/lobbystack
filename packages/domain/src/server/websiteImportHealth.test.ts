import { describe, expect, it } from "vitest";

import { isWebsiteImportStalled, WEBSITE_IMPORT_CRAWLING_MS, WEBSITE_IMPORT_INDEXING_MS, WEBSITE_IMPORT_QUEUED_MS, WEBSITE_IMPORT_UNDISPATCHED_MS, withWebsiteImportHealth } from "./websiteImportHealth";

const now = Date.parse("2026-11-11T12:00:00.000Z");
const ago = (ms: number) => new Date(now - ms);

describe("whether a website crawl stalled", () => {
  it("catches a crawl the outbox never handed to the queue within a minute, as when the worker is down", () => {
    const job = { status: "queued", updatedAt: ago(WEBSITE_IMPORT_UNDISPATCHED_MS + 1_000), dispatch: { createdAt: ago(WEBSITE_IMPORT_UNDISPATCHED_MS + 1_000), publishedAt: null } };
    expect(isWebsiteImportStalled(job, now)).toBe(true);
    expect(isWebsiteImportStalled({ ...job, dispatch: { createdAt: ago(30_000), publishedAt: null } }, now)).toBe(false);
  });

  it("reads the outbox's timestamps as the JSON strings Postgres returns", () => {
    expect(isWebsiteImportStalled({ status: "queued", updatedAt: ago(90_000).toISOString(), dispatch: { createdAt: ago(90_000).toISOString(), publishedAt: null } }, now)).toBe(true);
  });

  it("gives a crawl in the queue five minutes from when the dispatcher sent it on", () => {
    const queued = { status: "queued", updatedAt: ago(WEBSITE_IMPORT_QUEUED_MS + 60_000) };
    expect(isWebsiteImportStalled(queued, now)).toBe(true);
    expect(isWebsiteImportStalled({ ...queued, dispatch: { createdAt: queued.updatedAt, publishedAt: ago(60_000) } }, now)).toBe(false);
    expect(isWebsiteImportStalled({ ...queued, updatedAt: ago(WEBSITE_IMPORT_QUEUED_MS - 1_000) }, now)).toBe(false);
  });

  it("catches a crawl that started and then wrote nothing for longer than the provider allows", () => {
    expect(isWebsiteImportStalled({ status: "crawling", updatedAt: ago(WEBSITE_IMPORT_CRAWLING_MS + 1_000) }, now)).toBe(true);
    expect(isWebsiteImportStalled({ status: "indexing", updatedAt: ago(WEBSITE_IMPORT_INDEXING_MS + 1_000) }, now)).toBe(true);
  });

  it("leaves a long crawl alone while it keeps reporting progress", () => {
    // Waiting on Firecrawl's five minutes, or indexing a page a minute ago.
    expect(isWebsiteImportStalled({ status: "crawling", updatedAt: ago(6 * 60_000) }, now)).toBe(false);
    expect(isWebsiteImportStalled({ status: "indexing", updatedAt: ago(60_000) }, now)).toBe(false);
  });

  it("recovers as soon as the worker picks the crawl up and writes progress", () => {
    const stuck = { status: "queued", updatedAt: ago(20 * 60_000), dispatch: { createdAt: ago(20 * 60_000), publishedAt: null } };
    expect(isWebsiteImportStalled(stuck, now)).toBe(true);
    expect(isWebsiteImportStalled({ status: "crawling", updatedAt: ago(1_000) }, now)).toBe(false);
  });

  it("never calls a finished, failed or cancelled crawl stalled", () => {
    for (const status of ["completed", "failed", "cancelled", "unavailable"]) expect(isWebsiteImportStalled({ status, updatedAt: ago(86_400_000) }, now)).toBe(false);
  });

  it("swaps the clock for the answer, so the dashboard gets a summary without timestamps", () => {
    expect(withWebsiteImportHealth({ status: "crawling", websiteUrl: "https://example.com/", updatedAt: ago(WEBSITE_IMPORT_CRAWLING_MS + 1_000), dispatch: null }, now)).toEqual({ status: "crawling", websiteUrl: "https://example.com/", stalled: true });
    expect(withWebsiteImportHealth(null, now)).toBeNull();
  });
});
