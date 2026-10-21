import { SITE_URL } from "@/marketing/lib/seo";
import { createSchemaMap } from "@/marketing/seo/seo-graph";
import { marketingStaticParams } from "@/marketing/build";

// Prerendered once, for the unprefixed English site.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return marketingStaticParams([{ locale: "en" }]);
}

export const GET = createSchemaMap({
  siteUrl: SITE_URL,
  entries: [
    { path: "/schema/page.json", lastModified: new Date("2026-05-14") },
    { path: "/schema/post.json", lastModified: new Date("2026-05-14") },
  ],
});
