import {
  landingPageMarkdown,
  seoLandingPageByPath,
} from "@/marketing/lib/seo-landing-pages"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

const page = seoLandingPageByPath("/about/")
if (!page) throw new Error("Missing /about/ SEO landing page")

export const GET = () =>
  markdownResponse({
    markdown: landingPageMarkdown(page),
    canonical: absoluteUrl(page.path),
    title: page.title,
    description: page.description,
  })
