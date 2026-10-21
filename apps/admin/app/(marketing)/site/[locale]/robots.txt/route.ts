import { isIndexableMarketingSite, marketingSiteUrl } from "@/marketing/site-url";
import { marketingStaticParams } from "@/marketing/build";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return marketingStaticParams([{ locale: "en" }]);
}

export function GET() {
  const body = isIndexableMarketingSite()
    ? [
        "User-agent: *",
        "Allow: /",
        "Content-Signal: ai-train=yes, search=yes, ai-input=yes",
        "",
        `Sitemap: ${marketingSiteUrl()}/sitemap-index.xml`,
        "",
      ]
    : ["User-agent: *", "Disallow: /", ""];
  return new Response(body.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
