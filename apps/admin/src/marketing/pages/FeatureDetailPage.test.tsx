import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { getRouteSeo, SUPPORTED_LOCALES, translatedBasePaths, type Locale } from "@/marketing/i18n"
import { markdownAlternatePath } from "@/marketing/lib/agent-discovery"
import { featurePagePath, featurePageSlugs, getFeaturePage } from "@/marketing/lib/feature-pages"
import { publicPages } from "@/marketing/lib/pages"
import { markdownTwin } from "@/marketing/markdown-twins"
import { FeatureDetailPage, featureDetailPageSeo } from "@/marketing/pages/FeatureDetailPage"

const pages = SUPPORTED_LOCALES.flatMap((locale) => featurePageSlugs.map((slug) => [locale, slug] as const))
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")

const shape = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(shape)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]))
  return typeof value
}

describe("feature pages", () => {
  it.each(pages)("renders the %s %s page with its headline, benefits, steps and questions", (locale, slug) => {
    const page = getFeaturePage(locale, slug)
    const body = text(renderToStaticMarkup(<FeatureDetailPage locale={locale} slug={slug} />))
    expect(body).toContain(page.hero.title)
    for (const item of [...page.benefits.items, ...page.steps.items]) expect(body).toContain(item.title)
    for (const faq of page.faqs) expect(body).toContain(faq.question)
  })

  it.each(SUPPORTED_LOCALES.filter((locale) => locale !== "en"))("keeps the %s copy in the shape of the English copy", (locale: Locale) => {
    for (const slug of featurePageSlugs) expect(shape(getFeaturePage(locale, slug)), slug).toEqual(shape(getFeaturePage("en", slug)))
  })

  it.each(pages)("keeps the %s %s title and description within search-result lengths", (locale, slug) => {
    const { title, description } = featureDetailPageSeo(locale, slug)
    expect(title?.length).toBeLessThanOrEqual(72)
    expect(description?.length).toBeLessThanOrEqual(165)
    expect(getRouteSeo({ locale, path: featurePagePath(slug) })?.title).toBe(title)
  })

  it("lists every page as translated, public and with a Markdown twin", async () => {
    for (const slug of featurePageSlugs) {
      const path = featurePagePath(slug)
      expect(translatedBasePaths).toContain(path)
      expect(publicPages.map((page) => page.path)).toContain(path)
      expect(markdownAlternatePath(path)).toBe(`/features/${slug}.md`)
      for (const locale of SUPPORTED_LOCALES) {
        const twin = await (await markdownTwin(locale, `features/${slug}`))?.text()
        expect(twin, `${locale} ${slug}`).toContain(getFeaturePage(locale, slug).hero.title)
      }
    }
  })
})
