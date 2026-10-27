import { FaqSection } from "@/marketing/components/FaqSection"
import type { SeoLandingPageProps } from "@/marketing/components/solution-layouts/types"
import { TradeMomentScene } from "@/marketing/components/solution-layouts/trade/TradeScenes"
import {
  container,
  SceneFit,
  sectionSpacing,
  TradeCallRules,
  TradeCompare,
  TradeDashboard,
  TradeExampleCall,
  TradeFeatures,
  TradeIntake,
  TradeOthers,
  TradeRelated,
  TradeSetup,
} from "@/marketing/components/solution-layouts/trade/TradeSections"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { FactStrip } from "@/marketing/components/system/FactStrip"
import { PageHero } from "@/marketing/components/system/PageHero"
import { getCopy, localizeHref } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { seoLandingPages } from "@/marketing/lib/seo-landing-pages"
import { tradeDetails, tradeDetailsFor } from "@/marketing/lib/trade-details"
import { cn } from "@/marketing/lib/utils"
import { GeneralLayout } from "@/marketing/components/solution-layouts/GeneralLayout"

/**
 * English trade pages with written call examples (plumbers, HVAC,
 * electricians, roofing and the rest in trade-details.ts), modelled on
 * GitBook's industry pages: the trade's moment in the hero, an example call,
 * the call rules, the everyday calls, intake, the dashboard, setup, a
 * comparison, then the FAQ and links.
 */
export function TradeLayout({ page, locale }: SeoLandingPageProps) {
  const details = tradeDetailsFor(page.slug)
  if (!details) return <GeneralLayout page={page} locale={locale} />

  const common = getCopy(locale).common
  // localizeHref leaves absolute URLs alone, so the signup URL carries its own locale.
  const primaryHref = page.ctaPrimaryHref ? localizeHref(locale, page.ctaPrimaryHref) : appSignupUrl(locale)
  const primaryLabel = page.ctaPrimaryLabel ?? common.tryFree
  const secondaryHref = localizeHref(locale, page.ctaSecondaryHref ?? "/pricing/")
  const others = seoLandingPages.filter((candidate) => candidate.slug !== page.slug && tradeDetails[candidate.slug])
  const sectionProps = { page, details, locale }

  return (
    <>
      <PageHero
        eyebrow={page.eyebrow}
        title={page.h1}
        intro={page.intro}
        actions={
          <>
            <ButtonLink href={primaryHref}>{primaryLabel}</ButtonLink>
            <ButtonLink href={secondaryHref} variant="secondary">
              {page.ctaSecondaryLabel ?? common.seePricing}
            </ButtonLink>
          </>
        }
        footnote="No credit card required. Works with the number you already have."
        art={
          <SceneFit fit="hero">
            <TradeMomentScene details={details} locale={locale} />
          </SceneFit>
        }
      />

      <div className={cn(container, "mt-12 md:mt-16")}>
        <FactStrip facts={page.proofPoints} />
      </div>

      <TradeExampleCall {...sectionProps} />
      <TradeCallRules {...sectionProps} />
      <TradeFeatures {...sectionProps} />
      <TradeIntake {...sectionProps} />
      <TradeDashboard {...sectionProps} />
      <TradeSetup {...sectionProps} />
      <TradeCompare {...sectionProps} />

      {page.faqs.length > 0 && (
        <FaqSection className={sectionSpacing} heading={page.faqHeading ?? "Common questions"} faqs={page.faqs} />
      )}
      <TradeOthers others={others} locale={locale} />
      <TradeRelated page={page} locale={locale} />

      <ClosingCta
        titleLines={[page.ctaHeading ?? "Answer every call this week"]}
        {...(page.ctaBody ? { body: page.ctaBody } : {})}
        primary={{ label: primaryLabel, href: primaryHref }}
        secondary={{ label: page.ctaSecondaryLabel ?? common.viewPricing, href: secondaryHref }}
        footnote={common.noCreditCardCancelAnytime}
      />
    </>
  )
}
