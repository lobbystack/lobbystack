import type { Locale } from "@/marketing/i18n"
import type { SeoLandingPage } from "@/marketing/lib/seo-landing-pages"

/** What the solution page shell hands each layout. */
export type SeoLandingPageProps = {
  page: SeoLandingPage
  locale: Locale
}
