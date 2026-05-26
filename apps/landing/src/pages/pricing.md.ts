import type { APIRoute } from "astro"
import { pricingMarkdown } from "@/lib/agent-discovery"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = () =>
  markdownResponse({
    markdown: pricingMarkdown,
    canonical: absoluteUrl("/pricing/"),
    title: "AI Receptionist Pricing for Small Businesses",
    description:
      "Compare LobbyStack AI receptionist pricing for Free, Pro, and Enterprise plans, including voice minutes, outbound calls, SMS alerts, and overage rates.",
  })
