import type { Locale } from "@/marketing/i18n"

// The mono labels above section headings, in every language. Bespoke solution
// pages are English only, so their labels have no translations.

const eyebrows = {
  "home.missedCalls": ["Missed calls", "Appels manqués", "Llamadas perdidas", "Propušteni pozivi"],
  "home.features": ["What it does", "Ce qu'il fait", "Lo que hace", "Šta radi"],
  "home.knowledge": ["Knowledge", "Connaissances", "Conocimiento", "Znanje"],
  "home.phoneTools": ["Phone answering", "Réponse téléphonique", "Atención telefónica", "Odgovaranje na pozive"],
  "home.howItWorks": ["How it works", "Comment ça marche", "Cómo funciona", "Kako funkcioniše"],
  "home.control": ["Control", "Contrôle", "Control", "Kontrola"],
  "home.pricing": ["Pricing", "Tarifs", "Precios", "Cene"],
  "home.openSource": ["Open source", "Open source", "Código abierto", "Otvoreni kod"],
  "home.byTrade": ["By industry", "Par secteur", "Por sector", "Po delatnosti"],
  "pricing.hero": ["Pricing", "Tarifs", "Precios", "Cene"],
  "pricing.compare": ["Compare plans", "Comparer les forfaits", "Comparar planes", "Uporedite pakete"],
  "features.hero": ["Features", "Fonctionnalités", "Funciones", "Funkcije"],
  "features.wall": ["Everything it does", "Tout ce qu'il fait", "Todo lo que hace", "Sve što radi"],
  "features.everyPlan": ["Every plan", "Tous les forfaits", "Todos los planes", "Svaki paket"],
  "solutions.hero": ["Solutions", "Solutions", "Soluciones", "Rešenja"],
  "solutions.trades": ["By industry", "Par secteur", "Por sector", "Po delatnosti"],
  "solutions.comparisons": ["Comparisons", "Comparaisons", "Comparativas", "Poređenja"],
  "solutions.workflow": ["How it works", "Comment ça marche", "Cómo funciona", "Kako funkcioniše"],
  "solution.hero": ["Solution", "Solution", "Solución", "Rešenje"],
  "comparison.hero": ["Comparison", "Comparaison", "Comparativa", "Poređenje"],
  "company.hero": ["Company", "Entreprise", "Empresa", "Kompanija"],
  "solution.details": ["How it works", "Comment ça marche", "Cómo funciona", "Kako funkcioniše"],
  "solution.related": ["Related", "À lire aussi", "Relacionado", "Povezano"],
  "affiliate.hero": ["Affiliate program", "Programme d'affiliation", "Programa de afiliados", "Program preporuka"],
  "affiliate.benefits": ["Why join", "Pourquoi participer", "Por qué unirse", "Zašto se pridružiti"],
  "affiliate.details": ["Program terms", "Conditions du programme", "Condiciones del programa", "Uslovi programa"],
  "affiliate.guidelines": ["Guidelines", "Règles", "Normas", "Pravila"],
  "calculator.hero": ["Calculator", "Calculateur", "Calculadora", "Kalkulator"],
  "blog.hero": ["Blog", "Blogue", "Blog", "Blog"],
  "blog.topics": ["Topics", "Sujets", "Temas", "Teme"],
  "changelog.hero": ["Changelog", "Journal des changements", "Registro de cambios", "Dnevnik izmena"],
  "docs.hero": ["Developers", "Développeurs", "Desarrolladores", "Programeri"],
  "legal.hero": ["Legal", "Juridique", "Legal", "Pravno"],
  "search.hero": ["Search", "Recherche", "Búsqueda", "Pretraga"],
  "notFound.hero": ["404", "404", "404", "404"],
} satisfies Record<string, [string, string, string, string]>

export type EyebrowKey = keyof typeof eyebrows

const order = ["en", "fr", "es", "sr"] as const satisfies readonly Locale[]

export function eyebrow(locale: Locale, key: EyebrowKey): string {
  return eyebrows[key][order.indexOf(locale)] ?? eyebrows[key][0]
}

// English-only labels for the bespoke solution pages.
export const bespokeEyebrows = {
  hero: "Solution",
  problem: "The problem",
  solution: "How LobbyStack helps",
  useCases: "Use cases",
  howItWorks: "How it works",
  comparison: "Compare",
  businessFit: "Who it's for",
  capabilities: "Capabilities",
  revenue: "Revenue",
  openSource: "Self-hosted",
} as const
