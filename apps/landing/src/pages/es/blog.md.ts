import type { APIRoute } from "astro"
import { blogCanonicalSlug, getBlogPosts } from "@/lib/blog"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = async () => {
  const posts = await getBlogPosts("es")

  const markdown = `# Blog de recepcionistas con IA y novedades del producto

Novedades del producto y notas prácticas sobre atención telefónica con IA, llamadas perdidas, programación de citas, enrutamiento de llamadas, seguimiento de clientes potenciales e infraestructura de recepción de código abierto.

## Artículos

${posts
  .map(
    (post) =>
      `- [${post.data.title}](${absoluteUrl(`/es/blog/${blogCanonicalSlug(post)}/`)}) - ${post.data.description}`
  )
  .join("\n")}
`

  return markdownResponse({
    markdown,
    canonical: absoluteUrl("/es/blog/"),
    ...localizedRouteMeta("es", "/blog/"),
  })
}
