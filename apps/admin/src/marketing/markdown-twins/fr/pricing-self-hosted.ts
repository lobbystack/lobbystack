import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { selfHostedPricingMarkdown } from "@/marketing/lib/self-hosted-pricing-markdown"
import { absoluteUrl } from "@/marketing/lib/seo"

const meta = localizedRouteMeta("fr", "/pricing/self-hosted/")

export const GET = () =>
  markdownResponse({
    markdown: selfHostedPricingMarkdown("fr"),
    canonical: absoluteUrl("/fr/pricing/self-hosted/"),
    title: meta.title,
    description: meta.description,
  })
