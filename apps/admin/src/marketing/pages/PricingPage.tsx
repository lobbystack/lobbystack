import { CtaSection } from "@/marketing/components/CtaSection"
import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { PricingSection } from "@/marketing/components/PricingSection"
import { PricingFaqSection } from "@/marketing/components/pricing/PricingFaqSection"
import { getCopy, getRouteSeo, localeTag, localizePath, type Locale } from "@/marketing/i18n"
import { getPricingFaqs } from "@/marketing/lib/pricing-faqs"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const breadcrumbNames: Record<Locale, string> = {
  en: "Pricing",
  fr: "Tarifs",
  es: "Precios",
  sr: "Cene",
}

export function pricingPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const canonicalPath = localizePath(locale, "/pricing/")
  const seo = getRouteSeo({ locale, path: "/pricing/" })
  return {
    ...seo,
    canonicalPath,
    locale,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      softwareApplicationJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: breadcrumbNames[locale], path: canonicalPath },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": absoluteUrl(`${canonicalPath}#webpage`),
        name: seo?.title,
        url: absoluteUrl(canonicalPath),
        description: seo?.description,
        inLanguage: localeTag(locale),
        isPartOf: {
          "@id": absoluteUrl("/#website"),
        },
      },
      faqPageJsonLd({
        path: canonicalPath,
        faqs: getPricingFaqs(locale),
        locale,
      }),
    ],
  }
}

export function PricingPage({ locale }: { locale: Locale }) {
  const seo = pricingPageSeo(locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" tabIndex={-1}>
        <PricingSection locale={locale} />
        <PricingFaqSection locale={locale} />
        <CtaSection locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
