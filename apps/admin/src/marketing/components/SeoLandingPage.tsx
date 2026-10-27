import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { GeneralLayout } from "@/marketing/components/solution-layouts/GeneralLayout"
import type { SeoLandingPageProps } from "@/marketing/components/solution-layouts/types"
import { OpenSourceLayout } from "@/marketing/components/solution-layouts/OpenSourceLayout"
import { SelfHostedLayout } from "@/marketing/components/solution-layouts/SelfHostedLayout"
import { TimelineLayout } from "@/marketing/components/solution-layouts/TimelineLayout"
import { TradeLayout } from "@/marketing/components/solution-layouts/TradeLayout"
import { getCopy, localizePath, type Locale } from "@/marketing/i18n"
import { breadcrumbJsonLd, faqPageJsonLd, organizationJsonLd, webSiteJsonLd } from "@/marketing/lib/seo"
import type { SeoLandingPage as SeoLandingPageData } from "@/marketing/lib/seo-landing-pages"
import { tradeDetailsFor } from "@/marketing/lib/trade-details"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

export function seoLandingPageSeo(locale: Locale, page: SeoLandingPageData): MarketingPageSeo {
  const copy = getCopy(locale)
  const canonicalPath = localizePath(locale, page.path)
  const faqJsonLd =
    page.faqs.length > 0 ? faqPageJsonLd({ path: canonicalPath, faqs: page.faqs, locale }) : undefined
  return {
    title: page.title,
    description: page.description,
    canonicalPath,
    locale,
    image: page.image,
    imageAlt: page.imageAlt,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: page.eyebrow, path: canonicalPath },
      ]),
      ...(faqJsonLd ? [faqJsonLd] : []),
    ],
  }
}

export function SeoLandingPage({ page, locale }: SeoLandingPageProps) {
  const seo = seoLandingPageSeo(locale, page)
  const Layout = layoutFor(page, locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" className="min-h-screen bg-background text-foreground">
        <Layout page={page} locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}

/** Each kind of solution page has its own layout file in solution-layouts/. */
function layoutFor(page: SeoLandingPageData, locale: Locale) {
  if (locale === "en" && tradeDetailsFor(page.slug)) return TradeLayout
  if (locale === "en" && (page.slug === "after-hours-answering-service" || page.slug === "ai-receptionist-for-dental-offices")) {
    return TimelineLayout
  }
  if (locale === "en" && page.slug === "self-hosted-ai-receptionist") return SelfHostedLayout
  if (page.slug === "open-source-ai-receptionist") return OpenSourceLayout
  return GeneralLayout
}
