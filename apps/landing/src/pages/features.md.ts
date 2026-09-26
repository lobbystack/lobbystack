import type { APIRoute } from "astro"
import { featuresMarkdown } from "@/lib/agent-discovery"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = () =>
  markdownResponse({
    markdown: featuresMarkdown,
    canonical: absoluteUrl("/features/"),
    title: "AI receptionist features for calls, booking, and alerts",
    description:
      "Explore LobbyStack features for phone answering, appointment booking, call transfers, owner alerts, and call summaries.",
  })
