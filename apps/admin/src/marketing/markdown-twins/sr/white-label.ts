import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"
import { whiteLabelMarkdown } from "@/marketing/lib/white-label-markdown"

const meta = localizedRouteMeta("sr", "/white-label/")

export const GET = () =>
  markdownResponse({
    markdown: whiteLabelMarkdown("sr"),
    canonical: absoluteUrl("/sr/white-label/"),
    title: meta.title,
    description: meta.description,
  })
