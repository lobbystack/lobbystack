import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  absoluteUrl,
  ogImagePath,
} from "@/lib/seo"
import { seoLandingPages } from "@/lib/seo-landing-pages"

export type PublicPage = {
  path: string
  title: string
  description: string
  markdown?: string
}

export const publicPages: PublicPage[] = [
  {
    path: "/",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    markdown: "/index.md",
  },
  {
    path: "/features/",
    title: "AI Receptionist Features for Calls, SMS, and Booking",
    description:
      "Explore LobbyStack AI receptionist features for phone answering, SMS, appointment booking, call routing, lead qualification, follow-up, and summaries.",
    markdown: "/features.md",
  },
  {
    path: "/pricing/",
    title: "AI Receptionist Pricing for Small Businesses",
    description:
      "Compare LobbyStack AI receptionist pricing for Free, Pro, and Enterprise plans, including voice minutes, outbound calls, SMS alerts, and overage rates.",
    markdown: "/pricing.md",
  },
  {
    path: "/blog/",
    title: "AI Receptionist Blog and Product Updates",
    description:
      "Read LobbyStack product updates and practical guides about AI receptionists, phone answering, appointment booking, and small-business call automation.",
    markdown: "/blog.md",
  },
  {
    path: "/docs/api/",
    title: "LobbyStack Public API Documentation",
    description:
      "Machine-readable discovery resources for agents and integrators visiting LobbyStack.",
    markdown: "/docs/api.md",
  },
  {
    path: "/missed-call-revenue-calculator/",
    title: "Missed Call Revenue Calculator for Contractors",
    description:
      "Estimate weekly, monthly, and annual revenue at risk from missed contractor calls and see how much a 24/7 AI receptionist could recover.",
    markdown: "/missed-call-revenue-calculator/index.md",
  },
  // Add all SEO landing pages (company, solution, comparison) from the data file
  ...seoLandingPages.map((page) => ({
    path: page.path,
    title: page.title,
    description: page.description,
    markdown: `${page.path.slice(0, -1)}.md`,
  })),
]

export const pageByPath = (path: string) =>
  publicPages.find((page) => page.path === path)

export const ogEntries = publicPages.map((page) => ({
  slug: page.path === "/" ? "index" : page.path.replace(/^\/|\/$/g, ""),
  title: page.title,
  description: page.description,
  canonical: absoluteUrl(page.path),
  image: ogImagePath(page.path),
}))
