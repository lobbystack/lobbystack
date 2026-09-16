import { setTimeout as sleep } from "node:timers/promises";
import { assertPublicHttpUrl } from "./urlSafety";

export type CrawlPage = { url: string; title?: string; markdown?: string };
type CrawlResponse = { success?: boolean; id?: string; status?: string; next?: string | null; data?: Array<{ metadata?: { sourceURL?: string; title?: string }; markdown?: string }> };

export class FirecrawlProvider {
  constructor(private readonly config: { apiKey: string; baseUrl?: string; pollIntervalMs?: number; timeoutMs?: number }) {}

  async crawl(input: { url: string; limit?: number }): Promise<CrawlPage[]> {
    const url = await assertPublicHttpUrl(input.url);
    const baseUrl = (this.config.baseUrl ?? "https://api.firecrawl.dev").replace(/\/$/, "");
    const limit = Math.max(1, Math.min(1000, Math.floor(input.limit ?? 50)));
    const deadline = Date.now() + (this.config.timeoutMs ?? 5 * 60_000);
    const request = async (endpoint: string, body?: object): Promise<CrawlResponse> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Website crawl timed out before completion.");
      const response = await fetch(endpoint, {
        method: body ? "POST" : "GET", redirect: "error",
        headers: { authorization: `Bearer ${this.config.apiKey}`, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(Math.min(30_000, remaining)),
      });
      if (!response.ok) throw new Error(`Website crawl failed with status ${response.status}.`);
      const payload = await response.json() as CrawlResponse;
      if (payload.success === false || ["failed", "cancelled", "canceled"].includes(payload.status ?? "")) throw new Error("Website crawl failed at the crawling provider.");
      return payload;
    };
    const started = await request(`${baseUrl}/v1/crawl`, { url: url.toString(), limit, scrapeOptions: { formats: ["markdown"] } });
    if (!started.id) throw new Error("Website crawl did not return a job ID.");
    const statusUrl = new URL(`${baseUrl}/v1/crawl/${encodeURIComponent(started.id)}`);
    let payload: CrawlResponse;
    do {
      payload = await request(statusUrl.toString());
      if (payload.status === "completed") break;
      if (payload.status !== "scraping" && payload.status !== "queued") throw new Error("Website crawl returned an unknown job status.");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Website crawl timed out before completion.");
      await sleep(Math.min(this.config.pollIntervalMs ?? 2000, remaining));
    } while (true);

    const pages = new Map<string, CrawlPage>();
    const visited = new Set<string>([statusUrl.toString()]);
    for (;;) {
      for (const page of payload.data ?? []) {
        const pageUrl = page.metadata?.sourceURL ?? url.toString();
        pages.set(pageUrl, { url: pageUrl, ...(page.metadata?.title ? { title: page.metadata.title } : {}), ...(page.markdown ? { markdown: page.markdown } : {}) });
        if (pages.size >= limit) return [...pages.values()];
      }
      if (!payload.next) return [...pages.values()];
      const next = new URL(payload.next, statusUrl);
      // Keep provider credentials confined to this crawl job, including pagination.
      if (next.origin !== statusUrl.origin || next.pathname !== statusUrl.pathname || next.username || next.password || visited.has(next.toString())) throw new Error("Website crawl returned an invalid pagination URL.");
      visited.add(next.toString());
      if (visited.size > 1000) throw new Error("Website crawl exceeded its pagination limit.");
      payload = await request(next.toString());
    }
  }
}
