import { partnerTierCatalog, partnerTierSlugs, selfHostedSupportCatalog } from "@lobbystack/shared"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SUPPORTED_LOCALES, type Locale } from "@/marketing/i18n"
import { markdownAlternatePath } from "@/marketing/lib/agent-discovery"
import { getSelfHostedSupportCopy } from "@/marketing/lib/self-hosted-support-copy"
import { getWhiteLabelCopy } from "@/marketing/lib/white-label-copy"
import { getWhiteLabelFaqs } from "@/marketing/lib/white-label-faqs"
import { whiteLabelMarkdown } from "@/marketing/lib/white-label-markdown"
import { markdownTwin } from "@/marketing/markdown-twins"
import { viewForHash } from "@/marketing/components/white-label/TierViewSwitch"
import { WhiteLabelPage, whiteLabelPageSeo } from "@/marketing/pages/WhiteLabelPage"

const leafPaths = (value: unknown, prefix = ""): string[] => {
  if (typeof value === "function") return [prefix]
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key))
}

const render = (locale: Locale) => renderToStaticMarkup(<WhiteLabelPage locale={locale} />)

describe("white-label page", () => {
  it.each(SUPPORTED_LOCALES)("sends partner signups to White Label signup in %s", (locale) => {
    const html = render(locale)
    const signup = `https://app.lobbystack.com/partner/signup?lng=${locale}`
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href?.replaceAll("&amp;", "&"))
    // The hero, the four tier cards and the closing section.
    expect(hrefs.filter((href) => href === signup)).toHaveLength(6)
    expect(hrefs).toContain("#tiers")
  })

  it("shows each tier's price and pool from the partner tier catalog", () => {
    const html = render("en")
    // The cards open on annual billing, as the pricing page's do.
    expect(html).toContain(">$39<")
    expect(html).toContain(">$159<")
    expect(html).toContain(">$399<")
    expect(html).not.toContain("$39.20")
    expect(html).toContain(`${(partnerTierCatalog.growth.poolVoiceSeconds / 60).toLocaleString("en-US")} voice minutes`)
    expect(html).toContain("$0.015 a chat")
    expect(html).toContain("Per month, billed annually")
    expect(whiteLabelMarkdown("en")).toContain("| Starter | $49/mo | $39/mo |")
  })

  it.each(SUPPORTED_LOCALES)("puts the agency's self-hosted plans behind a switch in %s", (locale) => {
    const html = render(locale)
    const support = getSelfHostedSupportCopy(locale)
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href)
    // Server HTML shows the hosted tiers; the self-hosted view is there, hidden only while JavaScript runs.
    expect(html).toContain(`<div class="hidden noscript:block noscript:mt-20">`)
    expect(html).toContain(support.whiteLabel.link)
    expect(html).toContain(support.whiteLabel.title)
    expect(hrefs).toContain(selfHostedSupportCatalog.white_label.premium.checkoutUrls.annual)
    expect(hrefs).toContain(selfHostedSupportCatalog.white_label.enterprise.checkoutUrls.annual)
    expect(hrefs).not.toContain(selfHostedSupportCatalog.business.premium.checkoutUrls.annual)
  })

  it("switches the tiers to the view a link names, both ways", () => {
    expect(viewForHash("#self-hosted-tiers")).toBe("self-hosted")
    expect(viewForHash("#tiers")).toBe("hosted")
    expect(viewForHash("#faq")).toBeNull()
  })

  it("prices agency support as one flat fee, not per business", () => {
    const html = render("en")
    const selfHostedView = html.slice(html.indexOf(getSelfHostedSupportCopy("en").whiteLabel.title))
    expect(selfHostedView).toContain(">$159<")
    expect(selfHostedView).toContain(">$399<")
    expect(html).not.toContain("/business/mo")
    expect(whiteLabelMarkdown("en")).toContain("| Enterprise support | $499/mo | $399/mo |")
  })

  it.each(SUPPORTED_LOCALES)("never mentions a limit on simultaneous calls in %s", (locale) => {
    const text = `${render(locale)} ${whiteLabelMarkdown(locale)}`.toLowerCase()
    expect(text).not.toMatch(/simultaneous|concurrent|simultan|istovremen/)
  })

  it.each(SUPPORTED_LOCALES.filter((locale) => locale !== "en"))("translates every line into %s", (locale) => {
    expect(leafPaths(getWhiteLabelCopy(locale)).sort()).toEqual(leafPaths(getWhiteLabelCopy("en")).sort())
    expect(getWhiteLabelFaqs(locale)).toHaveLength(getWhiteLabelFaqs("en").length)
    expect(getWhiteLabelCopy(locale).hero.subhead).not.toBe(getWhiteLabelCopy("en").hero.subhead)
  })

  it("writes Serbian copy in Latin script only", () => {
    expect(JSON.stringify(getWhiteLabelCopy("sr")) + JSON.stringify(getWhiteLabelFaqs("sr"))).not.toMatch(/[\u0400-\u04FF]/)
  })

  it.each(SUPPORTED_LOCALES)("publishes %s metadata with its FAQ as structured data", (locale) => {
    const seo = whiteLabelPageSeo(locale)
    expect(seo.canonicalPath).toBe(locale === "en" ? "/white-label/" : `/${locale}/white-label/`)
    expect(seo.title).toContain("LobbyStack")
    expect(seo.description?.length).toBeLessThanOrEqual(160)
    const faqPage = seo.jsonLd?.find((item) => item["@type"] === "FAQPage")
    expect(faqPage?.mainEntity).toHaveLength(getWhiteLabelFaqs(locale).length)
  })

  const targetTerms: Record<Locale, string> = {
    en: "white-label ai receptionist",
    fr: "réceptionniste ia en marque blanche",
    es: "recepcionista con ia de marca blanca",
    sr: "white-label ai recepcioner",
  }

  // The title tag words the term around "open source", so it carries the term's core.
  const titleTerms: Record<Locale, string> = {
    en: "white-label ai receptionist",
    fr: "marque blanche",
    es: "marca blanca",
    sr: "white-label ai recepcioner",
  }

  // The H1 is the headline the page leads with; the target term goes in the title tag instead.
  it.each(SUPPORTED_LOCALES)("puts the %s target term in the title, the description and the first FAQ", (locale) => {
    const term = targetTerms[locale]
    expect(whiteLabelPageSeo(locale).title?.toLowerCase()).toContain(titleTerms[locale])
    expect(whiteLabelPageSeo(locale).description?.toLowerCase()).toContain(term)
    expect(getWhiteLabelFaqs(locale)[0]?.question.toLowerCase()).toContain(term)
  })

  it.each(SUPPORTED_LOCALES)("describes the %s page as the partner program's Service, priced from the tier catalog", (locale) => {
    const html = render(locale)
    const script = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
    const graph = JSON.parse(script ?? "{}")["@graph"] as Array<Record<string, unknown>>
    const service = graph.find((item) => item["@type"] === "Service")
    const offers = service?.offers as Array<{ price: string }>
    expect(offers.map((offer) => offer.price)).toEqual(
      partnerTierSlugs.map((slug) => String(partnerTierCatalog[slug].monthlyChargeCents / 100))
    )
    expect(graph.some((item) => item["@type"] === "SoftwareApplication")).toBe(false)
    const webPage = graph.find((item) => item["@type"] === "WebPage")
    expect(webPage?.about).toEqual({ "@id": service?.["@id"] })
  })

  it("serves the hero shot at phone sizes with high fetch priority", () => {
    const html = render("en")
    expect(html).toContain("/screenshots/partner-console-800.webp 800w")
    expect(html).toContain('fetchPriority="high"')
  })

  it.each(SUPPORTED_LOCALES)("serves a %s Markdown twin that agents can find", async (locale) => {
    const prefix = locale === "en" ? "" : `/${locale}`
    expect(markdownAlternatePath(`${prefix}/white-label/`)).toBe(`${prefix}/white-label.md`)
    const response = await markdownTwin(locale, "white-label")
    const body = await response?.text()
    expect(body).toContain(getWhiteLabelCopy(locale).tiers.title)
    expect(body).toContain(getWhiteLabelFaqs(locale)[0]?.question)
  })
})
