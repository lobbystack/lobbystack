import { publicStatus } from "@/marketing/lib/agent-discovery";
import { marketingStaticParams } from "@/marketing/build";

// Prerendered once, for the unprefixed English site.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return marketingStaticParams([{ locale: "en" }]);
}

export function GET() {
  return Response.json(publicStatus, { headers: { "Cache-Control": "public, max-age=300" } });
}
