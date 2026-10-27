import { Ban, CalendarCheck, Clock, Database, MessageCircleQuestion, MessageSquareText, Moon, PhoneForwarded, PhoneIncoming, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react"

import type { SeoLandingPageProps } from "@/marketing/components/solution-layouts/types"
import {
  container,
  FaqAndRelated,
  IconGrid,
  LinkGrid,
  SceneArt,
  sectionSpacing,
  signupLink,
  SolutionClosing,
  SolutionFacts,
  SolutionHero,
  SplitSection,
  type AnyScene,
} from "@/marketing/components/solution-layouts/solution/SolutionSections"
import { CallTimeline } from "@/marketing/components/solutions/CallTimeline"
import { Chip } from "@/marketing/components/system/art"
import { PlanCards } from "@/marketing/components/system/PlanCards"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { getCopy, localizeHref } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { billingSwitchLabels } from "@/marketing/lib/pricing-copy"
import { pricingPlanCards } from "@/marketing/lib/pricing-plan-cards"
import type { SeoLandingPage } from "@/marketing/lib/seo-landing-pages"
import {
  afterHoursIndustries,
  afterHoursRouting,
  coverageModes,
  dentalCalls,
  dentalDetails,
  nightCalls,
  type TimelineCall,
} from "@/marketing/lib/solution-details"
import type { CallAction, TradeDetails } from "@/marketing/lib/trade-details"

// The English after-hours and dental pages: GitBook's solution-page rhythm,
// with a day or a night of example calls as its centerpiece. The page's
// sections come from the shared page data, so the French, Spanish and
// Serbian pages carry the same copy through GeneralLayout.

/** How one of the page's sections renders: a split card with a scene, the plans, or a grid of its points. */
type SectionView = { scene: AnyScene } | { plans: true } | { cards: LucideIcon[] }

type TimelinePage = {
  hero: AnyScene
  timeline: { title: string; intro: string; calls: TimelineCall[] }
  sections: SectionView[]
  routing: { title: string; intro: string; items: TradeDetails["routing"] }
}

const pages: Record<string, TimelinePage> = {
  "after-hours-answering-service": {
    hero: { solution: "coverage" },
    timeline: {
      title: "One night of calls to Harbor Plumbing & Heating",
      intro: "Harbor Plumbing & Heating is a made-up company. These six calls came in between closing and opening, and each card says what LobbyStack did.",
      calls: nightCalls,
    },
    sections: [
      { scene: { product: "handoff" } },
      { scene: { product: "booking" } },
      { scene: { solution: "overnight" } },
      { plans: true },
    ],
    routing: {
      title: "What happens to each kind of after-hours call",
      intro: "You decide what LobbyStack does with each kind of call. This is a typical setup for a business that closes at 6 p.m.",
      items: afterHoursRouting.routing,
    },
  },
  "ai-receptionist-for-dental-offices": {
    hero: { solution: "dentalBooked" },
    timeline: {
      title: "A day of calls to Maple Street Dental",
      intro: "Maple Street Dental is a made-up practice. These six calls came in on one weekday, and each card says what LobbyStack did.",
      calls: dentalCalls,
    },
    sections: [
      { scene: { product: "callCapture" } },
      { scene: { product: "booking" } },
      { scene: { solution: "triage" } },
      { scene: { solution: "languages" } },
      { plans: true },
      { cards: [Database, ShieldCheck, RefreshCw] },
    ],
    routing: {
      title: "What happens to each kind of dental call",
      intro: "You decide what LobbyStack does with each kind of call. This is a typical setup for a practice with an on-call dentist.",
      items: dentalDetails.routing,
    },
  },
}

const actionIcons = {
  Transfers: PhoneForwarded,
  Books: CalendarCheck,
  Answers: MessageCircleQuestion,
  "Takes a message": MessageSquareText,
  "Ends the call": Ban,
} satisfies Record<CallAction, LucideIcon>

const coverageIcons = [Moon, PhoneIncoming, Clock]

export function TimelineLayout({ page, locale }: SeoLandingPageProps) {
  const config = pages[page.slug]
  const copy = getCopy(locale)
  const signupHref = page.ctaPrimaryHref ? localizeHref(locale, page.ctaPrimaryHref) : appSignupUrl(locale)
  const pricingHref = localizeHref(locale, page.ctaSecondaryHref ?? "/pricing/")
  const primaryLabel = page.ctaPrimaryLabel ?? copy.common.tryFree
  const secondaryLabel = page.ctaSecondaryLabel ?? copy.common.viewPricing
  const isAfterHours = page.slug === "after-hours-answering-service"
  if (!config) return null

  // Split cards alternate sides, counting only the sections drawn as splits.
  let splitIndex = 0

  return (
    <>
      <SolutionHero
        eyebrow={page.eyebrow}
        title={page.h1}
        intro={page.intro}
        primary={signupLink(primaryLabel, signupHref, `${page.slug}_hero`)}
        secondary={{ label: secondaryLabel, href: pricingHref }}
        footnote="Free plan with 30 voice minutes. Works with your existing business number."
        art={<SceneArt scene={config.hero} locale={locale} fit="hero" />}
      />

      <SolutionFacts facts={page.proofPoints} />

      <section className={sectionSpacing} id="calls">
        <div className={container}>
          <CallTimeline title={config.timeline.title} intro={config.timeline.intro} calls={config.timeline.calls} />
        </div>
      </section>

      {page.sections.map((section, index) => {
        const view = config.sections[index]
        if (!view) return null
        if ("scene" in view) {
          const reverse = splitIndex++ % 2 === 1
          return (
            <SplitSection
              key={section.title}
              title={section.title}
              body={section.body}
              points={section.points}
              reverse={reverse}
              media={<SceneArt scene={view.scene} locale={locale} fit="panel" />}
            />
          )
        }
        if ("plans" in view) {
          return <PlansSection key={section.title} section={section} locale={locale} />
        }
        return (
          <IconGrid
            key={section.title}
            title={section.title}
            intro={section.body}
            columns={3}
            cards={section.points.map((point, pointIndex) => {
              const [title, ...rest] = point.split(": ")
              return {
                icon: view.cards[pointIndex] ?? ShieldCheck,
                title: title ?? point,
                body: rest.join(": ") || point,
              }
            })}
          />
        )
      })}

      <IconGrid
        id="routing"
        title={config.routing.title}
        intro={config.routing.intro}
        columns={3}
        cards={config.routing.items.map((item) => ({
          icon: actionIcons[item.action],
          title: item.call,
          body: item.detail,
          footer: <Chip strong={item.action === "Transfers"}>{item.action}</Chip>,
        }))}
      />

      {isAfterHours && (
        <>
          <IconGrid
            id="coverage"
            title="Choose when LobbyStack answers"
            intro="You keep your business number. Pick one of these settings with your phone carrier, and change it whenever you like, including for holidays."
            columns={3}
            cards={coverageModes.map((mode, index) => ({
              icon: coverageIcons[index] ?? Clock,
              title: mode.title,
              body: mode.body,
              footer: <Chip>{mode.setting}</Chip>,
            }))}
          />
          <LinkGrid
            id="industries"
            title="After-hours answering by industry"
            intro="See how LobbyStack handles night and weekend calls in your line of work."
            links={afterHoursIndustries}
            locale={locale}
          />
        </>
      )}

      <FaqAndRelated
        heading={page.faqHeading ?? "Common questions"}
        faqs={page.faqs}
        related={page.relatedLinks}
        locale={locale}
      />

      <SolutionClosing
        title={page.ctaHeading ?? page.h1}
        body={page.ctaBody ?? page.intro}
        primary={signupLink(primaryLabel, signupHref, `${page.slug}_closing`)}
        secondary={{ label: secondaryLabel, href: pricingHref }}
        footnote={copy.common.noCreditCardCancelAnytime}
      />
    </>
  )
}

function PlansSection({ section, locale }: { section: SeoLandingPage["sections"][number]; locale: SeoLandingPageProps["locale"] }) {
  return (
    <section className={sectionSpacing} id="cost">
      <div className={container}>
        <SectionTitle centered intro={section.body} className="max-w-3xl">
          {section.title}
        </SectionTitle>
        <PlanCards className="mt-10" cards={pricingPlanCards(locale, "solution_cost")} labels={billingSwitchLabels(locale)} />
      </div>
    </section>
  )
}
