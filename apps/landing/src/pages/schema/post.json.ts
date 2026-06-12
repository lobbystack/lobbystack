import { createSchemaEndpoint } from "@jdevalk/astro-seo-graph"
import type { GraphEntity } from "@jdevalk/seo-graph-core"
import { blogCanonicalSlug, getBlogPosts } from "@/lib/blog"
import {
  blogJsonLd,
  blogPostingJsonLd,
  breadcrumbJsonLd,
  imageObjectJsonLd,
  organizationJsonLd,
  plainTextFromMarkdown,
  webPageJsonLd,
  webSiteJsonLd,
} from "@/lib/seo"

export const GET = createSchemaEndpoint({
  entries: () => getBlogPosts("en"),
  mapper: (post) => {
    const path = `/blog/${blogCanonicalSlug(post)}/`
    const publishedTime = post.data.pubDate.toISOString()

    return [
      organizationJsonLd(),
      webSiteJsonLd(),
      blogJsonLd(),
      imageObjectJsonLd({
        path,
        image: post.data.coverImage,
        alt: post.data.title,
        width: 1672,
        height: 941,
      }),
      webPageJsonLd({
        title: `${post.data.title} - AI Receptionist Blog`,
        description: post.data.description,
        path,
        image: post.data.coverImage,
      }),
      blogPostingJsonLd({
        title: post.data.title,
        description: post.data.description,
        path,
        image: post.data.coverImage,
        author: post.data.author,
        publishedTime,
        modifiedTime: publishedTime,
        category: post.data.category,
        articleBody: plainTextFromMarkdown(post.body),
      }),
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Blog", path: "/blog/" },
        { name: post.data.title, path },
      ]),
    ] as GraphEntity[]
  },
})
