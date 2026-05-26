import { createMarkdownEndpoint } from "@jdevalk/astro-seo-graph"
import { getCollection } from "astro:content"
import { absoluteUrl } from "@/lib/seo"

export const getStaticPaths = async () => {
  const posts = await getCollection("blog")

  return posts.map((post) => ({
    params: { slug: post.id },
  }))
}

export const GET = createMarkdownEndpoint({
  entries: () => getCollection("blog"),
  cacheControl: "public, max-age=3600",
  mapper: (post, slug) =>
    post.id !== slug
      ? null
      : {
          frontmatter: {
            title: post.data.title,
            canonical: absoluteUrl(`/blog/${post.id}/`),
            pubDate: post.data.pubDate,
            author: post.data.author,
            description: post.data.description,
            categories: post.data.category ? [post.data.category] : undefined,
          },
          body: post.body ?? "",
        },
})
