import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import type { Locale } from "@/marketing/i18n"
import { CookiePolicyMainEn, cookiePolicySeoEn } from "@/marketing/pages/cookie-policy/en"
import { CookiePolicyMainEs, cookiePolicySeoEs } from "@/marketing/pages/cookie-policy/es"
import { CookiePolicyMainFr, cookiePolicySeoFr } from "@/marketing/pages/cookie-policy/fr"
import { CookiePolicyMainSr, cookiePolicySeoSr } from "@/marketing/pages/cookie-policy/sr"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

// Each locale's cookie policy keeps its own copy and markup under
// ./cookie-policy/.
const pages = {
  en: { seo: cookiePolicySeoEn, Main: CookiePolicyMainEn },
  fr: { seo: cookiePolicySeoFr, Main: CookiePolicyMainFr },
  es: { seo: cookiePolicySeoEs, Main: CookiePolicyMainEs },
  sr: { seo: cookiePolicySeoSr, Main: CookiePolicyMainSr },
} satisfies Record<Locale, { seo: () => MarketingPageSeo; Main: () => React.ReactNode }>

export function cookiePolicyPageSeo(locale: Locale): MarketingPageSeo {
  return pages[locale].seo()
}

export function CookiePolicyPage({ locale }: { locale: Locale }) {
  const seo = cookiePolicyPageSeo(locale)
  const { Main } = pages[locale]
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <Main />
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
