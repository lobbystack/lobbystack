import { intlLocale, partnerTierCatalog, partnerTierSlugs, type PartnerTierSlug } from "@lobbystack/shared"
import { ChevronRight, Layers, LayoutGrid } from "lucide-react"
import type { ReactNode } from "react"

import {
  AppFrame,
  HeroIllustration,
  OverageArt,
  PackagesArt,
  PlaneGrid,
  SelfHostArt,
  SetupFeeArt,
} from "@/marketing/components/white-label/WhiteLabelArt"
import { localizeHref, type Locale } from "@/marketing/i18n"
import { appPartnerSignupUrl } from "@/marketing/lib/app-links"
import { PillLink } from "@/marketing/components/white-label/PillLink"
import { WhiteLabelTierCards, type WhiteLabelTierCard } from "@/marketing/components/white-label/WhiteLabelTierCards"
import { cn } from "@/marketing/lib/utils"
import { getWhiteLabelCopy, type WhiteLabelCard } from "@/marketing/lib/white-label-copy"
import { getWhiteLabelFaqs } from "@/marketing/lib/white-label-faqs"

type SectionProps = { locale: Locale }

const container = "mx-auto w-full max-w-site px-6"

/** Tiers whose card stands out, as the recommended choice. */
const highlightedTier: PartnerTierSlug = "growth"

/** The product shots in public/screenshots, at their pixel sizes. */
const dashboardShot = { src: "/screenshots/partner-business-dashboard.webp", width: 2880, height: 1880 }
const consoleShot = { src: "/screenshots/partner-console.webp", width: 3200, height: 1972 }
const signInShot = { src: "/screenshots/partner-signin.webp", width: 1600, height: 1000 }
const brandingShot = { src: "/screenshots/partner-branding.webp", width: 2880, height: 1360 }

function Shot({ shot, alt, priority, className }: { shot: typeof consoleShot; alt: string; priority?: boolean; className?: string }) {
  return (
    <img
      src={shot.src}
      alt={alt}
      width={shot.width}
      height={shot.height}
      className={cn("block w-full", className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  )
}

function SectionTitle({
  eyebrow,
  lines,
  centered,
  as: Heading = "h2",
}: {
  eyebrow: string
  lines: readonly string[]
  centered?: boolean
  as?: "h1" | "h2"
}) {
  return (
    <div className={cn(centered && "text-center")}>
      <p className="eyebrow">{eyebrow}</p>
      <Heading className={cn("mt-4", Heading === "h1" ? "program-display" : "program-heading")}>
        {lines.map((line, index) => (
          <span key={line}>
            {index > 0 && " "}
            <span className="md:block">{line}</span>
          </span>
        ))}
      </Heading>
    </div>
  )
}

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
          <Shot shot={consoleShot} alt={copy.shots.consoleAlt} priority />
        </AppFrame>
      </div>
    </section>
  )
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-11 items-center justify-center rounded-lg border border-border/80 bg-background shadow-[0_1px_2px_oklch(0_0_0/6%)]">
      {children}
    </span>
  )
}

export function WhiteLabelHowItWorks({ locale }: SectionProps) {
  const copy = getWhiteLabelCopy(locale)
  const t = copy.brand
  const smallCards = [
    { ...copy.console, icon: LayoutGrid },
    { ...copy.pool, icon: Layers },
  ]
  return (
    <section className="pt-20 md:pt-30" id="how-it-works">
      <div className={container}>
        <SectionTitle eyebrow={t.eyebrow} lines={t.titleLines} />

        <div className="mt-12 grid overflow-hidden rounded-2xl border border-border/60 md:grid-cols-2">
          <div className="relative min-h-[22rem] overflow-hidden bg-beige-strong/60 md:min-h-[30rem]">
            <AppFrame className="absolute top-8 left-6 w-[78%] md:top-12 md:left-10 md:w-[70%]">
              <Shot shot={signInShot} alt={copy.shots.signInAlt} />
            </AppFrame>
            <AppFrame className="absolute top-[48%] left-[22%] w-[110%] md:top-[46%] md:left-[26%] md:w-[100%]">
              <Shot shot={brandingShot} alt={copy.shots.brandingAlt} />
            </AppFrame>
          </div>
          <div className="flex flex-col justify-center bg-beige px-6 py-10 md:px-8 lg:pr-8 lg:pl-8">
            <p className="eyebrow">{t.card.eyebrow}</p>
            <h3 className="mt-2 font-heading text-[1.625rem] leading-[1.2] font-medium tracking-[-0.03em] md:text-[2rem]">
              {t.card.title}
            </h3>
            <p className="mt-3 text-base leading-6 text-muted-foreground">{t.card.body}</p>
            <div className="mt-10">
              <PillLink href="#tiers" variant="primary" section="white_label_brand">
                {t.card.cta}
              </PillLink>
            </div>
          </div>
        </div>

        <div className="mt-6 grid divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 md:mt-12 md:grid-cols-2 md:divide-x md:divide-y-0">
          {smallCards.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="bg-background p-6"
            >
              <IconTile>
                <Icon className="size-5 text-foreground/80" aria-hidden="true" />
              </IconTile>
              <div className="mt-8">
                <h3 className="text-xl leading-[1.3] font-medium tracking-[-0.02em]">{title}</h3>
                <p className="mt-3 text-base leading-6 text-muted-foreground">{body}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 grid overflow-hidden rounded-2xl border border-border/60 md:mt-12 md:grid-cols-[1.35fr_1fr]">
          <div className="relative min-h-[18rem] bg-beige-strong/60 md:min-h-[24rem]">
            <SelfHostArt />
          </div>
          <div className="flex flex-col justify-center bg-beige px-6 py-10 md:px-8">
            <p className="eyebrow">{copy.selfHost.eyebrow}</p>
            <h3 className="mt-2 font-heading text-[1.625rem] leading-[1.2] font-medium tracking-[-0.03em] md:text-[2rem]">
              {copy.selfHost.title}
            </h3>
            <p className="mt-3 text-base leading-6 text-muted-foreground">{copy.selfHost.body}</p>
            <div className="mt-10">
              <PillLink
                href={localizeHref(locale, "/solutions/self-hosted-ai-receptionist/")}
                variant="primary"
                section="white_label_self_host"
              >
                {copy.selfHost.cta}
              </PillLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function WhiteLabelDashboard({ locale }: SectionProps) {
  const t = getWhiteLabelCopy(locale).shots
  return (
    <section className="pt-20 md:pt-30">
      <div className={container}>
        <AppFrame>
          <Shot shot={dashboardShot} alt={t.dashboardAlt} />
        </AppFrame>
      </div>
    </section>
  )
}

function EarnCard({ card, children }: { card: WhiteLabelCard; children: ReactNode }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-beige">
      <div className="relative h-80 overflow-hidden bg-beige-strong/60">{children}</div>
      <div className="p-6">
        <p className="eyebrow">{card.eyebrow}</p>
        <h3 className="mt-2 text-xl leading-[1.3] font-medium tracking-[-0.02em]">{card.title}</h3>
        <p className="mt-3 text-base leading-6 text-muted-foreground">{card.body}</p>
      </div>
    </article>
  )
}

export function WhiteLabelEarn({ locale }: SectionProps) {
  const copy = getWhiteLabelCopy(locale)
  const t = copy.earn
  return (
    <section className="pt-20 md:pt-30" id="earn">
      <div className={container}>
        <SectionTitle eyebrow={t.eyebrow} lines={t.titleLines} />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <EarnCard card={t.packages}>
            <PackagesArt locale={locale} copy={copy.earnArt} />
          </EarnCard>
          <EarnCard card={t.setupFees}>
            <SetupFeeArt locale={locale} copy={copy.earnArt} />
          </EarnCard>
          <EarnCard card={t.overage}>
            <OverageArt locale={locale} copy={copy.earnArt} />
          </EarnCard>
        </div>
      </div>
    </section>
  )
}

/** A tier price in whole dollars, as the pricing page shows plan prices. */
function wholeUsd(locale: Locale, cents: number) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
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
  const cards: WhiteLabelTierCard[] = partnerTierSlugs.map((slug) => {
    const tier = partnerTierCatalog[slug]
    const annual = tier.annualEffectiveMonthlyChargeCents
    return {
      slug,
      ...t[slug],
      highlighted: slug === highlightedTier,
      period: tier.paid ? t.perMonth : null,
      price: {
        monthly: { amount: wholeUsd(locale, tier.monthlyChargeCents), note: tier.paid ? t.billedMonthly : null },
        annual: {
          amount: wholeUsd(locale, annual ?? tier.monthlyChargeCents),
          note: tier.paid ? t.billedAnnually : null,
        },
      },
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

  return (
    <section className="scroll-mt-20 pt-20 md:pt-30" id="tiers">
      <div className={container}>
        <div className="mx-auto max-w-[44rem]">
          <SectionTitle centered eyebrow={t.eyebrow} lines={[t.title]} />
          <p className="mt-4 text-center text-lg leading-[1.6] text-muted-foreground">{t.intro}</p>
        </div>

        <WhiteLabelTierCards
          cards={cards}
          labels={{ monthly: t.monthly, annual: t.annual, save: t.save, billingLabel: t.billingLabel }}
          signup={signup}
        />
        <p className="fine-print mx-auto mt-6 max-w-[44rem] text-center">{t.footnote}</p>
      </div>
    </section>
  )
}

export function WhiteLabelFaq({ locale }: SectionProps) {
  const copy = getWhiteLabelCopy(locale)
  const faqs = getWhiteLabelFaqs(locale)
  return (
    <section className="pt-20 md:pt-30" id="faq">
      <div className="mx-auto w-full max-w-[51.25rem] px-5 md:px-6">
        <h2 className="text-center text-2xl font-medium tracking-[-0.02em]">{copy.faqTitle}</h2>
        <div className="mt-8 overflow-hidden rounded-xl border border-border/80">
          {faqs.map((faq) => (
            <details key={faq.question} className="disclosure group border-b border-border/80 last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-4 py-[0.9375rem] text-left text-base text-foreground/80 transition-colors duration-150 hover:bg-beige focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                <h3 className="font-normal">{faq.question}</h3>
                <ChevronRight
                  className="size-4 shrink-0 text-foreground/70 transition-transform duration-200 ease-(--ease-out) group-open:rotate-90"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-4 pb-4 text-base leading-6 text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function WhiteLabelClosing({ locale }: SectionProps) {
  const t = getWhiteLabelCopy(locale).closing
  return (
    <section className="relative mt-24 overflow-hidden bg-beige md:mt-24">
      <PlaneGrid />
      <div className="relative mx-auto max-w-3xl px-5 py-28 text-center md:px-6 md:py-44">
        <h2 className="program-display">
          {t.titleLines.map((line, index) => (
            <span key={line}>
              {index > 0 && " "}
              <span className="md:block">{line}</span>
            </span>
          ))}
        </h2>
        <p className="mx-auto mt-6 max-w-[40rem] text-base leading-6 text-muted-foreground">{t.body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <PillLink href={appPartnerSignupUrl(locale)} variant="primary" section="white_label_closing">
            {t.primaryCta}
          </PillLink>
          <PillLink href="#tiers" variant="secondary" section="white_label_closing">
            {t.secondaryCta}
          </PillLink>
        </div>
      </div>
    </section>
  )
}
