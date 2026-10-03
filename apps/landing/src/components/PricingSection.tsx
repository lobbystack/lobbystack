import { Button, buttonVariants } from "@/components/ui/button"
import { appSignupUrl } from "@/lib/app-links"
import type { Locale } from "@/i18n"
import { cn } from "@/lib/utils"
import { getCloudPlanFactSheet } from "@lobbystack/shared/product-capabilities"
import { Check, Minus, ArrowRight } from "lucide-react"
import { Fragment, useLayoutEffect, useRef, useState } from "react"

/* ─────────────────────────── Data ─────────────────────────── */

const freePlanFacts = getCloudPlanFactSheet("free_cloud")
const freeVoiceMinutes = freePlanFacts.voiceMinutesIncluded ?? 0

type Tier = {
  name: string
  price: {
    monthly: string
    annual: string
  }
  period: string
  description: {
    monthly: string
    annual: string
  }
  cta: {
    monthly: string
    annual: string
  }
  ctaHref?: string
  ctaVariant: "default" | "outline"
  highlight: boolean
  highlights: Array<
    | string
    | {
        label: string
        sublabel: string
      }
  >
}

type BillingInterval = "monthly" | "annual"

const enterpriseContactHref =
  "mailto:support@lobbystack.com?subject=LobbyStack%20enterprise%20inquiry"

const tiers: Tier[] = [
  {
    name: "Free",
    price: {
      monthly: "$0",
      annual: "$0",
    },
    period: "",
    description: {
      monthly: "Test voice in your browser",
      annual: "Test voice in your browser",
    },
    cta: {
      monthly: "Start free",
      annual: "Start free",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      `${freeVoiceMinutes} browser voice minutes included`,
      ...(freePlanFacts.browserVoiceOnly ? ["No telephone number"] : []),
      "Community support",
    ],
  },
  {
    name: "Starter",
    price: {
      monthly: "$30",
      annual: "$24",
    },
    period: "/mo",
    description: {
      monthly: "Per month, billed monthly",
      annual: "Per month, billed annually",
    },
    cta: {
      monthly: "Start free",
      annual: "Start free",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      {
        label: "150 voice minutes included",
        sublabel: "Then $0.20/min",
      },
      "1 dedicated business number",
      "50 alert SMS segments",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: {
      monthly: "$100",
      annual: "$80",
    },
    period: "/mo",
    description: {
      monthly: "Per month, billed monthly",
      annual: "Per month, billed annually",
    },
    cta: {
      monthly: "Start free",
      annual: "Start free",
    },
    ctaVariant: "default" as const,
    highlight: true,
    highlights: [
      {
        label: "500 voice minutes included",
        sublabel: "Then $0.18/min",
      },
      "1 dedicated business number",
      "200 alert SMS segments",
      "Priority email support",
    ],
  },
  {
    name: "Enterprise",
    price: {
      monthly: "Custom",
      annual: "Custom",
    },
    period: "",
    description: {
      monthly: "For higher volume",
      annual: "For higher volume",
    },
    cta: {
      monthly: "Contact us",
      annual: "Contact us",
    },
    ctaHref: enterpriseContactHref,
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "Multiple dedicated numbers",
      "Custom usage limits",
      "Dedicated implementation support",
    ],
  },
]

const tiersFr: Tier[] = [
  {
    name: "Free",
    price: {
      monthly: "$0",
      annual: "$0",
    },
    period: "",
    description: {
      monthly: "Testez la voix dans votre navigateur",
      annual: "Testez la voix dans votre navigateur",
    },
    cta: {
      monthly: "Commencer gratuitement",
      annual: "Commencer gratuitement",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      `${freeVoiceMinutes} minutes vocales dans le navigateur`,
      ...(freePlanFacts.browserVoiceOnly ? ["Aucun numéro de téléphone"] : []),
      "Support communautaire",
    ],
  },
  {
    name: "Starter",
    price: {
      monthly: "$30",
      annual: "$24",
    },
    period: "/mois",
    description: {
      monthly: "Par mois, facturé mensuellement",
      annual: "Par mois, facturé annuellement",
    },
    cta: {
      monthly: "Commencer gratuitement",
      annual: "Commencer gratuitement",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      {
        label: "150 minutes vocales incluses",
        sublabel: "Puis 0,20 $/min",
      },
      "1 numéro d'entreprise dédié",
      "50 segments SMS d'alerte",
      "Support par courriel",
    ],
  },
  {
    name: "Pro",
    price: {
      monthly: "$100",
      annual: "$80",
    },
    period: "/mois",
    description: {
      monthly: "Par mois, facturé mensuellement",
      annual: "Par mois, facturé annuellement",
    },
    cta: {
      monthly: "Commencer gratuitement",
      annual: "Commencer gratuitement",
    },
    ctaVariant: "default" as const,
    highlight: true,
    highlights: [
      {
        label: "500 minutes vocales incluses",
        sublabel: "Puis 0,18 $/min",
      },
      "1 numéro d'entreprise dédié",
      "200 segments SMS d'alerte",
      "Support prioritaire par courriel",
    ],
  },
  {
    name: "Enterprise",
    price: {
      monthly: "Sur mesure",
      annual: "Sur mesure",
    },
    period: "",
    description: {
      monthly: "Pour les volumes élevés",
      annual: "Pour les volumes élevés",
    },
    cta: {
      monthly: "Nous contacter",
      annual: "Nous contacter",
    },
    ctaHref: enterpriseContactHref,
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "Plusieurs numéros dédiés",
      "Limites d'utilisation sur mesure",
      "Accompagnement dédié à l’implémentation",
    ],
  },
]

const tiersEs: Tier[] = [
  {
    name: "Free",
    price: {
      monthly: "$0",
      annual: "$0",
    },
    period: "",
    description: {
      monthly: "Pruebe la voz en su navegador",
      annual: "Pruebe la voz en su navegador",
    },
    cta: {
      monthly: "Empezar gratis",
      annual: "Empezar gratis",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      `${freeVoiceMinutes} minutos de voz en el navegador`,
      ...(freePlanFacts.browserVoiceOnly ? ["Sin número de teléfono"] : []),
      "Soporte de la comunidad",
    ],
  },
  {
    name: "Starter",
    price: {
      monthly: "$30",
      annual: "$24",
    },
    period: "/mes",
    description: {
      monthly: "Por mes, facturación mensual",
      annual: "Por mes, facturación anual",
    },
    cta: {
      monthly: "Empezar gratis",
      annual: "Empezar gratis",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      {
        label: "150 minutos de voz incluidos",
        sublabel: "Luego $0.20/min",
      },
      "1 número dedicado para su negocio",
      "50 segmentos de SMS de alerta",
      "Soporte por correo electrónico",
    ],
  },
  {
    name: "Pro",
    price: {
      monthly: "$100",
      annual: "$80",
    },
    period: "/mes",
    description: {
      monthly: "Por mes, facturación mensual",
      annual: "Por mes, facturación anual",
    },
    cta: {
      monthly: "Empezar gratis",
      annual: "Empezar gratis",
    },
    ctaVariant: "default" as const,
    highlight: true,
    highlights: [
      {
        label: "500 minutos de voz incluidos",
        sublabel: "Luego $0.18/min",
      },
      "1 número dedicado para su negocio",
      "200 segmentos de SMS de alerta",
      "Soporte prioritario por correo electrónico",
    ],
  },
  {
    name: "Enterprise",
    price: {
      monthly: "A medida",
      annual: "A medida",
    },
    period: "",
    description: {
      monthly: "Para mayor volumen",
      annual: "Para mayor volumen",
    },
    cta: {
      monthly: "Contáctenos",
      annual: "Contáctenos",
    },
    ctaHref: enterpriseContactHref,
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "Varios números dedicados",
      "Límites de uso a medida",
      "Soporte dedicado para la implementación",
    ],
  },
]

const tiersSr: Tier[] = [
  {
    name: "Free",
    price: {
      monthly: "$0",
      annual: "$0",
    },
    period: "",
    description: {
      monthly: "Isprobajte glas u pregledaču",
      annual: "Isprobajte glas u pregledaču",
    },
    cta: {
      monthly: "Počnite besplatno",
      annual: "Počnite besplatno",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      `${freeVoiceMinutes} minuta razgovora u pregledaču`,
      ...(freePlanFacts.browserVoiceOnly ? ["Bez broja telefona"] : []),
      "Podrška zajednice",
    ],
  },
  {
    name: "Starter",
    price: {
      monthly: "$30",
      annual: "$24",
    },
    period: "/mes.",
    description: {
      monthly: "Mesečno, uz mesečnu naplatu",
      annual: "Mesečno, uz godišnju naplatu",
    },
    cta: {
      monthly: "Počnite besplatno",
      annual: "Počnite besplatno",
    },
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      {
        label: "150 minuta razgovora uključeno",
        sublabel: "Zatim $0.20/min",
      },
      "1 namenski poslovni broj",
      "50 segmenata SMS upozorenja",
      "Podrška putem e-pošte",
    ],
  },
  {
    name: "Pro",
    price: {
      monthly: "$100",
      annual: "$80",
    },
    period: "/mes.",
    description: {
      monthly: "Mesečno, uz mesečnu naplatu",
      annual: "Mesečno, uz godišnju naplatu",
    },
    cta: {
      monthly: "Počnite besplatno",
      annual: "Počnite besplatno",
    },
    ctaVariant: "default" as const,
    highlight: true,
    highlights: [
      {
        label: "500 minuta razgovora uključeno",
        sublabel: "Zatim $0.18/min",
      },
      "1 namenski poslovni broj",
      "200 segmenata SMS upozorenja",
      "Prioritetna podrška putem e-pošte",
    ],
  },
  {
    name: "Enterprise",
    price: {
      monthly: "Po dogovoru",
      annual: "Po dogovoru",
    },
    period: "",
    description: {
      monthly: "Za veći obim",
      annual: "Za veći obim",
    },
    cta: {
      monthly: "Kontaktirajte nas",
      annual: "Kontaktirajte nas",
    },
    ctaHref: enterpriseContactHref,
    ctaVariant: "outline" as const,
    highlight: false,
    highlights: [
      "Više namenskih brojeva",
      "Prilagođeni limiti potrošnje",
      "Posvećena podrška pri implementaciji",
    ],
  },
]

const tiersByLocale = {
  en: tiers,
  fr: tiersFr,
  es: tiersEs,
  sr: tiersSr,
} satisfies Record<Locale, Tier[]>

/* ─── Comparison table data ─── */

type ComparisonValue =
  | string
  | boolean
  | {
      included: string
      then?: string
    }

type ComparisonRow = {
  feature: string
  free: ComparisonValue
  starter?: ComparisonValue
  pro: ComparisonValue
  enterprise: ComparisonValue
}

type ComparisonGroup = {
  category: string
  rows: ComparisonRow[]
}

const comparisonGroupsEn: ComparisonGroup[] = [
  {
    category: "Usage & limits",
    rows: [
      {
        feature: "Voice minutes",
        free: { included: `${freeVoiceMinutes} browser minutes` },
        starter: { included: "150 included", then: "then $0.20/min" },
        pro: { included: "500 included", then: "then $0.18/min" },
        enterprise: "Custom",
      },
      {
        feature: "Transfer attempts",
        free: false,
        starter: { included: "20 included", then: "then $0.02/attempt" },
        pro: { included: "100 included", then: "then $0.02/attempt" },
        enterprise: "Custom",
      },
      {
        feature: "Alert SMS segments",
        free: false,
        starter: { included: "50 included", then: "then $0.02/segment" },
        pro: { included: "200 included", then: "then $0.02/segment" },
        enterprise: "Custom",
      },
      {
        feature: "Knowledge base",
        free: "1 MB",
        starter: "5 MB",
        pro: "20 MB",
        enterprise: "Custom",
      },
      {
        feature: "Phone numbers",
        free: false,
        starter: "1 dedicated",
        pro: "1 dedicated",
        enterprise: "Multiple",
      },
    ],
  },
  {
    category: "Core receptionist",
    rows: [
      {
        feature: "24/7 call answering",
        free: "Browser testing",
        pro: true,
        enterprise: true,
      },
      {
        feature: "Caller details and message capture",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Knowledge base answers",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Plain-language workflows",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Spam filtering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Calls under 10s excluded from billing",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Unlimited concurrent calls",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Answers in the caller's language",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Booking",
    rows: [
      {
        feature: "Appointment booking",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Appointment confirmation texts",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Google Calendar integration",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Routing & transfers",
    rows: [
      {
        feature: "Urgent call handoff",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Call transfers",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "After-hours answering",
        free: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Notifications & messaging",
    rows: [
      {
        feature: "Email notifications",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "SMS notifications",
        free: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Data & dashboard",
    rows: [
      {
        feature: "Call summaries and transcripts",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Call history and recordings",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Caller profiles and notes",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Contacts",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Website knowledge import",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Deployment & support",
    rows: [
      {
        feature: "Hosting",
        free: "Managed cloud",
        pro: "Managed cloud",
        enterprise: "Managed cloud",
      },
      {
        feature: "Usage-based overages",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Support",
        free: "Community",
        starter: "Email",
        pro: "Priority email",
        enterprise: "Dedicated implementation",
      },
    ],
  },
]

const comparisonGroupsFr: ComparisonGroup[] = [
  {
    category: "Usage et limites",
    rows: [
      {
        feature: "Minutes vocales",
        free: { included: `${freeVoiceMinutes} minutes dans le navigateur` },
        starter: { included: "150 incluses", then: "puis 0,20 $/min" },
        pro: { included: "500 incluses", then: "puis 0,18 $/min" },
        enterprise: "Sur mesure",
      },
      {
        feature: "Tentatives de transfert",
        free: false,
        starter: { included: "20 incluses", then: "puis 0,02 $/tentative" },
        pro: { included: "100 incluses", then: "puis 0,02 $/tentative" },
        enterprise: "Sur mesure",
      },
      {
        feature: "Segments SMS d'alerte",
        free: false,
        starter: { included: "50 inclus", then: "puis 0,02 $/segment" },
        pro: { included: "200 inclus", then: "puis 0,02 $/segment" },
        enterprise: "Sur mesure",
      },
      {
        feature: "Base de connaissances",
        free: "1 Mo",
        starter: "5 Mo",
        pro: "20 Mo",
        enterprise: "Sur mesure",
      },
      {
        feature: "Numéros de téléphone",
        free: false,
        starter: "1 dédié",
        pro: "1 dédié",
        enterprise: "Plusieurs",
      },
    ],
  },
  {
    category: "Réceptionniste IA",
    rows: [
      {
        feature: "Réponse aux appels 24/7",
        free: "Tests dans le navigateur",
        pro: true,
        enterprise: true,
      },
      {
        feature: "Collecte des détails et messages",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Réponses depuis la base de connaissances",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Consignes en langage naturel",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Filtrage du spam",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Appels de moins de 10 s exclus de la facturation",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Appels simultanés illimités",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Répond dans la langue de l'appelant",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Rendez-vous",
    rows: [
      {
        feature: "Prise de rendez‑vous",
        free: "Illimitée",
        pro: "Illimitée",
        enterprise: "Illimitée",
      },
      {
        feature: "SMS de confirmation de rendez‑vous",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Intégration Google Calendar",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Routage et transferts",
    rows: [
      {
        feature: "Transfert des appels urgents",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Transferts d'appel",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Réponse hors horaires",
        free: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Notifications et messagerie",
    rows: [
      {
        feature: "Notifications par courriel",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Notifications SMS",
        free: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Données et tableau de bord",
    rows: [
      {
        feature: "Résumés et transcriptions d’appels",
        free: "Illimités",
        pro: "Illimités",
        enterprise: "Illimités",
      },
      {
        feature: "Historique et enregistrements d'appels",
        free: "Illimités",
        pro: "Illimités",
        enterprise: "Illimités",
      },
      {
        feature: "Profils et notes d'appelants",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Contacts",
        free: "Illimités",
        pro: "Illimités",
        enterprise: "Illimités",
      },
      {
        feature: "Import de connaissances depuis le site web",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Hébergement et support",
    rows: [
      {
        feature: "Hébergement",
        free: "Cloud géré",
        pro: "Cloud géré",
        enterprise: "Cloud géré",
      },
      {
        feature: "Dépassements à l’usage",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Support",
        free: "Communauté",
        starter: "Courriel",
        pro: "Courriel prioritaire",
        enterprise: "Implémentation dédiée",
      },
    ],
  },
]

const comparisonGroupsEs: ComparisonGroup[] = [
  {
    category: "Uso y límites",
    rows: [
      {
        feature: "Minutos de voz",
        free: { included: `${freeVoiceMinutes} minutos en el navegador` },
        starter: { included: "150 incluidos", then: "luego $0.20/min" },
        pro: { included: "500 incluidos", then: "luego $0.18/min" },
        enterprise: "A medida",
      },
      {
        feature: "Intentos de transferencia",
        free: false,
        starter: { included: "20 incluidos", then: "luego $0.02/intento" },
        pro: { included: "100 incluidos", then: "luego $0.02/intento" },
        enterprise: "A medida",
      },
      {
        feature: "Segmentos de SMS de alerta",
        free: false,
        starter: { included: "50 incluidos", then: "luego $0.02/segmento" },
        pro: { included: "200 incluidos", then: "luego $0.02/segmento" },
        enterprise: "A medida",
      },
      {
        feature: "Base de conocimiento",
        free: "1 MB",
        starter: "5 MB",
        pro: "20 MB",
        enterprise: "A medida",
      },
      {
        feature: "Números de teléfono",
        free: false,
        starter: "1 dedicado",
        pro: "1 dedicado",
        enterprise: "Varios",
      },
    ],
  },
  {
    category: "Funciones de recepción",
    rows: [
      {
        feature: "Atención de llamadas 24/7",
        free: "Pruebas en el navegador",
        pro: true,
        enterprise: true,
      },
      {
        feature: "Datos y mensajes de quien llama",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Respuestas desde la base de conocimiento",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Flujos de trabajo en lenguaje sencillo",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Filtro de spam",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Llamadas de menos de 10 s excluidas de la facturación",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Llamadas simultáneas ilimitadas",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Responde en el idioma de quien llama",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Reservas",
    rows: [
      {
        feature: "Reserva de citas",
        free: "Ilimitada",
        pro: "Ilimitada",
        enterprise: "Ilimitada",
      },
      {
        feature: "SMS de confirmación de citas",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Integración con Google Calendar",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Enrutamiento y transferencias",
    rows: [
      {
        feature: "Derivación de llamadas urgentes",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Transferencias de llamadas",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Atención fuera de horario",
        free: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Notificaciones y mensajes",
    rows: [
      {
        feature: "Notificaciones por correo electrónico",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Notificaciones por SMS",
        free: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Datos y panel",
    rows: [
      {
        feature: "Resúmenes y transcripciones de llamadas",
        free: "Ilimitados",
        pro: "Ilimitados",
        enterprise: "Ilimitados",
      },
      {
        feature: "Historial y grabaciones de llamadas",
        free: "Ilimitados",
        pro: "Ilimitados",
        enterprise: "Ilimitados",
      },
      {
        feature: "Perfiles y notas de quienes llaman",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Contactos",
        free: "Ilimitados",
        pro: "Ilimitados",
        enterprise: "Ilimitados",
      },
      {
        feature: "Importación de conocimiento desde el sitio web",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Implementación y soporte",
    rows: [
      {
        feature: "Alojamiento",
        free: "Nube gestionada",
        pro: "Nube gestionada",
        enterprise: "Nube gestionada",
      },
      {
        feature: "Excedentes según el uso",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Soporte",
        free: "Comunidad",
        starter: "Correo electrónico",
        pro: "Correo prioritario",
        enterprise: "Implementación dedicada",
      },
    ],
  },
]

const comparisonGroupsSr: ComparisonGroup[] = [
  {
    category: "Potrošnja i limiti",
    rows: [
      {
        feature: "Minuti razgovora",
        free: { included: `${freeVoiceMinutes} minuta u pregledaču` },
        starter: { included: "150 uključeno", then: "zatim $0.20/min" },
        pro: { included: "500 uključeno", then: "zatim $0.18/min" },
        enterprise: "Po dogovoru",
      },
      {
        feature: "Pokušaji preusmeravanja",
        free: false,
        starter: { included: "20 uključeno", then: "zatim $0.02/pokušaj" },
        pro: { included: "100 uključeno", then: "zatim $0.02/pokušaj" },
        enterprise: "Po dogovoru",
      },
      {
        feature: "Segmenti SMS upozorenja",
        free: false,
        starter: { included: "50 uključeno", then: "zatim $0.02/segment" },
        pro: { included: "200 uključeno", then: "zatim $0.02/segment" },
        enterprise: "Po dogovoru",
      },
      {
        feature: "Baza znanja",
        free: "1 MB",
        starter: "5 MB",
        pro: "20 MB",
        enterprise: "Po dogovoru",
      },
      {
        feature: "Brojevi telefona",
        free: false,
        starter: "1 namenski",
        pro: "1 namenski",
        enterprise: "Više",
      },
    ],
  },
  {
    category: "Osnovne funkcije recepcionera",
    rows: [
      {
        feature: "Odgovaranje na pozive 24/7",
        free: "Testiranje u pregledaču",
        pro: true,
        enterprise: true,
      },
      {
        feature: "Beleženje podataka i poruka pozivalaca",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Odgovori iz baze znanja",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Tokovi rada opisani običnim jezikom",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Filtriranje spama",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Pozivi kraći od 10 s se ne naplaćuju",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Neograničen broj istovremenih poziva",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Odgovara na jeziku pozivaoca",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Zakazivanje",
    rows: [
      {
        feature: "Zakazivanje termina",
        free: "Neograničeno",
        pro: "Neograničeno",
        enterprise: "Neograničeno",
      },
      {
        feature: "SMS potvrde termina",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Google Calendar integracija",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Rutiranje i preusmeravanje",
    rows: [
      {
        feature: "Prosleđivanje hitnih poziva",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Preusmeravanje poziva",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Odgovaranje van radnog vremena",
        free: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Obaveštenja i poruke",
    rows: [
      {
        feature: "Obaveštenja e-poštom",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "SMS obaveštenja",
        free: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Podaci i kontrolna tabla",
    rows: [
      {
        feature: "Rezimei i transkripti poziva",
        free: "Neograničeno",
        pro: "Neograničeno",
        enterprise: "Neograničeno",
      },
      {
        feature: "Istorija i snimci poziva",
        free: "Neograničeno",
        pro: "Neograničeno",
        enterprise: "Neograničeno",
      },
      {
        feature: "Profili i beleške pozivalaca",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Kontakti",
        free: "Neograničeno",
        pro: "Neograničeno",
        enterprise: "Neograničeno",
      },
      {
        feature: "Uvoz znanja sa sajta",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Hosting i podrška",
    rows: [
      {
        feature: "Hosting",
        free: "Upravljani cloud",
        pro: "Upravljani cloud",
        enterprise: "Upravljani cloud",
      },
      {
        feature: "Prekoračenja prema potrošnji",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Podrška",
        free: "Zajednica",
        starter: "E-pošta",
        pro: "Prioritetna e-pošta",
        enterprise: "Posvećena implementacija",
      },
    ],
  },
]

const comparisonGroupsByLocale = {
  en: comparisonGroupsEn,
  fr: comparisonGroupsFr,
  es: comparisonGroupsEs,
  sr: comparisonGroupsSr,
} satisfies Record<Locale, ComparisonGroup[]>

/* ─────────────────────────── Components ─────────────────────────── */

function ComparisonCell({
  includedLabel,
  notIncludedLabel,
  value,
}: {
  includedLabel: string
  notIncludedLabel: string
  value: ComparisonValue
}) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center">
        <Check
          className="mx-auto size-4 text-foreground/60"
          aria-hidden="true"
        />
        <span className="sr-only">{includedLabel}</span>
      </span>
    ) : (
      <span className="inline-flex items-center justify-center">
        <Minus
          className="mx-auto size-4 text-muted-foreground/30"
          aria-hidden="true"
        />
        <span className="sr-only">{notIncludedLabel}</span>
      </span>
    )
  }

  if (typeof value === "string") {
    return (
      <span
        className={
          value === "-" ? "text-muted-foreground/40" : "text-muted-foreground"
        }
      >
        {value}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col gap-0.5 leading-tight">
      <span className="font-medium text-foreground">{value.included}</span>
      {value.then && (
        <span className="text-xs text-muted-foreground">{value.then}</span>
      )}
    </span>
  )
}

type PricingSectionProps = {
  locale?: Locale
}

const pricingSectionCopy = {
  en: {
    heading: "Plans for businesses of every size",
    intro:
      "Start free, then upgrade to Starter or Pro for more included minutes and transparent overages.",
    monthly: "Monthly",
    annual: "Annual",
    save: "Save 20%",
    compareHeading: "Compare plans in detail",
    compareIntro:
      "Free includes 30 browser voice minutes with no telephone number. Starter and Pro include a dedicated number, monthly usage allowances, and usage-based overages.",
    billingLabel: "Billing interval",
    tableLabel: "Plan comparison table",
    caption:
      "Feature comparison across Free, Starter, Pro, and Enterprise plans.",
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
      "Free comprend 30 minutes vocales dans le navigateur, sans numéro de téléphone. Starter et Pro comprennent un numéro dédié, des volumes mensuels et des dépassements facturés à l’usage.",
    billingLabel: "Intervalle de facturation",
    tableLabel: "Tableau de comparaison des forfaits",
    caption:
      "Comparaison des fonctionnalités entre les forfaits Free, Starter, Pro et Enterprise.",
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
      "Free incluye 30 minutos de voz en el navegador, sin número de teléfono. Starter y Pro incluyen un número dedicado, minutos mensuales incluidos y excedentes según el uso.",
    billingLabel: "Periodo de facturación",
    tableLabel: "Tabla comparativa de planes",
    caption:
      "Comparación de funciones entre los planes Free, Starter, Pro y Enterprise.",
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
      "Free uključuje 30 minuta razgovora u pregledaču, bez broja telefona. Starter i Pro uključuju namenski broj, mesečnu kvotu minuta i prekoračenja koja se naplaćuju prema potrošnji.",
    billingLabel: "Period naplate",
    tableLabel: "Tabela poređenja paketa",
    caption: "Poređenje funkcija paketa Free, Starter, Pro i Enterprise.",
    feature: "Funkcija",
    included: "Uključeno",
    notIncluded: "Nije uključeno",
  },
} satisfies Record<Locale, Record<string, string>>

export function PricingSection({ locale = "en" }: PricingSectionProps) {
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("annual")
  const tabRefs = useRef<Record<BillingInterval, HTMLButtonElement | null>>({
    monthly: null,
    annual: null,
  })
  // Measured position of the selected tab. Until hydration measures it, the
  // selected tab paints its own background so the server HTML still shows state.
  const [thumb, setThumb] = useState<{ x: number; width: number } | null>(
    null
  )

  useLayoutEffect(() => {
    const tab = tabRefs.current[billingInterval]
    if (!tab) return

    const measure = () =>
      setThumb({ x: tab.offsetLeft, width: tab.offsetWidth })
    measure()

    // Watch every tab: a late font swap can resize the one before this tab
    // and shift it without changing its own size.
    const observer = new ResizeObserver(measure)
    Object.values(tabRefs.current).forEach((node) => node && observer.observe(node))
    return () => observer.disconnect()
  }, [billingInterval])
  const copy = pricingSectionCopy[locale]
  const localizedTiers = tiersByLocale[locale]
  const localizedComparisonGroups = comparisonGroupsByLocale[locale]

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 pt-16 pb-8 text-center md:pt-20 md:pb-10 lg:pb-12">
          <h1 className="animate-fade-up display-heading-compact stagger-1">
            {copy.heading}
          </h1>
          <p className="animate-fade-up body-copy mx-auto mt-5 max-w-[60ch] stagger-2 md:text-lg">
            {copy.intro}
          </p>
        </div>
      </section>

      {/* ── Tier cards ── */}
      <section className="mx-auto max-w-7xl px-6 pt-8 pb-8 md:pt-10 md:pb-10 lg:pt-12 lg:pb-12">
        <div className="animate-fade-up mb-8 flex justify-center stagger-3">
          <div
            aria-label={copy.billingLabel}
            className="relative inline-flex rounded-full border border-border bg-input/30 p-1"
            role="tablist"
          >
            {thumb && (
              <span
                aria-hidden="true"
                className="absolute top-1 bottom-1 left-0 rounded-full bg-background shadow-sm transition-[translate,width] duration-250 ease-(--ease-out) motion-reduce:transition-none"
                style={{ translate: `${thumb.x}px 0`, width: thumb.width }}
              />
            )}
            {(["monthly", "annual"] as const).map((interval) => (
              <Button
                aria-selected={billingInterval === interval}
                className={cn(
                  "relative h-9 rounded-full border-transparent bg-transparent px-4 hover:bg-transparent",
                  billingInterval === interval
                    ? cn(
                        "text-foreground",
                        !thumb && "bg-background shadow-sm hover:bg-background"
                      )
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={interval}
                ref={(node) => {
                  tabRefs.current[interval] = node
                }}
                onClick={() => setBillingInterval(interval)}
                role="tab"
                size="sm"
                type="button"
                variant="outline"
              >
                {interval === "monthly" ? copy.monthly : copy.annual}
                {interval === "annual" ? (
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {copy.save}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </div>

        <div className="animate-fade-up grid gap-6 stagger-3 md:grid-cols-2 xl:grid-cols-4">
          {localizedTiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex min-w-0 flex-col rounded-2xl border bg-background p-6 ${
                tier.highlight
                  ? "border-foreground/20 ring-1 ring-foreground/10"
                  : "border-border/60"
              }`}
            >
              {/* Tier header */}
              <div className="mb-6">
                <h2 className="font-heading text-lg font-medium tracking-[-0.03em]">
                  {tier.name}
                </h2>
                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    key={tier.price[billingInterval]}
                    className="swap-in font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums"
                  >
                    {tier.price[billingInterval]}
                  </span>
                  {tier.period && (
                    <span className="text-sm text-muted-foreground">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {tier.description[billingInterval]}
                </p>
              </div>

              {/* Action */}
              <a
                href={tier.ctaHref ?? appSignupUrl(locale)}
                className={cn(
                  buttonVariants({ variant: tier.ctaVariant }),
                  "mb-6 h-11 w-full min-w-0 rounded-full px-4 text-[0.8125rem] sm:text-sm"
                )}
                data-ph-signup-cta={tier.ctaHref ? undefined : true}
                data-ph-capture-attribute-section="pricing_plan"
                data-ph-capture-attribute-action="pricing_cta"
                data-ph-capture-attribute-destination={
                  tier.ctaHref ?? appSignupUrl(locale)
                }
                data-ph-capture-attribute-plan={tier.name}
                data-ph-capture-attribute-billing-interval={billingInterval}
                data-ph-capture-attribute-label={tier.cta[billingInterval]}
              >
                <span className="min-w-0">{tier.cta[billingInterval]}</span>
                <ArrowRight className="size-4 shrink-0 transition-transform duration-200 ease-(--ease-out) group-hover/button:translate-x-0.5" />
              </a>

              {/* Key highlights only */}
              <div className="flex-1 border-t border-border/50 pt-5">
                <ul className="flex flex-col gap-2.5">
                  {tier.highlights.map((item) => {
                    const label = typeof item === "string" ? item : item.label
                    const sublabel =
                      typeof item === "string" ? null : item.sublabel
                    return (
                      <li
                        key={label}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <Check
                          className="mt-0.5 size-3.5 shrink-0 text-foreground/60"
                          aria-hidden="true"
                        />
                        <span>
                          {label}
                          {sublabel ? (
                            <span className="block text-muted-foreground">
                              {sublabel}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature comparison table ── */}
      <section className="bg-background" id="compare">
        <div className="mx-auto max-w-5xl px-6 pt-10 pb-12 md:pt-12 md:pb-14 lg:pt-14 lg:pb-16">
          <h2 className="mb-4 text-center font-heading text-2xl leading-tight font-medium tracking-[-0.04em] md:text-3xl">
            {copy.compareHeading}
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
            {copy.compareIntro}
          </p>

          <div
            className="overflow-x-auto"
            role="region"
            aria-label={copy.tableLabel}
            tabIndex={0}
          >
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">{copy.caption}</caption>
              {/* Sticky header */}
              <thead>
                <tr className="border-b border-border/60">
                  <th
                    scope="col"
                    className="py-4 pr-8 text-left text-xs font-medium text-muted-foreground"
                  >
                    {copy.feature}
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                  >
                    Free
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                  >
                    Starter
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] rounded-t-xl bg-muted/60 px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                  >
                    Pro
                  </th>
                  <th
                    scope="col"
                    className="w-[150px] px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground"
                  >
                    Enterprise
                  </th>
                </tr>
              </thead>

              <tbody>
                {localizedComparisonGroups.map((group) => (
                  <Fragment key={group.category}>
                    {/* Category header row */}
                    <tr>
                      <td
                        colSpan={5}
                        className="pt-8 pb-3 text-xs font-medium tracking-wide text-muted-foreground"
                      >
                        {group.category}
                      </td>
                    </tr>

                    {/* Feature rows */}
                    {group.rows.map((row) => (
                      <tr
                        key={row.feature}
                        className="border-b border-border/40 last:border-0"
                      >
                        <th
                          scope="row"
                          className="py-3 pr-8 text-left font-medium text-foreground"
                        >
                          {row.feature}
                        </th>
                        {(
                          [
                            row.free,
                            row.starter ?? row.pro,
                            row.pro,
                            row.enterprise,
                          ] as ComparisonValue[]
                        ).map((value, i) => (
                          <td
                            key={i}
                            className={cn(
                              "px-4 py-3 text-center",
                              i === 2 && "bg-muted/60"
                            )}
                          >
                            <ComparisonCell
                              includedLabel={copy.included}
                              notIncludedLabel={copy.notIncluded}
                              value={value}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
