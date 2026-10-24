import { SeoLandingPage, seoLandingPageSeo } from "@/marketing/components/SeoLandingPage"
import type { Locale } from "@/marketing/i18n"
import { getLocalizedSeoLandingPage } from "@/marketing/lib/localized-seo-landing-pages"

// Each locale renders its own translation of the shared /about/ page.
function aboutPage(locale: Locale) {
  const page = getLocalizedSeoLandingPage(locale, "/about/")
  if (!page) throw new Error(`Missing /about/ SEO landing page for ${locale}`)
  return page
}

export function aboutPageSeo(locale: Locale) {
  return seoLandingPageSeo(locale, aboutPage(locale))
}

export function AboutPage({ locale }: { locale: Locale }) {
  return <SeoLandingPage page={aboutPage(locale)} locale={locale} />
}
