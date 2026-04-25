import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isWebsiteDocumentInScope,
  resolveRunningWebsiteCrawlStatus,
  resolveFirecrawlMarkdownContent,
  startOrReuseFirecrawlScrapeJob,
} from "./websiteIngestionActions";

describe("websiteIngestionActions helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats only same-site website documents as in scope", () => {
    expect(
      isWebsiteDocumentInScope({
        sourceUrl: "https://example.com/about",
        websiteUrl: "https://example.com",
      }),
    ).toBe(true);

    expect(
      isWebsiteDocumentInScope({
        sourceUrl: "https://other.com/menu",
        websiteUrl: "https://example.com",
      }),
    ).toBe(false);
  });

  it("returns inline Firecrawl markdown without fetching a file", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      resolveFirecrawlMarkdownContent(
        {
          markdown: "# About\nInline copy",
          markdownFileUrl: "https://storage.example.com/inline-should-not-be-fetched.md",
        },
        fetchMock,
      ),
    ).resolves.toBe("# About\nInline copy");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads Firecrawl markdown from file storage when inline markdown is omitted", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      text: async () => "# Menu\nFile-backed copy",
    } as Response);

    await expect(
      resolveFirecrawlMarkdownContent(
        {
          markdownFileUrl: "https://storage.example.com/markdown.md",
        },
        fetchMock,
      ),
    ).resolves.toBe("# Menu\nFile-backed copy");

    expect(fetchMock).toHaveBeenCalledWith("https://storage.example.com/markdown.md");
  });

  it("throws when Firecrawl file-backed markdown cannot be fetched", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    await expect(
      resolveFirecrawlMarkdownContent(
        {
          markdownFileUrl: "https://storage.example.com/markdown.md",
        },
        fetchMock,
      ),
    ).rejects.toThrow("Failed to fetch Firecrawl markdown file (503 Service Unavailable).");
  });

  it("marks running crawls stalled when provider progress stops", () => {
    const nowMs = Date.parse("2026-04-25T18:00:00.000Z");

    expect(
      resolveRunningWebsiteCrawlStatus({
        status: "running",
        startedAt: "2026-04-25T17:00:00.000Z",
        lastProgressAt: "2026-04-25T17:29:59.999Z",
        nowMs,
      }),
    ).toBe("stalled");
  });

  it("marks running crawls timed out when total runtime exceeds the hard limit", () => {
    const nowMs = Date.parse("2026-04-25T18:00:00.000Z");

    expect(
      resolveRunningWebsiteCrawlStatus({
        status: "running",
        startedAt: "2026-04-25T15:59:59.999Z",
        lastProgressAt: "2026-04-25T17:45:00.000Z",
        nowMs,
      }),
    ).toBe("timed_out");
  });

  it("reuses an in-flight Firecrawl scrape for the same page", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue({
        _id: "scrape_pending",
        status: "scraping",
        expiresAt: Date.now() + 60_000,
        formats: ["markdown"],
      }),
      runMutation: vi.fn(),
    };

    await expect(
      startOrReuseFirecrawlScrapeJob(
        ctx as unknown as Parameters<typeof startOrReuseFirecrawlScrapeJob>[0],
        "https://example.com/about",
      ),
    ).resolves.toEqual({ jobId: "scrape_pending" });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("starts Firecrawl scrapes without forcing cache invalidation", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "test-firecrawl-key");
    const ctx = {
      runQuery: vi.fn().mockResolvedValue(null),
      runMutation: vi.fn().mockResolvedValue({ jobId: "scrape_new" }),
    };

    await expect(
      startOrReuseFirecrawlScrapeJob(
        ctx as unknown as Parameters<typeof startOrReuseFirecrawlScrapeJob>[0],
        "https://example.com/menu",
      ),
    ).resolves.toEqual({ jobId: "scrape_new" });

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.not.objectContaining({
          force: expect.anything(),
        }),
      }),
    );
  });

  it("recovers when another import creates the scrape job first", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "test-firecrawl-key");
    const ctx = {
      runQuery: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          _id: "scrape_raced",
          status: "pending",
          expiresAt: Date.now() + 60_000,
          formats: ["markdown"],
        }),
      runMutation: vi.fn().mockRejectedValue(new Error("Scrape already in progress for this URL.")),
    };

    await expect(
      startOrReuseFirecrawlScrapeJob(
        ctx as unknown as Parameters<typeof startOrReuseFirecrawlScrapeJob>[0],
        "https://example.com/contact",
      ),
    ).resolves.toEqual({ jobId: "scrape_raced" });
  });
});
