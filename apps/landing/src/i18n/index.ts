import { en } from "@/i18n/en"
import { fr } from "@/i18n/fr"
import { es } from "@/i18n/es"
import { sr } from "@/i18n/sr"
import { DEFAULT_LOCALE, assertLocale, type Locale } from "@/i18n/config"
import type { LocalizedCatalog } from "@/i18n/types"
import { getLocalizedSeoLandingPage } from "@/lib/localized-seo-landing-pages"

export {
  DEFAULT_LOCALE,
  PREFIXED_LOCALES,
  SUPPORTED_LOCALES,
  assertLocale,
  isLocale,
  localeMeta,
  localeTag,
  type Locale,
} from "@/i18n/config"
export {
  alternateLocaleLinks,
  hasTranslation,
  languageSwitcherLinks,
  localeFromPath,
  localizeHref,
  localizePath,
  stripLocaleFromPath,
  translatedBasePaths,
  translatedPathSet,
} from "@/i18n/routes"
export type { FaqItem, LandingMessages, LocalizedSeo } from "@/i18n/types"

export const catalog = {
  en,
  fr,
  es,
  sr,
} satisfies LocalizedCatalog

export const getCopy = (locale: Locale | string | undefined) =>
  catalog[assertLocale(locale)]

export const getRouteSeo = ({
  locale,
  path,
}: {
  locale?: Locale | string
  path: string
}) => {
  const activeLocale = assertLocale(locale)
  const copy = getCopy(activeLocale)
  const localizedRoutes = copy.routes as Record<
    string,
    { title: string; description: string } | undefined
  >
  const defaultRoutes = catalog[DEFAULT_LOCALE].routes as Record<
    string,
    { title: string; description: string } | undefined
  >

  const normalizedPath = path.endsWith("/") ? path : `${path}/`
  const sharedPage = getLocalizedSeoLandingPage(activeLocale, normalizedPath)

  return (
    localizedRoutes[normalizedPath] ??
    localizedRoutes[path] ??
    (sharedPage
      ? {
          title: sharedPage.title,
          description: sharedPage.description,
        }
      : undefined) ??
    defaultRoutes[normalizedPath] ??
    defaultRoutes[path]
  )
}
