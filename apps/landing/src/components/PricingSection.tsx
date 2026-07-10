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
      "1 dedicated business number",
      "50 alert SMS segments",
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
      "1 dedicated business number",
      "200 alert SMS segments",
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

const tiersFr: Tier[] = [
  {
    name: "Free",
    price: {
      monthly: "$0",
      annual: "$0",
    },
    period: "",
    description: {
      monthly: "Par mois, facturé mensuellement",
      annual: "Par mois, facturé annuellement",
    },
    cta: {
      monthly: "Commencer gratuitement",
      annual: "Commencer gratuitement",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "30 minutes vocales incluses",
      "Toutes les fonctionnalités",
      "Support communautaire",
    ],
  },
  {
    name: "Starter",
    price: {
      monthly: "$30",
      annual: "$24",
    },
    period: "/mois",
    description: {
      monthly: "Par mois, facturé mensuellement",
      annual: "Par mois, facturé annuellement",
    },
    cta: {
      monthly: "Commencer gratuitement",
      annual: "Commencer gratuitement",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      {
        label: "150 minutes vocales incluses",
        sublabel: "Puis 0,20 $/min",
      },
      "1 numéro d'entreprise dédié",
      "50 segments SMS d'alerte",
      "Support par courriel",
    ],
  },
  {
    name: "Pro",
    price: {
      monthly: "$100",
      annual: "$80",
    },
    period: "/mois",
    description: {
      monthly: "Par mois, facturé mensuellement",
      annual: "Par mois, facturé annuellement",
    },
    cta: {
      monthly: "Commencer gratuitement",
      annual: "Commencer gratuitement",
    },
    ctaVariant: "default" as const,
    highlight: true,
    highlights: [
      {
        label: "500 minutes vocales incluses",
        sublabel: "Puis 0,18 $/min",
      },
      "1 numéro d'entreprise dédié",
      "200 segments SMS d'alerte",
      "Support prioritaire par courriel",
    ],
  },
  {
    name: "Enterprise",
    price: {
      monthly: "Sur mesure",
      annual: "Sur mesure",
    },
    period: "",
    description: {
      monthly: "Pour les volumes élevés",
      annual: "Pour les volumes élevés",
    },
    cta: {
      monthly: "Nous contacter",
      annual: "Nous contacter",
    },
    ctaHref: enterpriseContactHref,
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "Plusieurs numéros dédiés",
      "Routage multi-sites",
      "Règles de secours personnalisées",
      "Accompagnement dédié à l’implémentation",
    ],
  },
]

const tiersByLocale = {
  en: tiers,
  fr: tiersFr,
} satisfies Record<Locale, Tier[]>

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

const comparisonGroupsEn: ComparisonGroup[] = [
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
        free: "25 MB",
        starter: "100 MB",
        pro: "500 MB",
        enterprise: "Custom",
      },
      {
        feature: "Phone numbers",
        free: false,
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

const comparisonGroupsFr: ComparisonGroup[] = [
  {
    category: "Usage et limites",
    rows: [
      {
        feature: "Minutes vocales",
        free: { included: "30 incluses" },
        starter: { included: "150 incluses", then: "puis 0,20 $/min" },
        pro: { included: "500 incluses", then: "puis 0,18 $/min" },
        enterprise: "Sur mesure",
      },
      {
        feature: "Tentatives d'appels sortants",
        free: { included: "2 incluses" },
        starter: { included: "20 incluses", then: "puis 0,02 $/tentative" },
        pro: { included: "100 incluses", then: "puis 0,02 $/tentative" },
        enterprise: "Sur mesure",
      },
      {
        feature: "Segments SMS d'alerte",
        free: { included: "10 inclus" },
        starter: { included: "50 inclus", then: "puis 0,02 $/segment" },
        pro: { included: "200 inclus", then: "puis 0,02 $/segment" },
        enterprise: "Sur mesure",
      },
      {
        feature: "Base de connaissances",
        free: "25 Mo",
        starter: "100 Mo",
        pro: "500 Mo",
        enterprise: "Sur mesure",
      },
      {
        feature: "Numéros de téléphone",
        free: false,
        starter: "1 dédié",
        pro: "1 dédié",
        enterprise: "Plusieurs",
      },
    ],
  },
  {
    category: "Réceptionniste IA",
    rows: [
      {
        feature: "Réponse aux appels 24/7",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Collecte des détails et messages",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Réponses depuis la base de connaissances",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Consignes en langage naturel",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Filtrage du spam",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Appels de moins de 10 s exclus de la facturation",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Appels simultanés illimités",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Support multilingue",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Rendez-vous et suivi",
    rows: [
      {
        feature: "Prise de rendez‑vous",
        free: "Illimitée",
        pro: "Illimitée",
        enterprise: "Illimitée",
      },
      {
        feature: "SMS de confirmation de rendez‑vous",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Intégration Google Calendar",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Intégration Outlook",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Suivi des appels manqués",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Appels sortants",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Routage et transferts",
    rows: [
      {
        feature: "Transfert des appels urgents",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Transferts d'appel",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Réponse hors horaires",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Routage multi-sites",
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        feature: "Règles de secours et d’escalade personnalisées",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    category: "Notifications et messagerie",
    rows: [
      {
        feature: "Notifications par courriel",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Notifications SMS",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Données et tableau de bord",
    rows: [
      {
        feature: "Résumés et transcriptions d’appels",
        free: "Illimités",
        pro: "Illimités",
        enterprise: "Illimités",
      },
      {
        feature: "Historique et enregistrements d'appels",
        free: "Illimités",
        pro: "Illimités",
        enterprise: "Illimités",
      },
      {
        feature: "Profils et notes d'appelants",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Contacts",
        free: "Illimités",
        pro: "Illimités",
        enterprise: "Illimités",
      },
      {
        feature: "Import de connaissances depuis le site web",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Conseils de conservation des données",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    category: "Hébergement et support",
    rows: [
      {
        feature: "Hébergement",
        free: "Cloud géré",
        pro: "Cloud géré",
        enterprise: "Cloud géré",
      },
      {
        feature: "Dépassements à l’usage",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Support",
        free: "Communauté",
        starter: "Courriel",
        pro: "Courriel prioritaire",
        enterprise: "Implémentation dédiée",
      },
    ],
  },
]

const comparisonGroupsByLocale = {
  en: comparisonGroupsEn,
  fr: comparisonGroupsFr,
} satisfies Record<Locale, ComparisonGroup[]>

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
      "Every plan gives you access to all features. Starter and Pro give you higher included usage with monthly resets and usage-based overages.",
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
      "Tous les forfaits donnent accès aux mêmes fonctionnalités. Starter et Pro ajoutent plus de volume inclus, avec remise à zéro mensuelle et dépassements facturés à l’usage.",
    billingLabel: "Intervalle de facturation",
    tableLabel: "Tableau de comparaison des forfaits",
    caption:
      "Comparaison des fonctionnalités entre les forfaits Free, Starter, Pro et Enterprise.",
    feature: "Fonctionnalité",
    included: "Inclus",
    notIncluded: "Non inclus",
  },
} satisfies Record<Locale, Record<string, string>>

export function PricingSection({ locale = "en" }: PricingSectionProps) {
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("annual")
  const copy = pricingSectionCopy[locale]
  const localizedTiers = tiersByLocale[locale]
  const localizedComparisonGroups = comparisonGroupsByLocale[locale]

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
      <section className="mx-auto max-w-7xl px-6 pt-8 pb-8 md:pt-10 md:pb-10 lg:pt-12 lg:pb-12">
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

        <div className="animate-fade-up grid gap-6 delay-300 md:grid-cols-2 xl:grid-cols-4">
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
                  "mb-6 h-11 w-full min-w-0 rounded-full px-4 text-[0.8125rem] sm:text-sm"
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
                <span className="min-w-0">{tier.cta[billingInterval]}</span>
                <ArrowRight className="size-4 shrink-0" />
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
