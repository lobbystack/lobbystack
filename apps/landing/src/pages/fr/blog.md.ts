import type { APIRoute } from "astro"
import { blogCanonicalSlug, getBlogPosts } from "@/lib/blog"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = async () => {
  const posts = await getBlogPosts("fr")

  const markdown = `# Blog et mises a jour produit LobbyStack

Mises a jour produit et notes pratiques sur la reponse telephonique IA, la recuperation d'appels manques, la planification, le routage et le suivi des prospects.

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
    title: "Blog et mises a jour produit LobbyStack",
    description:
      "Mises a jour produit et guides pratiques sur les receptionnistes IA, la reponse telephonique, la reservation et l'automatisation des appels.",
  })
}
