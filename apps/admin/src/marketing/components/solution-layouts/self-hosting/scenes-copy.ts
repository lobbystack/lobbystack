import type { Locale } from "@/marketing/i18n"

// The words inside the self-hosting pages' scenes, in every language. Code,
// file names, commands and environment variables stay as they are.

export type SelfHostingScenesCopy = {
  mitLicense: string
  licenseDetail: string
  yourAccounts: string
  yourServer: string
  dashboard: string
  dashboardDetail: string
  workerDetail: string
  caddyDetail: string
  data: string
  dataDetail: string
  running: string
  railwayTitle: string
  secretsGenerated: string
  toolsDetail: string
  appointmentBooked: string
  yourFork: string
  edited: string
  changes: [string, string, string]
}

const en: SelfHostingScenesCopy = {
  mitLicense: "MIT License",
  licenseDetail: "Use, change and share the code",
  yourAccounts: "Your accounts",
  yourServer: "Your server",
  dashboard: "Dashboard",
  dashboardDetail: "Admin app and API",
  workerDetail: "Runs calls and jobs",
  caddyDetail: "Routes your domain",
  data: "PostgreSQL and storage",
  dataDetail: "Recordings, transcripts, contacts",
  running: "Running",
  railwayTitle: "Deploy on Railway",
  secretsGenerated: "Secrets and passwords generated",
  toolsDetail: "The receptionist's tools",
  appointmentBooked: "Appointment booked",
  yourFork: "Your fork",
  edited: "Edited",
  changes: ["Greeting", "Intake questions", "Transfer rules"],
}

const fr: SelfHostingScenesCopy = {
  mitLicense: "Licence MIT",
  licenseDetail: "Utilisez, modifiez et partagez le code",
  yourAccounts: "Vos comptes",
  yourServer: "Votre serveur",
  dashboard: "Tableau de bord",
  dashboardDetail: "Application d’admin et API",
  workerDetail: "Exécute les appels et les tâches",
  caddyDetail: "Dessert votre domaine",
  data: "PostgreSQL et stockage",
  dataDetail: "Enregistrements, transcriptions, contacts",
  running: "En marche",
  railwayTitle: "Déployer sur Railway",
  secretsGenerated: "Secrets et mots de passe générés",
  toolsDetail: "Les outils du réceptionniste",
  appointmentBooked: "Rendez-vous réservé",
  yourFork: "Votre fork",
  edited: "Modifié",
  changes: ["Message d’accueil", "Questions à poser", "Règles de transfert"],
}

const es: SelfHostingScenesCopy = {
  mitLicense: "Licencia MIT",
  licenseDetail: "Use, modifique y comparta el código",
  yourAccounts: "Sus cuentas",
  yourServer: "Su servidor",
  dashboard: "Panel",
  dashboardDetail: "App de administración y API",
  workerDetail: "Atiende llamadas y tareas",
  caddyDetail: "Sirve su dominio",
  data: "PostgreSQL y almacenamiento",
  dataDetail: "Grabaciones, transcripciones, contactos",
  running: "En ejecución",
  railwayTitle: "Desplegar en Railway",
  secretsGenerated: "Secretos y contraseñas generados",
  toolsDetail: "Las herramientas de la recepcionista",
  appointmentBooked: "Cita reservada",
  yourFork: "Su fork",
  edited: "Editado",
  changes: ["Saludo", "Preguntas iniciales", "Transferencias"],
}

const sr: SelfHostingScenesCopy = {
  mitLicense: "MIT licenca",
  licenseDetail: "Koristite, menjajte i delite kod",
  yourAccounts: "Vaši nalozi",
  yourServer: "Vaš server",
  dashboard: "Kontrolna tabla",
  dashboardDetail: "Admin aplikacija i API",
  workerDetail: "Vodi pozive i zadatke",
  caddyDetail: "Opslužuje Vaš domen",
  data: "PostgreSQL i skladište",
  dataDetail: "Snimci, transkripti, kontakti",
  running: "Radi",
  railwayTitle: "Postavite na Railway",
  secretsGenerated: "Tajne i lozinke su generisane",
  toolsDetail: "Alati recepcionera",
  appointmentBooked: "Termin je zakazan",
  yourFork: "Vaš fork",
  edited: "Izmenjeno",
  changes: ["Pozdrav", "Uvodna pitanja", "Pravila prosleđivanja"],
}

const copy: Record<Locale, SelfHostingScenesCopy> = { en, fr, es, sr }

export function getSelfHostingScenesCopy(locale: Locale) {
  return copy[locale]
}
