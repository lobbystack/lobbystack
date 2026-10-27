import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { getCopy, type Locale } from "@/marketing/i18n"

type CtaSectionProps = {
  locale?: Locale
}

const ctaCopy = {
  en: {
    headingStart: "Never miss another",
    headingMiddle: "ready-to-book",
    headingEnd: "caller",
    body: "Start free with 30 voice minutes and a US or Canadian number for 14 days.",
  },
  fr: {
    headingStart: "Ne manquez plus aucun",
    headingMiddle: "appel prêt à réserver",
    headingEnd: "",
    body: "Commencez gratuitement avec 30 minutes vocales et un numéro américain ou canadien pendant 14 jours.",
  },
  es: {
    headingStart: "No vuelva a perder",
    headingMiddle: "ninguna llamada",
    headingEnd: "lista para reservar",
    body: "Empiece gratis con 30 minutos de voz y un número de EE. UU. o Canadá durante 14 días.",
  },
  sr: {
    headingStart: "Ne propustite više nijednog",
    headingMiddle: "klijenta koji",
    headingEnd: "želi termin",
    body: "Počnite besplatno uz 30 minuta razgovora i broj iz SAD ili Kanade tokom 14 dana.",
  },
} satisfies Record<Locale, Record<string, string>>

export function CtaSection({ locale = "en" }: CtaSectionProps) {
  const copy = getCopy(locale)
  const localCopy = ctaCopy[locale]
  const signup = appSignupUrl(locale)
  return (
    <ClosingCta
      titleLines={[localCopy.headingStart, [localCopy.headingMiddle, localCopy.headingEnd].filter(Boolean).join(" ")]}
      body={localCopy.body}
      primary={{
        label: copy.common.tryFree,
        href: signup,
        attributes: {
          "data-ph-signup-cta": true,
          "data-ph-capture-attribute-section": "final_cta",
          "data-ph-capture-attribute-action": "try_for_free",
          "data-ph-capture-attribute-destination": signup,
        },
      }}
      footnote={copy.common.noCreditCardCancelAnytime}
    />
  )
}
