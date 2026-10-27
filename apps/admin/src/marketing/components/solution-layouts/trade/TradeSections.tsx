import { billingPlanCatalog, intlLocale } from "@lobbystack/shared"
import {
  Building2,
  CalendarCheck,
  Check,
  ChevronRight,
  CloudHail,
  DoorOpen,
  Hammer,
  HardHat,
  KeyRound,
  MessageSquareText,
  NotebookPen,
  PhoneForwarded,
  PhoneOff,
  WashingMachine,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { TranscriptScene, TranscriptText } from "@/marketing/components/scenes/TranscriptScene"
import {
  TradeAnswerScene,
  TradeBookingScene,
  TradeSummaryScene,
} from "@/marketing/components/solution-layouts/trade/TradeScenes"
import { AppFrame, Screenshot } from "@/marketing/components/system/AppFrame"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { IconCards, IconTile } from "@/marketing/components/system/IconCards"
import { MediaCard } from "@/marketing/components/system/MediaCard"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"
import { dashboardShot } from "@/marketing/lib/screenshots"
import type { SeoLandingPage } from "@/marketing/lib/seo-landing-pages"
import {
  callActionTitle,
  exampleCallFootnote,
  routingGroups,
  sceneLines,
  tradeArticle,
  type CallAction,
  type TradeDetails,
} from "@/marketing/lib/trade-details"
import { cn } from "@/marketing/lib/utils"

// The sections of the English trade pages, in the order TradeLayout stacks
// them. Their words come from the page (seo-landing-pages.ts) and its trade
// (trade-details.ts); the few shared lines below are English only, like the
// pages.

type SectionProps = { page: SeoLandingPage; details: TradeDetails; locale: Locale }

export const container = "mx-auto w-full max-w-site px-6"
export const sectionSpacing = "pt-20 md:pt-30"

/** How much each scene's plane scales in its panel. */
const fits = {
  hero: "[--scene-scale:0.74] sm:[--scene-scale:1] lg:[--scene-scale:1.05] xl:[--scene-scale:1.15]",
  transcript: "[--scene-scale:0.62] sm:[--scene-scale:0.9] md:[--scene-scale:0.86] lg:[--scene-scale:0.98] xl:[--scene-scale:1.04]",
  card: "[--scene-scale:0.68] sm:[--scene-scale:1] lg:[--scene-scale:0.92] xl:[--scene-scale:1]",
  summary: "[--scene-scale:0.56] sm:[--scene-scale:0.86] md:[--scene-scale:0.8] lg:[--scene-scale:0.96] xl:[--scene-scale:1.04]",
} as const

export function SceneFit({ fit, children }: { fit: keyof typeof fits; children: ReactNode }) {
  return <div className={cn("absolute inset-0", fits[fit])}>{children}</div>
}

function CheckDot() {
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
      <Check className="size-3 text-foreground/80" strokeWidth={2.5} aria-hidden="true" />
    </span>
  )
}

/** The example call: a few lines drawn as a scene, and every line as text below. */
export function TradeExampleCall({ details }: SectionProps) {
  return (
    <section className={sectionSpacing} id="example-call">
      <div className={container}>
        <SectionTitle centered eyebrow="Example call" intro={details.pitch.intro} className="max-w-3xl">
          {details.pitch.title}
        </SectionTitle>
        <SplitCard
          className="mt-12"
          columns="md:grid-cols-[1.2fr_1fr]"
          mediaClassName="min-h-[19rem] sm:min-h-[24rem] md:min-h-[28rem]"
          media={
            <SceneFit fit="transcript">
              <TranscriptScene lines={sceneLines(details)} tilt="right" />
            </SceneFit>
          }
          eyebrow={details.business}
          title={details.callCard.title}
          body={
            <>
              <p>{details.scenario}</p>
              <p className="mt-3">{details.callCard.body}</p>
            </>
          }
        />
        <TranscriptText
          className="mt-4"
          summary="Read the whole call"
          lines={details.call}
          speakerLabels={{ caller: "Caller", lobbystack: "LobbyStack" }}
          outcome={details.outcome}
          footnote={exampleCallFootnote(details)}
        />
      </div>
    </section>
  )
}

const actionIcons: Record<CallAction, LucideIcon> = {
  Transfers: PhoneForwarded,
  Books: CalendarCheck,
  Answers: MessageSquareText,
  "Takes a message": NotebookPen,
  "Ends the call": PhoneOff,
}

/** The call rules, grouped by what LobbyStack does, as a 2×2 grid of cards. */
export function TradeCallRules({ details }: SectionProps) {
  return (
    <section className={sectionSpacing} id="call-handling">
      <div className={container}>
        <SectionTitle eyebrow="Call rules" intro={details.rules.intro} className="max-w-3xl">
          {details.rules.title}
        </SectionTitle>
        <IconCards
          className="mt-12"
          cards={routingGroups(details).map(({ action, rows }) => ({
            icon: actionIcons[action],
            title: callActionTitle(action, details),
            body: (
              <ul className="space-y-3">
                {rows.map((row) => (
                  <li key={row.call}>
                    <span className="block font-medium text-foreground">{row.call}</span>
                    <span className="block">{row.detail}.</span>
                  </li>
                ))}
              </ul>
            ),
          }))}
        />
      </div>
    </section>
  )
}

/** The page's two sections as feature cards, each with its scene. */
export function TradeFeatures({ page, details, locale }: SectionProps) {
  const scenes = [
    <TradeBookingScene key="booking" details={details} locale={locale} />,
    <TradeAnswerScene key="answer" details={details} locale={locale} />,
  ]
  return (
    <section className={sectionSpacing} id="features">
      <div className={container}>
        <SectionTitle centered eyebrow="Everyday calls" intro={details.features.intro} className="max-w-3xl">
          {details.features.title}
        </SectionTitle>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {page.sections.slice(0, 2).map((section, index) => (
            <MediaCard
              key={section.title}
              media={<SceneFit fit="card">{scenes[index]}</SceneFit>}
              mediaClassName="h-64 sm:h-80"
              title={section.title}
              body={section.body}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

/** The intake questions beside the summary the example call saved. */
export function TradeIntake({ details, locale }: SectionProps) {
  return (
    <section className={sectionSpacing} id="intake">
      <div className={container}>
        <SplitCard
          reverse
          columns="md:grid-cols-[1.1fr_1fr]"
          mediaClassName="min-h-[19rem] sm:min-h-[24rem] md:min-h-[30rem]"
          media={
            <SceneFit fit="summary">
              <TradeSummaryScene details={details} locale={locale} />
            </SceneFit>
          }
          eyebrow="Intake"
          headingLevel="h2"
          title={details.intakeCopy.title}
          body={details.intakeCopy.body}
        >
          <ul className="mt-6 space-y-3">
            {details.intake.map((question) => (
              <li key={question} className="flex items-start gap-3 text-base leading-6 text-foreground">
                <CheckDot />
                {question}
              </li>
            ))}
          </ul>
        </SplitCard>
      </div>
    </section>
  )
}

export function TradeDashboard({ locale }: SectionProps) {
  return (
    <section className={sectionSpacing} id="dashboard">
      <div className={container}>
        <SectionTitle
          centered
          eyebrow="Dashboard"
          intro="Each answered call shows its outcome, the caller's answers, a transcript, and a recording. Messages land in your inbox, with text alerts if you turn them on."
          className="max-w-3xl"
        >
          Read any call the next morning
        </SectionTitle>
        <AppFrame className="mt-12">
          <Screenshot
            shot={dashboardShot(locale)}
            alt="LobbyStack dashboard home with this month's calls, follow-ups, upcoming appointments, and recent calls"
          />
        </AppFrame>
      </div>
    </section>
  )
}

export function TradeSetup({ details }: SectionProps) {
  const steps = [
    {
      title: "Write your rules",
      body: `Say in plain words what counts as ${tradeArticle(details.noun)} ${details.noun} emergency, which jobs to book, and which prices callers can hear. Then add the number urgent calls ring.`,
    },
    {
      title: "Call it yourself",
      body: "Call your LobbyStack number with a made-up emergency, then with a routine job. Change the rules until both calls go the way you want.",
    },
    {
      title: "Forward your number",
      body: "Keep the number your customers know. Your carrier can forward every call, or only the ones you miss and the ones after hours.",
    },
  ]
  return (
    <section className={sectionSpacing} id="setup">
      <div className={container}>
        <SectionTitle eyebrow="Setup" intro="Setup takes about 10 minutes. Test every rule on the Free plan before a customer calls." className="max-w-3xl">
          Three steps before the first real call
        </SectionTitle>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-background p-6">
              <span className="eyebrow">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="card-heading mt-8">{step.title}</h3>
              <p className="mt-3 text-base leading-6 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function monthlyPrice(locale: Locale, cents: number) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/** LobbyStack beside a live answering service, styled like the pricing page's table. */
export function TradeCompare({ details, locale }: SectionProps) {
  const starter = monthlyPrice(locale, billingPlanCatalog.starter.monthlyChargeCents)
  const pro = monthlyPrice(locale, billingPlanCatalog.pro.monthlyChargeCents)
  const rows = [
    {
      topic: "Booking",
      ai: "Books into Google Calendar during the call",
      live: "Often takes a message for you to return",
    },
    {
      topic: "Emergencies",
      ai: "Follows the rules you write and transfers to your on-call number",
      live: "Follows the script you send",
    },
    {
      topic: "Call records",
      ai: "A transcript, recording, and summary of each call",
      live: "Message notes, which vary by service",
    },
    {
      topic: "Languages",
      ai: "Opens in your default language and switches to the caller's",
      live: "Varies by service",
    },
    {
      topic: "Unusual calls",
      ai: "Transfers them to your team or takes a message",
      live: "An operator can use judgment",
    },
    {
      topic: "Pricing",
      ai: `Free plan, then ${starter} or ${pro} a month with minutes included`,
      live: "Usually billed per minute or per call",
    },
  ]
  return (
    <section className={sectionSpacing} id="ai-vs-live-answering">
      <div className={container}>
        <SectionTitle
          centered
          eyebrow="Compare"
          intro="A live answering service puts an operator on the line. LobbyStack answers with AI and hands calls to your team when your rules say so."
          className="max-w-3xl"
        >
          {`AI and live ${details.noun} answering services compared`}
        </SectionTitle>
        <div
          className="relative mt-12 overflow-x-auto rounded-2xl border border-border/60"
          role="region"
          aria-label={`LobbyStack compared with a live ${details.noun} answering service`}
          tabIndex={0}
        >
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-beige">
                <th scope="col" className="w-[22%] py-4 pr-6 pl-6 text-left text-xs font-medium text-muted-foreground">
                  Topic
                </th>
                <th
                  scope="col"
                  className="w-[39%] bg-beige-strong/60 px-6 py-4 text-left font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                >
                  LobbyStack
                </th>
                <th scope="col" className="px-6 py-4 text-left font-heading text-base font-medium tracking-[-0.03em] text-foreground">
                  Live answering service
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.topic} className="border-t border-border/50">
                  <th scope="row" className="py-4 pr-6 pl-6 text-left align-top font-medium text-foreground">
                    {row.topic}
                  </th>
                  <td className="bg-beige/70 px-6 py-4 align-top leading-relaxed text-foreground">{row.ai}</td>
                  <td className="px-6 py-4 align-top leading-relaxed text-muted-foreground">{row.live}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

const tradeIcons: Record<string, LucideIcon> = {
  "ai-receptionist-for-plumbers": Wrench,
  "ai-receptionist-for-hvac": Wind,
  "ai-receptionist-for-electricians": Zap,
  "ai-receptionist-for-garage-door-repair": DoorOpen,
  "ai-receptionist-for-appliance-repair": WashingMachine,
  "ai-receptionist-for-restoration-companies": Hammer,
  "ai-receptionist-for-locksmiths": KeyRound,
  "after-hours-answering-service-for-contractors": HardHat,
  "roofing-answering-service": CloudHail,
  "property-management-answering-service": Building2,
}

/** Links to the other trade pages, as a grid of small cards. */
export function TradeOthers({ others, locale }: { others: SeoLandingPage[]; locale: Locale }) {
  if (others.length === 0) return null
  return (
    <section className={sectionSpacing} id="other-trades">
      <div className={container}>
        <SectionTitle eyebrow="Other trades" className="max-w-3xl">
          Answering services for other trades
        </SectionTitle>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((trade) => (
            <li key={trade.path} className="bg-background">
              <a
                href={localizeHref(locale, trade.path)}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-beige focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              >
                <IconTile icon={tradeIcons[trade.slug] ?? Wrench} className="size-10" />
                <span className="min-w-0 flex-1 text-base font-medium text-foreground">{trade.eyebrow}</span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function TradeRelated({ page, locale }: { page: SeoLandingPage; locale: Locale }) {
  if (page.relatedLinks.length === 0) return null
  return (
    <section className={cn(container, "pt-16")}>
      <div className="flex flex-col justify-between gap-6 border-t border-border/70 pt-8 md:flex-row md:items-center">
        <h2 className="eyebrow">{getCopy(locale).common.relatedResources}</h2>
        <div className="flex flex-wrap gap-2.5">
          {page.relatedLinks.map((link) => (
            <ButtonLink
              key={link.href}
              href={localizeHref(locale, link.href)}
              variant="secondary"
              size="sm"
              className="h-auto min-h-8 max-w-full py-1.5 whitespace-normal"
            >
              {link.label}
            </ButtonLink>
          ))}
        </div>
      </div>
    </section>
  )
}
