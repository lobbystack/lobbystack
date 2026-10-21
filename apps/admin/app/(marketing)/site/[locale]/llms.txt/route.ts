import { readFileSync } from "node:fs";
import path from "node:path";

import { CONTENT_ROOT } from "@/marketing/content/collections";
import { marketingStaticParams } from "@/marketing/build";

// Prerendered once, for the unprefixed English site.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return marketingStaticParams([{ locale: "en" }]);
}

// The guide for language models, kept in content/ so it is served only on the
// marketing hosts and not from public/ on the dashboard host too.
export function GET() {
  return new Response(readFileSync(path.join(CONTENT_ROOT, "llms.txt"), "utf8"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
