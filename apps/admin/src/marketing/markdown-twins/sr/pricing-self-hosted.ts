import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { selfHostedPricingMarkdown } from "@/marketing/lib/self-hosted-pricing-markdown"
import { absoluteUrl } from "@/marketing/lib/seo"

const meta = localizedRouteMeta("sr", "/pricing/self-hosted/")

export const GET = () =>
  markdownResponse({
    markdown: selfHostedPricingMarkdown("sr"),
    canonical: absoluteUrl("/sr/pricing/self-hosted/"),
    title: meta.title,
    description: meta.description,
  })
