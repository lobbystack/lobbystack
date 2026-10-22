import { CtaSection } from "@/marketing/components/CtaSection"
import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { AffiliateProgramFaqSection } from "@/marketing/components/affiliate/AffiliateProgramFaqSection"
import { AffiliateProgramSections } from "@/marketing/components/affiliate/AffiliateProgramSections"
import { getCopy, getRouteSeo, localizePath, type Locale } from "@/marketing/i18n"
import { getAffiliateProgramFaqs } from "@/marketing/lib/affiliate-program-faqs"
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const pageTitles: Record<Locale, string> = {
  en: "Affiliate Program",
  fr: "Programme d'affiliation",
  es: "Programa de afiliados",
  sr: "Partnerski program",
}
const imageAlts: Record<Locale, string> = {
  en: "LobbyStack Affiliate Program",
  fr: "Programme d'affiliation LobbyStack",
  es: "Programa de afiliados de LobbyStack",
  sr: "LobbyStack partnerski program",
}
const affiliateOgImage =
  "/illustrations/open-source-ai-receptionist-affiliate-program-hero.webp"

export function affiliateProgramPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const canonicalPath = localizePath(locale, "/affiliate-program/")
  const seo = getRouteSeo({ locale, path: "/affiliate-program/" })
  const pageTitle = pageTitles[locale]
  return {
    ...seo,
    canonicalPath,
    locale,
    image: affiliateOgImage,
    imageAlt: imageAlts[locale],
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      softwareApplicationJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: pageTitle, path: canonicalPath },
      ]),
      faqPageJsonLd({
        path: canonicalPath,
        faqs: getAffiliateProgramFaqs(locale),
        locale,
      }),
    ],
  }
}

export function AffiliateProgramPage({ locale }: { locale: Locale }) {
  const seo = affiliateProgramPageSeo(locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content">
        <AffiliateProgramSections locale={locale} />
        <AffiliateProgramFaqSection locale={locale} />
        <CtaSection locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
