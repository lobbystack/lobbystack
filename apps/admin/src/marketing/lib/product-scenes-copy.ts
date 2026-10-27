import type { Locale } from "@/marketing/i18n"

// The words inside the product scenes that replace the old raster
// illustrations, so each scene reads in the page's language.

export type ProductScenesCopy = {
  incomingCall: string
  teamUnavailable: string
  ringTeam: string
  ringFor: string
  lobbystackAnswers: string
  booksOrMessages: string
  scheduleVisit: string
  appointmentBooked: string
  confirmationTexted: string
  urgent: string
  urgentQuote: string
  transferredTo: (name: string) => string
  contextAttached: string
  callAnswered: string
  team: { name: string; role: string }[]
  knowledgeSources: string
  sources: string[]
  synced: string
  readyToAnswer: string
  callSummary: string
  summaryService: string
  summaryNote: string
  jobBooked: string
  jobName: string
  serviceRequest: string
  estimate: string
  callHistory: string
  guardrails: string
  guardrailRules: string[]
  on: string
  yourServer: string
}

const en: ProductScenesCopy = {
  incomingCall: "Incoming call",
  teamUnavailable: "Team unavailable",
  ringTeam: "Ring your team",
  ringFor: "For 30 seconds",
  lobbystackAnswers: "LobbyStack answers",
  booksOrMessages: "Books or takes a message",
  scheduleVisit: "Schedule a visit",
  appointmentBooked: "Appointment booked",
  confirmationTexted: "Confirmation texted to the caller",
  urgent: "Urgent · needs a person",
  urgentQuote: "Water is coming through the ceiling. Can someone come today?",
  transferredTo: (name) => `Transferred to ${name}`,
  contextAttached: "Reason and contact details attached",
  callAnswered: "Call answered",
  team: [
    { name: "Mike Chen", role: "Technical" },
    { name: "Sarah Lopez", role: "Customer success" },
    { name: "Alex Martin", role: "Billing" },
  ],
  knowledgeSources: "Knowledge sources",
  sources: ["Website", "Services and prices", "Hours", "Policies (PDF)"],
  synced: "Synced",
  readyToAnswer: "Ready to answer callers",
  callSummary: "Call summary",
  summaryService: "Water heater repair",
  summaryNote: "First-time caller, wants a visit this week",
  jobBooked: "Job booked",
  jobName: "Kitchen faucet installation",
  serviceRequest: "Service request",
  estimate: "Estimate",
  callHistory: "Call history",
  guardrails: "AI guardrails",
  guardrailRules: ["Hand urgent calls to a person", "Never quote unlisted prices"],
  on: "On",
  yourServer: "Your server",
}

const fr: ProductScenesCopy = {
  incomingCall: "Appel entrant",
  teamUnavailable: "Équipe indisponible",
  ringTeam: "Sonner votre équipe",
  ringFor: "Pendant 30 secondes",
  lobbystackAnswers: "LobbyStack répond",
  booksOrMessages: "Réserve ou prend un message",
  scheduleVisit: "Planifier une visite",
  appointmentBooked: "Rendez-vous réservé",
  confirmationTexted: "Confirmation envoyée par texto",
  urgent: "Urgent · besoin d'une personne",
  urgentQuote: "De l'eau coule du plafond. Quelqu'un peut venir aujourd'hui?",
  transferredTo: (name) => `Transféré à ${name}`,
  contextAttached: "Motif et coordonnées joints",
  callAnswered: "Appel répondu",
  team: [
    { name: "Mike Chen", role: "Technique" },
    { name: "Sarah Lopez", role: "Service client" },
    { name: "Alex Martin", role: "Facturation" },
  ],
  knowledgeSources: "Sources de connaissances",
  sources: ["Site web", "Services et prix", "Heures d'ouverture", "Politiques (PDF)"],
  synced: "Synchronisé",
  readyToAnswer: "Prêt à répondre aux appelants",
  callSummary: "Résumé d'appel",
  summaryService: "Réparation de chauffe-eau",
  summaryNote: "Nouveau client, veut une visite cette semaine",
  jobBooked: "Travail réservé",
  jobName: "Installation d'un robinet de cuisine",
  serviceRequest: "Demande de service",
  estimate: "Soumission",
  callHistory: "Historique des appels",
  guardrails: "Garde-fous de l'IA",
  guardrailRules: ["Transmettre les urgences à une personne", "Ne jamais donner un prix non listé"],
  on: "Activé",
  yourServer: "Votre serveur",
}

const es: ProductScenesCopy = {
  incomingCall: "Llamada entrante",
  teamUnavailable: "Equipo no disponible",
  ringTeam: "Llamar a su equipo",
  ringFor: "Durante 30 segundos",
  lobbystackAnswers: "LobbyStack contesta",
  booksOrMessages: "Reserva o toma un mensaje",
  scheduleVisit: "Programar una visita",
  appointmentBooked: "Cita reservada",
  confirmationTexted: "Confirmación enviada por SMS",
  urgent: "Urgente · necesita a una persona",
  urgentQuote: "Entra agua por el techo. ¿Puede venir alguien hoy?",
  transferredTo: (name) => `Transferida a ${name}`,
  contextAttached: "Motivo y datos de contacto adjuntos",
  callAnswered: "Llamada atendida",
  team: [
    { name: "Mike Chen", role: "Soporte técnico" },
    { name: "Sarah Lopez", role: "Atención al cliente" },
    { name: "Alex Martin", role: "Facturación" },
  ],
  knowledgeSources: "Fuentes de conocimiento",
  sources: ["Sitio web", "Servicios y precios", "Horario", "Políticas (PDF)"],
  synced: "Sincronizado",
  readyToAnswer: "Listo para atender llamadas",
  callSummary: "Resumen de la llamada",
  summaryService: "Reparación de calentador",
  summaryNote: "Cliente nuevo, quiere una visita esta semana",
  jobBooked: "Trabajo reservado",
  jobName: "Instalación de grifo de cocina",
  serviceRequest: "Solicitud de servicio",
  estimate: "Presupuesto",
  callHistory: "Historial de llamadas",
  guardrails: "Límites de la IA",
  guardrailRules: ["Pasar las urgencias a una persona", "No dar precios que no estén en la lista"],
  on: "Activado",
  yourServer: "Su servidor",
}

const sr: ProductScenesCopy = {
  incomingCall: "Dolazni poziv",
  teamUnavailable: "Tim nije dostupan",
  ringTeam: "Pozovi tim",
  ringFor: "Tokom 30 sekundi",
  lobbystackAnswers: "LobbyStack odgovara",
  booksOrMessages: "Zakazuje ili prima poruku",
  scheduleVisit: "Zakaži posetu",
  appointmentBooked: "Termin zakazan",
  confirmationTexted: "Potvrda poslata SMS-om",
  urgent: "Hitno · potrebna je osoba",
  urgentQuote: "Voda curi sa plafona. Može li neko da dođe danas?",
  transferredTo: (name) => `Prebačeno: ${name}`,
  contextAttached: "Razlog i kontakt podaci priloženi",
  callAnswered: "Poziv primljen",
  team: [
    { name: "Mike Chen", role: "Tehnička podrška" },
    { name: "Sarah Lopez", role: "Korisnička podrška" },
    { name: "Alex Martin", role: "Naplata" },
  ],
  knowledgeSources: "Izvori znanja",
  sources: ["Sajt", "Usluge i cene", "Radno vreme", "Pravila (PDF)"],
  synced: "Sinhronizovano",
  readyToAnswer: "Spremno za odgovore pozivaocima",
  callSummary: "Rezime poziva",
  summaryService: "Popravka bojlera",
  summaryNote: "Novi klijent, želi posetu ove nedelje",
  jobBooked: "Posao zakazan",
  jobName: "Ugradnja kuhinjske slavine",
  serviceRequest: "Zahtev za uslugu",
  estimate: "Procena",
  callHistory: "Istorija poziva",
  guardrails: "Ograničenja AI",
  guardrailRules: ["Hitne pozive prebaci osobi", "Ne navodi cene kojih nema u listi"],
  on: "Uključeno",
  yourServer: "Vaš server",
}

const COPY_BY_LOCALE = { en, fr, es, sr } satisfies Record<Locale, ProductScenesCopy>

export function getProductScenesCopy(locale: Locale): ProductScenesCopy {
  return COPY_BY_LOCALE[locale]
}
