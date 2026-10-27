import { homeSectionsCopy } from "@/marketing/components/LandingPageAdditions"
import { ProductScene } from "@/marketing/components/scenes/ProductScenes"
import { AppFrame, Screenshot } from "@/marketing/components/system/AppFrame"
import { TileFieldArt } from "@/marketing/components/system/art"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { IconCards } from "@/marketing/components/system/IconCards"
import { MediaCard } from "@/marketing/components/system/MediaCard"
import { PlanCards } from "@/marketing/components/system/PlanCards"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { billingSwitchLabels } from "@/marketing/lib/pricing-copy"
import { pricingPlanCards } from "@/marketing/lib/pricing-plan-cards"
import { dashboardShot } from "@/marketing/lib/screenshots"
import { eyebrow } from "@/marketing/lib/eyebrows"

type LocalizedProps = { locale: Locale }

const container = "mx-auto w-full max-w-site px-6"

function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <ButtonLink href={href} variant="secondary" size="sm">
      {children}
    </ButtonLink>
  )
}

export function MissedCallsSection({ locale }: LocalizedProps) {
  const copy = homeSectionsCopy[locale]
  const scenes = ["answeredBooked", "routing"] as const
  return (
    <section className="section-spacing" id="missed-calls">
      <div className={container}>
        <SectionTitle eyebrow={eyebrow(locale, "home.missedCalls")} intro={copy.extension.body} className="max-w-3xl">
          {copy.extension.heading}
        </SectionTitle>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {copy.extensionCards.map((card, index) => (
            <MediaCard
              key={card.title}
              media={<ProductScene name={scenes[index] ?? "answeredBooked"} locale={locale} fit="wide" />}
              mediaClassName="aspect-[9/4]"
              title={card.title}
              body={card.description}
              action={<TextLink href={card.href}>{card.cta}</TextLink>}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export function KnowledgeSection({ locale }: LocalizedProps) {
  const common = getCopy(locale).common
  const copy = homeSectionsCopy[locale].connected
  return (
    <section className="section-spacing" id="knowledge">
      <div className={container}>
        <SplitCard
          media={<ProductScene name="knowledge" locale={locale} />}
          columns="md:grid-cols-[1.18fr_0.82fr]"
          eyebrow={eyebrow(locale, "home.knowledge")}
          headingLevel="h2"
          title={copy.heading}
          body={copy.body}
          action={
            <ButtonLink
              href={appSignupUrl(locale)}
              data-ph-signup-cta
              data-ph-capture-attribute-section="how_it_works"
              data-ph-capture-attribute-action="try_for_free"
              data-ph-capture-attribute-destination={appSignupUrl(locale)}
            >
              {common.tryFree}
            </ButtonLink>
          }
        />
      </div>
    </section>
  )
}

export function PhoneToolsSection({ locale }: LocalizedProps) {
  const copy = homeSectionsCopy[locale].quality
  const scenes = ["callCapture", "booking", "handoff"] as const
  return (
    <section className="section-spacing" id="phone-tools">
      <div className={container}>
        <SectionTitle eyebrow={eyebrow(locale, "home.phoneTools")} intro={copy.body} className="max-w-3xl">
          {copy.heading}
        </SectionTitle>
        <div className="mt-6">
          <TextLink href={localizeHref(locale, copy.learnMoreHref)}>{copy.learnMoreLabel}</TextLink>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {copy.toolCards.map((card, index) => (
            <MediaCard
              key={card.title}
              media={<ProductScene name={scenes[index] ?? "callCapture"} locale={locale} fit="card" />}
              title={card.title}
              body={card.description}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export function HowItWorksSection({ locale }: LocalizedProps) {
  const copy = homeSectionsCopy[locale].workflow
  return (
    <section className="section-spacing" id="how-it-works">
      <div className={container}>
        <SectionTitle eyebrow={eyebrow(locale, "home.howItWorks")} intro={copy.body} className="max-w-3xl">
          {copy.heading}
        </SectionTitle>
        <div className="mt-6">
          <TextLink href={localizeHref(locale, copy.guideHref)}>{copy.guideLabel}</TextLink>
        </div>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 md:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map((step, index) => (
            <li key={step.title} className="bg-background p-6">
              <span className="eyebrow">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="card-heading mt-8">{step.title}</h3>
              <p className="mt-3 text-base leading-6 text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/** The dashboard right under the hero, its top showing above the fold. */
export function DashboardPreview({ locale }: LocalizedProps) {
  return (
    <div className={container}>
      <AppFrame>
        <Screenshot shot={dashboardShot(locale)} alt={homeSectionsCopy[locale].control.imageAlt} priority />
      </AppFrame>
    </div>
  )
}

export function ControlSection({ locale }: LocalizedProps) {
  const copy = homeSectionsCopy[locale].control
  return (
    <section className="section-spacing" id="control">
      <div className={container}>
        <SectionTitle centered eyebrow={eyebrow(locale, "home.control")} intro={copy.body} className="max-w-3xl">
          {copy.heading}
        </SectionTitle>
        <IconCards
          className="mt-12"
          cards={copy.cards.map((card) => ({ icon: card.icon, title: card.title, body: card.description }))}
        />
      </div>
    </section>
  )
}

export function PricingPreviewSection({ locale }: LocalizedProps) {
  const copy = homeSectionsCopy[locale].pricing
  return (
    <section className="section-spacing" id="pricing-preview">
      <div className={container}>
        <SectionTitle centered eyebrow={eyebrow(locale, "home.pricing")} intro={copy.body} className="max-w-[44rem]">
          {copy.heading}
        </SectionTitle>
        <PlanCards className="mt-8" cards={pricingPlanCards(locale, "pricing_preview")} labels={billingSwitchLabels(locale)} />
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <ButtonLink
            href={localizeHref(locale, "/pricing/")}
            variant="secondary"
            data-ph-capture-attribute-section="pricing_preview"
            data-ph-capture-attribute-action="view_pricing"
            data-ph-capture-attribute-destination="/pricing/"
          >
            {copy.viewDetails}
          </ButtonLink>
          <p className="fine-print">{copy.note}</p>
        </div>
      </div>
    </section>
  )
}

export function OpenSourceSection({ locale }: LocalizedProps) {
  const copy = homeSectionsCopy[locale].openSource
  return (
    <section className="section-spacing" id="open-source">
      <div className={container}>
        <SplitCard
          media={<TileFieldArt />}
          columns="md:grid-cols-[1.35fr_1fr]"
          eyebrow={eyebrow(locale, "home.openSource")}
          headingLevel="h2"
          title={copy.heading}
          body={copy.body}
          action={
            <>
              <ButtonLink
                href="https://github.com/lobbystack/lobbystack"
                target="_blank"
                rel="noopener noreferrer"
                data-ph-capture-attribute-section="open_source"
                data-ph-capture-attribute-action="view_github"
                data-ph-capture-attribute-destination="https://github.com/lobbystack/lobbystack"
              >
                {copy.cta}
              </ButtonLink>
              <ButtonLink
                href={localizeHref(locale, "/solutions/self-hosted-ai-receptionist/")}
                variant="secondary"
                data-ph-capture-attribute-section="open_source"
                data-ph-capture-attribute-action="view_self_hosted_solution"
                data-ph-capture-attribute-destination="/solutions/self-hosted-ai-receptionist/"
              >
                {copy.selfHostedCta}
              </ButtonLink>
            </>
          }
        />
      </div>
    </section>
  )
}
