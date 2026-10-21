import { calculatorMarkdown } from "@/marketing/lib/agent-discovery"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = () =>
  markdownResponse({
    markdown: calculatorMarkdown,
    canonical: absoluteUrl("/missed-call-revenue-calculator/"),
    title: "Missed Call Revenue Calculator for Contractors",
    description:
      "Estimate weekly, monthly, and annual revenue at risk from missed contractor calls and see how much a 24/7 AI receptionist could recover.",
  })
