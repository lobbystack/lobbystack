import { ArrowRight, Check } from "lucide-react"

import { FaqAccordion } from "@/marketing/components/FaqAccordion"
import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
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
import { buttonVariants } from "@/marketing/components/ui/button"
import { getCopy, localizeHref, localizePath, type Locale } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { breadcrumbJsonLd, faqPageJsonLd, organizationJsonLd, webSiteJsonLd } from "@/marketing/lib/seo"
import { afterHoursRouting, dentalCalls, dentalDetails, nightCalls } from "@/marketing/lib/solution-details"
import { seoLandingPages, type SeoLandingPage as SeoLandingPageData } from "@/marketing/lib/seo-landing-pages"
import { tradeDetails, tradeDetailsFor } from "@/marketing/lib/trade-details"
import { cn } from "@/marketing/lib/utils"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

type SeoLandingPageProps = {
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
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" className="min-h-screen bg-background text-foreground">
        {/* Hero Section */}
        <section className="mx-auto max-w-site px-6 pt-16 pb-0 md:pt-20 lg:pt-24">
          {isSelfHosted && (
            <SelfHostedHero h1={page.h1} intro={page.intro} guideHref={page.ctaPrimaryHref ?? "/docs/"} />
          )}
          {stackedHero && (
            <StackedHero
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
                <h1 className="display-heading">{page.h1}</h1>
                <p className={cn("body-copy mt-6 max-w-[65ch] md:text-lg", (isTradePage || isAboutPage) && "mx-auto")}>
                  {page.intro}
                </p>

                <div
                  className={cn("mt-8 flex flex-wrap items-center gap-4", (isTradePage || isAboutPage) && "justify-center")}
                >
                  <a
                    href={primaryCtaHref}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-11 w-full max-w-80 rounded-full px-16 text-sm font-medium md:w-auto md:max-w-none"
                    )}
                  >
                    {page.ctaPrimaryLabel ?? copy.common.tryFree}
                    <ArrowRight className="ml-1 size-4" />
                  </a>
                  <a
                    href={localizeHref(locale, page.ctaSecondaryHref ?? "/pricing/")}
                    className="inline-flex h-11 w-full max-w-80 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted md:w-auto md:max-w-none"
                  >
                    {page.ctaSecondaryLabel ?? copy.common.seePricing}
                  </a>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">{reassurance}</p>
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
                    <div className="h-full w-full overflow-hidden rounded-2xl border border-border/70 bg-muted shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
                      <img
                        src={page.image}
                        alt={page.imageAlt}
                        width="1200"
                        height="800"
                        className="aspect-[4/3] h-full w-full object-cover lg:aspect-[1.15/1]"
                        decoding="async"
                        fetchPriority="high"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Proof Points / Benefits */}
          <div className="mt-16 grid divide-y divide-border/60 border-y border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {page.proofPoints.map((point, index) => (
              <div key={index} className="flex items-center justify-center gap-3 px-6 py-6 text-center">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                  <Check className="size-3.5 text-foreground/80" strokeWidth={2.5} />
                </span>
                <p className="text-sm leading-relaxed font-medium text-muted-foreground">{point}</p>
              </div>
            ))}
          </div>

          {isTradePage && (
            <figure className="mx-auto mb-16 max-w-5xl overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-sm">
              <img
                src="/screenshots/dashboard-home.webp"
                alt={t.dashboardAlt}
                width="2560"
                height="1920"
                className="h-auto w-full"
                loading="lazy"
                decoding="async"
              />
              <figcaption className="border-t border-border/50 px-5 py-4 text-sm text-muted-foreground">
                {t.dashboardCaption}
              </figcaption>
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
            <section className="border-t border-border/40 py-20 md:py-28" id="architecture">
              <div className="mx-auto max-w-site px-6">
                <div className="max-w-3xl">
                  <h2 className="section-heading">How a call moves through your server</h2>
                  <p className="section-intro">
                    Everything inside the dashed line runs on your server. Twilio
                    and OpenAI run on your own accounts.
                  </p>
                </div>
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
          <section className="border-t border-border/40 py-20 md:py-28">
            <div className="mx-auto max-w-site divide-y divide-border/60 px-6">
              {page.sections.map((section, index) => (
                <div key={index} className="grid gap-6 py-12 first:pt-0 last:pb-0 lg:grid-cols-12 lg:gap-12">
                  <h2 className="font-heading text-2xl leading-[1.15] font-medium tracking-[-0.04em] md:text-3xl lg:col-span-5">
                    {section.title}
                  </h2>
                  <div className="lg:col-span-7">
                    <p className="body-copy max-w-[65ch] md:text-lg">{section.body}</p>
                    <ul className="mt-6 space-y-3">
                      {section.points.map((point, pointIndex) => (
                        <li key={pointIndex} className="flex items-start gap-3 text-sm font-medium text-foreground md:text-base">
                          <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                            <Check className="size-3.5 text-foreground/80" strokeWidth={2.5} />
                          </span>
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
          <section className="border-t border-border/40 bg-muted/15 py-20 md:py-28">
            <div className="mx-auto max-w-site space-y-20 px-6 md:space-y-32">
              {page.sections.map((section, index) => {
                const isEven = index % 2 === 0
                return (
                  <div key={index} className="grid gap-12 lg:grid-cols-12 lg:items-center">
                    <div className={cn("space-y-5 lg:col-span-6", isEven ? "lg:order-first" : "lg:order-last")}>
                      <h2 className="section-heading text-left leading-[1.1]">{section.title}</h2>
                      <p className="body-copy max-w-[55ch] text-base md:text-lg">{section.body}</p>
                    </div>
                    <div className="lg:col-span-6">
                      <div className="rounded-2xl border border-border/60 bg-background p-8 shadow-[0_10px_30px_rgba(0,0,0,0.02)] md:p-10">
                        <ul className="space-y-4">
                          {section.points.map((point, pointIndex) => (
                            <li key={pointIndex} className="flex items-start gap-3.5">
                              <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                                <Check className="size-3.5 text-foreground/80" strokeWidth={2.5} />
                              </div>
                              <span className="text-sm font-medium text-muted-foreground md:text-base">{point}</span>
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
        {page.faqs.length > 0 && (
          <section
            className="relative mx-auto max-w-4xl px-6 py-20 before:absolute before:top-0 before:left-1/2 before:h-px before:w-screen before:-translate-x-1/2 before:bg-border/40 md:py-28"
            id="faq"
          >
            <h2 className="section-heading mb-12 text-center">{page.faqHeading ?? t.faqHeading}</h2>
            <FaqAccordion faqs={page.faqs} />
          </section>
        )}

        {/* Final CTA Section */}
        <section className="border-t border-border/40 bg-muted/10 py-20 md:py-28">
          <div className="mx-auto max-w-3xl space-y-6 px-6 text-center">
            <h2 className="section-heading mx-auto max-w-[24ch]">{page.ctaHeading ?? t.ctaHeading}</h2>
            <p className="section-intro mx-auto max-w-lg">{page.ctaBody ?? t.ctaBody}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a
                href={primaryCtaHref}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 w-full max-w-80 rounded-full px-16 text-sm font-medium md:w-auto md:max-w-none"
                )}
              >
                {page.ctaPrimaryLabel ?? copy.common.tryFree}
                <ArrowRight className="ml-1 size-4" />
              </a>
              <a
                href={localizeHref(locale, page.ctaSecondaryHref ?? "/pricing/")}
                className="inline-flex h-11 w-full max-w-80 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted md:w-auto md:max-w-none"
              >
                {page.ctaSecondaryLabel ?? copy.common.viewPricing}
              </a>
            </div>
            <p className="text-xs text-muted-foreground">{copy.common.noCreditCardCancelAnytime}</p>
          </div>
        </section>

        {otherTrades.length > 0 && (
          <section className="border-t border-border/40 py-16">
            <div className="mx-auto max-w-site px-6">
              <h2 className="card-heading">Answering services for other trades</h2>
              <ul className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {otherTrades.map((trade) => (
                  <li key={trade.path}>
                    <a
                      href={localizeHref(locale, trade.path)}
                      className="text-base font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
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
        <section className="relative mx-auto max-w-site px-6 py-12 before:absolute before:top-0 before:left-1/2 before:h-px before:w-screen before:-translate-x-1/2 before:bg-border/40">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">{copy.common.relatedResources}</h3>
            <div className="flex flex-wrap gap-3">
              {page.relatedLinks.map((link, index) => (
                <a
                  key={index}
                  href={localizeHref(locale, link.href)}
                  className="inline-flex h-9 items-center rounded-full border border-border/70 bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
