import { renderMarkdownAlternate } from "@jdevalk/astro-seo-graph"
import { CONTENT_SIGNAL } from "@/lib/agent-discovery"

export const markdownResponse = ({
  markdown,
  canonical,
  title,
  description,
}: {
  markdown: string
  canonical: string
  title: string
  description: string
}) => {
  const rendered = renderMarkdownAlternate({
    frontmatter: {
      title,
      description,
      canonical,
    },
    body: markdown,
  })

  return new Response(rendered.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Content-Signal": CONTENT_SIGNAL,
      "X-Robots-Tag": "noindex, follow",
      "X-Markdown-Tokens": String(rendered.tokenCount),
      Link: `<${rendered.canonicalHref}>; rel="canonical"`,
    },
  })
}
