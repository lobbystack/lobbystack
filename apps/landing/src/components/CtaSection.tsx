import { buttonVariants } from "@/components/ui/button"
import { appSignupUrl } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { getCopy, type Locale } from "@/i18n"
import { ArrowRight } from "lucide-react"

type CtaSectionProps = {
  locale?: Locale
}

const ctaCopy = {
  en: {
    headingStart: "Never miss another",
    headingMiddle: "ready-to-book",
    headingEnd: "caller",
    body: "Test 30 browser voice minutes for free. No telephone number included.",
  },
  fr: {
    headingStart: "Ne manquez plus aucun",
    headingMiddle: "appel prêt à réserver",
    headingEnd: "",
    body: "Testez 30 minutes vocales dans le navigateur gratuitement. Aucun numéro de téléphone inclus.",
  },
  es: {
    headingStart: "No vuelva a perder",
    headingMiddle: "ninguna llamada",
    headingEnd: "lista para reservar",
    body: "Pruebe gratis 30 minutos de voz en el navegador. No incluye número de teléfono.",
  },
  sr: {
    headingStart: "Ne propustite više nijednog",
    headingMiddle: "klijenta koji",
    headingEnd: "želi termin",
    body: "Isprobajte besplatno 30 minuta razgovora u pregledaču. Broj telefona nije uključen.",
  },
} satisfies Record<Locale, Record<string, string>>

export function CtaSection({ locale = "en" }: CtaSectionProps) {
  const copy = getCopy(locale)
  const localCopy = ctaCopy[locale]

  return (
    <section className="flex min-h-[360px] items-center bg-background py-16 md:min-h-[440px] md:py-20 lg:min-h-[500px]">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="section-heading">
          {localCopy.headingStart}{" "}
          <span className="whitespace-nowrap">{localCopy.headingMiddle}</span>{" "}
          {localCopy.headingEnd && (
            <span className="underline decoration-2 underline-offset-4">
              {localCopy.headingEnd}
            </span>
          )}
        </h2>
        <p className="section-intro mx-auto max-w-[56ch]">{localCopy.body}</p>
        <div className="mt-8">
          <a
            href={appSignupUrl(locale)}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 rounded-full px-7 text-sm"
            )}
            data-ph-signup-cta
            data-ph-capture-attribute-section="final_cta"
            data-ph-capture-attribute-action="try_for_free"
            data-ph-capture-attribute-destination={appSignupUrl(locale)}
          >
            {copy.common.tryFree}
            <ArrowRight className="ml-1 size-4 transition-transform duration-200 ease-(--ease-out) group-hover/button:translate-x-0.5" />
          </a>
        </div>
        <p className="fine-print mt-3">
          {copy.common.noCreditCardCancelAnytime}
        </p>
      </div>
    </section>
  )
}
