"use client"

import { Button, buttonVariants } from "@/marketing/components/ui/button"
import { appSignupUrl } from "@/marketing/lib/app-links"
import type { Locale } from "@/marketing/i18n"
import { cn } from "@/marketing/lib/utils"
import { planCards } from "@lobbystack/shared/plan-cards"
import { planComparison, type ComparisonValue } from "@lobbystack/shared/plan-comparison"
import { Check, Minus, ArrowRight } from "lucide-react"
import { Fragment, useLayoutEffect, useRef, useState } from "react"

/* ─────────────────────────── Data ─────────────────────────── */

type Tier = {
  name: string
  price: {
    monthly: string
    annual: string
  }
  period: string
  description: {
    monthly: string
    annual: string
  }
  cta: {
    monthly: string
    annual: string
  }
  ctaHref?: string
  // Carried to signup, so the dashboard offers this plan first.
  plan?: "starter" | "pro"
  ctaVariant: "default" | "outline"
  highlight: boolean
  highlights: Array<
    | string
    | {
        label: string
        sublabel: string
      }
  >
}

type BillingInterval = "monthly" | "annual"

const enterpriseContactHref =
  "mailto:support@lobbystack.com?subject=LobbyStack%20enterprise%20inquiry"

// The cards' words and numbers come from the shared plan cards, which the dashboard uses too.
function tiersFor(locale: Locale): Tier[] {
  return planCards(locale).map((card) => ({
    name: card.name,
    price: card.price,
    period: card.period,
    description: card.description,
    cta: { monthly: card.cta, annual: card.cta },
    ...(card.slug === "starter" || card.slug === "pro" ? { plan: card.slug } : {}),
    ...(card.slug === "enterprise" ? { ctaHref: enterpriseContactHref } : {}),
    ctaVariant: card.featured ? "default" : "outline",
    highlight: card.featured,
    highlights: card.lines.map((line) => line.sublabel ? { label: line.label, sublabel: line.sublabel } : line.label),
  }))
}

/* ─── Comparison table data ─── */

// The table's rows come from the shared plan comparison, which onboarding uses too.

/* ─────────────────────────── Components ─────────────────────────── */

function ComparisonCell({
  includedLabel,
  notIncludedLabel,
  value,
}: {
  includedLabel: string
  notIncludedLabel: string
  value: ComparisonValue
}) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center">
        <Check
          className="mx-auto size-4 text-foreground/60"
          aria-hidden="true"
        />
        <span className="sr-only">{includedLabel}</span>
      </span>
    ) : (
      <span className="inline-flex items-center justify-center">
        <Minus
          className="mx-auto size-4 text-muted-foreground/30"
          aria-hidden="true"
        />
        <span className="sr-only">{notIncludedLabel}</span>
      </span>
    )
  }

  if (typeof value === "string") {
    return (
      <span
        className={
          value === "-" ? "text-muted-foreground/40" : "text-muted-foreground"
        }
      >
        {value}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col gap-0.5 leading-tight">
      <span className="font-medium text-foreground">{value.included}</span>
      {value.then && (
        <span className="text-xs text-muted-foreground">{value.then}</span>
      )}
    </span>
  )
}

type PricingSectionProps = {
  locale?: Locale
}

const pricingSectionCopy = {
  en: {
    heading: "Plans for businesses of every size",
    intro:
      "Start free, then upgrade to Starter or Pro for more included minutes and transparent overages.",
    monthly: "Monthly",
    annual: "Annual",
    save: "Save 20%",
    compareHeading: "Compare plans in detail",
    compareIntro:
      "Free includes 30 voice minutes and a phone number free for 14 days. Starter and Pro include a dedicated number, monthly usage allowances, and usage-based overages.",
    billingLabel: "Billing interval",
    tableLabel: "Plan comparison table",
    caption:
      "Feature comparison across Free, Starter, Pro, and Enterprise plans.",
    feature: "Feature",
    included: "Included",
    notIncluded: "Not included",
  },
  fr: {
    heading: "Des forfaits pour entreprises de toute taille",
    intro:
      "Commencez gratuitement, puis passez à Starter ou Pro pour plus de minutes incluses et des dépassements transparents.",
    monthly: "Mensuel",
    annual: "Annuel",
    save: "Économisez 20 %",
    compareHeading: "Comparer les forfaits en détail",
    compareIntro:
      "Free comprend 30 minutes vocales et un numéro de téléphone gratuit pendant 14 jours. Starter et Pro comprennent un numéro dédié, des volumes mensuels et des dépassements facturés à l’usage.",
    billingLabel: "Intervalle de facturation",
    tableLabel: "Tableau de comparaison des forfaits",
    caption:
      "Comparaison des fonctionnalités entre les forfaits Free, Starter, Pro et Enterprise.",
    feature: "Fonctionnalité",
    included: "Inclus",
    notIncluded: "Non inclus",
  },
  es: {
    heading: "Planes para negocios de todos los tamaños",
    intro:
      "Empiece gratis y luego cambie a Starter o Pro para tener más minutos incluidos y excedentes transparentes.",
    monthly: "Mensual",
    annual: "Anual",
    save: "Ahorre 20%",
    compareHeading: "Compare los planes en detalle",
    compareIntro:
      "Free incluye 30 minutos de voz y un número de teléfono gratis durante 14 días. Starter y Pro incluyen un número dedicado, minutos mensuales incluidos y excedentes según el uso.",
    billingLabel: "Periodo de facturación",
    tableLabel: "Tabla comparativa de planes",
    caption:
      "Comparación de funciones entre los planes Free, Starter, Pro y Enterprise.",
    feature: "Función",
    included: "Incluido",
    notIncluded: "No incluido",
  },
  sr: {
    heading: "Paketi za firme svih veličina",
    intro:
      "Počnite besplatno, a zatim pređite na Starter ili Pro za više uključenih minuta i jasne cene prekoračenja.",
    monthly: "Mesečno",
    annual: "Godišnje",
    save: "Uštedite 20%",
    compareHeading: "Detaljno uporedite pakete",
    compareIntro:
      "Free uključuje 30 minuta razgovora i broj telefona besplatno na 14 dana. Starter i Pro uključuju namenski broj, mesečnu kvotu minuta i prekoračenja koja se naplaćuju prema potrošnji.",
    billingLabel: "Period naplate",
    tableLabel: "Tabela poređenja paketa",
    caption: "Poređenje funkcija paketa Free, Starter, Pro i Enterprise.",
    feature: "Funkcija",
    included: "Uključeno",
    notIncluded: "Nije uključeno",
  },
} satisfies Record<Locale, Record<string, string>>

export function PricingSection({ locale = "en" }: PricingSectionProps) {
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("annual")
  const tabRefs = useRef<Record<BillingInterval, HTMLButtonElement | null>>({
    monthly: null,
    annual: null,
  })
  // Measured position of the selected tab. Until hydration measures it, the
  // selected tab paints its own background so the server HTML still shows state.
  const [thumb, setThumb] = useState<{ x: number; width: number } | null>(
    null
  )

  useLayoutEffect(() => {
    const tab = tabRefs.current[billingInterval]
    if (!tab) return

    const measure = () =>
      setThumb({ x: tab.offsetLeft, width: tab.offsetWidth })
    measure()

    // Watch every tab: a late font swap can resize the one before this tab
    // and shift it without changing its own size.
    const observer = new ResizeObserver(measure)
    Object.values(tabRefs.current).forEach((node) => node && observer.observe(node))
    return () => observer.disconnect()
  }, [billingInterval])
  const copy = pricingSectionCopy[locale]
  const localizedTiers = tiersFor(locale)
  const localizedComparisonGroups = planComparison(locale)

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 pt-16 pb-8 text-center md:pt-20 md:pb-10 lg:pb-12">
          <h1 className="animate-fade-up display-heading-compact stagger-1">
            {copy.heading}
          </h1>
          <p className="animate-fade-up body-copy mx-auto mt-5 max-w-[60ch] stagger-2 md:text-lg">
            {copy.intro}
          </p>
        </div>
      </section>

      {/* ── Tier cards ── */}
      <section className="mx-auto max-w-site px-6 pt-8 pb-8 md:pt-10 md:pb-10 lg:pt-12 lg:pb-12">
        <div className="animate-fade-up mb-8 flex justify-center stagger-3">
          <div
            aria-label={copy.billingLabel}
            className="relative inline-flex rounded-full border border-border bg-input/30 p-1"
            role="tablist"
          >
            {thumb && (
              <span
                aria-hidden="true"
                className="absolute top-1 bottom-1 left-0 rounded-full bg-background shadow-sm transition-[translate,width] duration-250 ease-(--ease-out) motion-reduce:transition-none"
                style={{ translate: `${thumb.x}px 0`, width: thumb.width }}
              />
            )}
            {(["monthly", "annual"] as const).map((interval) => (
              <Button
                aria-selected={billingInterval === interval}
                className={cn(
                  "relative h-9 rounded-full border-transparent bg-transparent px-4 hover:bg-transparent",
                  billingInterval === interval
                    ? cn(
                        "text-foreground",
                        !thumb && "bg-background shadow-sm hover:bg-background"
                      )
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={interval}
                ref={(node) => {
                  tabRefs.current[interval] = node
                }}
                onClick={() => setBillingInterval(interval)}
                role="tab"
                size="sm"
                type="button"
                variant="outline"
              >
                {interval === "monthly" ? copy.monthly : copy.annual}
                {interval === "annual" ? (
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {copy.save}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </div>

        <div className="animate-fade-up grid gap-6 stagger-3 md:grid-cols-2 xl:grid-cols-4">
          {localizedTiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex min-w-0 flex-col rounded-2xl border bg-background p-6 ${
                tier.highlight
                  ? "border-foreground/20 ring-1 ring-foreground/10"
                  : "border-border/60"
              }`}
            >
              {/* Tier header */}
              <div className="mb-6">
                <h2 className="font-heading text-lg font-medium tracking-[-0.03em]">
                  {tier.name}
                </h2>
                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    key={tier.price[billingInterval]}
                    className="swap-in font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums"
                  >
                    {tier.price[billingInterval]}
                  </span>
                  {tier.period && (
                    <span className="text-sm text-muted-foreground">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {tier.description[billingInterval]}
                </p>
              </div>

              {/* Action */}
              <a
                href={tier.ctaHref ?? appSignupUrl(locale, tier.plan ? { plan: tier.plan } : undefined)}
                className={cn(
                  buttonVariants({ variant: tier.ctaVariant }),
                  "mb-6 h-11 w-full min-w-0 rounded-full px-4 text-[0.8125rem] sm:text-sm"
                )}
                data-ph-signup-cta={tier.ctaHref ? undefined : true}
                data-ph-capture-attribute-section="pricing_plan"
                data-ph-capture-attribute-action="pricing_cta"
                data-ph-capture-attribute-destination={
                  tier.ctaHref ?? appSignupUrl(locale, tier.plan ? { plan: tier.plan } : undefined)
                }
                data-ph-capture-attribute-plan={tier.name}
                data-ph-capture-attribute-billing-interval={billingInterval}
                data-ph-capture-attribute-label={tier.cta[billingInterval]}
              >
                <span className="min-w-0">{tier.cta[billingInterval]}</span>
                <ArrowRight className="size-4 shrink-0 transition-transform duration-200 ease-(--ease-out) group-hover/button:translate-x-0.5" />
              </a>

              {/* Key highlights only */}
              <div className="flex-1 border-t border-border/50 pt-5">
                <ul className="flex flex-col gap-2.5">
                  {tier.highlights.map((item) => {
                    const label = typeof item === "string" ? item : item.label
                    const sublabel =
                      typeof item === "string" ? null : item.sublabel
                    return (
                      <li
                        key={label}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <Check
                          className="mt-0.5 size-3.5 shrink-0 text-foreground/60"
                          aria-hidden="true"
                        />
                        <span>
                          {label}
                          {sublabel ? (
                            <span className="block text-muted-foreground">
                              {sublabel}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature comparison table ── */}
      <section className="bg-background" id="compare">
        <div className="mx-auto max-w-5xl px-6 pt-10 pb-12 md:pt-12 md:pb-14 lg:pt-14 lg:pb-16">
          <h2 className="mb-4 text-center font-heading text-2xl leading-tight font-medium tracking-[-0.04em] md:text-3xl">
            {copy.compareHeading}
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
            {copy.compareIntro}
          </p>

          <div
            className="overflow-x-auto"
            role="region"
            aria-label={copy.tableLabel}
            tabIndex={0}
          >
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">{copy.caption}</caption>
              {/* Sticky header */}
              <thead>
                <tr className="border-b border-border/60">
                  <th
                    scope="col"
                    className="py-4 pr-8 text-left text-xs font-medium text-muted-foreground"
                  >
                    {copy.feature}
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                  >
                    Free
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                  >
                    Starter
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] rounded-t-xl bg-muted/60 px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                  >
                    Pro
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                  >
                    Enterprise
                  </th>
                </tr>
              </thead>

              <tbody>
                {localizedComparisonGroups.map((group) => (
                  <Fragment key={group.category}>
                    {/* Category header row */}
                    <tr>
                      <td
                        colSpan={5}
                        className="pt-8 pb-3 text-xs font-medium tracking-wide text-muted-foreground"
                      >
                        {group.category}
                      </td>
                    </tr>

                    {/* Feature rows */}
                    {group.rows.map((row) => (
                      <tr
                        key={row.feature}
                        className="border-b border-border/40 last:border-0"
                      >
                        <th
                          scope="row"
                          className="py-3 pr-8 text-left font-medium text-foreground"
                        >
                          {row.feature}
                        </th>
                        {(
                          [
                            row.free,
                            row.starter ?? row.pro,
                            row.pro,
                            row.enterprise,
                          ] as ComparisonValue[]
                        ).map((value, i) => (
                          <td
                            key={i}
                            className={cn(
                              "px-4 py-3 text-center",
                              i === 2 && "bg-muted/60"
                            )}
                          >
                            <ComparisonCell
                              includedLabel={copy.included}
                              notIncludedLabel={copy.notIncluded}
                              value={value}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
