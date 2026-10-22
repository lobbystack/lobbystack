import { pricingMarkdown } from "@/marketing/lib/agent-discovery"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = () =>
  markdownResponse({
    markdown: pricingMarkdown,
    canonical: absoluteUrl("/pricing/"),
    title: "AI Receptionist Pricing for Small Businesses",
    description:
      "Compare LobbyStack AI receptionist pricing for Free, Starter, Pro, and Enterprise plans, including voice minutes, annual billing, SMS alerts, and overage rates.",
  })
