import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"

type FeaturesCtaSectionProps = {
  locale?: Locale
}

const featuresCtaCopy = {
  en: {
    headingStart: "Stop letting missed calls decide your",
    headingEmphasis: "revenue",
    body: "Let LobbyStack answer, qualify, quote, book, and notify your team day or night.",
  },
  fr: {
    headingStart: "Ne laissez plus les appels manqués décider votre",
    headingEmphasis: "chiffre d’affaires",
    body: "LobbyStack répond, qualifie, planifie et prévient votre équipe, même le soir et la fin de semaine.",
  },
  es: {
    headingStart: "Que las llamadas perdidas no decidan sus",
    headingEmphasis: "ingresos",
    body: "Deje que LobbyStack conteste, califique, dé presupuestos, reserve y avise a su equipo de día o de noche.",
  },
  sr: {
    headingStart: "Ne dozvolite da propušteni pozivi određuju Vaš",
    headingEmphasis: "prihod",
    body: "Neka LobbyStack odgovara, kvalifikuje, daje cene, zakazuje i obaveštava Vaš tim danju i noću.",
  },
} satisfies Record<Locale, Record<string, string>>

export function FeaturesCtaSection({ locale = "en" }: FeaturesCtaSectionProps) {
  const common = getCopy(locale).common
  const copy = featuresCtaCopy[locale]
  const signup = appSignupUrl(locale)
  return (
    <ClosingCta
      titleLines={[`${copy.headingStart} ${copy.headingEmphasis}`]}
      body={copy.body}
      primary={{
        label: common.tryFree,
        href: signup,
        attributes: {
          "data-ph-signup-cta": true,
          "data-ph-capture-attribute-section": "features_final_cta",
          "data-ph-capture-attribute-action": "try_for_free",
          "data-ph-capture-attribute-destination": signup,
        },
      }}
      secondary={{
        label: common.viewPricing,
        href: localizeHref(locale, "/pricing/"),
        attributes: {
          "data-ph-capture-attribute-section": "features_final_cta",
          "data-ph-capture-attribute-action": "view_pricing",
          "data-ph-capture-attribute-destination": "/pricing/",
        },
      }}
      footnote={common.noCreditCardCancelAnytime}
    />
  )
}
