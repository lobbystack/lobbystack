import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CtaSection } from "@/marketing/components/CtaSection"
import { HeroSection } from "@/marketing/components/HeroSection"
import { KnowledgeSection, PricingPreviewSection } from "@/marketing/components/home/HomeSections"
import { Navbar } from "@/marketing/components/Navbar"
import { PricingSection } from "@/marketing/components/PricingSection"
import type { Locale } from "@/marketing/i18n/config"

// The sections that make up the home and pricing pages, in page order.
const pages = {
  home: (locale: Locale) => (
    <>
      <Navbar locale={locale} />
      <HeroSection locale={locale} />
      <KnowledgeSection locale={locale} />
      <PricingPreviewSection locale={locale} />
      <CtaSection locale={locale} />
    </>
  ),
  pricing: (locale: Locale) => (
    <>
      <Navbar locale={locale} />
      <PricingSection locale={locale} />
      <CtaSection locale={locale} />
    </>
  ),
}

const attribute = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]?.replaceAll("&amp;", "&")

function dashboardLinks(html: string) {
  return [...html.matchAll(/<a\s[^>]*>/g)]
    .map(([tag]) => ({
      href: attribute(tag, "href"),
      destination: attribute(tag, "data-ph-capture-attribute-destination"),
    }))
    .filter((link) => link.href?.startsWith("https://app.lobbystack.com/"))
}

describe.each(["es", "sr"] as const)("%s auth links", (locale) => {
  it.each(Object.keys(pages) as Array<keyof typeof pages>)(
    "keeps the %s page's signup and login links in the page language",
    (page) => {
      const links = dashboardLinks(renderToStaticMarkup(pages[page](locale)))
      const hrefs = links.map((link) => link.href)

      expect(hrefs).toContain(`https://app.lobbystack.com/${locale}/signup`)
      expect(hrefs).toContain(`https://app.lobbystack.com/${locale}/login`)
      for (const { href, destination } of links) {
        // Plain prefixes rather than a regex: the landing link check reads the escaped
        // regex as a broken link to a host named "app".
        expect(
          [`https://app.lobbystack.com/${locale}/signup`, `https://app.lobbystack.com/${locale}/login`].some((prefix) => href?.startsWith(prefix)),
          href
        ).toBe(true)
        if (destination) expect(destination).toBe(href)
      }
    }
  )
})

describe.each(["en", "fr", "es", "sr"] as const)("%s pricing plan links", (locale) => {
  it("sends Starter and Pro to signup with their plan, and Free without one", () => {
    const hrefs = dashboardLinks(renderToStaticMarkup(<PricingSection locale={locale} />))
      .map((link) => link.href)
      .filter((href) => href?.includes("/signup"))

    expect(hrefs).toEqual([
      `https://app.lobbystack.com/${locale}/signup`,
      `https://app.lobbystack.com/${locale}/signup?plan=starter`,
      `https://app.lobbystack.com/${locale}/signup?plan=pro`,
    ])
  })
})
