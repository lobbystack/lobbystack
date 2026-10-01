import type React from "react"
import type { LucideIcon } from "lucide-react"
import type { Locale } from "@/i18n"
import {
  Pencil,
  CalendarCheck,
  DollarSign,
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
  Mic,
  Mail,
  BookOpen,
  Layers,
  CircleSlash,
  LifeBuoy,
  PhoneForwarded,
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
  visual?: "workflow" | "calendar" | "quote" | "routing" | "usage"
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
      "For approved services, LobbyStack can give exact prices, starting prices, or price ranges. For custom work, it asks the right questions and passes the details to your team.",
    icon: DollarSign,
    size: "large",
    visual: "quote",
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
    title: "Answers in your caller's language",
    description:
      "LobbyStack replies in the language the caller speaks, so customers who don't speak English can still book and ask questions.",
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
      "Use LobbyStack for a sales line, quote line, booking line, support line, or intake line.",
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
      "If the caller agrees, LobbyStack texts them a reminder 24 hours before the appointment.",
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
    title: "Call recordings",
    description:
      "Listen to any call again from your dashboard.",
    icon: Mic,
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
      "When LobbyStack does not know something, it can ask follow-up questions, take a message, transfer, or notify the team.",
    icon: LifeBuoy,
    size: "medium",
  },
  {
    title: "Failed-transfer fallback",
    description:
      "If no one picks up, LobbyStack takes a message and sends your team a summary.",
    icon: PhoneForwarded,
    size: "medium",
  },
  {
    title: "Call history",
    description:
      "See every call, caller, outcome, summary, appointment, and transfer.",
    icon: History,
    size: "medium",
  },
  {
    title: "Lead status",
    description:
      "See which calls became qualified leads, quote requests, or appointments.",
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
      "Highlight calls that became bookings, quote requests, or high-value leads.",
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
      "Pour les services approuvés, LobbyStack peut donner un prix exact, un prix de départ ou une fourchette. Pour les demandes sur mesure, il pose les bonnes questions et transmet les détails à votre équipe.",
    icon: DollarSign,
    size: "large",
    visual: "quote",
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
    title: "Répond dans la langue de l’appelant",
    description:
      "LobbyStack répond dans la langue que parle l’appelant. Les clients qui ne parlent pas français peuvent quand même réserver et poser leurs questions.",
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
      "Utilisez LobbyStack pour une ligne de vente, de devis, de réservation, de support ou d’accueil.",
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
      "Si l’appelant accepte, LobbyStack lui envoie un SMS de rappel 24 heures avant le rendez‑vous.",
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
    title: "Enregistrements d’appels",
    description:
      "Réécoutez n’importe quel appel depuis votre tableau de bord.",
    icon: Mic,
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
      "Quand LobbyStack ne sait pas répondre, il peut poser une question, prendre un message, transférer ou prévenir l’équipe.",
    icon: LifeBuoy,
    size: "medium",
  },
  {
    title: "Secours après transfert manqué",
    description:
      "Si personne ne décroche, LobbyStack prend un message et envoie un résumé à votre équipe.",
    icon: PhoneForwarded,
    size: "medium",
  },
  {
    title: "Historique des appels",
    description:
      "Voyez chaque appel, appelant, résultat, résumé, rendez‑vous et transfert.",
    icon: History,
    size: "medium",
  },
  {
    title: "Statut des prospects",
    description:
      "Suivez les appels devenus prospects qualifiés, demandes de devis ou rendez‑vous.",
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
      "Repérez les appels transformés en rendez‑vous, demandes de devis ou prospects à forte valeur.",
    icon: TrendingUp,
    size: "medium",
  },
]

const largeCardsEs: FeatureCard[] = [
  {
    title: "Cree flujos de trabajo con palabras, no con diagramas",
    description:
      "Entrene a LobbyStack como entrenaría a un empleado real. Dígale qué preguntar, qué decir, cuándo dar un presupuesto, cuándo reservar, cuándo transferir y a quién avisar, sin tocar un editor de flujos.",
    icon: Pencil,
    size: "large",
    visual: "workflow",
  },
  {
    title: "Reserve la cita mientras el cliente sigue decidido",
    description:
      "LobbyStack consulta la disponibilidad, ofrece horarios, reserva la cita y envía la confirmación antes de que el cliente llame a otro proveedor.",
    icon: CalendarCheck,
    size: "large",
    visual: "calendar",
  },
  {
    title: "Dé presupuestos sin hacer esperar a nadie",
    description:
      "Para los servicios aprobados, LobbyStack puede dar precios exactos, precios desde o rangos de precios. Para trabajos a medida, hace las preguntas adecuadas y pasa los detalles a su equipo.",
    icon: DollarSign,
    size: "large",
    visual: "quote",
  },
  {
    title: "Transfiera las llamadas que necesitan a una persona",
    description:
      "LobbyStack atiende primero las llamadas rutinarias y luego transfiere según sus instrucciones. Las urgencias, los clientes molestos, los clientes potenciales de alto valor y los casos especiales pueden ir directamente a la persona adecuada.",
    icon: ArrowRightLeft,
    size: "large",
    visual: "routing",
  },
  {
    title: "Pague por llamadas reales, no por basura",
    description:
      "LobbyStack no cuenta en el uso las llamadas de spam ni las de menos de 10 segundos, así que los números equivocados, las llamadas automáticas, los cuelgues inmediatos y las llamadas accidentales no consumen su plan.",
    icon: ShieldBan,
    size: "large",
    visual: "usage",
  },
]

const mediumCardsEs: FeatureCard[] = [
  {
    title: "Su teléfono, siempre atendido",
    description:
      "LobbyStack puede contestar todas las llamadas o intervenir solo cuando su equipo está ocupado, cerrado o no disponible.",
    icon: Phone,
    size: "medium",
    tag: "Siempre activo",
  },
  {
    title: "Responde en el idioma de quien llama",
    description:
      "LobbyStack responde en el idioma de la persona que llama, así los clientes que no hablan español también pueden reservar y hacer preguntas.",
    icon: Globe,
    size: "medium",
    tag: "Multilingüe",
  },
  {
    title: "Llamadas simultáneas ilimitadas",
    description:
      "Varios clientes pueden recibir atención al mismo tiempo, sin esperar en cola ni encontrar la línea ocupada.",
    icon: Users,
    size: "medium",
    tag: "Sin espera",
  },
  {
    title: "Conversaciones naturales",
    description:
      "Los clientes pueden hablar con normalidad. LobbyStack maneja interrupciones, preguntas de seguimiento y llamadas desordenadas de la vida real.",
    icon: AudioWaveform,
    size: "medium",
  },
  {
    title: "Líneas dedicadas",
    description:
      "Use LobbyStack para una línea de ventas, de presupuestos, de reservas, de soporte o de recepción de solicitudes.",
    icon: Hash,
    size: "medium",
  },
  {
    title: "Calificación de clientes potenciales",
    description:
      "Haga que LobbyStack pregunte por presupuesto, plazo, ubicación, tipo de servicio, urgencia e intención de compra antes de reservar o transferir.",
    icon: UserCheck,
    size: "medium",
  },
  {
    title: "Verificación de la zona de servicio",
    description:
      "Pida un código postal antes de reservar y dirija a los clientes según las zonas que realmente atiende.",
    icon: MapPin,
    size: "medium",
  },
  {
    title: "SMS de confirmación de citas",
    description:
      "Después de reservar, LobbyStack envía al cliente un SMS de confirmación con los detalles de la cita.",
    icon: MessageSquareText,
    size: "medium",
  },
  {
    title: "Reprogramación",
    description:
      "Los clientes pueden reprogramar cuando sus reglas lo permiten, sin esperar a que su equipo les devuelva la llamada.",
    icon: CalendarClock,
    size: "medium",
  },
  {
    title: "Cancelaciones",
    description:
      "LobbyStack puede gestionar cancelaciones según sus políticas y avisar a su equipo.",
    icon: CalendarX,
    size: "medium",
  },
  {
    title: "Recordatorios de citas",
    description:
      "Si la persona que llama acepta, LobbyStack le envía un SMS de recordatorio 24 horas antes de la cita.",
    icon: Bell,
    size: "medium",
  },
  {
    title: "Resúmenes de llamadas",
    description:
      "Cada llamada importante puede terminar con un resumen claro, un resultado y el siguiente paso.",
    icon: FileText,
    size: "medium",
  },
  {
    title: "Transcripciones completas",
    description:
      "Revise la conversación completa cuando su equipo necesite más detalle que el resumen.",
    icon: ScrollText,
    size: "medium",
  },
  {
    title: "Grabaciones de llamadas",
    description: "Vuelva a escuchar cualquier llamada desde su panel.",
    icon: Mic,
    size: "medium",
  },
  {
    title: "Notificaciones por correo y SMS",
    description:
      "Envíe a la persona adecuada novedades de reservas, solicitudes de presupuesto, alertas urgentes, resúmenes de transferencias fallidas y avisos de clientes potenciales de alto valor.",
    icon: Mail,
    size: "medium",
  },
  {
    title: "Conocimiento del negocio",
    description:
      "Añada sus servicios, precios, horarios, ubicaciones, políticas, preguntas frecuentes y datos del personal para que LobbyStack sepa qué decir.",
    icon: BookOpen,
    size: "medium",
  },
  {
    title: "Reglas por servicio",
    description:
      "Defina instrucciones distintas según el servicio, la ubicación, el personal, el tipo de cita o el tipo de cliente potencial.",
    icon: Layers,
    size: "medium",
  },
  {
    title: "Lo que nunca debe decir",
    description:
      "Indique qué no debe LobbyStack prometer, explicar, diagnosticar, presupuestar ni reservar nunca.",
    icon: CircleSlash,
    size: "medium",
  },
  {
    title: "Plan de respaldo",
    description:
      "Cuando LobbyStack no sabe algo, puede hacer preguntas de seguimiento, tomar un mensaje, transferir la llamada o avisar al equipo.",
    icon: LifeBuoy,
    size: "medium",
  },
  {
    title: "Respaldo si falla la transferencia",
    description:
      "Si nadie contesta, LobbyStack toma un mensaje y envía un resumen a su equipo.",
    icon: PhoneForwarded,
    size: "medium",
  },
  {
    title: "Historial de llamadas",
    description:
      "Vea cada llamada, persona que llama, resultado, resumen, cita y transferencia.",
    icon: History,
    size: "medium",
  },
  {
    title: "Estado de clientes potenciales",
    description:
      "Vea qué llamadas se convirtieron en clientes potenciales calificados, solicitudes de presupuesto o citas.",
    icon: Target,
    size: "medium",
  },
  {
    title: "Actividad de citas",
    description:
      "Revise reservas, reprogramaciones, cancelaciones y SMS de confirmación.",
    icon: CalendarDays,
    size: "medium",
  },
  {
    title: "Oportunidades de ingresos",
    description:
      "Destaque las llamadas que terminaron en reservas, solicitudes de presupuesto o clientes potenciales de alto valor.",
    icon: TrendingUp,
    size: "medium",
  },
]

const largeCardsSr: FeatureCard[] = [
  {
    title: "Pravite tokove rada rečima, ne dijagramima",
    description:
      "Obučite LobbyStack kao što biste obučili pravog zaposlenog. Recite mu šta da pita, šta da kaže, kada da navede cenu, kada da zakaže, kada da preusmeri poziv i koga da obavesti, bez alata za pravljenje tokova rada.",
    icon: Pencil,
    size: "large",
    visual: "workflow",
  },
  {
    title: "Zakažite termin dok je klijent još spreman",
    description:
      "LobbyStack proverava dostupnost, nudi termine, zakazuje i šalje potvrdu pre nego što pozivalac ode kod nekog drugog.",
    icon: CalendarCheck,
    size: "large",
    visual: "calendar",
  },
  {
    title: "Recite cenu odmah, bez čekanja",
    description:
      "Za odobrene usluge LobbyStack može da navede tačnu cenu, početnu cenu ili raspon cena. Za posao po meri postavlja prava pitanja i prosleđuje detalje Vašem timu.",
    icon: DollarSign,
    size: "large",
    visual: "quote",
  },
  {
    title: "Preusmerite pozive kojima je potreban čovek",
    description:
      "LobbyStack prvo rešava rutinske pozive, a zatim preusmerava prema Vašim uputstvima. Hitni zahtevi, nezadovoljni klijenti, vredni potencijalni klijenti i posebni slučajevi mogu odmah stići do odgovarajuće osobe.",
    icon: ArrowRightLeft,
    size: "large",
    visual: "routing",
  },
  {
    title: "Plaćajte prave pozive, ne smeće",
    description:
      "LobbyStack ne računa spam pozive i pozive kraće od 10 sekundi u potrošnju, pa pogrešni brojevi, automatski pozivi, trenutni prekidi i slučajni pozivi iz džepa ne troše Vaš paket.",
    icon: ShieldBan,
    size: "large",
    visual: "usage",
  },
]

const mediumCardsSr: FeatureCard[] = [
  {
    title: "Vaš telefon, uvek pokriven",
    description:
      "LobbyStack može da odgovara na svaki poziv ili da uskoči samo kada je Vaš tim zauzet, zatvoren ili nedostupan.",
    icon: Phone,
    size: "medium",
    tag: "Uvek uključen",
  },
  {
    title: "Odgovara na jeziku pozivaoca",
    description:
      "LobbyStack odgovara na jeziku kojim pozivalac govori, pa i klijenti koji ne govore srpski mogu da zakažu termin i postave pitanja.",
    icon: Globe,
    size: "medium",
    tag: "Višejezično",
  },
  {
    title: "Neograničen broj istovremenih poziva",
    description:
      "Više klijenata može da dobije pomoć u isto vreme, bez čekanja u redu i bez zauzete linije.",
    icon: Users,
    size: "medium",
    tag: "Bez čekanja",
  },
  {
    title: "Prirodni razgovori",
    description:
      "Klijenti mogu normalno da pričaju. LobbyStack se snalazi sa prekidima, dodatnim pitanjima i neurednim pozivima iz stvarnog života.",
    icon: AudioWaveform,
    size: "medium",
  },
  {
    title: "Namenske linije",
    description:
      "Koristite LobbyStack za liniju za prodaju, ponude, zakazivanje, podršku ili prijem upita.",
    icon: Hash,
    size: "medium",
  },
  {
    title: "Kvalifikacija potencijalnih klijenata",
    description:
      "Neka LobbyStack pita za budžet, rok, lokaciju, vrstu usluge, hitnost i nameru kupovine pre zakazivanja ili preusmeravanja.",
    icon: UserCheck,
    size: "medium",
  },
  {
    title: "Provera područja usluge",
    description:
      "Pitajte za poštanski broj pre zakazivanja i usmerite klijente prema mestima gde zaista radite.",
    icon: MapPin,
    size: "medium",
  },
  {
    title: "SMS potvrde termina",
    description:
      "Posle zakazivanja LobbyStack klijentu šalje SMS potvrdu sa detaljima termina.",
    icon: MessageSquareText,
    size: "medium",
  },
  {
    title: "Pomeranje termina",
    description:
      "Klijenti mogu da pomere termin kada to Vaša pravila dozvoljavaju, bez čekanja da ih tim pozove.",
    icon: CalendarClock,
    size: "medium",
  },
  {
    title: "Otkazivanja",
    description:
      "LobbyStack može da obradi otkazivanja prema Vašim pravilima i obavesti Vaš tim.",
    icon: CalendarX,
    size: "medium",
  },
  {
    title: "Podsetnici za termine",
    description:
      "Ako se pozivalac složi, LobbyStack mu šalje SMS podsetnik 24 sata pre termina.",
    icon: Bell,
    size: "medium",
  },
  {
    title: "Rezimei poziva",
    description:
      "Svaki važan poziv može da se završi jasnim rezimeom, ishodom i sledećim korakom.",
    icon: FileText,
    size: "medium",
  },
  {
    title: "Kompletni transkripti",
    description:
      "Pregledajte ceo razgovor kada Vašem timu treba više detalja od rezimea.",
    icon: ScrollText,
    size: "medium",
  },
  {
    title: "Snimci poziva",
    description: "Preslušajte bilo koji poziv sa kontrolne table.",
    icon: Mic,
    size: "medium",
  },
  {
    title: "Obaveštenja e-poštom i SMS-om",
    description:
      "Šaljite pravoj osobi novosti o zakazivanjima, zahteve za ponudu, hitna upozorenja, rezimee neuspelih preusmeravanja i obaveštenja o vrednim potencijalnim klijentima.",
    icon: Mail,
    size: "medium",
  },
  {
    title: "Znanje o firmi",
    description:
      "Dodajte usluge, cene, radno vreme, lokacije, pravila, česta pitanja i podatke o zaposlenima da bi LobbyStack znao šta da kaže.",
    icon: BookOpen,
    size: "medium",
  },
  {
    title: "Pravila po usluzi",
    description:
      "Podesite različita uputstva za različite usluge, lokacije, zaposlene, vrste termina ili vrste potencijalnih klijenata.",
    icon: Layers,
    size: "medium",
  },
  {
    title: "Šta nikada ne sme da kaže",
    description:
      "Navedite šta LobbyStack nikada ne sme da obeća, objasni, dijagnostikuje, proceni ili zakaže.",
    icon: CircleSlash,
    size: "medium",
  },
  {
    title: "Rezervni plan",
    description:
      "Kada LobbyStack nešto ne zna, može da postavi dodatna pitanja, primi poruku, preusmeri poziv ili obavesti tim.",
    icon: LifeBuoy,
    size: "medium",
  },
  {
    title: "Kada preusmeravanje ne uspe",
    description:
      "Ako se niko ne javi, LobbyStack prima poruku i šalje rezime Vašem timu.",
    icon: PhoneForwarded,
    size: "medium",
  },
  {
    title: "Istorija poziva",
    description:
      "Pogledajte svaki poziv, pozivaoca, ishod, rezime, termin i preusmeravanje.",
    icon: History,
    size: "medium",
  },
  {
    title: "Status potencijalnih klijenata",
    description:
      "Pogledajte koji su pozivi postali kvalifikovani potencijalni klijenti, zahtevi za ponudu ili termini.",
    icon: Target,
    size: "medium",
  },
  {
    title: "Aktivnost termina",
    description:
      "Pregledajte zakazivanja, pomeranja, otkazivanja i SMS potvrde.",
    icon: CalendarDays,
    size: "medium",
  },
  {
    title: "Prilike za prihod",
    description:
      "Istaknite pozive koji su završili zakazivanjem, zahtevom za ponudu ili vrednim potencijalnim klijentom.",
    icon: TrendingUp,
    size: "medium",
  },
]

const featureWallCopy = {
  en: {
    heading: "Everything your front desk should already be doing",
    intro:
      "LobbyStack answers, books, qualifies, quotes, transfers, filters junk, and keeps your team in the loop.",
    calloutTitle: "Your business is not a flowchart",
    calloutBody:
      "Real calls are messy. Customers interrupt, change their mind, ask multiple questions, and explain things out of order. LobbyStack lets you describe the outcome in plain English instead of building fragile call trees.",
    calloutExample:
      "If a customer asks for pricing, ask the required quote questions, give the approved price range, and take a message for the team if they need exact pricing.",
    visuals: {
      workflow:
        "If a caller asks for pricing, ask the required quote questions, give the approved price range, and take a message for the team if they need exact pricing.",
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
        outcome: "Price range shared · Team notified",
      },
      routing: [
        { label: "Urgent call", action: "Routed to manager" },
        { label: "Sales lead", action: "Routed to sales" },
        { label: "Billing request", action: "Routed to billing" },
        { label: "No answer", action: "Message taken" },
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
      "LobbyStack répond, planifie, qualifie, donne des fourchettes, transfère, filtre les appels inutiles et garde votre équipe informée.",
    calloutTitle: "Votre entreprise n’est pas un organigramme",
    calloutBody:
      "Les vrais appels sont rarement linéaires. Les clients interrompent, changent d’idée, posent plusieurs questions et donnent les informations dans le désordre. LobbyStack vous laisse décrire le résultat attendu en français courant, sans construire un arbre d’appels fragile.",
    calloutExample:
      "Si un client demande un prix, posez les questions de devis, donnez la fourchette approuvée et prenez un message pour l’équipe s’il faut confirmer le montant exact.",
    visuals: {
      workflow:
        "Si un appelant demande un prix, posez les questions de devis, donnez la fourchette approuvée et prenez un message pour l’équipe s’il faut confirmer le montant exact.",
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
        outcome: "Fourchette communiquée · Équipe prévenue",
      },
      routing: [
        { label: "Appel urgent", action: "Vers le responsable" },
        { label: "Prospect vente", action: "Vers les ventes" },
        { label: "Question facturation", action: "Vers la facturation" },
        { label: "Aucune réponse", action: "Message pris" },
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
  es: {
    heading: "Todo lo que su recepción ya debería estar haciendo",
    intro:
      "LobbyStack contesta, reserva, califica, da presupuestos, transfiere, filtra las llamadas basura y mantiene informado a su equipo.",
    calloutTitle: "Su negocio no es un diagrama de flujo",
    calloutBody:
      "Las llamadas reales son desordenadas. Los clientes interrumpen, cambian de opinión, hacen varias preguntas y lo explican todo sin orden. LobbyStack le permite describir el resultado en español sencillo, sin construir frágiles árboles de llamadas.",
    calloutExample:
      "Si un cliente pide precios, haga las preguntas necesarias para el presupuesto, dé el rango de precios aprobado y tome un mensaje para el equipo si necesita un precio exacto.",
    visuals: {
      workflow:
        "Si alguien llama y pide precios, haga las preguntas necesarias para el presupuesto, dé el rango de precios aprobado y tome un mensaje para el equipo si necesita un precio exacto.",
      calendar: [
        "Cita reservada",
        "Confirmación enviada al cliente",
        "Equipo avisado",
        "Notas adjuntas",
      ],
      quote: {
        rows: [
          { label: "Servicio", value: "Estimación de reforma" },
          { label: "Ubicación", value: "Centro" },
          { label: "Presupuesto", value: "$8k – $12k" },
          { label: "Plazo", value: "El próximo mes" },
        ],
        outcome: "Rango de precios enviado · Equipo avisado",
      },
      routing: [
        { label: "Llamada urgente", action: "Al gerente" },
        { label: "Cliente potencial", action: "A ventas" },
        { label: "Consulta de facturación", action: "A facturación" },
        { label: "Sin respuesta", action: "Mensaje tomado" },
      ],
      usage: {
        counted: "Contada",
        excluded: "Excluida",
        rows: [
          { label: "Llamadas reales de clientes", value: "42", counted: true },
          { label: "Llamadas de spam", value: "12", counted: false },
          { label: "Menos de 10 segundos", value: "7", counted: false },
        ],
      },
    },
  },
  sr: {
    heading: "Sve što bi Vaša recepcija već trebalo da radi",
    intro:
      "LobbyStack odgovara, zakazuje, kvalifikuje, daje cene, preusmerava, filtrira nebitne pozive i obaveštava Vaš tim.",
    calloutTitle: "Vaša firma nije dijagram toka",
    calloutBody:
      "Pravi pozivi su neuredni. Klijenti prekidaju, predomišljaju se, postavljaju više pitanja i objašnjavaju stvari bez reda. LobbyStack Vam omogućava da ishod opišete običnim srpskim jezikom, umesto da gradite krhka stabla poziva.",
    calloutExample:
      "Ako klijent pita za cenu, postavite potrebna pitanja za ponudu, navedite odobreni raspon cena i primite poruku za tim ako mu treba tačna cena.",
    visuals: {
      workflow:
        "Ako pozivalac pita za cenu, postavite potrebna pitanja za ponudu, navedite odobreni raspon cena i primite poruku za tim ako mu treba tačna cena.",
      calendar: [
        "Termin zakazan",
        "Potvrda poslata klijentu",
        "Tim obavešten",
        "Beleške priložene",
      ],
      quote: {
        rows: [
          { label: "Usluga", value: "Procena renoviranja" },
          { label: "Lokacija", value: "Centar grada" },
          { label: "Budžet", value: "$8k – $12k" },
          { label: "Rok", value: "Sledeći mesec" },
        ],
        outcome: "Raspon cena poslat · Tim obavešten",
      },
      routing: [
        { label: "Hitan poziv", action: "Ka menadžeru" },
        { label: "Prodajni upit", action: "Ka prodaji" },
        { label: "Pitanje o naplati", action: "Ka naplati" },
        { label: "Nema odgovora", action: "Poruka primljena" },
      ],
      usage: {
        counted: "Računa se",
        excluded: "Ne računa se",
        rows: [
          { label: "Pravi pozivi klijenata", value: "42", counted: true },
          { label: "Spam pozivi", value: "12", counted: false },
          { label: "Kraće od 10 sekundi", value: "7", counted: false },
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
  es: largeCardsEs,
  sr: largeCardsSr,
} satisfies Record<Locale, FeatureCard[]>

const mediumCardsByLocale = {
  en: mediumCards,
  fr: mediumCardsFr,
  es: mediumCardsEs,
  sr: mediumCardsSr,
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
  routing: RoutingVisual,
  usage: UsageVisual,
}

/* ─────────────────────────── Card renderers ─────────────────────────── */

function LargeFeatureCard({
  card,
  locale,
  fullWidth = false,
}: {
  card: FeatureCard
  locale: Locale
  fullWidth?: boolean
}) {
  const Icon = card.icon
  const Visual = card.visual ? visualMap[card.visual] : null

  return (
    <article
      className={`flex flex-col rounded-2xl border border-border/70 bg-background p-6 transition-colors hover:border-border md:p-8 ${
        fullWidth ? "md:col-span-2" : ""
      }`}
    >
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
          {localizedLargeCards.map((card, index) => (
            <LargeFeatureCard
              key={card.title}
              card={card}
              locale={locale}
              fullWidth={
                localizedLargeCards.length % 2 === 1 &&
                index === localizedLargeCards.length - 1
              }
            />
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
