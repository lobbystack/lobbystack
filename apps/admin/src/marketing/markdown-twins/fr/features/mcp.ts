import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { mcpMarkdown } from "@/marketing/lib/mcp-page-markdown"
import { absoluteUrl } from "@/marketing/lib/seo"

const meta = localizedRouteMeta("fr", "/features/mcp/")

export const GET = () =>
  markdownResponse({
    markdown: mcpMarkdown("fr"),
    canonical: absoluteUrl("/fr/features/mcp/"),
    title: meta.title,
    description: meta.description,
  })
