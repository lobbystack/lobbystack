import { describe, expect, it } from "vitest"
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/config"
import { legalDocuments, type LegalBlock, type LegalKind } from "@/lib/legal"

const kinds = Object.keys(legalDocuments) as LegalKind[]
const translatedLocales = SUPPORTED_LOCALES.filter((locale) => locale !== "en")

const shape = (block: LegalBlock) =>
  typeof block === "string"
    ? "p"
    : "h3" in block
      ? "h3"
      : `ul:${block.ul.length}`

const allText = (kind: LegalKind, locale: Locale) => {
  const doc = legalDocuments[kind][locale]
  return [
    doc.intro,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...section.blocks.flatMap((block) =>
        typeof block === "string"
          ? [block]
          : "h3" in block
            ? [block.h3]
            : block.ul
      ),
    ]),
  ].join("\n")
}

describe("legal documents", () => {
  describe.each(translatedLocales)("%s", (locale) => {
    it.each(kinds)("keeps the %s version in parity with English", (kind) => {
      const { en } = legalDocuments[kind]
      const translated = legalDocuments[kind][locale]

      expect(translated.sections.map((section) => section.id)).toEqual(
        en.sections.map((section) => section.id)
      )
      for (const [index, section] of en.sections.entries()) {
        expect(translated.sections[index]!.blocks.map(shape)).toEqual(
          section.blocks.map(shape)
        )
      }
    })

    it.each(kinds)("keeps em dashes out of %s", (kind) => {
      expect(allText(kind, locale)).not.toContain("—")
    })

    it.each(kinds)("links %s pages to localized routes", (kind) => {
      const text = allText(kind, locale)
      for (const path of ["/privacy/", "/pricing/", "/cookie-policy/"]) {
        expect(text).not.toContain(`href="${path}`)
      }
    })
  })

  it.each(kinds)("uses unique section anchors in %s", (kind) => {
    const ids = legalDocuments[kind].en.sections.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(kinds)("keeps em dashes out of the English %s", (kind) => {
    expect(allText(kind, "en")).not.toContain("—")
  })

  it.each(kinds)("writes the Serbian %s in Latin script", (kind) => {
    expect(allText(kind, "sr")).not.toMatch(/[Ѐ-ӿ]/)
  })
})
