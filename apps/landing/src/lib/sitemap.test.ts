import { describe, expect, it, vi } from "vitest"
import { seoLandingPages } from "@/lib/seo-landing-pages"
import { sitemapSourceForUrl, stableLastmodForUrl } from "@/lib/sitemap"

describe("landing sitemap metadata", () => {
  it("maps every generated SEO landing page to a stable source", () => {
    for (const page of seoLandingPages) {
      expect(sitemapSourceForUrl(`https://lobbystack.com${page.path}`)).toBe(
        "src/lib/seo-landing-pages.ts"
      )
      for (const locale of ["fr", "es", "sr"]) {
        expect(
          sitemapSourceForUrl(`https://lobbystack.com/${locale}${page.path}`)
        ).toBe(`src/lib/${locale}-seo-landing-pages.ts`)
      }
    }
  })

  it("maps localized home pages and blog posts to their own sources", () => {
    expect(sitemapSourceForUrl("https://lobbystack.com/sr/")).toBe(
      "src/i18n/sr.ts"
    )
    expect(sitemapSourceForUrl("https://lobbystack.com/es/pricing/")).toBe(
      "src/i18n/es.ts"
    )
    expect(
      sitemapSourceForUrl("https://lobbystack.com/es/blog/upfirst-alternative/")
    ).toBe("src/content/blog/es/upfirst-alternative.md")
    expect(
      sitemapSourceForUrl(
        "https://lobbystack.com/sr/solutions/ai-phone-answering/"
      )
    ).toBe("src/lib/sr-seo-landing-pages.ts")
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
