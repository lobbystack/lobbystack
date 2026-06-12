export const DEFAULT_LOCALE = "en"

export const SUPPORTED_LOCALES = ["en", "fr"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const localeMeta: Record<
  Locale,
  { label: string; nativeLabel: string; dir: "ltr" | "rtl" }
> = {
  en: { label: "English", nativeLabel: "English", dir: "ltr" },
  fr: { label: "French", nativeLabel: "Francais", dir: "ltr" },
}

export const isLocale = (value: string | undefined): value is Locale =>
  Boolean(value && SUPPORTED_LOCALES.includes(value as Locale))

export const assertLocale = (value: string | undefined): Locale => {
  if (isLocale(value)) return value
  return DEFAULT_LOCALE
}

