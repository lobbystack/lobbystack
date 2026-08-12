export type CrawlPage = { url: string; title?: string; markdown?: string };

export class FirecrawlProvider {
  constructor(private readonly config: { apiKey: string; baseUrl?: string }) {}

  async crawl(input: { url: string; limit?: number }): Promise<CrawlPage[]> {
    const url = await assertPublicHttpUrl(input.url);
    const response = await fetch(`${this.config.baseUrl ?? "https://api.firecrawl.dev"}/v1/crawl`, { method: "POST", headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ url: url.toString(), limit: input.limit ?? 50, scrapeOptions: { formats: ["markdown"] } }) });
    if (!response.ok) {
      throw new Error(`Website crawl failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { data?: Array<{ metadata?: { sourceURL?: string; title?: string }; markdown?: string }> };
    return (payload.data ?? []).map((page) => ({ url: page.metadata?.sourceURL ?? url.toString(), ...(page.metadata?.title ? { title: page.metadata.title } : {}), ...(page.markdown ? { markdown: page.markdown } : {}) }));
  }
}
import { assertPublicHttpUrl } from "./urlSafety";
