import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  alternateLocaleLinks,
  getRouteSeo,
  localizeHref,
  localizePath,
  stripLocaleFromPath,
  translatedBasePaths,
  type Locale,
} from "@/i18n"

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
  })

  it("localizes internal hrefs and preserves machine/external endpoints", () => {
    expect(localizeHref("fr", "/pricing/?interval=year#plans")).toBe(
      "/fr/pricing/?interval=year#plans"
    )
    expect(localizeHref("fr", "https://docs.lobbystack.com/introduction")).toBe(
      "https://docs.lobbystack.com/introduction"
    )
    expect(localizeHref("fr", "/openapi.json")).toBe("/openapi.json")
    expect(localizeHref("fr", "/.well-known/api-catalog")).toBe(
      "/.well-known/api-catalog"
    )
  })

  it("generates hreflang alternates from the unprefixed canonical path", () => {
    expect(alternateLocaleLinks("/fr/pricing/")).toEqual([
      { hrefLang: "en", href: "https://lobbystack.com/pricing/" },
      { hrefLang: "fr", href: "https://lobbystack.com/fr/pricing/" },
      { hrefLang: "x-default", href: "https://lobbystack.com/pricing/" },
    ])
  })
})

describe("landing translated route registry", () => {
  it("has SEO metadata for every non-blog translated route in every locale", () => {
    const locales: Locale[] = ["en", "fr"]
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

describe("landing translated content coverage", () => {
  it("has a French blog post for every English canonical blog slug", () => {
    const englishSlugs = canonicalSlugsIn(pathFromHere("../content/blog"))
    const frenchSlugs = canonicalSlugsIn(pathFromHere("../content/blog/fr"))

    expect(frenchSlugs).toEqual(englishSlugs)
  })

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
