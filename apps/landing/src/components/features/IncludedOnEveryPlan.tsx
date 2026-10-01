import { Check } from "lucide-react"
import { getCopy, localizeHref, type Locale } from "@/i18n"

const includedCopy = {
  en: {
    headingStart: "Answer telephone calls with",
    headingEmphasis: "Starter or Pro",
    intro:
      "Test 30 browser voice minutes on Free, without a telephone number. Choose Starter or Pro for a dedicated number and the telephone features below.",
    label: "Included on Starter and Pro",
    features: [
      "Call answering",
      "Plain-language workflows",
      "Appointment booking",
      "Appointment confirmation texts",
      "Call recordings",
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
    headingStart: "Recevez des appels téléphoniques avec",
    headingEmphasis: "Starter ou Pro",
    intro:
      "Testez 30 minutes vocales dans le navigateur sur Free, sans numéro de téléphone. Choisissez Starter ou Pro pour obtenir un numéro dédié et les fonctions téléphoniques ci-dessous.",
    label: "Inclus dans Starter et Pro",
    features: [
      "Réponse aux appels",
      "Consignes en langage naturel",
      "Prise de rendez‑vous",
      "SMS de confirmation",
      "Enregistrements d’appels",
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
  es: {
    headingStart: "Conteste llamadas telefónicas con",
    headingEmphasis: "Starter o Pro",
    intro:
      "Pruebe 30 minutos de voz en el navegador con Free, sin número de teléfono. Elija Starter o Pro para tener un número dedicado y las funciones telefónicas de abajo.",
    label: "Incluido en Starter y Pro",
    features: [
      "Atención de llamadas",
      "Flujos en lenguaje sencillo",
      "Reserva de citas",
      "SMS de confirmación de citas",
      "Grabaciones de llamadas",
      "Transferencias",
      "Resúmenes de llamadas",
      "Notificaciones por correo",
      "Notificaciones por SMS",
      "Filtro de spam",
      "Llamadas de menos de 10 segundos excluidas",
      "Llamadas simultáneas ilimitadas",
      "Base de conocimiento",
      "Panel e historial de llamadas",
    ],
  },
  sr: {
    headingStart: "Odgovarajte na telefonske pozive uz",
    headingEmphasis: "Starter ili Pro",
    intro:
      "Isprobajte 30 minuta razgovora u pregledaču na paketu Free, bez broja telefona. Izaberite Starter ili Pro za namenski broj i telefonske funkcije ispod.",
    label: "Uključeno u Starter i Pro",
    features: [
      "Odgovaranje na pozive",
      "Tokovi rada običnim jezikom",
      "Zakazivanje termina",
      "SMS potvrde termina",
      "Snimci poziva",
      "Preusmeravanja",
      "Rezimei poziva",
      "Obaveštenja e-poštom",
      "SMS obaveštenja",
      "Filtriranje spama",
      "Pozivi kraći od 10 sekundi se ne računaju",
      "Neograničen broj istovremenih poziva",
      "Baza znanja",
      "Kontrolna tabla i istorija poziva",
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
