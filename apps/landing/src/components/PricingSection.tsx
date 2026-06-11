import { Button, buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import type { Locale } from "@/i18n"
import { cn } from "@/lib/utils"
import { Check, Minus, ArrowRight } from "lucide-react"
import { Fragment, useState } from "react"

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

const tiers: Tier[] = [
  {
    name: "Free",
    price: {
      monthly: "$0",
      annual: "$0",
    },
    period: "",
    description: {
      monthly: "Per month, billed monthly",
      annual: "Per month, billed annually",
    },
    cta: {
      monthly: "Start free",
      annual: "Start free",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "30 voice minutes included",
      "All features",
      "1 dedicated business number",
      "Community support",
    ],
  },
  {
    name: "Starter",
    price: {
      monthly: "$30",
      annual: "$24",
    },
    period: "/mo",
    description: {
      monthly: "Per month, billed monthly",
      annual: "Per month, billed annually",
    },
    cta: {
      monthly: "Start free",
      annual: "Start free",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      {
        label: "150 voice minutes included",
        sublabel: "Then $0.20/min",
      },
      "50 alert SMS segments",
      "2 GB knowledge base",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: {
      monthly: "$100",
      annual: "$80",
    },
    period: "/mo",
    description: {
      monthly: "Per month, billed monthly",
      annual: "Per month, billed annually",
    },
    cta: {
      monthly: "Start free",
      annual: "Start free",
    },
    ctaVariant: "default" as const,
    highlight: true,
    highlights: [
      {
        label: "500 voice minutes included",
        sublabel: "Then $0.18/min",
      },
      "200 alert SMS segments",
      "10 GB knowledge base",
      "Priority email support",
    ],
  },
  {
    name: "Enterprise",
    price: {
      monthly: "Custom",
      annual: "Custom",
    },
    period: "",
    description: {
      monthly: "For higher volume",
      annual: "For higher volume",
    },
    cta: {
      monthly: "Contact us",
      annual: "Contact us",
    },
    ctaHref: enterpriseContactHref,
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "Multiple dedicated numbers",
      "Multi-location routing",
      "Custom fallback rules",
      "Dedicated implementation support",
    ],
  },
]

/* ─── Comparison table data ─── */

type ComparisonValue =
  | string
  | boolean
  | {
      included: string
      then?: string
    }

type ComparisonRow = {
  feature: string
  free: ComparisonValue
  starter?: ComparisonValue
  pro: ComparisonValue
  enterprise: ComparisonValue
}

type ComparisonGroup = {
  category: string
  rows: ComparisonRow[]
}

const comparisonGroups: ComparisonGroup[] = [
  {
    category: "Usage & limits",
    rows: [
      {
        feature: "Voice minutes",
        free: { included: "30 included" },
        starter: { included: "150 included", then: "then $0.20/min" },
        pro: { included: "500 included", then: "then $0.18/min" },
        enterprise: "Custom",
      },
      {
        feature: "Outbound call attempts",
        free: { included: "2 included" },
        starter: { included: "20 included", then: "then $0.02/attempt" },
        pro: { included: "100 included", then: "then $0.02/attempt" },
        enterprise: "Custom",
      },
      {
        feature: "Alert SMS segments",
        free: { included: "10 included" },
        starter: { included: "50 included", then: "then $0.02/segment" },
        pro: { included: "200 included", then: "then $0.02/segment" },
        enterprise: "Custom",
      },
      {
        feature: "Knowledge base",
        free: "100 MB",
        starter: "2 GB",
        pro: "10 GB",
        enterprise: "Custom",
      },
      {
        feature: "Phone numbers",
        free: "Upgrade to add",
        starter: "1 dedicated",
        pro: "1 dedicated",
        enterprise: "Multiple",
      },
    ],
  },
  {
    category: "Core receptionist",
    rows: [
      {
        feature: "24/7 call answering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Caller details and message capture",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Knowledge base answers",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Plain-language workflows",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Spam filtering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Calls under 10s excluded from billing",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Unlimited concurrent calls",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Multilingual support",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Booking & follow-up",
    rows: [
      {
        feature: "Appointment booking",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Appointment confirmation texts",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Google Calendar integration",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Outlook integration",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Missed-call follow-up",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Outbound calls",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Routing & transfers",
    rows: [
      {
        feature: "Urgent call handoff",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Call transfers",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "After-hours answering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Multi-location routing",
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        feature: "Custom fallback and escalation rules",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    category: "Notifications & messaging",
    rows: [
      {
        feature: "Email notifications",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "SMS notifications",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Data & dashboard",
    rows: [
      {
        feature: "Call summaries and transcripts",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Call history and recordings",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Caller profiles and notes",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Contacts",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Website knowledge import",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Data retention guidance",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    category: "Deployment & support",
    rows: [
      {
        feature: "Hosting",
        free: "Managed cloud",
        pro: "Managed cloud",
        enterprise: "Managed cloud",
      },
      {
        feature: "Usage-based overages",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Support",
        free: "Community",
        starter: "Email",
        pro: "Priority email",
        enterprise: "Dedicated implementation",
      },
    ],
  },
]

/* ─────────────────────────── Components ─────────────────────────── */

function ComparisonCell({ value }: { value: ComparisonValue }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center">
        <Check
          className="mx-auto size-4 text-foreground/60"
          aria-hidden="true"
        />
        <span className="sr-only">Included</span>
      </span>
    ) : (
      <span className="inline-flex items-center justify-center">
        <Minus
          className="mx-auto size-4 text-muted-foreground/30"
          aria-hidden="true"
        />
        <span className="sr-only">Not included</span>
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
      "Every plan gives you access to all features. Starter and Pro give you higher included usage with monthly resets and usage-based overages.",
    billingLabel: "Billing interval",
    tableLabel: "Plan comparison table",
    caption:
      "Feature comparison across Free, Starter, Pro, and Enterprise plans.",
    feature: "Feature",
  },
  fr: {
    heading: "Des forfaits pour entreprises de toute taille",
    intro:
      "Commencez gratuitement, puis passez a Starter ou Pro pour plus de minutes incluses et des depassements transparents.",
    monthly: "Mensuel",
    annual: "Annuel",
    save: "Economisez 20 %",
    compareHeading: "Comparer les forfaits en detail",
    compareIntro:
      "Tous les forfaits donnent acces a toutes les fonctionnalites. Starter et Pro ajoutent plus d'usage inclus avec remise a zero mensuelle et depassements a l'usage.",
    billingLabel: "Intervalle de facturation",
    tableLabel: "Tableau de comparaison des forfaits",
    caption:
      "Comparaison des fonctionnalites entre les forfaits Free, Starter, Pro et Enterprise.",
    feature: "Fonctionnalite",
  },
} satisfies Record<Locale, Record<string, string>>

export function PricingSection({ locale = "en" }: PricingSectionProps) {
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("annual")
  const copy = pricingSectionCopy[locale]

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 pt-16 pb-8 text-center md:pt-20 md:pb-10 lg:pb-12">
          <h1 className="animate-fade-up display-heading-compact delay-100">
            {copy.heading}
          </h1>
          <p className="animate-fade-up body-copy mx-auto mt-5 max-w-[60ch] delay-200 md:text-lg">
            {copy.intro}
          </p>
        </div>
      </section>

      {/* ── Tier cards ── */}
      <section className="mx-auto max-w-6xl px-6 pt-8 pb-8 md:pt-10 md:pb-10 lg:pt-12 lg:pb-12">
        <div className="animate-fade-up mb-8 flex justify-center delay-300">
          <div
            aria-label={copy.billingLabel}
            className="inline-flex rounded-full border border-border bg-input/30 p-1"
            role="tablist"
          >
            {(["monthly", "annual"] as const).map((interval) => (
              <Button
                aria-selected={billingInterval === interval}
                className={cn(
                  "h-9 rounded-full px-4",
                  billingInterval === interval
                    ? "bg-background text-foreground shadow-sm hover:bg-background"
                    : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                key={interval}
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

        <div className="animate-fade-up grid gap-6 delay-300 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-2xl border bg-background p-8 ${
                tier.highlight
                  ? "border-foreground/20 ring-1 ring-foreground/10"
                  : "border-border/60"
              }`}
            >
              {/* Tier header */}
              <div className="mb-6">
                <h3 className="font-heading text-lg font-medium tracking-[-0.03em]">
                  {tier.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
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
                href={tier.ctaHref ?? APP_SIGNUP_URL}
                className={cn(
                  buttonVariants({ variant: tier.ctaVariant }),
                  "mb-6 w-full rounded-full"
                )}
                data-ph-signup-cta={tier.ctaHref ? undefined : true}
                data-ph-capture-attribute-section="pricing_plan"
                data-ph-capture-attribute-action="pricing_cta"
                data-ph-capture-attribute-destination={
                  tier.ctaHref ?? APP_SIGNUP_URL
                }
                data-ph-capture-attribute-plan={tier.name}
                data-ph-capture-attribute-billing-interval={billingInterval}
                data-ph-capture-attribute-label={tier.cta[billingInterval]}
              >
                {tier.cta[billingInterval]}
                <ArrowRight className="ml-1 size-4" />
              </a>

              {/* Key highlights only */}
              <div className="flex-1 border-t border-border/50 pt-5">
                <ul className="flex flex-col gap-2.5">
                  {tier.highlights.map((item) => {
                    const label = typeof item === "string" ? item : item.label
                    const sublabel = typeof item === "string" ? null : item.sublabel
                    return (
                      <li key={label} className="flex items-start gap-2.5 text-sm">
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
              <caption className="sr-only">
                {copy.caption}
              </caption>
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
                {comparisonGroups.map((group) => (
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
                            <ComparisonCell value={value} />
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
