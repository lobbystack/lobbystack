import { selfHostedSupportCatalog } from "@lobbystack/shared"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SUPPORTED_LOCALES, type Locale } from "@/marketing/i18n"
import { markdownAlternatePath } from "@/marketing/lib/agent-discovery"
import { getSelfHostedPricingFaqs } from "@/marketing/lib/self-hosted-pricing-faqs"
import { selfHostedPricingMarkdown } from "@/marketing/lib/self-hosted-pricing-markdown"
import { getSelfHostedSupportCopy } from "@/marketing/lib/self-hosted-support-copy"
import { markdownTwin } from "@/marketing/markdown-twins"
import { PricingPage } from "@/marketing/pages/PricingPage"
import { SelfHostedPricingPage, selfHostedPricingPageSeo } from "@/marketing/pages/SelfHostedPricingPage"

const leafPaths = (value: unknown, prefix = ""): string[] => {
  if (!value || typeof value !== "object") return [prefix]
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key))
}

/** Which cells hold a check, a dash or words, so translations can't move what a plan includes. */
const inclusionShape = (locale: Locale) => {
  const copy = getSelfHostedSupportCopy(locale)
  return [copy.business, copy.partner].map((audience) => ({
    lines: audience.lines.map((line) => line.plans),
    groups: audience.groups.map((group) =>
      group.rows.map((row) => row.values.map((value) => (typeof value === "boolean" ? value : "text")))
    ),
  }))
}

const render = (locale: Locale) => renderToStaticMarkup(<SelfHostedPricingPage locale={locale} />)
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href!.replaceAll("&amp;", "&"))
const prefix = (locale: Locale) => (locale === "en" ? "" : `/${locale}`)

describe("self-hosted pricing page", () => {
  it.each(SUPPORTED_LOCALES)("sends %s buyers to the annual Polar checkouts and the free edition to the docs", (locale) => {
    const links = hrefs(render(locale))
    // The cards open on annual billing, as the cloud cards do.
    expect(links).toContain(selfHostedSupportCatalog.business.premium.checkoutUrls.annual)
    expect(links).toContain(selfHostedSupportCatalog.business.enterprise.checkoutUrls.annual)
    expect(links).not.toContain(selfHostedSupportCatalog.business.premium.checkoutUrls.monthly)
    expect(links.some((href) => href.startsWith("https://docs.lobbystack.com/") && href.endsWith("self-hosting/overview"))).toBe(true)
    expect(links).toContain(`${prefix(locale)}/pricing/`)
    expect(links).toContain(`${prefix(locale)}/white-label/#self-hosted-tiers`)
    expect(links).toContain("mailto:support@lobbystack.com?subject=Self-hosted%20support")
  })

  it("shows each plan's price per business, the free edition and the hidden comparison", () => {
    const html = render("en")
    expect(html).toContain(">$0<")
    expect(html).toContain("Free forever")
    expect(html).toContain(">$20<")
    expect(html).toContain(">$80<")
    expect(html).toContain("/business/mo")
    expect(html).toContain("Compare all features")
    expect(html).toMatch(/aria-expanded="false"/)
    // The table is in the HTML for crawlers, closed behind the button, and open without JavaScript.
    expect(html).toMatch(/<div id="[^"]+" class="mx-auto mt-8 max-w-5xl hidden noscript:block">/)
    expect(html).toContain("4 business hours")
    expect(html).not.toMatch(/production is down|same business day/i)
    const markdown = selfHostedPricingMarkdown("en")
    expect(markdown).toContain("| Premium support | $25/business/mo | $20/business/mo |")
    expect(markdown).toContain(`[Monthly](${selfHostedSupportCatalog.business.premium.checkoutUrls.monthly}), [Annual](${selfHostedSupportCatalog.business.premium.checkoutUrls.annual})`)
  })

  it.each(SUPPORTED_LOCALES)("links the %s cloud pricing hero to the self-hosted plans", (locale) => {
    const html = renderToStaticMarkup(<PricingPage locale={locale} />)
    expect(hrefs(html)).toContain(`${prefix(locale)}/pricing/self-hosted/`)
  })

  it.each(SUPPORTED_LOCALES)("never mentions a limit on simultaneous calls in %s", (locale) => {
    const text = `${render(locale)} ${selfHostedPricingMarkdown(locale)}`.toLowerCase()
    expect(text).not.toMatch(/simultaneous|concurrent|simultan|istovremen/)
  })

  it.each(SUPPORTED_LOCALES.filter((locale) => locale !== "en"))("translates every line into %s", (locale) => {
    expect(leafPaths(getSelfHostedSupportCopy(locale)).sort()).toEqual(leafPaths(getSelfHostedSupportCopy("en")).sort())
    expect(inclusionShape(locale)).toEqual(inclusionShape("en"))
    expect(getSelfHostedPricingFaqs(locale)).toHaveLength(getSelfHostedPricingFaqs("en").length)
    expect(getSelfHostedSupportCopy(locale).pricing.intro).not.toBe(getSelfHostedSupportCopy("en").pricing.intro)
  })

  it("writes Serbian copy in Latin script only", () => {
    expect(JSON.stringify(getSelfHostedSupportCopy("sr")) + JSON.stringify(getSelfHostedPricingFaqs("sr"))).not.toMatch(/[Ѐ-ӿ]/)
  })

  it.each(SUPPORTED_LOCALES)("keeps em dashes out of the %s copy", (locale) => {
    expect(JSON.stringify(getSelfHostedSupportCopy(locale)) + JSON.stringify(getSelfHostedPricingFaqs(locale))).not.toContain("—")
  })

  it.each(SUPPORTED_LOCALES)("publishes %s metadata with its FAQ as structured data", (locale) => {
    const seo = selfHostedPricingPageSeo(locale)
    expect(seo.canonicalPath).toBe(`${prefix(locale)}/pricing/self-hosted/`)
    expect(seo.title).toContain("LobbyStack")
    expect(seo.description?.length).toBeLessThanOrEqual(160)
    const faqPage = seo.jsonLd?.find((item) => item["@type"] === "FAQPage")
    expect(faqPage?.mainEntity).toHaveLength(getSelfHostedPricingFaqs(locale).length)
    // The cloud app's offers are no price for self-hosted support.
    expect(seo.jsonLd?.some((item) => item["@type"] === "SoftwareApplication")).toBe(false)
  })

  it.each(SUPPORTED_LOCALES)("serves a %s Markdown twin that agents can find", async (locale) => {
    expect(markdownAlternatePath(`${prefix(locale)}/pricing/self-hosted/`)).toBe(`${prefix(locale)}/pricing/self-hosted.md`)
    const body = await (await markdownTwin(locale, "pricing/self-hosted"))?.text()
    expect(body).toContain(getSelfHostedSupportCopy(locale).pricing.heading)
    expect(body).toContain(selfHostedSupportCatalog.business.enterprise.checkoutUrls.monthly)
    expect(body).toContain(getSelfHostedPricingFaqs(locale)[0]?.question)
  })
})
