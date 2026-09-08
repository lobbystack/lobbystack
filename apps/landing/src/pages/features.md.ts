import type { APIRoute } from "astro"
import { featuresMarkdown } from "@/lib/agent-discovery"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = () =>
  markdownResponse({
    markdown: featuresMarkdown,
    canonical: absoluteUrl("/features/"),
    title: "AI receptionist features for calls, messages, and booking",
    description:
      "Explore LobbyStack features for phone answering, website chat, SMS alerts, appointment booking, call routing, follow-up, and summaries.",
  })
