import { afterEach, describe, expect, it, vi } from "vitest";
import { CrawlRequestError, FirecrawlProvider } from "./firecrawl";

vi.mock("./urlSafety", () => ({ assertPublicHttpUrl: async (url: string) => new URL(url) }));

afterEach(() => vi.unstubAllGlobals());

function responses(...payloads: unknown[]) {
  const fetcher = vi.fn();
  for (const payload of payloads) fetcher.mockResolvedValueOnce(new Response(JSON.stringify(payload)));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const provider = () => new FirecrawlProvider({ apiKey: "test-key", pollIntervalMs: 0 });
const page = (url: string) => ({ metadata: { sourceURL: url, title: "Page" }, markdown: "Content" });

describe("FirecrawlProvider", () => {
  it("waits for completion and collects paginated results", async () => {
    const fetcher = responses(
      { success: true, id: "job" },
      { status: "scraping", data: [] },
      { status: "completed", data: [page("https://example.com/")], next: "https://api.firecrawl.dev/v1/crawl/job?skip=1" },
      { status: "completed", data: [page("https://example.com/about")] },
    );
    expect(await provider().crawl({ url: "https://example.com" })).toEqual([
      { url: "https://example.com/", title: "Page", markdown: "Content" },
      { url: "https://example.com/about", title: "Page", markdown: "Content" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[0]?.[1].method).toBe("POST");
    expect(fetcher.mock.calls[1]?.[1].method).toBe("GET");
  });

  it("stops at the requested page limit", async () => {
    const fetcher = responses({ id: "job" }, { status: "completed", data: [page("https://example.com/")], next: "https://api.firecrawl.dev/v1/crawl/job?skip=1" });
    expect(await provider().crawl({ url: "https://example.com", limit: 1 })).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["failed", "cancelled", "canceled"])("rejects a %s job", async (status) => {
    responses({ id: "job" }, { status });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("crawling provider");
  });

  it.each(["https://attacker.example/", "https://api.firecrawl.dev/v1/crawl/other", "https://api.firecrawl.dev/v1/crawl/job"])("rejects unsafe or cyclic pagination: %s", async (next) => {
    const fetcher = responses({ id: "job" }, { status: "completed", data: [], next });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("invalid pagination URL");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects an unsuccessful start", async () => {
    responses({ success: false });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("crawling provider");
  });

  it("requires a job ID", async () => {
    responses({ success: true });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("job ID");
  });

  it("rides out a short rate limit without restarting the crawl", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job" })))
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", data: [page("https://example.com/")] })));
    vi.stubGlobal("fetch", fetcher);
    expect(await provider().crawl({ url: "https://example.com" })).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.filter((call) => call[1].method === "POST")).toHaveLength(1);
  });

  it("hands a long rate limit back to the caller with its Retry-After", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "retry-after": "120" } }));
    vi.stubGlobal("fetch", fetcher);
    const error = await provider().crawl({ url: "https://example.com" }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CrawlRequestError);
    expect(error).toMatchObject({ status: 429, transient: true, retryAfterMs: 120_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("gives up after a few server errors, and at once on a refusal", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(new FirecrawlProvider({ apiKey: "test", retryDelayMs: 0 }).crawl({ url: "https://example.com" })).rejects.toMatchObject({ status: 503, transient: true });
    expect(fetcher).toHaveBeenCalledTimes(3);

    fetcher.mockClear().mockImplementation(async () => new Response("{}", { status: 401 }));
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toMatchObject({ status: 401, transient: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds the overall crawl duration", async () => {
    const fetcher = responses();
    await expect(new FirecrawlProvider({ apiKey: "test", timeoutMs: 0 }).crawl({ url: "https://example.com" })).rejects.toThrow("timed out");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
