import { describe, expect, it } from "vitest"

import { landingPageMarkdown, seoLandingPages } from "@/marketing/lib/seo-landing-pages"
import { callActionTitle, routingGroups, sceneLines, tradeDetails } from "@/marketing/lib/trade-details"

describe("trade page details", () => {
  const entries = Object.entries(tradeDetails)

  it("only describes pages that exist", () => {
    const slugs = new Set(seoLandingPages.map((page) => page.slug))
    for (const [slug] of entries) expect(slugs.has(slug)).toBe(true)
  })

  it("gives every trade a complete example call and call table", () => {
    for (const [slug, details] of entries) {
      expect(details.call.length, slug).toBeGreaterThanOrEqual(6)
      expect(details.call[0]?.speaker, slug).toBe("lobbystack")
      expect(
        details.call.filter((line) => line.note).length,
        slug
      ).toBeGreaterThanOrEqual(3)
      expect(details.routing.length, slug).toBeGreaterThanOrEqual(5)
      expect(details.intake.length, slug).toBeGreaterThanOrEqual(5)
    }
  })

  it("keeps example calls unique across trades", () => {
    const openings = entries.map(([, details]) => details.call[1]?.text)
    expect(new Set(openings).size).toBe(openings.length)
  })

  it("groups each trade's call rules into four cards, for a 2×2 grid", () => {
    for (const [slug, details] of entries) {
      expect(routingGroups(details).length, slug).toBe(4)
    }
  })

  it("draws the caller's opening line and three noted steps in the call scene", () => {
    for (const [slug, details] of entries) {
      const lines = sceneLines(details)
      expect(lines[0]?.speaker, slug).toBe("caller")
      expect(lines.length, slug).toBe(4)
      expect(lines.slice(1).every((line) => line.note), slug).toBe(true)
    }
  })

  it("fills every scene and heading the trade layout shows", () => {
    for (const [slug, details] of entries) {
      expect(details.summary.length, slug).toBe(4)
      expect(details.booking.hours[details.booking.picked], slug).toBeDefined()
      for (const text of [details.hero.problem, details.hero.outcome, details.pitch.title, details.features.title]) {
        expect(text.trim().length, slug).toBeGreaterThan(0)
      }
    }
  })

  it("puts the whole call, the grouped rules, the intake questions and the FAQ in the Markdown", () => {
    for (const [slug, details] of entries) {
      const page = seoLandingPages.find((candidate) => candidate.slug === slug)
      if (!page) throw new Error(`Missing page ${slug}`)
      const markdown = landingPageMarkdown(page)
      for (const line of details.call) {
        const speaker = line.speaker === "caller" ? "Caller" : "LobbyStack"
        expect(markdown, slug).toContain(`- ${line.at} **${speaker}:** ${line.text}`)
      }
      for (const { action, rows } of routingGroups(details)) {
        expect(markdown, slug).toContain(`### ${callActionTitle(action, details)}`)
        for (const row of rows) expect(markdown, slug).toContain(`- **${row.call}:** ${row.detail}.`)
      }
      for (const question of details.intake) expect(markdown, slug).toContain(`- ${question}`)
      for (const faq of page.faqs) expect(markdown, slug).toContain(`### ${faq.question}`)
      for (const section of page.sections) expect(markdown, slug).toContain(`## ${section.title}`)
    }
  })

  it("gives every trade page two sections for its feature cards", () => {
    for (const [slug] of entries) {
      const page = seoLandingPages.find((candidate) => candidate.slug === slug)
      expect(page?.sections.length, slug).toBe(2)
    }
  })
})
