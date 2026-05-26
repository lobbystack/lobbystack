import type { APIRoute } from "astro"
import {
  landingPageMarkdown,
  seoLandingPageByPath,
} from "@/lib/seo-landing-pages"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const page = seoLandingPageByPath("/about/")
if (!page) throw new Error("Missing /about/ SEO landing page")

export const GET: APIRoute = () =>
  markdownResponse({
    markdown: landingPageMarkdown(page),
    canonical: absoluteUrl(page.path),
    title: page.title,
    description: page.description,
  })
