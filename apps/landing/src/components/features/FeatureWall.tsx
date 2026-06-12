import type React from "react"
import type { LucideIcon } from "lucide-react"
import type { Locale } from "@/i18n"
import {
  Pencil,
  CalendarCheck,
  DollarSign,
  PhoneOutgoing,
  ArrowRightLeft,
  ShieldBan,
  Phone,
  Globe,
  Users,
  AudioWaveform,
  Hash,
  UserCheck,
  MapPin,
  MessageSquareText,
  CalendarClock,
  CalendarX,
  Bell,
  FileText,
  ScrollText,
  Mail,
  BarChart3,
  BookOpen,
  Layers,
  CircleSlash,
  LifeBuoy,
  PhoneMissed,
  ClipboardList,
  PhoneForwarded,
  Repeat,
  History,
  Target,
  CalendarDays,
  TrendingUp,
} from "lucide-react"

/* ─────────────────────────── Types ─────────────────────────── */

type CardSize = "large" | "medium" | "full"

interface FeatureCard {
  title: string
  description: string
  icon: LucideIcon
  size: CardSize
  tag?: string
  visual?: "workflow" | "calendar" | "quote" | "outbound" | "routing" | "usage"
}

/* ─────────────────────────── Data ─────────────────────────── */

const largeCards: FeatureCard[] = [
  {
    title: "Build workflows with words, not flowcharts",
    description:
      "Train LobbyStack the way you would train a real employee. Tell it what to ask, what to say, when to quote, when to book, when to transfer, and who to notify without touching a workflow builder.",
    icon: Pencil,
    size: "large",
    visual: "workflow",
  },
  {
    title: "Book appointments while the customer is still ready",
    description:
      "LobbyStack checks availability, offers times, books the appointment, and sends the confirmation before the caller moves on to someone else.",
    icon: CalendarCheck,
    size: "large",
    visual: "calendar",
  },
  {
    title: "Give quotes without making callers wait",
    description:
      "For approved services, LobbyStack can give exact prices, starting prices, or price ranges. For custom work, it asks the right questions and schedules a pricing callback.",
    icon: DollarSign,
    size: "large",
    visual: "quote",
  },
  {
    title: "Follow up instead of losing the lead",
    description:
      "LobbyStack can make outbound calls for callbacks, reminders, confirmations, quote follow-ups, and missed-call recovery.",
    icon: PhoneOutgoing,
    size: "large",
    visual: "outbound",
  },
  {
    title: "Transfer the calls that need a person",
    description:
      "LobbyStack handles routine calls first, then transfers based on your instructions. Urgent requests, upset customers, high-value leads, and special cases can go straight to the right person.",
    icon: ArrowRightLeft,
    size: "large",
    visual: "routing",
  },
  {
    title: "Pay for real calls, not junk",
    description:
      "LobbyStack excludes spam calls and calls under 10 seconds from usage, so wrong numbers, robocalls, instant hang-ups, and pocket dials do not eat your plan.",
    icon: ShieldBan,
    size: "large",
    visual: "usage",
  },
]

const mediumCards: FeatureCard[] = [
  {
    title: "Your phone, always staffed",
    description:
      "LobbyStack can answer every call or step in only when your team is busy, closed, or unavailable.",
    icon: Phone,
    size: "medium",
    tag: "Always on",
  },
  {
    title: "One receptionist. 57 languages.",
    description:
      "Serve more customers with AI voice models that handle natural conversations across 57 languages.",
    icon: Globe,
    size: "medium",
    tag: "Multilingual",
  },
  {
    title: "Unlimited concurrent calls",
    description:
      "Multiple customers can be helped at the same time instead of waiting in a queue or hitting a busy line.",
    icon: Users,
    size: "medium",
    tag: "No queue",
  },
  {
    title: "Natural conversations",
    description:
      "Customers can speak normally. LobbyStack handles interruptions, follow-up questions, and messy real-world calls.",
    icon: AudioWaveform,
    size: "medium",
  },
  {
    title: "Dedicated call lines",
    description:
      "Use LobbyStack for a sales line, quote line, booking line, support line, intake line, or campaign number.",
    icon: Hash,
    size: "medium",
  },
  {
    title: "Lead qualification",
    description:
      "Have LobbyStack ask about budget, timeline, location, service type, urgency, and buying intent before booking or transferring.",
    icon: UserCheck,
    size: "medium",
  },
  {
    title: "Service-area checks",
    description:
      "Ask for a postal code or ZIP code before booking and route customers based on where you actually serve.",
    icon: MapPin,
    size: "medium",
  },
  {
    title: "Appointment confirmation texts",
    description:
      "After booking, LobbyStack sends the customer a confirmation text with the appointment details.",
    icon: MessageSquareText,
    size: "medium",
  },
  {
    title: "Rescheduling",
    description:
      "Customers can reschedule when your rules allow it, without waiting for your team to call back.",
    icon: CalendarClock,
    size: "medium",
  },
  {
    title: "Cancellations",
    description:
      "LobbyStack can handle cancellations according to your policies and notify your team.",
    icon: CalendarX,
    size: "medium",
  },
  {
    title: "Appointment reminders",
    description:
      "Remind customers before upcoming appointments so fewer people forget or no-show.",
    icon: Bell,
    size: "medium",
  },
  {
    title: "Call summaries",
    description:
      "Every important call can end with a clear summary, outcome, and next step.",
    icon: FileText,
    size: "medium",
  },
  {
    title: "Full transcripts",
    description:
      "Review the full conversation when your team needs more detail than the summary.",
    icon: ScrollText,
    size: "medium",
  },
  {
    title: "Email and SMS notifications",
    description:
      "Send booking updates, quote requests, urgent alerts, missed-transfer summaries, and high-value lead notices to the right person.",
    icon: Mail,
    size: "medium",
  },
  {
    title: "Daily recap",
    description:
      "Send a daily summary of bookings, quote requests, missed calls, spam blocked, and follow-ups.",
    icon: BarChart3,
    size: "medium",
  },
  {
    title: "Business knowledge",
    description:
      "Add your services, prices, hours, locations, policies, FAQs, and staff details so LobbyStack knows what to say.",
    icon: BookOpen,
    size: "medium",
  },
  {
    title: "Service rules",
    description:
      "Set different instructions for different services, locations, staff, appointment types, or lead types.",
    icon: Layers,
    size: "medium",
  },
  {
    title: "Do-not-say instructions",
    description:
      "Tell LobbyStack what it should never promise, explain, diagnose, quote, or book.",
    icon: CircleSlash,
    size: "medium",
  },
  {
    title: "Fallback behavior",
    description:
      "When LobbyStack does not know something, it can ask follow-up questions, schedule a callback, transfer, or notify the team.",
    icon: LifeBuoy,
    size: "medium",
  },
  {
    title: "Failed-transfer fallback",
    description:
      "If no one answers, LobbyStack can schedule a callback, send a summary, and keep the customer moving.",
    icon: PhoneForwarded,
    size: "medium",
  },
  {
    title: "Intake completion",
    description:
      "Call customers to collect missing details before an appointment, estimate, or callback.",
    icon: ClipboardList,
    size: "medium",
  },
  {
    title: "Missed-call recovery",
    description:
      "Call back people who hang up, call after hours, or miss your team during busy periods.",
    icon: PhoneMissed,
    size: "medium",
  },
  {
    title: "Quote follow-up",
    description:
      "Follow up with customers who asked for pricing but have not booked yet.",
    icon: Repeat,
    size: "medium",
  },
  {
    title: "Call history",
    description:
      "See every call, caller, outcome, summary, appointment, transfer, and follow-up.",
    icon: History,
    size: "medium",
  },
  {
    title: "Lead status",
    description:
      "See which calls became qualified leads, quote requests, appointments, or callbacks.",
    icon: Target,
    size: "medium",
  },
  {
    title: "Appointment activity",
    description:
      "Review bookings, reschedules, cancellations, and confirmation texts.",
    icon: CalendarDays,
    size: "medium",
  },
  {
    title: "Revenue opportunities",
    description:
      "Highlight calls that became bookings, quotes, callbacks, or high-value leads.",
    icon: TrendingUp,
    size: "medium",
  },
]

const largeCardsFr: FeatureCard[] = [
  {
    title: "Décrivez vos règles avec des mots, pas avec des organigrammes",
    description:
      "Formez LobbyStack comme une vraie personne à l’accueil. Dites-lui quoi demander, quoi répondre, quand donner une fourchette, quand planifier, quand transférer et qui prévenir.",
    icon: Pencil,
    size: "large",
    visual: "workflow",
  },
  {
    title: "Prenez le rendez‑vous pendant que le client est encore disponible",
    description:
      "LobbyStack vérifie les disponibilités, propose des créneaux, planifie le rendez‑vous et envoie la confirmation avant que l’appelant passe à un autre fournisseur.",
    icon: CalendarCheck,
    size: "large",
    visual: "calendar",
  },
  {
    title: "Donnez une fourchette sans faire attendre les appelants",
    description:
      "Pour les services approuvés, LobbyStack peut donner un prix exact, un prix de départ ou une fourchette. Pour les demandes sur mesure, il pose les bonnes questions et planifie un rappel.",
    icon: DollarSign,
    size: "large",
    visual: "quote",
  },
  {
    title: "Relancez au lieu de perdre le prospect",
    description:
      "LobbyStack peut appeler pour les rappels, confirmations, relances de devis, rappels de rendez‑vous et appels manqués.",
    icon: PhoneOutgoing,
    size: "large",
    visual: "outbound",
  },
  {
    title: "Transférez les appels qui ont besoin d’une personne",
    description:
      "LobbyStack traite d’abord les appels simples, puis transfère selon vos consignes. Urgences, clients mécontents, prospects importants et cas particuliers peuvent arriver directement à la bonne personne.",
    icon: ArrowRightLeft,
    size: "large",
    visual: "routing",
  },
  {
    title: "Payez pour les vrais appels, pas pour le bruit",
    description:
      "LobbyStack exclut les appels indésirables et les appels de moins de 10 secondes, afin que mauvais numéros, appels automatisés et raccrochages immédiats ne consomment pas votre forfait.",
    icon: ShieldBan,
    size: "large",
    visual: "usage",
  },
]

const mediumCardsFr: FeatureCard[] = [
  {
    title: "Votre téléphone, toujours couvert",
    description:
      "LobbyStack peut répondre à chaque appel ou seulement prendre le relais quand votre équipe est occupée, fermée ou indisponible.",
    icon: Phone,
    size: "medium",
    tag: "Toujours prêt",
  },
  {
    title: "Une réceptionniste. 57 langues.",
    description:
      "Servez plus de clients avec des voix IA capables de tenir des conversations naturelles dans 57 langues.",
    icon: Globe,
    size: "medium",
    tag: "Multilingue",
  },
  {
    title: "Appels simultanés illimités",
    description:
      "Plusieurs clients peuvent être aidés en même temps, sans file d’attente ni tonalité occupée.",
    icon: Users,
    size: "medium",
    tag: "Sans file",
  },
  {
    title: "Conversations naturelles",
    description:
      "Les clients parlent normalement. LobbyStack gère les interruptions, les questions de suivi et les appels désordonnés.",
    icon: AudioWaveform,
    size: "medium",
  },
  {
    title: "Lignes dédiées",
    description:
      "Utilisez LobbyStack pour une ligne de vente, de devis, de réservation, de support, d’accueil ou de campagne.",
    icon: Hash,
    size: "medium",
  },
  {
    title: "Qualification des demandes",
    description:
      "Demandez à LobbyStack de vérifier budget, délai, adresse, type de service, urgence et intention d’achat avant de planifier ou transférer.",
    icon: UserCheck,
    size: "medium",
  },
  {
    title: "Vérification des zones desservies",
    description:
      "Demandez un code postal avant de planifier et orientez les clients selon les zones que vous couvrez réellement.",
    icon: MapPin,
    size: "medium",
  },
  {
    title: "SMS de confirmation",
    description:
      "Après la prise de rendez‑vous, LobbyStack envoie au client un SMS avec les détails.",
    icon: MessageSquareText,
    size: "medium",
  },
  {
    title: "Déplacements de rendez‑vous",
    description:
      "Les clients peuvent déplacer un rendez‑vous lorsque vos règles le permettent, sans attendre un rappel.",
    icon: CalendarClock,
    size: "medium",
  },
  {
    title: "Annulations",
    description:
      "LobbyStack peut gérer les annulations selon vos politiques et prévenir votre équipe.",
    icon: CalendarX,
    size: "medium",
  },
  {
    title: "Rappels de rendez‑vous",
    description:
      "Rappelez les rendez‑vous à venir pour réduire les oublis et les absences.",
    icon: Bell,
    size: "medium",
  },
  {
    title: "Résumés d’appels",
    description:
      "Chaque appel important peut se terminer avec un résumé clair, un résultat et une prochaine étape.",
    icon: FileText,
    size: "medium",
  },
  {
    title: "Transcriptions complètes",
    description:
      "Relisez toute la conversation quand votre équipe a besoin de plus de détails que le résumé.",
    icon: ScrollText,
    size: "medium",
  },
  {
    title: "Notifications courriel et SMS",
    description:
      "Envoyez rendez‑vous, demandes de devis, alertes urgentes, transferts manqués et prospects importants à la bonne personne.",
    icon: Mail,
    size: "medium",
  },
  {
    title: "Récapitulatif quotidien",
    description:
      "Recevez chaque jour un résumé des rendez‑vous, demandes de devis, appels manqués, appels filtrés et suivis.",
    icon: BarChart3,
    size: "medium",
  },
  {
    title: "Connaissances métier",
    description:
      "Ajoutez services, prix, horaires, adresses, politiques, FAQ et informations d’équipe pour que LobbyStack sache quoi répondre.",
    icon: BookOpen,
    size: "medium",
  },
  {
    title: "Règles par service",
    description:
      "Définissez des consignes différentes selon le service, la zone, le membre d’équipe, le type de rendez‑vous ou le type de prospect.",
    icon: Layers,
    size: "medium",
  },
  {
    title: "Consignes à ne jamais dire",
    description:
      "Indiquez ce que LobbyStack ne doit jamais promettre, expliquer, diagnostiquer, chiffrer ou réserver.",
    icon: CircleSlash,
    size: "medium",
  },
  {
    title: "Comportement de secours",
    description:
      "Quand LobbyStack ne sait pas répondre, il peut poser une question, planifier un rappel, transférer ou prévenir l’équipe.",
    icon: LifeBuoy,
    size: "medium",
  },
  {
    title: "Secours après transfert manqué",
    description:
      "Si personne ne répond, LobbyStack peut planifier un rappel, envoyer un résumé et garder le client engagé.",
    icon: PhoneForwarded,
    size: "medium",
  },
  {
    title: "Complétion des dossiers",
    description:
      "Appelez les clients pour recueillir les informations manquantes avant un rendez‑vous, une estimation ou un rappel.",
    icon: ClipboardList,
    size: "medium",
  },
  {
    title: "Récupération des appels manqués",
    description:
      "Rappelez les personnes qui raccrochent, appellent hors horaires ou n’arrivent pas à joindre votre équipe.",
    icon: PhoneMissed,
    size: "medium",
  },
  {
    title: "Relance de devis",
    description:
      "Relancez les clients qui ont demandé un prix mais n’ont pas encore réservé.",
    icon: Repeat,
    size: "medium",
  },
  {
    title: "Historique des appels",
    description:
      "Voyez chaque appel, appelant, résultat, résumé, rendez‑vous, transfert et suivi.",
    icon: History,
    size: "medium",
  },
  {
    title: "Statut des prospects",
    description:
      "Suivez les appels devenus prospects qualifiés, demandes de devis, rendez‑vous ou rappels.",
    icon: Target,
    size: "medium",
  },
  {
    title: "Activité des rendez‑vous",
    description:
      "Consultez les prises de rendez‑vous, déplacements, annulations et SMS de confirmation.",
    icon: CalendarDays,
    size: "medium",
  },
  {
    title: "Occasions de revenu",
    description:
      "Repérez les appels transformés en rendez‑vous, devis, rappels ou prospects à forte valeur.",
    icon: TrendingUp,
    size: "medium",
  },
]

const featureWallCopy = {
  en: {
    heading: "Everything your front desk should already be doing",
    intro:
      "LobbyStack answers, books, qualifies, quotes, transfers, follows up, filters junk, and keeps your team in the loop.",
    calloutTitle: "Your business is not a flowchart",
    calloutBody:
      "Real calls are messy. Customers interrupt, change their mind, ask multiple questions, and explain things out of order. LobbyStack lets you describe the outcome in plain English instead of building fragile call trees.",
    calloutExample:
      "If a customer asks for pricing, ask the required quote questions, give the approved price range, and schedule a callback if they need exact pricing.",
    visuals: {
      workflow:
        "If a caller asks for pricing, ask the required quote questions, give the approved price range, and schedule a callback if they need exact pricing.",
      calendar: [
        "Appointment booked",
        "Customer confirmation sent",
        "Team notified",
        "Notes attached",
      ],
      quote: {
        rows: [
          { label: "Service", value: "Renovation estimate" },
          { label: "Location", value: "Downtown" },
          { label: "Budget", value: "$8k – $12k" },
          { label: "Timeline", value: "Next month" },
        ],
        outcome: "Price range shared · Callback scheduled",
      },
      outbound: [
        { label: "Missed caller callback", status: "Queued" },
        { label: "Quote follow-up", status: "Scheduled" },
        { label: "Appointment reminder", status: "Sent" },
        { label: "Intake completion", status: "Pending" },
      ],
      routing: [
        { label: "Urgent call", action: "Routed to manager" },
        { label: "Sales lead", action: "Routed to sales" },
        { label: "Billing request", action: "Routed to billing" },
        { label: "No answer", action: "Callback scheduled" },
      ],
      usage: {
        counted: "Counted",
        excluded: "Excluded",
        rows: [
          { label: "Real customer calls", value: "42", counted: true },
          { label: "Spam calls", value: "12", counted: false },
          { label: "Under 10 seconds", value: "7", counted: false },
        ],
      },
    },
  },
  fr: {
    heading: "Tout ce qu’un accueil efficace devrait déjà faire",
    intro:
      "LobbyStack répond, planifie, qualifie, donne des fourchettes, transfère, relance, filtre les appels inutiles et garde votre équipe informée.",
    calloutTitle: "Votre entreprise n’est pas un organigramme",
    calloutBody:
      "Les vrais appels sont rarement linéaires. Les clients interrompent, changent d’idée, posent plusieurs questions et donnent les informations dans le désordre. LobbyStack vous laisse décrire le résultat attendu en français courant, sans construire un arbre d’appels fragile.",
    calloutExample:
      "Si un client demande un prix, posez les questions de devis, donnez la fourchette approuvée et planifiez un rappel s’il faut confirmer le montant exact.",
    visuals: {
      workflow:
        "Si un appelant demande un prix, posez les questions de devis, donnez la fourchette approuvée et planifiez un rappel s’il faut confirmer le montant exact.",
      calendar: [
        "Rendez-vous planifié",
        "Confirmation envoyée au client",
        "Équipe prévenue",
        "Notes jointes",
      ],
      quote: {
        rows: [
          { label: "Service", value: "Estimation rénovation" },
          { label: "Adresse", value: "Centre-ville" },
          { label: "Budget", value: "8 k$ à 12 k$" },
          { label: "Délai", value: "Le mois prochain" },
        ],
        outcome: "Fourchette communiquée · Rappel planifié",
      },
      outbound: [
        { label: "Rappel d’un appel manqué", status: "En file" },
        { label: "Relance de devis", status: "Planifiée" },
        { label: "Rappel de rendez‑vous", status: "Envoyé" },
        { label: "Dossier à compléter", status: "En attente" },
      ],
      routing: [
        { label: "Appel urgent", action: "Vers le responsable" },
        { label: "Prospect vente", action: "Vers les ventes" },
        { label: "Question facturation", action: "Vers la facturation" },
        { label: "Aucune réponse", action: "Rappel planifié" },
      ],
      usage: {
        counted: "Compté",
        excluded: "Exclu",
        rows: [
          { label: "Vrais appels clients", value: "42", counted: true },
          { label: "Appels indésirables", value: "12", counted: false },
          { label: "Moins de 10 secondes", value: "7", counted: false },
        ],
      },
    },
  },
} satisfies Record<
  Locale,
  {
    heading: string
    intro: string
    calloutTitle: string
    calloutBody: string
    calloutExample: string
    visuals: {
      workflow: string
      calendar: string[]
      quote: {
        rows: Array<{ label: string; value: string }>
        outcome: string
      }
      outbound: Array<{ label: string; status: string }>
      routing: Array<{ label: string; action: string }>
      usage: {
        counted: string
        excluded: string
        rows: Array<{ label: string; value: string; counted: boolean }>
      }
    }
  }
>

const largeCardsByLocale = {
  en: largeCards,
  fr: largeCardsFr,
} satisfies Record<Locale, FeatureCard[]>

const mediumCardsByLocale = {
  en: mediumCards,
  fr: mediumCardsFr,
} satisfies Record<Locale, FeatureCard[]>

/* ─────────────────────────── Visual sub-components ─────────────────────────── */

type VisualProps = {
  locale: Locale
}

function WorkflowVisual({ locale }: VisualProps) {
  const text = featureWallCopy[locale].visuals.workflow

  return (
    <div className="rounded-xl bg-muted/60 p-4">
      <p className="font-mono text-[12px] leading-relaxed text-foreground/70">
        {text}
      </p>
    </div>
  )
}

function CalendarVisual({ locale }: VisualProps) {
  const items = featureWallCopy[locale].visuals.calendar

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item}
          className="flex items-center gap-2 text-[13px] text-muted-foreground"
        >
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {item}
        </div>
      ))}
    </div>
  )
}

function QuoteVisual({ locale }: VisualProps) {
  const quote = featureWallCopy[locale].visuals.quote

  return (
    <div className="space-y-2">
      {quote.rows.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between text-[13px]"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-medium text-foreground">{item.value}</span>
        </div>
      ))}
      <div className="mt-2 border-t border-border/50 pt-2 text-[13px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {quote.outcome}
        </div>
      </div>
    </div>
  )
}

function OutboundVisual({ locale }: VisualProps) {
  const items = featureWallCopy[locale].visuals.outbound

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between text-[13px]"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground/70">
            {item.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function RoutingVisual({ locale }: VisualProps) {
  const items = featureWallCopy[locale].visuals.routing

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between text-[13px]"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="text-foreground/80">{item.action}</span>
        </div>
      ))}
    </div>
  )
}

function UsageVisual({ locale }: VisualProps) {
  const usage = featureWallCopy[locale].visuals.usage

  return (
    <div className="space-y-2">
      {usage.rows.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between text-[13px]"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="flex items-center gap-2">
            <span className="font-medium text-foreground">{item.value}</span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                item.counted
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.counted ? usage.counted : usage.excluded}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

const visualMap: Record<string, (props: VisualProps) => React.ReactNode> = {
  workflow: WorkflowVisual,
  calendar: CalendarVisual,
  quote: QuoteVisual,
  outbound: OutboundVisual,
  routing: RoutingVisual,
  usage: UsageVisual,
}

/* ─────────────────────────── Card renderers ─────────────────────────── */

function LargeFeatureCard({
  card,
  locale,
}: {
  card: FeatureCard
  locale: Locale
}) {
  const Icon = card.icon
  const Visual = card.visual ? visualMap[card.visual] : null

  return (
    <article className="flex flex-col rounded-2xl border border-border/70 bg-background p-6 transition-colors hover:border-border md:p-8">
      {/* Header row */}
      <div className="mb-1 flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-[18px] text-foreground/70" />
        </div>
      </div>

      {/* Copy */}
      <h3 className="mt-4 font-heading text-lg leading-snug font-medium tracking-tight">
        {card.title}
      </h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground md:min-h-[4.5rem]">
        {card.description}
      </p>

      {/* Visual */}
      {Visual && (
        <div className="mt-5">
          <Visual locale={locale} />
        </div>
      )}
    </article>
  )
}

function MediumFeatureCard({ card }: { card: FeatureCard }) {
  const Icon = card.icon

  return (
    <article className="group flex flex-col rounded-2xl border border-border/70 bg-background p-6 transition-colors hover:border-border">
      {/* Icon + tag row */}
      <div className="flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-[18px] text-foreground/70" />
        </div>
        {card.tag && (
          <span className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground">
            {card.tag}
          </span>
        )}
      </div>

      {/* Copy */}
      <h3 className="mt-4 font-heading text-[15px] leading-snug font-medium tracking-tight">
        {card.title}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {card.description}
      </p>
    </article>
  )
}

/* ─────────────────────────── Full-width callout ─────────────────────────── */

function FullWidthCallout({ locale }: { locale: Locale }) {
  const copy = featureWallCopy[locale]

  return (
    <article className="col-span-full rounded-2xl border border-border/70 bg-background p-8 md:p-10">
      <div className="mx-auto max-w-3xl">
        <h3 className="font-heading text-2xl leading-tight font-medium tracking-tight md:text-[1.7rem]">
          {copy.calloutTitle}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {copy.calloutBody}
        </p>
        <div className="mt-6 rounded-xl bg-muted/60 p-5">
          <p className="font-mono text-[13px] leading-relaxed text-foreground/70">
            {copy.calloutExample}
          </p>
        </div>
      </div>
    </article>
  )
}

/* ─────────────────────────── Main export ─────────────────────────── */

type FeatureWallProps = {
  locale?: Locale
}

export function FeatureWall({ locale = "en" }: FeatureWallProps) {
  const copy = featureWallCopy[locale]
  const localizedLargeCards = largeCardsByLocale[locale]
  const localizedMediumCards = mediumCardsByLocale[locale]

  return (
    <section className="section-spacing" id="feature-wall">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section intro */}
        <div className="mb-12 max-w-3xl md:mb-16">
          <h2 className="section-heading">{copy.heading}</h2>
          <p className="section-intro">{copy.intro}</p>
        </div>

        {/* Large cards, 2-column grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {localizedLargeCards.map((card) => (
            <LargeFeatureCard key={card.title} card={card} locale={locale} />
          ))}
        </div>

        {/* Full-width callout */}
        <div className="mt-4">
          <FullWidthCallout locale={locale} />
        </div>

        {/* Medium cards, 3-to-4-column grid */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {localizedMediumCards.map((card) => (
            <MediumFeatureCard key={card.title} card={card} />
          ))}
        </div>
      </div>
    </section>
  )
}
