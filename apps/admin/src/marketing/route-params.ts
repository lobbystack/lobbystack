import { notFound } from "next/navigation"

import { isLocale, type Locale } from "@/marketing/i18n"

export type LocaleParams = { params: Promise<{ locale: string }> }

/** The page's locale from its route params. Unknown locales get the 404. */
export async function localeFrom(params: LocaleParams["params"]): Promise<Locale> {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  return locale
}
