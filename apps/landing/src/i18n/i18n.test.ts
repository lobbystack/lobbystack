import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  SUPPORTED_LOCALES,
  alternateLocaleLinks,
  catalog,
  getRouteSeo,
  languageSwitcherLinks,
  localeTag,
  localizeHref,
  localizePath,
  stripLocaleFromPath,
  translatedBasePaths,
  type Locale,
} from "@/i18n"
import {
  seoLandingPageByPath,
  seoLandingPages,
} from "@/lib/seo-landing-pages"
import {
  fullyLocalizedFrenchSeoPaths,
  fullyLocalizedSeoPaths,
  localizedSeoLandingPages,
} from "@/lib/localized-seo-landing-pages"

const translatedLocales = SUPPORTED_LOCALES.filter((locale) => locale !== "en")

const leafPaths = (value: unknown, prefix = ""): string[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key)
  )
}

const pathFromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const readSourceTree = (dir: string): string => {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = `${dir}/${entry}`
      const stat = statSync(path)

      if (stat.isDirectory()) return readSourceTree(path)
      if (!/\.(astro|ts|tsx|js|md)$/.test(entry)) return ""
      if (/\.(test|spec)\.(ts|tsx|js)$/.test(entry)) return ""

      return readFileSync(path, "utf8")
    })
    .join("\n")
}

const canonicalSlugsIn = (dir: string) =>
  readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => {
      const body = readFileSync(`${dir}/${entry}`, "utf8")
      return body.match(/^canonicalSlug:\s*"([^"]+)"/m)?.[1] ?? entry.replace(/\.md$/, "")
    })
    .sort()

describe("landing i18n route helpers", () => {
  it("strips and applies locale prefixes consistently", () => {
    expect(stripLocaleFromPath("/fr/pricing/")).toBe("/pricing/")
    expect(stripLocaleFromPath("/pricing")).toBe("/pricing/")
    expect(localizePath("en", "/fr/features/")).toBe("/features/")
    expect(localizePath("fr", "/features/")).toBe("/fr/features/")
    expect(localizePath("fr", "/")).toBe("/fr/")
    expect(stripLocaleFromPath("/es/pricing/")).toBe("/pricing/")
    expect(stripLocaleFromPath("/sr/")).toBe("/")
    expect(localizePath("es", "/sr/features/")).toBe("/es/features/")
    expect(localizePath("sr", "/")).toBe("/sr/")
  })

  it("localizes internal hrefs and preserves machine/external endpoints", () => {
    expect(localizeHref("fr", "/pricing/?interval=year#plans")).toBe(
      "/fr/pricing/?interval=year#plans"
    )
    expect(localizeHref("fr", "/cookie-policy/")).toBe("/fr/cookie-policy/")
    expect(localizeHref("fr", "https://docs.lobbystack.com/introduction")).toBe(
      "https://docs.lobbystack.com/introduction"
    )
    expect(localizeHref("fr", "/openapi.json")).toBe("/openapi.json")
    expect(localizeHref("fr", "/.well-known/api-catalog")).toBe(
      "/.well-known/api-catalog"
    )
  })

  it("generates hreflang alternates from the unprefixed canonical path", () => {
    const alternates = (path: string) => [
      { hrefLang: "en", href: `https://lobbystack.com${path}` },
      { hrefLang: "fr", href: `https://lobbystack.com/fr${path}` },
      { hrefLang: "es", href: `https://lobbystack.com/es${path}` },
      { hrefLang: "sr-Latn", href: `https://lobbystack.com/sr${path}` },
      { hrefLang: "x-default", href: `https://lobbystack.com${path}` },
    ]

    expect(alternateLocaleLinks("/fr/pricing/")).toEqual(alternates("/pricing/"))
    expect(alternateLocaleLinks("/sr/pricing/")).toEqual(alternates("/pricing/"))
    expect(alternateLocaleLinks("/cookie-policy/")).toEqual(
      alternates("/cookie-policy/")
    )
    expect(
      alternateLocaleLinks("/es/blog/best-open-source-ai-phone-answering-services/")
    ).toEqual(alternates("/blog/best-open-source-ai-phone-answering-services/"))
  })

  it("tags Serbian pages as Latin script", () => {
    expect(localeTag("sr")).toBe("sr-Latn")
    expect(localeTag("es")).toBe("es")
    const date = new Intl.DateTimeFormat(localeTag("sr"), {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, 8, 30)))
    expect(date).toBe("30. septembar 2026.")
    expect(date).not.toMatch(/[\u0400-\u04FF]/)
  })

  it("links the language switcher to the same page in every language", () => {
    expect(languageSwitcherLinks("/es/pricing/")).toEqual([
      { locale: "en", label: "English", hrefLang: "en", href: "/pricing/" },
      { locale: "fr", label: "Français", hrefLang: "fr", href: "/fr/pricing/" },
      { locale: "es", label: "Español", hrefLang: "es", href: "/es/pricing/" },
      { locale: "sr", label: "Srpski", hrefLang: "sr-Latn", href: "/sr/pricing/" },
    ])
    expect(languageSwitcherLinks("/unknown-page/").map((link) => link.href)).toEqual([
      "/",
      "/fr/",
      "/es/",
      "/sr/",
    ])
  })
})

describe("landing translated route registry", () => {
  it("has SEO metadata for every non-blog translated route in every locale", () => {
    const locales: Locale[] = [...SUPPORTED_LOCALES]
    const checkedPaths = translatedBasePaths.filter(
      (path) => path === "/blog/" || !path.startsWith("/blog/")
    )

    for (const locale of locales) {
      for (const path of checkedPaths) {
        const seo = getRouteSeo({ locale, path })
        expect(seo, `${locale} ${path}`).toBeDefined()
        expect(seo?.title, `${locale} ${path} title`).toBeTruthy()
        expect(seo?.description, `${locale} ${path} description`).toBeTruthy()
      }
    }
  })

  it("keeps middleware Accept-Language route checks in parity", () => {
    const middleware = readFileSync(
      pathFromHere("../../functions/_middleware.js"),
      "utf8"
    )

    for (const path of translatedBasePaths) {
      expect(middleware, `middleware should include ${path}`).toContain(
        `"${path}"`
      )
    }
  })
})

describe("landing dictionaries", () => {
  it.each(translatedLocales)("has every English key in the %s dictionary", (locale) => {
    expect(leafPaths(catalog[locale]).sort()).toEqual(leafPaths(catalog.en).sort())
  })

  it("writes Serbian copy in Latin script only", () => {
    expect(JSON.stringify(catalog.sr)).not.toMatch(/[\u0400-\u04FF]/)
  })
})

describe("landing translated content coverage", () => {
  it("has complete French content for every generated SEO landing page", () => {
    const frenchPages = localizedSeoLandingPages("fr")

    expect(frenchPages).toHaveLength(seoLandingPages.length)

    for (const frenchPage of frenchPages) {
      const englishPage = seoLandingPageByPath(frenchPage.path)

      expect(fullyLocalizedFrenchSeoPaths.has(frenchPage.path)).toBe(true)
      expect(englishPage).toBeDefined()
      expect(frenchPage.title).not.toBe(englishPage?.title)
      expect(frenchPage.description).not.toBe(englishPage?.description)
      expect(frenchPage.h1).not.toBe(englishPage?.h1)
      expect(frenchPage.intro).not.toBe(englishPage?.intro)
      expect(frenchPage.imageAlt).not.toBe(englishPage?.imageAlt)
      expect(frenchPage.proofPoints).toHaveLength(3)
      expect(frenchPage.sections.length).toBeGreaterThanOrEqual(3)
      expect(frenchPage.relatedLinks.length).toBeGreaterThanOrEqual(3)
      expect(frenchPage.ctaHeading).toBeTruthy()
      expect(frenchPage.ctaBody).toBeTruthy()

      for (const section of frenchPage.sections) {
        expect(section.title).toBeTruthy()
        expect(section.body).toBeTruthy()
        expect(section.points.length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it.each(translatedLocales)(
    "has a %s blog post for every English canonical blog slug",
    (locale) => {
      const englishSlugs = canonicalSlugsIn(pathFromHere("../content/blog"))
      const localizedSlugs = canonicalSlugsIn(
        pathFromHere(`../content/blog/${locale}`)
      )

      expect(localizedSlugs).toEqual(englishSlugs)
    }
  )

  it.each(translatedLocales)(
    "has a %s changelog entry for every English entry",
    (locale) => {
      const english = canonicalSlugsIn(pathFromHere("../content/changelog"))
      const localized = canonicalSlugsIn(
        pathFromHere(`../content/changelog/${locale}`)
      )

      expect(localized).toEqual(english)
    }
  )

  it.each(["es", "sr"] as const)(
    "publishes the same %s SEO landing pages as French",
    (locale) => {
      expect([...fullyLocalizedSeoPaths(locale)].sort()).toEqual(
        [...fullyLocalizedFrenchSeoPaths].sort()
      )

      for (const page of localizedSeoLandingPages(locale)) {
        const englishPage = seoLandingPageByPath(page.path)
        expect(englishPage, page.path).toBeDefined()
        expect(page.title, page.path).not.toBe(englishPage?.title)
        expect(page.h1, page.path).not.toBe(englishPage?.h1)
        expect(page.intro, page.path).not.toBe(englishPage?.intro)
        expect(page.sections.length, page.path).toBeGreaterThanOrEqual(1)
        if (locale === "sr") {
          expect(JSON.stringify(page), page.path).not.toMatch(/[\u0400-\u04FF]/)
        }
      }
    }
  )

  it("does not keep the deleted generic French page model", () => {
    expect(existsSync(pathFromHere("../components/LocalizedPage.astro"))).toBe(
      false
    )
    expect(existsSync(pathFromHere("../lib/fr-pages.ts"))).toBe(false)

    const source = readSourceTree(pathFromHere("../"))
    expect(source).not.toContain("LocalizedPage")
    expect(source).not.toContain("fr-pages")
  })
})
