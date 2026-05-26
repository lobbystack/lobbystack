import type { APIRoute } from "astro"
import { featuresMarkdown } from "@/lib/agent-discovery"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = () =>
  markdownResponse({
    markdown: featuresMarkdown,
    canonical: absoluteUrl("/features/"),
    title: "AI Receptionist Features for Calls, SMS, and Booking",
    description:
      "Explore LobbyStack AI receptionist features for phone answering, SMS, appointment booking, call routing, lead qualification, follow-up, and summaries.",
  })
