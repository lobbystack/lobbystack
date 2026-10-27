import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { WhiteLabelRelated } from "@/marketing/components/white-label/WhiteLabelRelated"
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
  organizationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { getWhiteLabelCopy } from "@/marketing/lib/white-label-copy"
import { getWhiteLabelFaqs } from "@/marketing/lib/white-label-faqs"
import { whiteLabelServiceId, whiteLabelServiceJsonLd } from "@/marketing/lib/white-label-jsonld"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const pageTitles: Record<Locale, string> = {
  en: "White-label",
  fr: "Marque blanche",
  es: "Marca blanca",
  sr: "White-label",
}

/** A crop of the partner console, made from public/screenshots/partner-console.webp. */
const socialImage = "/screenshots/partner-console-social.jpg"

export function whiteLabelPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const canonicalPath = localizePath(locale, "/white-label/")
  return {
    ...getRouteSeo({ locale, path: "/white-label/" }),
    canonicalPath,
    locale,
    image: socialImage,
    imageAlt: getWhiteLabelCopy(locale).shots.consoleAlt,
    about: whiteLabelServiceId(locale),
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      whiteLabelServiceJsonLd(locale),
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
        <WhiteLabelRelated locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
