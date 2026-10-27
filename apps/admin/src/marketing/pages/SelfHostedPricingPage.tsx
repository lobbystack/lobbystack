import { ArrowRight, Building2, Cloud, Mail } from "lucide-react"

import { CtaSection } from "@/marketing/components/CtaSection"
import { FaqAccordion } from "@/marketing/components/FaqAccordion"
import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { PlanViewPrompt, planViewLinkClass } from "@/marketing/components/pricing/PlanViewPrompt"
import { SupportPlans } from "@/marketing/components/pricing/SupportPlans"
import { getCopy, getRouteSeo, localeTag, localizePath, type Locale } from "@/marketing/i18n"
import { getSelfHostedPricingFaqs } from "@/marketing/lib/self-hosted-pricing-faqs"
import { getSelfHostedSupportCopy } from "@/marketing/lib/self-hosted-support-copy"
import { selfHostedSupportEmail, supportComparisonGroups, supportPlanCards } from "@/marketing/lib/self-hosted-support-plans"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  faqPageJsonLd,
  ogImagePath,
  organizationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { pricingBreadcrumbNames } from "@/marketing/pages/PricingPage"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

export function selfHostedPricingPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const canonicalPath = localizePath(locale, "/pricing/self-hosted/")
  const seo = getRouteSeo({ locale, path: "/pricing/self-hosted/" })
  return {
    ...seo,
    canonicalPath,
    locale,
    image: ogImagePath("/pricing/self-hosted/"),
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      // No SoftwareApplication here: its offers are the cloud plans, which this page doesn't sell.
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: pricingBreadcrumbNames[locale], path: localizePath(locale, "/pricing/") },
        { name: getSelfHostedSupportCopy(locale).pricing.breadcrumb, path: canonicalPath },
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
      faqPageJsonLd({ path: canonicalPath, faqs: getSelfHostedPricingFaqs(locale), locale }),
    ],
  }
}

export function SelfHostedPricingPage({ locale }: { locale: Locale }) {
  const seo = selfHostedPricingPageSeo(locale)
  const copy = getSelfHostedSupportCopy(locale)
  const t = copy.pricing
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" tabIndex={-1}>
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-4xl px-6 pt-16 pb-8 text-center md:pt-20 md:pb-10 lg:pb-12">
            <h1 className="animate-fade-up display-heading-compact stagger-1">{t.heading}</h1>
            <p className="animate-fade-up body-copy mx-auto mt-5 max-w-[60ch] stagger-2 md:text-lg">{t.intro}</p>
            <div className="animate-fade-up mt-6 stagger-2">
              <PlanViewPrompt icon={Cloud} prompt={t.cloudPrompt}>
                <a href={localizePath(locale, "/pricing/")} className={planViewLinkClass}>
                  {t.cloudLink}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </a>
              </PlanViewPrompt>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-site px-6 pt-8 pb-12 md:pt-10 md:pb-14 lg:pt-12 lg:pb-16">
          <div className="animate-fade-up stagger-3">
            <SupportPlans
              cards={supportPlanCards(locale, "business")}
              groups={supportComparisonGroups(locale, "business")}
              labels={copy.labels}
              tone="site"
              section="self_hosted_plan"
            />
          </div>
          <div className="mt-10 flex flex-col items-center gap-3">
            <PlanViewPrompt icon={Building2} prompt={t.clientsPrompt}>
              <a href={`${localizePath(locale, "/white-label/")}#self-hosted-tiers`} className={planViewLinkClass}>
                {t.clientsLink}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </a>
            </PlanViewPrompt>
            <PlanViewPrompt icon={Mail} prompt={t.questionsPrompt}>
              <a href={selfHostedSupportEmail} className={planViewLinkClass}>
                {t.questionsLink}
              </a>
            </PlanViewPrompt>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pt-10 pb-14 md:pt-12 md:pb-16 lg:pt-14 lg:pb-20">
          <h2 className="mb-10 text-center font-heading text-2xl leading-tight font-medium tracking-[-0.04em] md:text-3xl">
            {t.faqHeading}
          </h2>
          <FaqAccordion faqs={getSelfHostedPricingFaqs(locale)} />
        </section>
        <CtaSection locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
