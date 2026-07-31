import { describe, expect, it, vi } from "vitest"
import { seoLandingPages } from "@/lib/seo-landing-pages"
import { sitemapSourceForUrl, stableLastmodForUrl } from "@/lib/sitemap"

describe("landing sitemap metadata", () => {
  it("maps every generated SEO landing page to a stable source", () => {
    for (const page of seoLandingPages) {
      expect(sitemapSourceForUrl(`https://lobbystack.com${page.path}`)).toBe(
        "src/lib/seo-landing-pages.ts"
      )
      expect(sitemapSourceForUrl(`https://lobbystack.com/fr${page.path}`)).toBe(
        "src/lib/fr-seo-landing-pages.ts"
      )
    }
  })

  it("uses the source modification date without a build-time fallback", () => {
    const resolveLastmod = vi.fn(() => new Date("2026-07-15T12:00:00.000Z"))

    expect(
      stableLastmodForUrl(
        "https://lobbystack.com/solutions/ai-receptionist-for-hvac/",
        resolveLastmod
      )
    ).toBe("2026-07-15T12:00:00.000Z")
    expect(resolveLastmod).toHaveBeenCalledWith("src/lib/seo-landing-pages.ts")
  })

  it("omits lastmod when a URL has no authoritative source", () => {
    const resolveLastmod = vi.fn(() => new Date("2026-07-15T12:00:00.000Z"))

    expect(
      stableLastmodForUrl(
        "https://lobbystack.com/unmapped-route/",
        resolveLastmod
      )
    ).toBeUndefined()
    expect(resolveLastmod).not.toHaveBeenCalled()
  })
})
