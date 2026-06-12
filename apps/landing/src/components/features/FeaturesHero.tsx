import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { getCopy, localizeHref, type Locale } from "@/i18n"
import { ArrowRight } from "lucide-react"

type FeaturesHeroProps = {
  locale?: Locale
}

const featuresHeroCopy = {
  en: {
    h1Start: "AI receptionist features that actually",
    h1Emphasis: "gets work done",
    body: "LobbyStack handles AI phone answering, appointment booking, team follow-up, call routing, quotes, and lead qualification without phone trees or workflow-builder mess.",
    workflowLabel: "Write the workflow",
    workflowText:
      "When someone asks for a quote, ask what service they need, where they are located, their timeline, and their budget. Give our approved price range for standard jobs. If they need exact pricing, schedule a callback with sales and attach the summary for the team.",
    callLabel: "LobbyStack handles the call",
    quoteTitle: "Quote request from Sarah M.",
    service: "Service: Renovation estimate",
    budget: "Budget: $8,000 to $12,000",
    timeline: "Timeline: Next month",
    priceRange: "Price range shared",
    callbackNeeded: "Callback needed",
    outcomeLabel: "Review the outcome",
    callbackBooked: "Callback booked",
    callbackTime: "Tuesday at 2:00 PM",
    assigned: "Assigned to Alex",
    confirmation: "Customer confirmation sent",
    notification: "Team notification sent",
    summary: "Summary attached",
  },
  fr: {
    h1Start: "Tout ce qu’il faut pour",
    h1Emphasis: "répondre, qualifier et réserver",
    body: "LobbyStack prend les appels, qualifie les demandes, planifie les rendez‑vous et transmet les bonnes informations à votre équipe, sans menu téléphonique ni scénarios impossibles à maintenir.",
    workflowLabel: "Décrivez vos règles",
    workflowText:
      "Si quelqu’un demande un devis, demandez le service, l’adresse, le délai souhaité et le budget. Donnez la fourchette approuvée pour les demandes standards. Si le prix doit être confirmé, planifiez un rappel et joignez le résumé à l’équipe.",
    callLabel: "LobbyStack prend l’appel",
    quoteTitle: "Demande de devis - Sarah M.",
    service: "Service : estimation de rénovation",
    budget: "Budget : 8 000 $ à 12 000 $",
    timeline: "Délai : le mois prochain",
    priceRange: "Fourchette communiquée",
    callbackNeeded: "Rappel à prévoir",
    outcomeLabel: "Suivez la suite",
    callbackBooked: "Rappel planifié",
    callbackTime: "Mardi à 14 h",
    assigned: "Attribué à Alex",
    confirmation: "Confirmation envoyée au client",
    notification: "Équipe notifiée",
    summary: "Résumé joint",
  },
} satisfies Record<Locale, Record<string, string>>

export function FeaturesHero({ locale = "en" }: FeaturesHeroProps) {
  const common = getCopy(locale).common
  const copy = featuresHeroCopy[locale]

  return (
    <section className="relative overflow-hidden" id="features-hero">
      <div className="mx-auto max-w-7xl px-6 pt-16 md:pt-20 lg:pt-24">
        {/* Hero copy */}
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="animate-fade-up display-heading delay-100">
            {copy.h1Start}{" "}
            <span className="underline decoration-2 underline-offset-4">
              {copy.h1Emphasis}
            </span>
          </h1>

          <p className="animate-fade-up body-copy mx-auto mt-6 max-w-[65ch] delay-200 md:text-lg">
            {copy.body}
          </p>

          {/* CTAs */}
          <div className="animate-fade-up mt-8 flex items-center justify-center gap-4 delay-300">
            <a
              href={APP_SIGNUP_URL}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-full px-7 text-sm"
              )}
              data-ph-signup-cta
              data-ph-capture-attribute-section="features_hero"
              data-ph-capture-attribute-action="try_for_free"
              data-ph-capture-attribute-destination={APP_SIGNUP_URL}
            >
              {common.tryFree}
              <ArrowRight className="ml-1 size-4" />
            </a>
            <a
              href={localizeHref(locale, "/pricing/")}
              data-ph-capture-attribute-section="features_hero"
              data-ph-capture-attribute-action="view_pricing"
              data-ph-capture-attribute-destination="/pricing/"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {common.viewPricing}
            </a>
          </div>
        </div>

        {/* Three product panels */}
        <div className="animate-fade-up mx-auto mt-16 max-w-5xl delay-500 md:mt-20">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Panel 1: Plain-language workflow */}
            <div className="flex flex-col rounded-2xl border border-border/70 bg-background p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                  1
                </span>
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  {copy.workflowLabel}
                </p>
              </div>
              <div className="flex-1 rounded-xl bg-muted/60 p-4">
                <p className="font-mono text-xs leading-relaxed text-foreground/80">
                  {copy.workflowText}
                </p>
              </div>
            </div>

            {/* Panel 2: Call summary */}
            <div className="flex flex-col rounded-2xl border border-border/70 bg-background p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                  2
                </span>
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  {copy.callLabel}
                </p>
              </div>
              <div className="flex-1 space-y-3">
                <h4 className="text-sm font-medium text-foreground">
                  {copy.quoteTitle}
                </h4>
                <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    {copy.service}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    {copy.budget}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    {copy.timeline}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    {copy.priceRange}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    {copy.callbackNeeded}
                  </li>
                </ul>
              </div>
            </div>

            {/* Panel 3: Callback booked */}
            <div className="flex flex-col rounded-2xl border border-border/70 bg-background p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                  3
                </span>
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  {copy.outcomeLabel}
                </p>
              </div>
              <div className="flex-1 space-y-3">
                <h4 className="text-sm font-medium text-foreground">
                  {copy.callbackBooked}
                </h4>
                <p className="text-lg font-medium tracking-tight text-foreground">
                  {copy.callbackTime}
                </p>
                <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    {copy.assigned}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    {copy.confirmation}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    {copy.notification}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    {copy.summary}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
