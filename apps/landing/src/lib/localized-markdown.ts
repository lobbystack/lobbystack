import { getRouteSeo, type Locale } from "@/i18n"

/**
 * Title and description for a localized `.md` alternate, read from the same
 * route SEO copy the HTML page uses so both stay in sync.
 */
export const localizedRouteMeta = (locale: Locale, path: string) => {
  const seo = getRouteSeo({ locale, path })
  if (!seo) throw new Error(`Missing route SEO for ${locale} ${path}`)
  return { title: seo.title, description: seo.description }
}
