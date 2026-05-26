import rss from "@astrojs/rss"
import { getCollection } from "astro:content"
import type { APIContext } from "astro"
import { DEFAULT_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/seo"

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const markdownToHtml = (markdown = "") =>
  markdown
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim()

      if (!trimmed) return ""
      if (trimmed.startsWith("## ")) {
        return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`
      }
      if (trimmed.startsWith("# ")) {
        return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`
      }
      if (trimmed.startsWith("- ")) {
        const items = trimmed
          .split("\n")
          .map((line) => `<li>${escapeHtml(line.replace(/^-\s+/, ""))}</li>`)
          .join("")
        return `<ul>${items}</ul>`
      }

      return `<p>${escapeHtml(trimmed)}</p>`
    })
    .join("\n")

export async function GET(context: APIContext) {
  const posts = await getCollection("blog")
  posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())

  return rss({
    title: `${SITE_NAME} Blog`,
    description: DEFAULT_DESCRIPTION,
    site: context.site ?? absoluteUrl("/"),
    trailingSlash: true,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.id}/`,
      categories: post.data.category ? [post.data.category] : undefined,
      content: markdownToHtml(post.body ?? ""),
    })),
    customData: "<language>en-us</language>",
  })
}
