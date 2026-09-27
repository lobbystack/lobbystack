import { describe, expect, it } from "vitest"
import { legalDocuments, type LegalBlock, type LegalKind } from "@/lib/legal"

const kinds = Object.keys(legalDocuments) as LegalKind[]

const shape = (block: LegalBlock) =>
  typeof block === "string"
    ? "p"
    : "h3" in block
      ? "h3"
      : `ul:${block.ul.length}`

const allText = (kind: LegalKind, locale: "en" | "fr") => {
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
  it.each(kinds)("keeps the %s English and French versions in parity", (kind) => {
    const { en, fr } = legalDocuments[kind]

    expect(fr.sections.map((section) => section.id)).toEqual(
      en.sections.map((section) => section.id)
    )
    for (const [index, section] of en.sections.entries()) {
      expect(fr.sections[index]!.blocks.map(shape)).toEqual(
        section.blocks.map(shape)
      )
    }
  })

  it.each(kinds)("uses unique section anchors in %s", (kind) => {
    const ids = legalDocuments[kind].en.sections.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(kinds)("keeps em dashes out of %s", (kind) => {
    expect(allText(kind, "en")).not.toContain("—")
    expect(allText(kind, "fr")).not.toContain("—")
  })

  it.each(kinds)("links French %s pages to French routes", (kind) => {
    const french = allText(kind, "fr")
    for (const path of ["/privacy/", "/pricing/", "/cookie-policy/"]) {
      expect(french).not.toContain(`href="${path}`)
    }
  })
})
