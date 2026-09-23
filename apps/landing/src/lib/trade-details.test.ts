import { describe, expect, it } from "vitest"

import { seoLandingPages } from "@/lib/seo-landing-pages"
import { tradeDetails } from "@/lib/trade-details"

describe("trade page details", () => {
  const entries = Object.entries(tradeDetails)

  it("only describes pages that exist", () => {
    const slugs = new Set(seoLandingPages.map((page) => page.slug))
    for (const [slug] of entries) expect(slugs.has(slug)).toBe(true)
  })

  it("gives every trade a complete example call and call table", () => {
    for (const [slug, details] of entries) {
      expect(details.call.length, slug).toBeGreaterThanOrEqual(6)
      expect(details.call[0].speaker, slug).toBe("lobbystack")
      expect(
        details.call.filter((line) => line.note).length,
        slug
      ).toBeGreaterThanOrEqual(3)
      expect(details.routing.length, slug).toBeGreaterThanOrEqual(5)
      expect(details.intake.length, slug).toBeGreaterThanOrEqual(5)
    }
  })

  it("keeps example calls unique across trades", () => {
    const openings = entries.map(([, details]) => details.call[1].text)
    expect(new Set(openings).size).toBe(openings.length)
  })
})
