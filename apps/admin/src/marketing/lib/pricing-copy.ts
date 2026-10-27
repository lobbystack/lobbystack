import type { Locale } from "@/marketing/i18n"

// The pricing page's words, shared by its sections and the homepage preview.
export const pricingSectionCopy = {
  en: {
    heading: "Plans for businesses of every size",
    intro:
      "Start free, then upgrade to Starter or Pro for more included minutes and transparent overages.",
    monthly: "Monthly",
    annual: "Annual",
    save: "Save 20%",
    compareHeading: "Compare plans in detail",
    compareIntro:
      "Free includes 30 voice minutes and a phone number free for 14 days. Starter and Pro include a dedicated number, monthly usage allowances, and usage-based overages.",
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
      "Commencez gratuitement, puis passez à Starter ou Pro pour plus de minutes incluses et des dépassements transparents.",
    monthly: "Mensuel",
    annual: "Annuel",
    save: "Économisez 20 %",
    compareHeading: "Comparer les forfaits en détail",
    compareIntro:
      "Free comprend 30 minutes vocales et un numéro de téléphone gratuit pendant 14 jours. Starter et Pro comprennent un numéro dédié, des volumes mensuels et des dépassements facturés à l’usage.",
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
      "Empiece gratis y luego cambie a Starter o Pro para tener más minutos incluidos y excedentes transparentes.",
    monthly: "Mensual",
    annual: "Anual",
    save: "Ahorre 20%",
    compareHeading: "Compare los planes en detalle",
    compareIntro:
      "Free incluye 30 minutos de voz y un número de teléfono gratis durante 14 días. Starter y Pro incluyen un número dedicado, minutos mensuales incluidos y excedentes según el uso.",
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
      "Počnite besplatno, a zatim pređite na Starter ili Pro za više uključenih minuta i jasne cene prekoračenja.",
    monthly: "Mesečno",
    annual: "Godišnje",
    save: "Uštedite 20%",
    compareHeading: "Detaljno uporedite pakete",
    compareIntro:
      "Free uključuje 30 minuta razgovora i broj telefona besplatno na 14 dana. Starter i Pro uključuju namenski broj, mesečnu kvotu minuta i prekoračenja koja se naplaćuju prema potrošnji.",
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
