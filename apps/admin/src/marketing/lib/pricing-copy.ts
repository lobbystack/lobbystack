import type { Locale } from "@/marketing/i18n"

// The pricing page's words, shared by its sections and the homepage preview.
export const pricingSectionCopy = {
  en: {
    heading: "Plans for businesses of every size",
    intro:
      "Start free for 14 days. Starter and Pro add a dedicated number, more minutes and clear overage rates.",
    monthly: "Monthly",
    annual: "Annual",
    save: "Save 20%",
    compareHeading: "Compare plans in detail",
    compareIntro:
      "Free gives you 30 voice minutes and a phone number for 14 days. Starter and Pro add a dedicated number and monthly allowances.",
    billingLabel: "Billing interval",
    tableLabel: "Plan comparison table",
    caption:
      "Feature comparison across Free, Starter, Pro, and Enterprise plans.",
    selfHostedPrompt: "Looking for self-hosted plans?",
    selfHostedLink: "See self-hosted pricing",
    feature: "Feature",
    included: "Included",
    notIncluded: "Not included",
  },
  fr: {
    heading: "Des forfaits pour entreprises de toute taille",
    intro:
      "Commencez gratuitement pendant 14 jours. Starter et Pro ajoutent un numéro dédié, plus de minutes et des tarifs de dépassement clairs.",
    monthly: "Mensuel",
    annual: "Annuel",
    save: "Économisez 20 %",
    compareHeading: "Comparer les forfaits en détail",
    compareIntro:
      "Free vous donne 30 minutes vocales et un numéro de téléphone pendant 14 jours. Starter et Pro ajoutent un numéro dédié et des volumes mensuels.",
    billingLabel: "Intervalle de facturation",
    tableLabel: "Tableau de comparaison des forfaits",
    caption:
      "Comparaison des fonctionnalités entre les forfaits Free, Starter, Pro et Enterprise.",
    selfHostedPrompt: "Vous cherchez les forfaits auto-hébergés ?",
    selfHostedLink: "Voir les tarifs auto-hébergés",
    feature: "Fonctionnalité",
    included: "Inclus",
    notIncluded: "Non inclus",
  },
  es: {
    heading: "Planes para negocios de todos los tamaños",
    intro:
      "Empiece gratis durante 14 días. Starter y Pro añaden un número dedicado, más minutos y tarifas de excedente claras.",
    monthly: "Mensual",
    annual: "Anual",
    save: "Ahorre 20%",
    compareHeading: "Compare los planes en detalle",
    compareIntro:
      "Free le da 30 minutos de voz y un número de teléfono durante 14 días. Starter y Pro añaden un número dedicado y minutos mensuales incluidos.",
    billingLabel: "Periodo de facturación",
    tableLabel: "Tabla comparativa de planes",
    caption:
      "Comparación de funciones entre los planes Free, Starter, Pro y Enterprise.",
    selfHostedPrompt: "¿Busca planes autoalojados?",
    selfHostedLink: "Ver precios autoalojados",
    feature: "Función",
    included: "Incluido",
    notIncluded: "No incluido",
  },
  sr: {
    heading: "Paketi za firme svih veličina",
    intro:
      "Počnite besplatno na 14 dana. Starter i Pro donose namenski broj, više minuta i jasne cene prekoračenja.",
    monthly: "Mesečno",
    annual: "Godišnje",
    save: "Uštedite 20%",
    compareHeading: "Detaljno uporedite pakete",
    compareIntro:
      "Free Vam daje 30 minuta razgovora i broj telefona na 14 dana. Starter i Pro dodaju namenski broj i mesečne kvote.",
    billingLabel: "Period naplate",
    tableLabel: "Tabela poređenja paketa",
    caption: "Poređenje funkcija paketa Free, Starter, Pro i Enterprise.",
    selfHostedPrompt: "Tražite pakete za samostalno hostovanje?",
    selfHostedLink: "Pogledajte cene za samostalno hostovanje",
    feature: "Funkcija",
    included: "Uključeno",
    notIncluded: "Nije uključeno",
  },
} satisfies Record<Locale, Record<string, string>>

/** The Monthly / Annual switch's labels. */
export function billingSwitchLabels(locale: Locale) {
  const { monthly, annual, save, billingLabel } = pricingSectionCopy[locale]
  return { monthly, annual, save, billingLabel }
}
