import { absoluteUrl, normalizedPath } from "@/lib/seo"

export const DEFAULT_LOCALE = "en"
export const SUPPORTED_LOCALES = ["en", "fr"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const localeMeta: Record<
  Locale,
  { label: string; nativeLabel: string; dir: "ltr" | "rtl" }
> = {
  en: { label: "English", nativeLabel: "English", dir: "ltr" },
  fr: { label: "French", nativeLabel: "Français", dir: "ltr" },
}

export const translatedBasePaths = [
  "/",
  "/features/",
  "/pricing/",
  "/solutions/",
  "/solutions/ai-phone-answering/",
  "/solutions/ai-appointment-scheduler/",
  "/solutions/ai-receptionist-for-home-services/",
  "/solutions/after-hours-answering-service/",
  "/solutions/ai-receptionist-for-dental-offices/",
  "/solutions/ai-receptionist-for-salons-and-spas/",
  "/solutions/self-hosted-ai-receptionist/",
  "/missed-call-revenue-calculator/",
  "/about/",
  "/comparison/",
  "/blog/",
  "/blog/lobbystack-is-live/",
  "/docs/api/",
  "/privacy/",
  "/terms/",
] as const

const translatedPathSet = new Set<string>(translatedBasePaths)

export const isLocale = (value: string | undefined): value is Locale =>
  Boolean(value && SUPPORTED_LOCALES.includes(value as Locale))

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
    href.endsWith(".md") ||
    href.endsWith(".txt")
  ) {
    return href
  }

  const [pathname, suffix = ""] = href.split(/(?=[?#])/, 2)
  return `${localizePath(locale, pathname || "/")}${suffix}`
}

export const hasTranslation = (path = "/") =>
  translatedPathSet.has(stripLocaleFromPath(path))

export const alternateLocaleLinks = (path = "/") => {
  const basePath = stripLocaleFromPath(path)
  if (!hasTranslation(basePath)) return []

  return [
    ...SUPPORTED_LOCALES.map((locale) => ({
      hrefLang: locale,
      href: absoluteUrl(localizePath(locale, basePath)),
    })),
    {
      hrefLang: "x-default",
      href: absoluteUrl(localizePath(DEFAULT_LOCALE, basePath)),
    },
  ]
}
