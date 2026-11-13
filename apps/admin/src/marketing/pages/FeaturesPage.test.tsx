import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SUPPORTED_LOCALES, translatedBasePaths } from "@/marketing/i18n"
import { featureGroups, featureIndexCopy, featureLink } from "@/marketing/lib/feature-index"
import { markdownTwin } from "@/marketing/markdown-twins"
import { FeaturesPage } from "@/marketing/pages/FeaturesPage"

const featureIds = featureGroups.flatMap((group) => group.features)

describe("features page", () => {
  it.each(SUPPORTED_LOCALES)("links every feature card to its page or guide in %s", (locale) => {
    const html = renderToStaticMarkup(<FeaturesPage locale={locale} />)
    const index = html.slice(html.indexOf('id="feature-index"'), html.indexOf('id="included"'))
    for (const id of featureIds) {
      const { href } = featureLink(locale, id)
      const card = index.split("<a ").find((anchor) => anchor.includes(`href="${href}"`))
      expect(card, id).toBeDefined()
      expect(card).toContain(`<h3`)
    }
    expect(index.split("<a ")).toHaveLength(featureIds.length + 1)
  })

  it("sends cards on this site only to pages every language has", () => {
    for (const id of featureIds) {
      const { href, external } = featureLink("en", id)
      if (!external) expect(translatedBasePaths, id).toContain(href)
    }
  })

  it("opens the Help Center in French and Spanish, and in English for Serbian", () => {
    expect(featureLink("fr", "inbox").href).toBe("https://docs.lobbystack.com/fr/dashboard/inbox")
    expect(featureLink("es", "inbox").href).toBe("https://docs.lobbystack.com/es/dashboard/inbox")
    expect(featureLink("sr", "inbox").href).toBe("https://docs.lobbystack.com/dashboard/inbox")
  })

  it.each(SUPPORTED_LOCALES)("lists the same features in the Markdown twin in %s", async (locale) => {
    const body = await (await markdownTwin(locale, "features"))?.text()
    for (const id of featureIds) {
      expect(body).toContain(`[${featureIndexCopy[locale].features[id].title}](`)
    }
  })
})
