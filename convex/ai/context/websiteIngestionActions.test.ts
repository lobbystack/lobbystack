import { describe, expect, it, vi } from "vitest";

import {
  isWebsiteDocumentInScope,
  resolveFirecrawlMarkdownContent,
} from "./websiteIngestionActions";

describe("websiteIngestionActions helpers", () => {
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
});
