import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { translatedBasePaths } from "@/i18n"

const competitorSlugs = [
  "upfirst-alternative",
  "my-ai-front-desk-alternative",
  "smith-ai-alternative",
  "goodcall-alternative",
  "rosie-ai-alternative",
  "zoom-ai-receptionist-alternative",
  "dialzara-alternative",
  "ringcentral-ai-receptionist-alternative",
  "nextiva-xbert-alternative",
  "quo-sona-alternative",
  "cloudtalk-ai-receptionist-alternative",
  "moneypenny-ai-receptionist-alternative",
] as const

const comparisonSlugs = [
  ...competitorSlugs,
  "ai-receptionist-vs-virtual-receptionist",
  "ai-receptionist-vs-voicemail",
] as const

const rootPath = (path: string) =>
  fileURLToPath(new URL(`../../${path}`, import.meta.url))

const frontmatterValue = (source: string, key: string) =>
  source.match(new RegExp(`^${key}:\\s*"([^"]+)"`, "m"))?.[1]

const postPath = (slug: string, locale: "en" | "fr") =>
  rootPath(`src/content/blog/${locale === "fr" ? "fr/" : ""}${slug}.md`)

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = `${directory}/${entry}`
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) return []
    return /\.(astro|js|ts|tsx|md)$/.test(entry) ? [path] : []
  })

describe("competitor comparison blog collection", () => {
  it("keeps complete English and French pairs with matching slugs", () => {
    for (const slug of comparisonSlugs) {
      const englishPath = postPath(slug, "en")
      const frenchPath = postPath(slug, "fr")

      expect(existsSync(englishPath), `missing English post ${slug}`).toBe(true)
      expect(existsSync(frenchPath), `missing French post ${slug}`).toBe(true)

      const english = readFileSync(englishPath, "utf8")
      const french = readFileSync(frenchPath, "utf8")
      expect(frontmatterValue(english, "canonicalSlug")).toBe(slug)
      expect(frontmatterValue(french, "canonicalSlug")).toBe(slug)
      expect(frontmatterValue(english, "locale")).toBe("en")
      expect(frontmatterValue(french, "locale")).toBe("fr")
    }
  })

  it("enforces search metadata and fresh-content fields", () => {
    for (const slug of comparisonSlugs) {
      for (const locale of ["en", "fr"] as const) {
        const source = readFileSync(postPath(slug, locale), "utf8")
        const title = frontmatterValue(source, "title")
        const seoTitle = frontmatterValue(source, "seoTitle")
        const description = frontmatterValue(source, "description")
        const updatedDate = source.match(/^updatedDate:\s*(.+)$/m)?.[1]

        expect(title?.length, `${locale} ${slug} title`).toBeLessThanOrEqual(60)
        expect(
          seoTitle?.length,
          `${locale} ${slug} seoTitle`
        ).toBeLessThanOrEqual(60)
        expect(
          description?.length,
          `${locale} ${slug} description minimum`
        ).toBeGreaterThanOrEqual(140)
        expect(
          description?.length,
          `${locale} ${slug} description maximum`
        ).toBeLessThanOrEqual(170)
        expect(
          Number.isNaN(Date.parse(updatedDate ?? "")),
          `${locale} ${slug} updatedDate`
        ).toBe(false)
      }
    }
  })

  it("keeps prose free of the main stop-slop markers", () => {
    const bannedPhrases = [
      "Here's the thing",
      "The uncomfortable truth",
      "Let that sink in",
      "In today's fast-paced",
      "At the end of the day",
    ]

    for (const slug of comparisonSlugs) {
      for (const locale of ["en", "fr"] as const) {
        const source = readFileSync(postPath(slug, locale), "utf8")
        expect(source, `${locale} ${slug} em dash`).not.toContain("—")
        for (const phrase of bannedPhrases) {
          expect(source, `${locale} ${slug}: ${phrase}`).not.toContain(phrase)
        }
      }
    }
  })

  it("keeps LobbyStack's core offer visible in every competitor post", () => {
    for (const slug of competitorSlugs) {
      const english = readFileSync(postPath(slug, "en"), "utf8")
      const french = readFileSync(postPath(slug, "fr"), "utf8")

      expect(english, slug).toMatch(/30 (?:free )?(?:voice )?minutes/)
      expect(english, slug).toContain("all features")
      expect(english, slug).toContain("## Choose LobbyStack")
      expect(english, slug).toContain("## Verdict")
      expect(english, slug).not.toMatch(
        /LobbyStack includes fewer|comparison is close|Rosie wins/
      )

      expect(french, slug).toMatch(/30 minutes/)
      expect(french, slug).toContain("toutes les fonctions")
      expect(french, slug).toContain("## Choisissez LobbyStack")
      expect(french, slug).toContain("## Verdict")
      expect(french, slug).not.toMatch(
        /LobbyStack inclut moins|comparaison est serrée|Rosie gagne/
      )
    }
  })

  it("registers reciprocal localized routes", () => {
    for (const slug of comparisonSlugs) {
      expect(translatedBasePaths).toContain(`/blog/${slug}/`)
    }
  })

  it("ships one correctly sized shared cover for each article pair", async () => {
    for (const slug of comparisonSlugs) {
      const expectedCover = `/illustrations/${slug}-hero.webp`
      const english = readFileSync(postPath(slug, "en"), "utf8")
      const french = readFileSync(postPath(slug, "fr"), "utf8")
      const englishAlt = frontmatterValue(english, "coverImageAlt")
      const frenchAlt = frontmatterValue(french, "coverImageAlt")
      const imagePath = rootPath(`public${expectedCover}`)

      expect(frontmatterValue(english, "coverImage")).toBe(expectedCover)
      expect(frontmatterValue(french, "coverImage")).toBe(expectedCover)
      expect(
        englishAlt?.length,
        `${slug} English cover alt`
      ).toBeGreaterThanOrEqual(20)
      expect(
        frenchAlt?.length,
        `${slug} French cover alt`
      ).toBeGreaterThanOrEqual(20)
      expect(existsSync(imagePath), `missing cover ${expectedCover}`).toBe(true)

      if (existsSync(imagePath)) {
        const metadata = await sharp(imagePath).metadata()
        expect(metadata.format, expectedCover).toBe("webp")
        expect(metadata.width, expectedCover).toBe(1672)
        expect(metadata.height, expectedCover).toBe(941)
      }
    }
  })
})

describe("comparison route migration", () => {
  it("redirects every retired route to a blog destination", () => {
    const redirects = readFileSync(rootPath("public/_redirects"), "utf8")

    expect(redirects).toContain("/comparison/ /blog/ 301")
    expect(redirects).toContain("/fr/comparison/ /fr/blog/ 301")
    expect(redirects).toContain(
      "/compare/ai-receptionist-vs-virtual-receptionist/ /blog/ai-receptionist-vs-virtual-receptionist/ 301"
    )
    expect(redirects).toContain(
      "/compare/ai-receptionist-vs-voicemail/ /blog/ai-receptionist-vs-voicemail/ 301"
    )
  })

  it("does not leave retired comparison links in live source", () => {
    for (const path of sourceFiles(rootPath("src"))) {
      const source = readFileSync(path, "utf8")
      expect(source, path).not.toMatch(/\/comparison\/|\/compare\//)
    }
  })
})
