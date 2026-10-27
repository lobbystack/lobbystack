import { Check } from "lucide-react"

import { FaqSection } from "@/marketing/components/FaqSection"
import { AfterHoursCost } from "@/marketing/components/solutions/after-hours/AfterHoursCost"
import { AfterHoursIndustries } from "@/marketing/components/solutions/after-hours/AfterHoursIndustries"
import { CoverageSchedule } from "@/marketing/components/solutions/after-hours/CoverageSchedule"
import { CallTimeline } from "@/marketing/components/solutions/CallTimeline"
import { LightModeDashboardMockup } from "@/marketing/components/solutions/LightModeDashboardMockup"
import { ArchitectureDiagram } from "@/marketing/components/solutions/self-hosted/ArchitectureDiagram"
import { CloudVsSelfHosted } from "@/marketing/components/solutions/self-hosted/CloudVsSelfHosted"
import { SelfHostedHero } from "@/marketing/components/solutions/self-hosted/SelfHostedHero"
import { WhatYouRun } from "@/marketing/components/solutions/self-hosted/WhatYouRun"
import { StackedHero } from "@/marketing/components/solutions/StackedHero"
import { AfterTheCall } from "@/marketing/components/trade/AfterTheCall"
import { CallRouting } from "@/marketing/components/trade/CallRouting"
import { ExampleCall } from "@/marketing/components/trade/ExampleCall"
import { SetupAndCompare } from "@/marketing/components/trade/SetupAndCompare"
import { ProductScene, type ProductSceneName } from "@/marketing/components/scenes/ProductScenes"
import { AppFrame, Screenshot } from "@/marketing/components/system/AppFrame"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { afterHoursRouting, dentalCalls, dentalDetails, nightCalls } from "@/marketing/lib/solution-details"
import { seoLandingPages, type SeoLandingPage as SeoLandingPageData } from "@/marketing/lib/seo-landing-pages"
import { dashboardShot } from "@/marketing/lib/screenshots"
import { tradeDetails, tradeDetailsFor } from "@/marketing/lib/trade-details"
import { cn } from "@/marketing/lib/utils"

// The scenes that replace the raster heroes, which carried English text.
const heroScenes: Record<string, ProductSceneName> = {
  "/illustrations/call-capture.webp": "callCapture",
  "/illustrations/booking-flow.webp": "booking",
  "/illustrations/industry-bookings.webp": "jobBooked",
  "/illustrations/business-knowledge.webp": "knowledge",
  "/illustrations/trust-controls.webp": "guardrails",
  "/illustrations/human-handoff.webp": "handoff",
  "/illustrations/call-routing-team.webp": "routing",
  "/illustrations/call-booking-summary.webp": "summary",
  "/illustrations/missed-calls.webp": "answeredBooked",
  "/illustrations/missed-calls-v3.webp": "answeredBooked",
}

function CheckDot() {
  return (
    <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
      <Check className="size-3 text-foreground/80" strokeWidth={2.5} />
    </span>
  )
}

export type SeoLandingPageProps = {
  page: SeoLandingPageData
  locale: Locale
}

const tradeSlugs = [
  "ai-receptionist-for-plumbers",
  "ai-receptionist-for-hvac",
  "ai-receptionist-for-electricians",
  "ai-receptionist-for-garage-door-repair",
  "ai-receptionist-for-appliance-repair",
  "ai-receptionist-for-restoration-companies",
  "ai-receptionist-for-locksmiths",
  "after-hours-answering-service-for-contractors",
]

const pageCopy = {
  en: {
    reassurance: "No credit card required. Works with your existing business number.",
    dashboardAlt:
      "LobbyStack dashboard Home page with monthly calls, follow-ups, upcoming appointments, and recent calls",
    dashboardCaption:
      "The LobbyStack dashboard shows each answered call with its outcome, plus the follow-ups and appointments your team needs to handle.",
    faqHeading: "Common questions",
    ctaHeading: "Start answering every call without front-desk overload",
    ctaBody:
      "Try LobbyStack with included voice minutes, configure your custom trade and call rules, and see how much revenue you can recover.",
  },
  fr: {
    reassurance: "Aucune carte bancaire requise. Fonctionne avec votre numero professionnel actuel.",
    dashboardAlt:
      "Page d’accueil du tableau de bord LobbyStack avec les appels du mois, les suivis, les rendez-vous à venir et les appels récents",
    dashboardCaption:
      "Le tableau de bord LobbyStack affiche chaque appel répondu avec son résultat, ainsi que les suivis et les rendez-vous que votre équipe doit traiter.",
    faqHeading: "Questions fréquentes",
    ctaHeading: "Répondez à chaque appel sans surcharger votre accueil",
    ctaBody:
      "Essayez LobbyStack avec les minutes vocales incluses, configurez vos règles de métier et d’appel, et voyez combien de revenus vous pouvez récupérer.",
  },
  es: {
    reassurance: "No se requiere tarjeta de crédito. Funciona con su número de negocio actual.",
    dashboardAlt:
      "Página de inicio del panel de LobbyStack con las llamadas del mes, los seguimientos, las próximas citas y las llamadas recientes",
    dashboardCaption:
      "El panel de LobbyStack muestra cada llamada atendida con su resultado, además de los seguimientos y las citas que su equipo debe gestionar.",
    faqHeading: "Preguntas frecuentes",
    ctaHeading: "Conteste cada llamada sin sobrecargar la recepción",
    ctaBody:
      "Pruebe LobbyStack con los minutos de voz incluidos, configure las reglas de su oficio y de sus llamadas, y vea cuántos ingresos puede recuperar.",
  },
  sr: {
    reassurance: "Nije potrebna platna kartica. Radi sa Vašim postojećim poslovnim brojem.",
    dashboardAlt:
      "Početna stranica LobbyStack kontrolne table sa pozivima u ovom mesecu, zadacima za praćenje, predstojećim terminima i nedavnim pozivima",
    dashboardCaption:
      "LobbyStack kontrolna tabla prikazuje svaki odgovoreni poziv sa ishodom, kao i zadatke za praćenje i termine koje Vaš tim treba da obradi.",
    faqHeading: "Česta pitanja",
    ctaHeading: "Odgovorite na svaki poziv bez preopterećenja recepcije",
    ctaBody:
      "Isprobajte LobbyStack sa uključenim minutima razgovora, podesite pravila za svoju delatnost i pozive i pogledajte koliko prihoda možete da povratite.",
  },
} satisfies Record<
  Locale,
  {
    reassurance: string
    dashboardAlt: string
    dashboardCaption: string
    faqHeading: string
    ctaHeading: string
    ctaBody: string
  }
>

/** The pre-restyle body of every solution page, kept as a reference while each layout is rebuilt. Do not edit. */
export function LegacySolutionBody({ page, locale }: SeoLandingPageProps) {
  // localizeHref leaves absolute URLs alone, so the signup URL carries its own locale.
  const primaryCtaHref = page.ctaPrimaryHref ? localizeHref(locale, page.ctaPrimaryHref) : appSignupUrl(locale)
  const copy = getCopy(locale)

  // Trade pages with written call examples get the full trade layout. The
  // French, Spanish and Serbian pages don't have that content yet and keep the
  // simpler layout.
  const details = locale === "en" ? tradeDetailsFor(page.slug) : undefined
  const isTradePage = tradeSlugs.includes(page.slug) && !details
  const otherTrades = details
    ? seoLandingPages.filter((candidate) => candidate.slug !== page.slug && tradeDetails[candidate.slug])
    : []
  const isAboutPage = page.path === "/about/"
  // The English after-hours and self-hosted pages get their own sections in
  // the same row layout as the trade pages.
  const isAfterHours = locale === "en" && page.slug === "after-hours-answering-service"
  const isSelfHosted = locale === "en" && page.slug === "self-hosted-ai-receptionist"
  const isDental = locale === "en" && page.slug === "ai-receptionist-for-dental-offices"
  const stackedHero = isAfterHours || isDental
  const richLayout = Boolean(details) || stackedHero || isSelfHosted

  const t = pageCopy[locale]
  // The self-hosted layout only renders in English.
  const reassurance = isSelfHosted
    ? "Free to self-host under the MIT License. You pay your own hosting, Twilio, and OpenAI bills."
    : t.reassurance

  return (
    <>
        {/* Hero Section */}
        <section className="mx-auto max-w-site px-6 pt-10 pb-0 md:pt-11">
          {isSelfHosted && (
            <SelfHostedHero h1={page.h1} intro={page.intro} guideHref={page.ctaPrimaryHref ?? "/docs/"} />
          )}
          {stackedHero && (
            <StackedHero
              eyebrow={page.eyebrow}
              h1={page.h1}
              intro={page.intro}
              primary={{
                href: primaryCtaHref,
                label: page.ctaPrimaryLabel ?? copy.common.tryFree,
              }}
              secondary={{
                href: localizeHref(locale, page.ctaSecondaryHref ?? "/pricing/"),
                label: page.ctaSecondaryLabel ?? copy.common.seePricing,
              }}
              reassurance={reassurance}
            >
              {isAfterHours ? (
                <CallTimeline title="One night of calls to Harbor Plumbing & Heating" calls={nightCalls} />
              ) : (
                <CallTimeline title="A day of calls to Maple Street Dental" calls={dentalCalls} />
              )}
            </StackedHero>
          )}
          {!(stackedHero || isSelfHosted) && (
            <div
              className={cn(
                "grid gap-12 lg:items-center",
                isTradePage || isAboutPage
                  ? "mx-auto max-w-3xl text-center"
                  : richLayout
                    ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start"
                    : "lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
              )}
            >
              <div>
                <p className="eyebrow">{page.eyebrow}</p>
                <h1 className="display-heading mt-4">{page.h1}</h1>
                <p className={cn("mt-4 max-w-[40rem] text-lg leading-[1.6] text-muted-foreground", (isTradePage || isAboutPage) && "mx-auto")}>
                  {page.intro}
                </p>

                <div className={cn("mt-8 flex flex-wrap items-center gap-2.5", (isTradePage || isAboutPage) && "justify-center")}>
                  <ButtonLink href={primaryCtaHref}>{page.ctaPrimaryLabel ?? copy.common.tryFree}</ButtonLink>
                  <ButtonLink href={localizeHref(locale, page.ctaSecondaryHref ?? "/pricing/")} variant="secondary">
                    {page.ctaSecondaryLabel ?? copy.common.seePricing}
                  </ButtonLink>
                </div>
                <p className="fine-print mt-4">{reassurance}</p>
              </div>

              {details && <ExampleCall details={details} />}
              {!richLayout && !isTradePage && !isAboutPage && (
                <div
                  className={cn(
                    "min-h-[300px] w-full sm:min-h-[380px] lg:min-h-[440px]",
                    page.group === "solution" ? "lg:translate-y-10" : undefined
                  )}
                >
                  {page.group === "solution" &&
                  [
                    "after-hours-answering-service",
                    "ai-receptionist-for-dental-offices",
                    "ai-receptionist-for-salons-and-spas",
                    "self-hosted-ai-receptionist",
                  ].includes(page.slug) ? (
                    <LightModeDashboardMockup slug={page.slug} />
                  ) : (
                    <div
                      className="relative h-full min-h-[300px] w-full overflow-hidden rounded-2xl border border-border/60 bg-beige-strong/60 sm:min-h-[380px] lg:min-h-[440px]"
                      role="img"
                      aria-label={page.imageAlt}
                    >
                      {heroScenes[page.image] ? (
                        <ProductScene name={heroScenes[page.image] ?? "callCapture"} locale={locale} fit="panel" />
                      ) : (
                        <img
                          src={page.image}
                          alt=""
                          width="1200"
                          height="800"
                          className="absolute inset-0 h-full w-full object-cover"
                          decoding="async"
                          fetchPriority="high"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Proof Points / Benefits */}
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-3">
            {page.proofPoints.map((point, index) => (
              <div key={index} className="flex items-center justify-center gap-3 bg-background px-6 py-6 text-center">
                <CheckDot />
                <p className="text-base leading-6 text-muted-foreground">{point}</p>
              </div>
            ))}
          </div>

          {isTradePage && (
            <figure className="mx-auto mt-16 max-w-5xl">
              <AppFrame>
                <Screenshot shot={dashboardShot(locale)} alt={t.dashboardAlt} />
              </AppFrame>
              <figcaption className="mt-4 text-center text-sm text-muted-foreground">{t.dashboardCaption}</figcaption>
            </figure>
          )}
        </section>

        {details && <CallRouting details={details} />}
        {isDental && <CallRouting details={dentalDetails} />}
        {isAfterHours && (
          <>
            <CallRouting
              details={afterHoursRouting}
              intro="You decide what LobbyStack does with each kind of call. Here's a typical after-hours setup."
              callHeading="The call"
            />
            <CoverageSchedule />
          </>
        )}
        {isSelfHosted && (
          <>
            <section className="section-spacing" id="architecture">
              <div className="mx-auto max-w-site px-6">
                <SectionTitle
                  eyebrow="Architecture"
                  intro="Everything inside the dashed line runs on your server. Twilio and OpenAI run on your own accounts."
                  className="max-w-3xl"
                >
                  How a call moves through your server
                </SectionTitle>
                <div className="mt-12">
                  <ArchitectureDiagram />
                </div>
              </div>
            </section>
            <WhatYouRun />
          </>
        )}

        {/* Alternating Solution Tour Sections */}
        {richLayout && (
          <section className="section-spacing">
            <div className="mx-auto max-w-site divide-y divide-border/60 px-6">
              {page.sections.map((section, index) => (
                <div key={index} className="grid gap-6 py-12 first:pt-0 last:pb-0 lg:grid-cols-12 lg:gap-12">
                  <h2 className="feature-heading lg:col-span-5">
                    {section.title}
                  </h2>
                  <div className="lg:col-span-7">
                    <p className="max-w-[65ch] text-lg leading-[1.6] text-muted-foreground">{section.body}</p>
                    <ul className="mt-6 space-y-3">
                      {section.points.map((point, pointIndex) => (
                        <li key={pointIndex} className="flex items-start gap-3 text-base text-foreground">
                          <CheckDot />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {!richLayout && (
          <section className="section-spacing">
            <div className="mx-auto max-w-site space-y-16 px-6 md:space-y-24">
              {page.sections.map((section, index) => {
                const isEven = index % 2 === 0
                return (
                  <div key={index} className="grid gap-12 lg:grid-cols-12 lg:items-center">
                    <div className={cn("space-y-5 lg:col-span-6", isEven ? "lg:order-first" : "lg:order-last")}>
                      <h2 className="feature-heading">{section.title}</h2>
                      <p className="max-w-[55ch] text-lg leading-[1.6] text-muted-foreground">{section.body}</p>
                    </div>
                    <div className="lg:col-span-6">
                      <div className="rounded-2xl border border-border/60 bg-beige p-8 md:p-10">
                        <ul className="space-y-4">
                          {section.points.map((point, pointIndex) => (
                            <li key={pointIndex} className="flex items-start gap-3.5">
                              <CheckDot />
                              <span className="text-base text-muted-foreground">{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {details && (
          <>
            <AfterTheCall details={details} />
            <SetupAndCompare details={details} />
          </>
        )}
        {isAfterHours && (
          <>
            <AfterHoursCost />
            <SetupAndCompare details={afterHoursRouting} />
            <AfterHoursIndustries />
          </>
        )}
        {isSelfHosted && <CloudVsSelfHosted />}
        {isDental && (
          <>
            <AfterTheCall details={dentalDetails} />
            <SetupAndCompare details={dentalDetails} />
          </>
        )}

        {/* FAQ Section */}
        {page.faqs.length > 0 && <FaqSection heading={page.faqHeading ?? t.faqHeading} faqs={page.faqs} />}

        {otherTrades.length > 0 && (
          <section className="section-spacing">
            <div className="mx-auto max-w-site px-6">
              <h2 className="card-heading">Answering services for other trades</h2>
              <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-3">
                {otherTrades.map((trade) => (
                  <li key={trade.path} className="bg-background">
                    <a
                      href={localizeHref(locale, trade.path)}
                      className="block px-5 py-4 text-base font-medium text-foreground transition-colors hover:bg-beige"
                    >
                      {trade.eyebrow}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Related Resources Footer */}
        <section className="mx-auto max-w-site px-6 pt-12">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <h3 className="eyebrow">{copy.common.relatedResources}</h3>
            <div className="flex flex-wrap gap-2.5">
              {page.relatedLinks.map((link, index) => (
                <ButtonLink key={index} href={localizeHref(locale, link.href)} variant="secondary" size="sm">
                  {link.label}
                </ButtonLink>
              ))}
            </div>
          </div>
        </section>

        <ClosingCta
          titleLines={[page.ctaHeading ?? t.ctaHeading]}
          body={page.ctaBody ?? t.ctaBody}
          primary={{ label: page.ctaPrimaryLabel ?? copy.common.tryFree, href: primaryCtaHref }}
          secondary={{
            label: page.ctaSecondaryLabel ?? copy.common.viewPricing,
            href: localizeHref(locale, page.ctaSecondaryHref ?? "/pricing/"),
          }}
          footnote={copy.common.noCreditCardCancelAnytime}
        />
    </>
  )
}
