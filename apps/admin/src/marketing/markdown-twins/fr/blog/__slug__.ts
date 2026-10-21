import { createMarkdownEndpoint } from "@/marketing/seo/seo-graph"
import { blogCanonicalSlug, getBlogPosts } from "@/marketing/content/blog"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = createMarkdownEndpoint({
  entries: () => getBlogPosts("fr"),
  cacheControl: "public, max-age=3600",
  mapper: (post, slug) =>
    blogCanonicalSlug(post) !== slug
      ? null
      : {
          frontmatter: {
            title: post.data.title,
            canonical: absoluteUrl(`/fr/blog/${blogCanonicalSlug(post)}/`),
            pubDate: post.data.pubDate,
            author: post.data.author,
            description: post.data.description,
            categories: post.data.category ? [post.data.category] : undefined,
          },
          body: post.body,
        },
})
