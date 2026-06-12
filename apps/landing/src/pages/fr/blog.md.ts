import type { APIRoute } from "astro"
import { blogCanonicalSlug, getBlogPosts } from "@/lib/blog"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = async () => {
  const posts = await getBlogPosts("fr")

  const markdown = `# Blog et mises à jour produit LobbyStack

Mises à jour produit et notes pratiques sur la réponse téléphonique IA, la récupération d’appels manqués, la planification, les transferts et le suivi des prospects.

## Articles

${posts
  .map(
    (post) =>
      `- [${post.data.title}](${absoluteUrl(`/fr/blog/${blogCanonicalSlug(post)}/`)}) - ${post.data.description}`
  )
  .join("\n")}
`

  return markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/blog/"),
    title: "Blog et mises à jour produit LobbyStack",
    description:
      "Mises à jour produit et guides pratiques sur les réceptionnistes IA, la réponse téléphonique, la prise de rendez-vous et l’automatisation des appels.",
  })
}
