import { openApiDocument } from "@/marketing/lib/agent-discovery";
import { marketingStaticParams } from "@/marketing/build";

// Prerendered once, for the unprefixed English site.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return marketingStaticParams([{ locale: "en" }]);
}

export function GET() {
  return new Response(JSON.stringify(openApiDocument, null, 2), {
    headers: {
      "Content-Type": "application/vnd.oai.openapi+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
