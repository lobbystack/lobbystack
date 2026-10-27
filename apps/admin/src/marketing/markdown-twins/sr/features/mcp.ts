import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { mcpMarkdown } from "@/marketing/lib/mcp-page-markdown"
import { absoluteUrl } from "@/marketing/lib/seo"

const meta = localizedRouteMeta("sr", "/features/mcp/")

export const GET = () =>
  markdownResponse({
    markdown: mcpMarkdown("sr"),
    canonical: absoluteUrl("/sr/features/mcp/"),
    title: meta.title,
    description: meta.description,
  })
