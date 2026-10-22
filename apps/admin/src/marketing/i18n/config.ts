export const DEFAULT_LOCALE = "en"

export const SUPPORTED_LOCALES = ["en", "fr", "es", "sr"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

/**
 * `tag` is the BCP 47 tag for `<html lang>`, `hreflang`, `Intl` and schema.org
 * `inLanguage`. Serbian is published in Latin script only, and a bare `sr` tag
 * makes `Intl` format dates and numbers in Cyrillic, so it uses `sr-Latn`.
 * `ogLocale` is the Open Graph `og:locale` value.
 */
export const localeMeta: Record<
  Locale,
  {
    label: string
    nativeLabel: string
    dir: "ltr" | "rtl"
    tag: string
    ogLocale: string
  }
> = {
  en: {
    label: "English",
    nativeLabel: "English",
    dir: "ltr",
    tag: "en",
    ogLocale: "en_US",
  },
  fr: {
    label: "French",
    nativeLabel: "Français",
    dir: "ltr",
    tag: "fr",
    ogLocale: "fr_FR",
  },
  es: {
    label: "Spanish",
    nativeLabel: "Español",
    dir: "ltr",
    tag: "es",
    ogLocale: "es_ES",
  },
  sr: {
    label: "Serbian",
    nativeLabel: "Srpski",
    dir: "ltr",
    tag: "sr-Latn",
    ogLocale: "sr_RS",
  },
}

/** Locales other than the default, which are served under a `/{locale}/` prefix. */
export const PREFIXED_LOCALES = SUPPORTED_LOCALES.filter(
  (locale) => locale !== DEFAULT_LOCALE
)

export const isLocale = (value: string | undefined): value is Locale =>
  Boolean(value && SUPPORTED_LOCALES.includes(value as Locale))

export const assertLocale = (value: string | undefined): Locale => {
  if (isLocale(value)) return value
  return DEFAULT_LOCALE
}

/** BCP 47 tag to use with `Intl` and in markup for a locale. */
export const localeTag = (locale: Locale | string | undefined) =>
  localeMeta[assertLocale(locale)].tag
