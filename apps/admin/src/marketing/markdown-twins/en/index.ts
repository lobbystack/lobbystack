import { homepageMarkdown } from "@/marketing/lib/agent-discovery"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, absoluteUrl } from "@/marketing/lib/seo"

export const GET = () =>
  markdownResponse({
    markdown: homepageMarkdown,
    canonical: absoluteUrl("/"),
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  })
