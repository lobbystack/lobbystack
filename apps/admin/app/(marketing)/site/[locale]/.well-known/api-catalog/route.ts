import { apiCatalog } from "@/marketing/lib/agent-discovery";
import { marketingStaticParams } from "@/marketing/build";

// Prerendered once, for the unprefixed English site.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return marketingStaticParams([{ locale: "en" }]);
}

export function GET() {
  return new Response(JSON.stringify(apiCatalog, null, 2), {
    headers: {
      "Content-Type": 'application/linkset+json; charset=utf-8; profile="https://www.rfc-editor.org/info/rfc9727"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
