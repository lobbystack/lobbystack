import type { APIRoute } from "astro"
import { affiliateProgramMarkdown } from "@/lib/agent-discovery"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("sr", "/affiliate-program/")

export const GET: APIRoute = () =>
  markdownResponse({
    markdown: affiliateProgramMarkdown("sr"),
    canonical: absoluteUrl("/sr/affiliate-program/"),
    title: meta.title,
    description: meta.description,
  })
