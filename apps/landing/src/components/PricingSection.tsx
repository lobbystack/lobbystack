import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { Check, Minus, ArrowRight } from "lucide-react"
import { Fragment } from "react"

/* ─────────────────────────── Data ─────────────────────────── */

const enterpriseContactHref =
  "mailto:support@lobbystack.com?subject=LobbyStack%20enterprise%20inquiry"

type Tier = {
  name: string
  price: string
  period: string
  description: string
  cta: string
  ctaHref?: string
  ctaVariant: "default" | "outline"
  highlight: boolean
  highlights: string[]
}

const tiers: Tier[] = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Try LobbyStack with enough usage to see it work.",
    cta: "Start free",
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "30 voice minutes included",
      "Add a dedicated number after upgrade",
      "Unlimited booking and contacts",
      "Community support",
    ],
  },
  {
    name: "Starter",
    price: "$30",
    period: "/mo",
    description:
      "$24/mo effective when billed annually. Includes 150 voice minutes that reset monthly.",
    cta: "Start Starter",
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "150 voice minutes + pay-as-you-go",
      "1 dedicated business number",
      "2 GB knowledge storage",
      "$0.20/min voice overages",
    ],
  },
  {
    name: "Pro",
    price: "$100",
    period: "/mo",
    description:
      "$80/mo effective when billed annually. More included usage for growing call volume.",
    cta: "Go Pro",
    ctaVariant: "default" as const,
    highlight: true,
    highlights: [
      "500 voice minutes + pay-as-you-go",
      "200 alert SMS segments",
      "10 GB knowledge storage",
      "Priority email support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description:
      "For higher volume, multiple numbers, or custom deployment needs.",
    cta: "Contact us",
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
        feature: "Knowledge storage",
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
        feature: "Usage-based billing",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Support",
        free: "Community",
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

export function PricingSection() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 pt-16 pb-8 text-center md:pt-20 md:pb-10 lg:pb-12">
          <h1 className="animate-fade-up display-heading-compact delay-100">
            AI receptionist{" "}
            <span className="underline decoration-2 underline-offset-4">
              pricing
            </span>
          </h1>
          <p className="animate-fade-up body-copy mx-auto mt-5 max-w-[60ch] delay-200 md:text-lg">
            Start free, then upgrade to Starter or Pro for more included
            minutes, annual savings, and transparent overages.
          </p>
        </div>
      </section>

      {/* ── Tier cards ── */}
      <section className="mx-auto max-w-6xl px-6 pt-8 pb-8 md:pt-10 md:pb-10 lg:pt-12 lg:pb-12">
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
              {tier.highlight && (
                <div className="absolute -top-3 left-8 rounded-full bg-foreground px-3 py-0.5 text-xs font-medium text-background">
                  Most popular
                </div>
              )}

              {/* Tier header */}
              <div className="mb-6">
                <h3 className="font-heading text-lg font-medium tracking-[-0.03em]">
                  {tier.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-sm text-muted-foreground">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {tier.description}
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
                data-ph-capture-attribute-label={tier.cta}
              >
                {tier.cta}
                <ArrowRight className="ml-1 size-4" />
              </a>

              {/* Key highlights only */}
              <div className="flex-1 border-t border-border/50 pt-5">
                <ul className="flex flex-col gap-2.5">
                  {tier.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-foreground/60"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
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
            Compare plans in detail
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
            Every plan gets the core AI receptionist. Starter and Pro give you
            higher included usage with monthly resets and usage-based overages.
          </p>

          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Plan comparison table"
            tabIndex={0}
          >
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">
                Feature comparison across Free, Starter, Pro, and Enterprise plans.
              </caption>
              {/* Sticky header */}
              <thead>
                <tr className="border-b border-border/60">
                  <th
                    scope="col"
                    className="pr-8 pb-4 text-left text-xs font-medium text-muted-foreground"
                  >
                    Feature
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground"
                  >
                    Free
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground"
                  >
                    Starter
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      Pro
                      <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-medium text-background">
                        Popular
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground"
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
                          <td key={i} className="px-4 py-3 text-center">
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
