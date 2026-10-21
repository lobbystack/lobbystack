import { blogCanonicalSlug, getBlogPosts } from "@/marketing/content/blog"
import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = async () => {
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
