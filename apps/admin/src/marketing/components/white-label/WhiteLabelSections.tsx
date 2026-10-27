import { intlLocale, partnerTierCatalog, partnerTierSlugs, type PartnerTierSlug } from "@lobbystack/shared"
import { Layers, LayoutGrid } from "lucide-react"

import { FaqSection } from "@/marketing/components/FaqSection"
import { SupportPlans } from "@/marketing/components/pricing/SupportPlans"
import { AppFrame, Screenshot, type ScreenshotSource } from "@/marketing/components/system/AppFrame"
import { TileFieldArt } from "@/marketing/components/system/art"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { IconCards } from "@/marketing/components/system/IconCards"
import { MediaCard } from "@/marketing/components/system/MediaCard"
import { PlanCards, type PlanCard } from "@/marketing/components/system/PlanCards"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { partnerSignupAttributes, PillLink } from "@/marketing/components/white-label/PillLink"
import { TierViewSwitch } from "@/marketing/components/white-label/TierViewSwitch"
import { HeroIllustration, OverageArt, PackagesArt, SetupFeeArt } from "@/marketing/components/white-label/WhiteLabelArt"
import { localizeHref, type Locale } from "@/marketing/i18n"
import { appPartnerSignupUrl } from "@/marketing/lib/app-links"
import { wholeUsd } from "@/marketing/lib/money"
import { getSelfHostedSupportCopy } from "@/marketing/lib/self-hosted-support-copy"
import { supportComparisonGroups, supportPlanCards } from "@/marketing/lib/self-hosted-support-plans"
import { cn } from "@/marketing/lib/utils"
import { getWhiteLabelCopy } from "@/marketing/lib/white-label-copy"
import { getWhiteLabelFaqs } from "@/marketing/lib/white-label-faqs"

type SectionProps = { locale: Locale }

const container = "mx-auto w-full max-w-site px-6"

/** Tiers whose card stands out, as the recommended choice. */
const highlightedTier: PartnerTierSlug = "growth"

/** The product shots in public/screenshots, at their pixel sizes. */
const dashboardShot = { src: "/screenshots/partner-business-dashboard.webp", width: 2880, height: 1880 }
const consoleShot: ScreenshotSource = {
  src: "/screenshots/partner-console.webp",
  width: 3200,
  height: 1972,
  // Smaller copies so phones don't download the full shot for the hero.
  srcSet: [800, 1200, 1600, 2400]
    .map((width) => `/screenshots/partner-console-${width}.webp ${width}w`)
    .concat("/screenshots/partner-console.webp 3200w")
    .join(", "),
  sizes: "(min-width: 72rem) 68rem, calc(100vw - 3rem)",
}
const signInShot = { src: "/screenshots/partner-signin.webp", width: 1600, height: 1000 }
const brandingShot = { src: "/screenshots/partner-branding.webp", width: 2880, height: 1360 }

export function WhiteLabelHero({ locale }: SectionProps) {
  const copy = getWhiteLabelCopy(locale)
  const t = copy.hero
  const signup = appPartnerSignupUrl(locale)
  return (
    <section className="relative overflow-x-clip" id="hero">
      <div className={cn(container, "relative pt-10 pb-4 md:pt-11 lg:min-h-[26rem]")}>
        <div className="relative z-10 max-w-[38rem]">
          <SectionTitle as="h1" eyebrow={t.eyebrow} lines={t.titleLines} />
          <p className="mt-4 max-w-[34.5rem] text-lg leading-[1.6] text-muted-foreground">{t.subhead}</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <PillLink href={signup} variant="primary" section="white_label_hero">
              {t.primaryCta}
            </PillLink>
            <PillLink href="#tiers" variant="secondary" section="white_label_hero">
              {t.secondaryCta}
            </PillLink>
          </div>
        </div>
        <div className="relative mx-auto mt-2 h-[15.5rem] w-full max-w-[34rem] overflow-hidden sm:h-[26rem] lg:absolute lg:top-0 lg:-right-4 lg:mt-0 lg:h-[26rem] lg:w-[34rem] lg:overflow-visible">
          <HeroIllustration
            copy={copy.heroArt}
            className="absolute top-0 left-1/2 origin-top -translate-x-1/2 scale-[0.68] sm:scale-100 lg:left-0 lg:translate-x-0"
          />
        </div>
      </div>
      <div className={cn(container, "mt-2 md:mt-12 lg:mt-6")}>
        <AppFrame>
          <Screenshot shot={consoleShot} alt={copy.shots.consoleAlt} priority />
        </AppFrame>
      </div>
    </section>
  )
}

export function WhiteLabelHowItWorks({ locale }: SectionProps) {
  const copy = getWhiteLabelCopy(locale)
  const t = copy.brand
  return (
    <section className="pt-20 md:pt-30" id="how-it-works">
      <div className={container}>
        <SectionTitle eyebrow={t.eyebrow} lines={t.titleLines} />

        <SplitCard
          className="mt-12"
          mediaClassName="min-h-[22rem] md:min-h-[30rem]"
          media={
            <>
              <AppFrame className="absolute top-8 left-6 w-[78%] md:top-12 md:left-10 md:w-[70%]">
                <Screenshot shot={signInShot} alt={copy.shots.signInAlt} />
              </AppFrame>
              <AppFrame className="absolute top-[48%] left-[22%] w-[110%] md:top-[46%] md:left-[26%] md:w-[100%]">
                <Screenshot shot={brandingShot} alt={copy.shots.brandingAlt} />
              </AppFrame>
            </>
          }
          eyebrow={t.card.eyebrow}
          title={t.card.title}
          body={t.card.body}
          action={
            <PillLink href="#tiers" variant="primary" section="white_label_brand">
              {t.card.cta}
            </PillLink>
          }
        />

        <IconCards
          className="mt-6 md:mt-12"
          cards={[
            { ...copy.console, icon: LayoutGrid },
            { ...copy.pool, icon: Layers },
          ]}
        />

        <SplitCard
          className="mt-6 md:mt-12"
          columns="md:grid-cols-[1.35fr_1fr]"
          media={<TileFieldArt />}
          eyebrow={copy.selfHost.eyebrow}
          title={copy.selfHost.title}
          body={copy.selfHost.body}
          action={
            <PillLink
              href={localizeHref(locale, "/solutions/self-hosted-ai-receptionist/")}
              variant="primary"
              section="white_label_self_host"
            >
              {copy.selfHost.cta}
            </PillLink>
          }
        />
      </div>
    </section>
  )
}

export function WhiteLabelDashboard({ locale }: SectionProps) {
  const copy = getWhiteLabelCopy(locale)
  const t = copy.receptionist
  return (
    <section className="pt-20 md:pt-30" id="receptionist">
      <div className={container}>
        <SectionTitle eyebrow={t.eyebrow} lines={[t.title]} intro={t.body} className="max-w-[44rem]" />
        <div className="mt-8">
          <PillLink href={localizeHref(locale, "/features/")} variant="secondary" section="white_label_receptionist">
            {t.cta}
          </PillLink>
        </div>
        <AppFrame className="mt-12">
          <Screenshot shot={dashboardShot} alt={copy.shots.dashboardAlt} />
        </AppFrame>
      </div>
    </section>
  )
}

export function WhiteLabelEarn({ locale }: SectionProps) {
  const copy = getWhiteLabelCopy(locale)
  const t = copy.earn
  const cards = [
    { card: t.packages, art: <PackagesArt locale={locale} copy={copy.earnArt} /> },
    { card: t.setupFees, art: <SetupFeeArt locale={locale} copy={copy.earnArt} /> },
    { card: t.overage, art: <OverageArt locale={locale} copy={copy.earnArt} /> },
  ]
  return (
    <section className="pt-20 md:pt-30" id="earn">
      <div className={container}>
        <SectionTitle eyebrow={t.eyebrow} lines={t.titleLines} />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {cards.map(({ card, art }) => (
            <MediaCard key={card.title} media={art} eyebrow={card.eyebrow} title={card.title} body={card.body} />
          ))}
        </div>
      </div>
    </section>
  )
}

function usd(locale: Locale, cents: number) {
  const dollars = cents / 100
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 3,
  }).format(dollars)
}

export function WhiteLabelTiers({ locale }: SectionProps) {
  const t = getWhiteLabelCopy(locale).tiers
  const signup = appPartnerSignupUrl(locale)
  const number = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value)
  const cards: PlanCard[] = partnerTierSlugs.map((slug) => {
    const tier = partnerTierCatalog[slug]
    const annual = tier.annualEffectiveMonthlyChargeCents
    return {
      key: slug,
      name: t[slug].name,
      description: t[slug].description,
      highlighted: slug === highlightedTier,
      period: tier.paid ? t.perMonth : null,
      price: {
        monthly: { amount: wholeUsd(locale, tier.monthlyChargeCents), note: tier.paid ? t.billedMonthly : null },
        annual: {
          amount: wholeUsd(locale, annual ?? tier.monthlyChargeCents),
          note: tier.paid ? t.billedAnnually : null,
        },
      },
      cta: { label: t[slug].cta, href: signup, attributes: partnerSignupAttributes(signup, `white_label_tier_${slug}`) },
      features: [
        t.pool(number(tier.poolVoiceSeconds / 60), number(tier.poolChats)),
        tier.trialNumbers > 0 ? t.trialNumber : t.numbers(number(tier.includedNumbers)),
        tier.paid ? t.customDomain : t.subdomain,
        tier.voiceOverageRatePerMinuteCents !== null && tier.chatOverageRatePerChatCents !== null
          ? t.overage(usd(locale, tier.voiceOverageRatePerMinuteCents), usd(locale, tier.chatOverageRatePerChatCents))
          : t.anyBusinesses,
      ],
    }
  })

  // The section switches between the partner tiers and the self-hosted support plans.
  const support = getSelfHostedSupportCopy(locale)
  const header = (eyebrow: string, title: string, intro: string) => (
    <SectionTitle centered eyebrow={eyebrow} lines={[title]} intro={intro} className="max-w-[44rem]" />
  )

  return (
    <section className="scroll-mt-20 pt-20 md:pt-30" id="tiers">
      <div className={container}>
        <TierViewSwitch
          hosted={{
            header: header(t.eyebrow, t.title, t.intro),
            prompt: support.whiteLabel.prompt,
            link: support.whiteLabel.link,
            body: (
              <>
                <PlanCards
                  className="mt-8"
                  cards={cards}
                  labels={{ monthly: t.monthly, annual: t.annual, save: t.save, billingLabel: t.billingLabel }}
                />
                <p className="fine-print mx-auto mt-6 max-w-[44rem] text-center">{t.footnote}</p>
              </>
            ),
          }}
          selfHosted={{
            header: header(getWhiteLabelCopy(locale).selfHost.eyebrow, support.whiteLabel.title, support.whiteLabel.intro),
            prompt: support.whiteLabel.backPrompt,
            link: support.whiteLabel.backLink,
            body: (
              <div className="mt-8">
                <SupportPlans
                  cards={supportPlanCards(locale, "white_label")}
                  groups={supportComparisonGroups(locale, "white_label")}
                  labels={support.labels}
                  tone="beige"
                  section="white_label_self_hosted"
                />
              </div>
            ),
          }}
        />
      </div>
    </section>
  )
}

export function WhiteLabelFaq({ locale }: SectionProps) {
  return <FaqSection className="pt-20 md:pt-30" heading={getWhiteLabelCopy(locale).faqTitle} faqs={getWhiteLabelFaqs(locale)} />
}

export function WhiteLabelClosing({ locale }: SectionProps) {
  const t = getWhiteLabelCopy(locale).closing
  const signup = appPartnerSignupUrl(locale)
  return (
    <ClosingCta
      titleLines={t.titleLines}
      body={t.body}
      primary={{ label: t.primaryCta, href: signup, attributes: partnerSignupAttributes(signup, "white_label_closing") }}
      secondary={{ label: t.secondaryCta, href: "#tiers" }}
    />
  )
}
