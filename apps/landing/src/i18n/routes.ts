import { absoluteUrl, normalizedPath } from "@/lib/seo"
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  localeMeta,
  type Locale,
} from "@/i18n/config"
import { translatedBasePaths } from "@/i18n/translated-base-paths"

export { translatedBasePaths }

export const translatedPathSet = new Set<string>(translatedBasePaths)

export const stripLocaleFromPath = (path = "/") => {
  const normalized = normalizedPath(path)
  const [, maybeLocale, ...rest] = normalized.split("/")

  if (!isLocale(maybeLocale) || maybeLocale === DEFAULT_LOCALE) {
    return normalized
  }

  const stripped = `/${rest.join("/")}`
  return normalizedPath(stripped === "/" ? "/" : stripped)
}

export const localeFromPath = (path = "/"): Locale => {
  const [, maybeLocale] = normalizedPath(path).split("/")
  return isLocale(maybeLocale) ? maybeLocale : DEFAULT_LOCALE
}

export const localizePath = (locale: Locale, path = "/") => {
  const basePath = stripLocaleFromPath(path)

  if (locale === DEFAULT_LOCALE) return basePath
  if (!hasTranslation(basePath)) return basePath
  if (basePath === "/") return `/${locale}/`
  return `/${locale}${basePath}`
}

export const localizeHref = (locale: Locale, href: string) => {
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("/.well-known/") ||
    href.startsWith("/api/") ||
    href.startsWith("/openapi.json") ||
    href.startsWith("/schema/") ||
    href.startsWith("/schemamap.xml") ||
    href.startsWith("/feed.xml") ||
    href.startsWith("/llms.txt") ||
    href.endsWith(".md") ||
    href.endsWith(".txt")
  ) {
    return href
  }

  const suffixStart = href.search(/[?#]/)
  const pathname = suffixStart === -1 ? href : href.slice(0, suffixStart)
  const suffix = suffixStart === -1 ? "" : href.slice(suffixStart)

  return `${localizePath(locale, pathname || "/")}${suffix}`
}

export const hasTranslation = (path = "/") =>
  translatedPathSet.has(stripLocaleFromPath(path))

export const alternateLocaleLinks = (path = "/") => {
  const basePath = stripLocaleFromPath(path)
  if (!hasTranslation(basePath)) return []

  return [
    ...SUPPORTED_LOCALES.map((locale) => ({
      hrefLang: localeMeta[locale].tag,
      href: absoluteUrl(localizePath(locale, basePath)),
    })),
    {
      hrefLang: "x-default",
      href: absoluteUrl(localizePath(DEFAULT_LOCALE, basePath)),
    },
  ]
}

/**
 * Links to the same page in every supported language, for the language
 * switcher. A page without translations links to each locale's home page.
 */
export const languageSwitcherLinks = (path = "/") => {
  const basePath = stripLocaleFromPath(path)
  const target = hasTranslation(basePath) ? basePath : "/"

  return SUPPORTED_LOCALES.map((locale) => ({
    locale,
    label: localeMeta[locale].nativeLabel,
    hrefLang: localeMeta[locale].tag,
    href: localizePath(locale, target),
  }))
}
