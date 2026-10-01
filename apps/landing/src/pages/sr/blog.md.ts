import type { APIRoute } from "astro"
import { blogCanonicalSlug, getBlogPosts } from "@/lib/blog"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = async () => {
  const posts = await getBlogPosts("sr")

  const markdown = `# Blog o AI recepcionerima i novosti o proizvodu

Novosti o proizvodu i praktični saveti o AI odgovaranju na pozive, propuštenim pozivima, zakazivanju termina, preusmeravanju poziva, praćenju potencijalnih klijenata i infrastrukturi recepcionera otvorenog koda.

## Članci

${posts
  .map(
    (post) =>
      `- [${post.data.title}](${absoluteUrl(`/sr/blog/${blogCanonicalSlug(post)}/`)}) - ${post.data.description}`
  )
  .join("\n")}
`

  return markdownResponse({
    markdown,
    canonical: absoluteUrl("/sr/blog/"),
    ...localizedRouteMeta("sr", "/blog/"),
  })
}
