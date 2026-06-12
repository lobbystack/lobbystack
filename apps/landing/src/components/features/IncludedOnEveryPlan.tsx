import { Check } from "lucide-react"
import { getCopy, localizeHref, type Locale } from "@/i18n"

const includedCopy = {
  en: {
    headingStart: "Every plan gets the full",
    headingEmphasis: "receptionist",
    intro:
      "Plans scale by usage, not by locking basic receptionist features behind higher tiers.",
    label: "Included on every plan",
    features: [
      "Call answering",
      "Plain-language workflows",
      "Appointment booking",
      "Appointment confirmation texts",
      "Outbound calls",
      "Transfers",
      "Call summaries",
      "Email notifications",
      "SMS notifications",
      "Spam filtering",
      "Calls under 10 seconds excluded",
      "Unlimited concurrent calls",
      "Knowledge base",
      "Dashboard and call history",
    ],
  },
  fr: {
    headingStart: "Tout ce qu’il faut pour votre réceptionniste IA,",
    headingEmphasis: "dès le premier forfait",
    intro:
      "Les forfaits évoluent avec votre volume d’appels. Les fonctions essentielles restent incluses.",
    label: "Inclus dans chaque forfait",
    features: [
      "Réponse aux appels",
      "Consignes en langage naturel",
      "Prise de rendez‑vous",
      "SMS de confirmation",
      "Appels sortants",
      "Transferts",
      "Résumés d’appels",
      "Notifications par courriel",
      "Notifications SMS",
      "Filtrage du spam",
      "Appels de moins de 10 secondes exclus",
      "Appels simultanés illimités",
      "Base de connaissances",
      "Tableau de bord et historique d’appels",
    ],
  },
} satisfies Record<
  Locale,
  {
    headingStart: string
    headingEmphasis: string
    intro: string
    label: string
    features: string[]
  }
>

type IncludedOnEveryPlanProps = {
  locale?: Locale
}

export function IncludedOnEveryPlan({
  locale = "en",
}: IncludedOnEveryPlanProps) {
  const copy = includedCopy[locale]
  const common = getCopy(locale).common

  return (
    <section className="section-spacing" id="included">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section intro */}
        <div className="mb-12 max-w-3xl md:mb-16">
          <h2 className="section-heading">
            {copy.headingStart}{" "}
            <span className="underline decoration-2 underline-offset-4">
              {copy.headingEmphasis}
            </span>
          </h2>
          <p className="section-intro">{copy.intro}</p>
        </div>

        {/* Checkmark card */}
        <div className="rounded-2xl border border-border/70 bg-background p-8 md:p-10">
          <p className="mb-6 text-xs font-medium tracking-wide text-muted-foreground">
            {copy.label}
          </p>

          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {copy.features.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2.5 text-sm text-foreground"
              >
                <Check className="size-4 shrink-0 text-foreground/50" />
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8">
          <a
            href={localizeHref(locale, "/pricing/")}
            data-ph-capture-attribute-section="included_every_plan"
            data-ph-capture-attribute-action="view_pricing"
            data-ph-capture-attribute-destination="/pricing/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {common.viewPricing}
          </a>
        </div>
      </div>
    </section>
  )
}
