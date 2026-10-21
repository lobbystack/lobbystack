import { featuresMarkdown } from "@/marketing/lib/agent-discovery"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = () =>
  markdownResponse({
    markdown: featuresMarkdown,
    canonical: absoluteUrl("/features/"),
    title: "AI receptionist features for calls, booking, and alerts",
    description:
      "Explore LobbyStack features for phone answering, appointment booking, call transfers, owner alerts, and call summaries.",
  })
