import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { FeaturesCtaSection } from "@/marketing/components/features/FeaturesCtaSection"
import { FeaturesHero } from "@/marketing/components/features/FeaturesHero"
import { FeatureWall } from "@/marketing/components/features/FeatureWall"
import { IncludedOnEveryPlan } from "@/marketing/components/features/IncludedOnEveryPlan"
import { getCopy, getRouteSeo, localeTag, localizePath, type Locale } from "@/marketing/i18n"
import { absoluteUrl, breadcrumbJsonLd, organizationJsonLd, webSiteJsonLd } from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const featuresBreadcrumbNames: Record<Locale, string> = {
  en: "Features",
  fr: "Fonctionnalités",
  es: "Funciones",
  sr: "Funkcije",
}

export function featuresPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const canonicalPath = localizePath(locale, "/features/")
  const seo = getRouteSeo({ locale, path: "/features/" })
  return {
    ...seo,
    canonicalPath,
    locale,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: featuresBreadcrumbNames[locale], path: canonicalPath },
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
    ],
  }
}

export function FeaturesPage({ locale }: { locale: Locale }) {
  const seo = featuresPageSeo(locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" tabIndex={-1}>
        <FeaturesHero locale={locale} />
        <FeatureWall locale={locale} />
        <IncludedOnEveryPlan locale={locale} />
        <FeaturesCtaSection locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
