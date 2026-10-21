import { affiliateProgramMarkdown } from "@/marketing/lib/agent-discovery"
import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

const meta = localizedRouteMeta("sr", "/affiliate-program/")

export const GET = () =>
  markdownResponse({
    markdown: affiliateProgramMarkdown("sr"),
    canonical: absoluteUrl("/sr/affiliate-program/"),
    title: meta.title,
    description: meta.description,
  })
