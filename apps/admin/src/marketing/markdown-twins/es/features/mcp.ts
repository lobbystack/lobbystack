import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { mcpMarkdown } from "@/marketing/lib/mcp-page-markdown"
import { absoluteUrl } from "@/marketing/lib/seo"

const meta = localizedRouteMeta("es", "/features/mcp/")

export const GET = () =>
  markdownResponse({
    markdown: mcpMarkdown("es"),
    canonical: absoluteUrl("/es/features/mcp/"),
    title: meta.title,
    description: meta.description,
  })
