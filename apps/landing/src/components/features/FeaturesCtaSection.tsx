import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { getCopy, localizeHref, type Locale } from "@/i18n"
import { ArrowRight } from "lucide-react"

type FeaturesCtaSectionProps = {
  locale?: Locale
}

const featuresCtaCopy = {
  en: {
    headingStart: "Stop letting missed calls decide your",
    headingEmphasis: "revenue",
    body: "Let LobbyStack answer, qualify, quote, book, follow up, and notify your team day or night.",
  },
  fr: {
    headingStart: "Ne laissez plus les appels manqués décider de votre",
    headingEmphasis: "chiffre d’affaires",
    body: "LobbyStack répond, qualifie, planifie, relance et prévient votre équipe, même le soir et la fin de semaine.",
  },
} satisfies Record<Locale, Record<string, string>>

export function FeaturesCtaSection({ locale = "en" }: FeaturesCtaSectionProps) {
  const common = getCopy(locale).common
  const copy = featuresCtaCopy[locale]

  return (
    <section className="flex min-h-[360px] items-center bg-background py-16 md:min-h-[440px] md:py-20 lg:min-h-[500px]">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="section-heading">
          {copy.headingStart}{" "}
          <span className="underline decoration-2 underline-offset-4">
            {copy.headingEmphasis}
          </span>
        </h2>
        <p className="section-intro mx-auto max-w-xl">{copy.body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href={APP_SIGNUP_URL}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 rounded-full px-7 text-sm"
            )}
            data-ph-signup-cta
            data-ph-capture-attribute-section="features_final_cta"
            data-ph-capture-attribute-action="try_for_free"
            data-ph-capture-attribute-destination={APP_SIGNUP_URL}
          >
            {common.tryFree}
            <ArrowRight className="ml-1 size-4" />
          </a>
          <a
            href={localizeHref(locale, "/pricing/")}
            data-ph-capture-attribute-section="features_final_cta"
            data-ph-capture-attribute-action="view_pricing"
            data-ph-capture-attribute-destination="/pricing/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {common.viewPricing}
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {common.noCreditCardCancelAnytime}
        </p>
      </div>
    </section>
  )
}
