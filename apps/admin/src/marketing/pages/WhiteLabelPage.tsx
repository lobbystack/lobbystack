import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import {
  WhiteLabelClosing,
  WhiteLabelDashboard,
  WhiteLabelEarn,
  WhiteLabelFaq,
  WhiteLabelHero,
  WhiteLabelHowItWorks,
  WhiteLabelTiers,
} from "@/marketing/components/white-label/WhiteLabelSections"
import { getCopy, getRouteSeo, localizePath, type Locale } from "@/marketing/i18n"
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  ogImagePath,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { getWhiteLabelFaqs } from "@/marketing/lib/white-label-faqs"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const pageTitles: Record<Locale, string> = {
  en: "White label",
  fr: "Marque blanche",
  es: "Marca blanca",
  sr: "Bela etiketa",
}

export function whiteLabelPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const canonicalPath = localizePath(locale, "/white-label/")
  return {
    ...getRouteSeo({ locale, path: "/white-label/" }),
    canonicalPath,
    locale,
    image: ogImagePath("/white-label/"),
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      softwareApplicationJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: pageTitles[locale], path: canonicalPath },
      ]),
      faqPageJsonLd({ path: canonicalPath, faqs: getWhiteLabelFaqs(locale), locale }),
    ],
  }
}

export function WhiteLabelPage({ locale }: { locale: Locale }) {
  const seo = whiteLabelPageSeo(locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content">
        <WhiteLabelHero locale={locale} />
        <WhiteLabelHowItWorks locale={locale} />
        <WhiteLabelDashboard locale={locale} />
        <WhiteLabelEarn locale={locale} />
        <WhiteLabelTiers locale={locale} />
        <WhiteLabelFaq locale={locale} />
        <WhiteLabelClosing locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
