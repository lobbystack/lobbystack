import { createSchemaMap } from "@jdevalk/astro-seo-graph"
import { SITE_URL } from "@/lib/seo"

export const GET = createSchemaMap({
  siteUrl: SITE_URL,
  entries: [
    { path: "/schema/page.json", lastModified: new Date("2026-05-14") },
    { path: "/schema/post.json", lastModified: new Date("2026-05-14") },
  ],
})
