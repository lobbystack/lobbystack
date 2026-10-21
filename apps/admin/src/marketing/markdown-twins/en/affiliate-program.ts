import { affiliateProgramMarkdown } from "@/marketing/lib/agent-discovery"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = () =>
  markdownResponse({
    markdown: affiliateProgramMarkdown("en"),
    canonical: absoluteUrl("/affiliate-program/"),
    title: "LobbyStack Affiliate Program | Earn 20% Commission",
    description:
      "Refer businesses to hosted LobbyStack plans and earn 20% of their payments for 12 months. Referrals save 5% at signup. PayPal payouts monthly.",
  })
