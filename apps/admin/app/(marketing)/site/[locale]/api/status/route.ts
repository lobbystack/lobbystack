import { publicStatus } from "@/marketing/lib/agent-discovery";

// Prerendered once, for the unprefixed English site.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ locale: "en" }];
}

export function GET() {
  return Response.json(publicStatus, { headers: { "Cache-Control": "public, max-age=300" } });
}
