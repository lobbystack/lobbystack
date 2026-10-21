import { CtaSection } from "@/marketing/components/CtaSection"
import { FaqSection } from "@/marketing/components/FaqSection"
import { FeatureGrid } from "@/marketing/components/FeatureGrid"
import { Footer } from "@/marketing/components/Footer"
import { HeroSection } from "@/marketing/components/HeroSection"
import {
  LandingPageAdditions,
  ProductExtensionSection,
} from "@/marketing/components/LandingPageAdditions"
import { Navbar } from "@/marketing/components/Navbar"
import { TradeLinks } from "@/marketing/components/TradeLinks"
import { LobbyStackHeroVoiceDemo } from "@/marketing/components/web-voice/LobbyStackWebVoiceWidget"
import { getCopy, getRouteSeo, localizePath, type Locale } from "@/marketing/i18n"
import { getHomeFaqs } from "@/marketing/lib/home-faqs"
import {
  faqPageJsonLd,
  organizationJsonLd,
  productJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const ogImageAlt: Record<Locale, string> = {
  en: "LobbyStack open-source AI receptionist dashboard and product logo",
  fr: "Tableau de bord de réceptionniste IA open source LobbyStack et logo produit",
  es: "Panel de la recepcionista con IA de código abierto LobbyStack y logotipo del producto",
  sr: "Kontrolna tabla LobbyStack AI recepcionera otvorenog koda i logo proizvoda",
}

export function homePageSeo(locale: Locale): MarketingPageSeo {
  const canonicalPath = localizePath(locale, "/")
  return {
    ...getRouteSeo({ locale, path: "/" }),
    canonicalPath,
    locale,
    image: "/og/lobbystack-og.webp",
    imageAlt: ogImageAlt[locale],
    imageWidth: 1200,
    imageHeight: 630,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      softwareApplicationJsonLd({ locale }),
      productJsonLd({ locale }),
      faqPageJsonLd({ path: canonicalPath, faqs: getHomeFaqs(locale), locale }),
    ],
  }
}

export function HomePage({ locale }: { locale: Locale }) {
  const seo = homePageSeo(locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content">
        <HeroSection locale={locale}>
          <LobbyStackHeroVoiceDemo locale={locale} />
        </HeroSection>
        <ProductExtensionSection locale={locale} />
        <FeatureGrid locale={locale} />
        <LandingPageAdditions locale={locale} />
        <TradeLinks locale={locale} />
        <FaqSection heading={getCopy(locale).common.commonQuestions} faqs={getHomeFaqs(locale)} />
        <CtaSection locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
