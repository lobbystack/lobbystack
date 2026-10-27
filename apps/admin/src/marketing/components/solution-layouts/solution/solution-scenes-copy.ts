import type { Locale } from "@/marketing/i18n"

// The words inside the solution pages' own scenes, in every site language.
// Businesses and people in them are made up.

export type SolutionScenesCopy = {
  yourNumber: string
  forwardRules: [string, string, string]
  lobbystackAnswers: string
  whoAnswers: string
  open: string
  closed: string
  weekends: string
  allDay: string
  yourTeam: string
  lobbystack: string
  sameNumber: string
  overnightCalls: string
  overnight: { reason: string; outcome: string }[]
  morningSummary: string
  morningDetail: string
  businessName: string
  textsFrom: string
  confirmationText: (when: string) => string
  dayBefore: string
  reminderText: (time: string) => string
  confirmed: string
  codeChecked: string
  codeDetail: string
  appointmentMoved: string
  movedService: string
  callOpens: string
  defaultLanguage: string
  switchedTo: string
  callerLine: string
  receptionistLine: string
  triageQuestions: string
  triage: { question: string; answer: string }[]
  transferredToDentist: string
  onCallDentist: string
  connected: string
  newPatientCall: string
  examBooked: string
  examDetail: string
  confirmationSent: string
}

const en: SolutionScenesCopy = {
  yourNumber: "Your number",
  forwardRules: ["Line busy", "No answer", "After close"],
  lobbystackAnswers: "LobbyStack answers",
  whoAnswers: "Who answers",
  open: "Open",
  closed: "Closed",
  weekends: "Weekends",
  allDay: "All day",
  yourTeam: "Your team",
  lobbystack: "LobbyStack",
  sameNumber: "Same business number",
  overnightCalls: "Overnight calls",
  overnight: [
    { reason: "Furnace tune-up", outcome: "Booked" },
    { reason: "Spam call", outcome: "Ended" },
    { reason: "No heat", outcome: "Transferred" },
    { reason: "Running toilet", outcome: "Booked" },
  ],
  morningSummary: "Ready this morning",
  morningDetail: "A summary and transcript for each call",
  businessName: "Harbor Plumbing",
  textsFrom: "Harbor Plumbing",
  confirmationText: (when) => `You're booked for ${when}. Reply STOP to opt out.`,
  dayBefore: "The day before",
  reminderText: (time) => `Reminder: your visit is tomorrow at ${time}.`,
  confirmed: "Confirmed",
  codeChecked: "Code checked",
  codeDetail: "Texted to the number on file",
  appointmentMoved: "Appointment moved",
  movedService: "Drain cleaning",
  callOpens: "Call opens",
  defaultLanguage: "English",
  switchedTo: "Switched to Spanish",
  callerLine: "¿Tienen citas el sábado?",
  receptionistLine: "Sí, tenemos a las 10:00.",
  triageQuestions: "Your triage questions",
  triage: [
    { question: "Swelling?", answer: "Yes" },
    { question: "Fever?", answer: "No" },
    { question: "Since when?", answer: "Last night" },
  ],
  transferredToDentist: "Transferred to Dr. Patel",
  onCallDentist: "On-call dentist",
  connected: "Connected",
  newPatientCall: "New patient",
  examBooked: "Exam and cleaning booked",
  examDetail: "Insurance and reason noted",
  confirmationSent: "Confirmation texted",
}

const fr: SolutionScenesCopy = {
  yourNumber: "Votre numéro",
  forwardRules: ["Ligne occupée", "Sans réponse", "Après la fermeture"],
  lobbystackAnswers: "LobbyStack répond",
  whoAnswers: "Qui répond",
  open: "Ouvert",
  closed: "Fermé",
  weekends: "Fins de semaine",
  allDay: "Toute la journée",
  yourTeam: "Votre équipe",
  lobbystack: "LobbyStack",
  sameNumber: "Le même numéro d'entreprise",
  overnightCalls: "Appels de la nuit",
  overnight: [
    { reason: "Entretien de fournaise", outcome: "Réservé" },
    { reason: "Appel indésirable", outcome: "Terminé" },
    { reason: "Plus de chauffage", outcome: "Transféré" },
    { reason: "Toilette qui coule", outcome: "Réservé" },
  ],
  morningSummary: "Prêt ce matin",
  morningDetail: "Un résumé et une transcription par appel",
  businessName: "Harbor Plumbing",
  textsFrom: "Harbor Plumbing",
  confirmationText: (when) => `Votre rendez-vous est réservé : ${when}. Répondez STOP pour vous désabonner.`,
  dayBefore: "La veille",
  reminderText: (time) => `Rappel : votre visite est demain à ${time}.`,
  confirmed: "Confirmé",
  codeChecked: "Code vérifié",
  codeDetail: "Envoyé par texto au numéro du dossier",
  appointmentMoved: "Rendez-vous déplacé",
  movedService: "Débouchage de drain",
  callOpens: "L'appel commence",
  defaultLanguage: "Français",
  switchedTo: "Passé à l'espagnol",
  callerLine: "¿Tienen citas el sábado?",
  receptionistLine: "Sí, tenemos a las 10:00.",
  triageQuestions: "Vos questions de triage",
  triage: [
    { question: "Enflure?", answer: "Oui" },
    { question: "Fièvre?", answer: "Non" },
    { question: "Depuis quand?", answer: "Hier soir" },
  ],
  transferredToDentist: "Transféré à la Dre Patel",
  onCallDentist: "Dentiste de garde",
  connected: "Connecté",
  newPatientCall: "Nouveau patient",
  examBooked: "Examen et nettoyage réservés",
  examDetail: "Assurance et motif notés",
  confirmationSent: "Confirmation par texto",
}

const es: SolutionScenesCopy = {
  yourNumber: "Su número",
  forwardRules: ["Línea ocupada", "Sin respuesta", "Después del cierre"],
  lobbystackAnswers: "LobbyStack contesta",
  whoAnswers: "Quién contesta",
  open: "Abierto",
  closed: "Cerrado",
  weekends: "Fines de semana",
  allDay: "Todo el día",
  yourTeam: "Su equipo",
  lobbystack: "LobbyStack",
  sameNumber: "El mismo número del negocio",
  overnightCalls: "Llamadas de la noche",
  overnight: [
    { reason: "Mantenimiento de calefacción", outcome: "Reservada" },
    { reason: "Llamada de spam", outcome: "Terminada" },
    { reason: "Sin calefacción", outcome: "Transferida" },
    { reason: "Inodoro que gotea", outcome: "Reservada" },
  ],
  morningSummary: "Listo esta mañana",
  morningDetail: "Un resumen y una transcripción por llamada",
  businessName: "Harbor Plumbing",
  textsFrom: "Harbor Plumbing",
  confirmationText: (when) => `Su cita quedó para el ${when}. Responda STOP para darse de baja.`,
  dayBefore: "El día anterior",
  reminderText: (time) => `Recordatorio: su visita es mañana a las ${time}.`,
  confirmed: "Confirmada",
  codeChecked: "Código verificado",
  codeDetail: "Enviado por SMS al número registrado",
  appointmentMoved: "Cita cambiada",
  movedService: "Destape de drenaje",
  callOpens: "La llamada empieza",
  defaultLanguage: "Inglés",
  switchedTo: "Cambió al español",
  callerLine: "¿Tienen citas el sábado?",
  receptionistLine: "Sí, tenemos a las 10:00.",
  triageQuestions: "Sus preguntas de triaje",
  triage: [
    { question: "¿Hinchazón?", answer: "Sí" },
    { question: "¿Fiebre?", answer: "No" },
    { question: "¿Desde cuándo?", answer: "Anoche" },
  ],
  transferredToDentist: "Transferida a la Dra. Patel",
  onCallDentist: "Dentista de guardia",
  connected: "Conectada",
  newPatientCall: "Paciente nuevo",
  examBooked: "Examen y limpieza reservados",
  examDetail: "Seguro y motivo anotados",
  confirmationSent: "Confirmación por SMS",
}

const sr: SolutionScenesCopy = {
  yourNumber: "Vaš broj",
  forwardRules: ["Linija zauzeta", "Bez odgovora", "Posle radnog vremena"],
  lobbystackAnswers: "LobbyStack odgovara",
  whoAnswers: "Ko odgovara",
  open: "Otvoreno",
  closed: "Zatvoreno",
  weekends: "Vikendom",
  allDay: "Ceo dan",
  yourTeam: "Vaš tim",
  lobbystack: "LobbyStack",
  sameNumber: "Isti poslovni broj",
  overnightCalls: "Noćni pozivi",
  overnight: [
    { reason: "Servis peći", outcome: "Zakazano" },
    { reason: "Neželjeni poziv", outcome: "Prekinut" },
    { reason: "Nema grejanja", outcome: "Preusmeren" },
    { reason: "Vodokotlić curi", outcome: "Zakazano" },
  ],
  morningSummary: "Spremno jutros",
  morningDetail: "Rezime i transkript za svaki poziv",
  businessName: "Harbor Plumbing",
  textsFrom: "Harbor Plumbing",
  confirmationText: (when) => `Vaš termin je zakazan: ${when}. Odgovorite STOP da se odjavite.`,
  dayBefore: "Dan ranije",
  reminderText: (time) => `Podsetnik: Vaša poseta je sutra u ${time}.`,
  confirmed: "Potvrđeno",
  codeChecked: "Kôd proveren",
  codeDetail: "Poslat SMS-om na broj iz evidencije",
  appointmentMoved: "Termin pomeren",
  movedService: "Čišćenje odvoda",
  callOpens: "Poziv počinje",
  defaultLanguage: "Srpski",
  switchedTo: "Prešao na španski",
  callerLine: "¿Tienen citas el sábado?",
  receptionistLine: "Sí, tenemos a las 10:00.",
  triageQuestions: "Vaša pitanja za trijažu",
  triage: [
    { question: "Otok?", answer: "Da" },
    { question: "Temperatura?", answer: "Ne" },
    { question: "Od kada?", answer: "Od sinoć" },
  ],
  transferredToDentist: "Preusmeren dr Patel",
  onCallDentist: "Dežurni stomatolog",
  connected: "Povezano",
  newPatientCall: "Novi pacijent",
  examBooked: "Pregled i čišćenje zakazani",
  examDetail: "Osiguranje i razlog zabeleženi",
  confirmationSent: "Potvrda poslata SMS-om",
}

const copy = { en, fr, es, sr } satisfies Record<Locale, SolutionScenesCopy>

export function getSolutionScenesCopy(locale: Locale): SolutionScenesCopy {
  return copy[locale] ?? en
}
