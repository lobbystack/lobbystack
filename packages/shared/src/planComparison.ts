import { billingPlanCatalog, contentRetentionDaysByPlan } from "./billing";
import type { PlanCardLocale } from "./planCards";

/**
 * The plan comparison table shown on the pricing page and in onboarding.
 * Allowances, rates and retention come from the billing catalog; the words live here once.
 */
export type ComparisonValue = boolean | string | { included: string; then?: string };
export type ComparisonRow = { feature: string; free: ComparisonValue; starter: ComparisonValue; pro: ComparisonValue; enterprise: ComparisonValue };
export type ComparisonGroup = { category: string; rows: ComparisonRow[] };

type Feature =
  | "voiceMinutes" | "outboundCalls" | "alertSms" | "knowledgeStorage" | "phoneNumbers"
  | "callAnswering" | "callerDetails" | "knowledgeAnswers" | "workflows" | "spamFiltering" | "shortCalls" | "concurrentCalls" | "multilingual"
  | "appointmentBooking" | "confirmationTexts" | "googleCalendar"
  | "urgentHandoff" | "callTransfers" | "afterHours"
  | "emailNotifications" | "smsNotifications"
  | "summaries" | "history" | "callerProfiles" | "contacts" | "websiteImport"
  | "hosting" | "usageBilling" | "support";

type Copy = {
  groups: [string, string, string, string, string, string, string];
  features: Record<Feature, string>;
  /** "Included" agrees with the noun in French: minutes and attempts are feminine, segments masculine. */
  included: (count: number, gender: "f" | "m") => string;
  then: (rate: string, unit: "min" | "attempt" | "segment") => string;
  rate: (cents: number) => string;
  megabytes: (count: number) => string;
  days: (count: number) => string;
  /** Booking is feminine in French and Spanish; summaries, history and contacts are masculine plural. */
  unlimited: { f: string; m: string };
  custom: string;
  multiple: string;
  trialDays: string;
  freeForDays: string;
  dedicated: string;
  managedCloud: string;
  cloudOrSelfHosted: string;
  support: { community: string; email: string; priority: string; dedicated: string };
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

const copy: Record<PlanCardLocale, Copy> = {
  en: {
    groups: ["Usage & limits", "Core receptionist", "Booking", "Routing & transfers", "Notifications & messaging", "Data & dashboard", "Deployment & support"],
    features: {
      voiceMinutes: "Voice minutes", outboundCalls: "Transfer attempts", alertSms: "Alert SMS segments", knowledgeStorage: "Knowledge base", phoneNumbers: "Phone numbers",
      callAnswering: "24/7 call answering", callerDetails: "Caller details and message capture", knowledgeAnswers: "Knowledge base answers", workflows: "Plain-language workflows", spamFiltering: "Spam filtering", shortCalls: "Calls under 10s excluded from billing", concurrentCalls: "Unlimited concurrent calls", multilingual: "Answers in the caller's language",
      appointmentBooking: "Appointment booking", confirmationTexts: "Appointment confirmation texts", googleCalendar: "Google Calendar integration",
      urgentHandoff: "Urgent call handoff", callTransfers: "Call transfers", afterHours: "After-hours answering",
      emailNotifications: "Email notifications", smsNotifications: "SMS notifications",
      summaries: "Call summaries and transcripts", history: "Call history and recordings", callerProfiles: "Caller profiles and notes", contacts: "Contacts", websiteImport: "Website knowledge import",
      hosting: "Hosting", usageBilling: "Usage-based overages", support: "Support",
    },
    included: (count) => `${count} included`,
    then: (rate, unit) => `then ${rate}/${unit}`,
    rate: (cents) => `$${dollars(cents)}`,
    megabytes: (count) => `${count} MB`,
    days: (count) => `${count} days`,
    unlimited: { f: "Unlimited", m: "Unlimited" },
    custom: "Custom", multiple: "Multiple", trialDays: "For 14 days", freeForDays: "Free for 14 days", dedicated: "1 dedicated",
    managedCloud: "Managed cloud", cloudOrSelfHosted: "Cloud or self-hosted",
    support: { community: "Community", email: "Email", priority: "Priority email", dedicated: "Dedicated implementation" },
  },
  fr: {
    groups: ["Usage et limites", "Réceptionniste IA", "Rendez-vous", "Routage et transferts", "Notifications et messagerie", "Données et tableau de bord", "Hébergement et support"],
    features: {
      voiceMinutes: "Minutes vocales", outboundCalls: "Tentatives de transfert", alertSms: "Segments SMS d'alerte", knowledgeStorage: "Base de connaissances", phoneNumbers: "Numéros de téléphone",
      callAnswering: "Réponse aux appels 24/7", callerDetails: "Collecte des détails et messages", knowledgeAnswers: "Réponses depuis la base de connaissances", workflows: "Consignes en langage naturel", spamFiltering: "Filtrage du spam", shortCalls: "Appels de moins de 10 s exclus de la facturation", concurrentCalls: "Appels simultanés illimités", multilingual: "Répond dans la langue de l'appelant",
      appointmentBooking: "Prise de rendez‑vous", confirmationTexts: "SMS de confirmation de rendez‑vous", googleCalendar: "Intégration Google Calendar",
      urgentHandoff: "Transfert des appels urgents", callTransfers: "Transferts d'appel", afterHours: "Réponse hors horaires",
      emailNotifications: "Notifications par courriel", smsNotifications: "Notifications SMS",
      summaries: "Résumés et transcriptions d’appels", history: "Historique et enregistrements d'appels", callerProfiles: "Profils et notes d'appelants", contacts: "Contacts", websiteImport: "Import de connaissances depuis le site web",
      hosting: "Hébergement", usageBilling: "Dépassements à l’usage", support: "Support",
    },
    included: (count, gender) => `${count} ${gender === "f" ? "incluses" : "inclus"}`,
    then: (rate, unit) => `puis ${rate}/${unit === "attempt" ? "tentative" : unit}`,
    rate: (cents) => `${dollars(cents).replace(".", ",")} $`,
    megabytes: (count) => `${count} Mo`,
    days: (count) => `${count} jours`,
    unlimited: { f: "Illimitée", m: "Illimités" },
    custom: "Sur mesure", multiple: "Plusieurs", trialDays: "Pendant 14 jours", freeForDays: "Gratuit 14 jours", dedicated: "1 dédié",
    managedCloud: "Cloud géré", cloudOrSelfHosted: "Cloud ou auto-hébergé",
    support: { community: "Communauté", email: "Courriel", priority: "Courriel prioritaire", dedicated: "Implémentation dédiée" },
  },
  es: {
    groups: ["Uso y límites", "Funciones de recepción", "Reservas", "Enrutamiento y transferencias", "Notificaciones y mensajes", "Datos y panel", "Implementación y soporte"],
    features: {
      voiceMinutes: "Minutos de voz", outboundCalls: "Intentos de transferencia", alertSms: "Segmentos de SMS de alerta", knowledgeStorage: "Base de conocimiento", phoneNumbers: "Números de teléfono",
      callAnswering: "Atención de llamadas 24/7", callerDetails: "Datos y mensajes de quien llama", knowledgeAnswers: "Respuestas desde la base de conocimiento", workflows: "Flujos de trabajo en lenguaje sencillo", spamFiltering: "Filtro de spam", shortCalls: "Llamadas de menos de 10 s excluidas de la facturación", concurrentCalls: "Llamadas simultáneas ilimitadas", multilingual: "Responde en el idioma de quien llama",
      appointmentBooking: "Reserva de citas", confirmationTexts: "SMS de confirmación de citas", googleCalendar: "Integración con Google Calendar",
      urgentHandoff: "Derivación de llamadas urgentes", callTransfers: "Transferencias de llamadas", afterHours: "Atención fuera de horario",
      emailNotifications: "Notificaciones por correo electrónico", smsNotifications: "Notificaciones por SMS",
      summaries: "Resúmenes y transcripciones de llamadas", history: "Historial y grabaciones de llamadas", callerProfiles: "Perfiles y notas de quienes llaman", contacts: "Contactos", websiteImport: "Importación de conocimiento desde el sitio web",
      hosting: "Alojamiento", usageBilling: "Excedentes según el uso", support: "Soporte",
    },
    included: (count) => `${count} incluidos`,
    then: (rate, unit) => `luego ${rate}/${unit === "attempt" ? "intento" : unit === "segment" ? "segmento" : unit}`,
    rate: (cents) => `$${dollars(cents)}`,
    megabytes: (count) => `${count} MB`,
    days: (count) => `${count} días`,
    unlimited: { f: "Ilimitada", m: "Ilimitados" },
    custom: "A medida", multiple: "Varios", trialDays: "Durante 14 días", freeForDays: "Gratis 14 días", dedicated: "1 dedicado",
    managedCloud: "Nube gestionada", cloudOrSelfHosted: "Nube o autoalojamiento",
    support: { community: "Comunidad", email: "Correo electrónico", priority: "Correo prioritario", dedicated: "Implementación dedicada" },
  },
  sr: {
    groups: ["Potrošnja i limiti", "Osnovne funkcije recepcionera", "Zakazivanje", "Rutiranje i preusmeravanje", "Obaveštenja i poruke", "Podaci i kontrolna tabla", "Hosting i podrška"],
    features: {
      voiceMinutes: "Minuti razgovora", outboundCalls: "Pokušaji preusmeravanja", alertSms: "Segmenti SMS upozorenja", knowledgeStorage: "Baza znanja", phoneNumbers: "Brojevi telefona",
      callAnswering: "Odgovaranje na pozive 24/7", callerDetails: "Beleženje podataka i poruka pozivalaca", knowledgeAnswers: "Odgovori iz baze znanja", workflows: "Tokovi rada opisani običnim jezikom", spamFiltering: "Filtriranje spama", shortCalls: "Pozivi kraći od 10 s se ne naplaćuju", concurrentCalls: "Neograničen broj istovremenih poziva", multilingual: "Odgovara na jeziku pozivaoca",
      appointmentBooking: "Zakazivanje termina", confirmationTexts: "SMS potvrde termina", googleCalendar: "Google Calendar integracija",
      urgentHandoff: "Prosleđivanje hitnih poziva", callTransfers: "Preusmeravanje poziva", afterHours: "Odgovaranje van radnog vremena",
      emailNotifications: "Obaveštenja e-poštom", smsNotifications: "SMS obaveštenja",
      summaries: "Rezimei i transkripti poziva", history: "Istorija i snimci poziva", callerProfiles: "Profili i beleške pozivalaca", contacts: "Kontakti", websiteImport: "Uvoz znanja sa sajta",
      hosting: "Hosting", usageBilling: "Prekoračenja prema potrošnji", support: "Podrška",
    },
    included: (count) => `${count} uključeno`,
    then: (rate, unit) => `zatim ${rate}/${unit === "attempt" ? "pokušaj" : unit}`,
    rate: (cents) => `$${dollars(cents)}`,
    megabytes: (count) => `${count} MB`,
    days: (count) => `${count} dana`,
    unlimited: { f: "Neograničeno", m: "Neograničeno" },
    custom: "Po dogovoru", multiple: "Više", trialDays: "Tokom 14 dana", freeForDays: "Besplatno 14 dana", dedicated: "1 namenski",
    managedCloud: "Upravljani cloud", cloudOrSelfHosted: "Cloud ili samostalno hostovanje",
    support: { community: "Zajednica", email: "E-pošta", priority: "Prioritetna e-pošta", dedicated: "Posvećena implementacija" },
  },
};

const { free_cloud: free, starter, pro } = billingPlanCatalog;

export function planComparison(locale: string): ComparisonGroup[] {
  const c = copy[(locale.slice(0, 2) as PlanCardLocale)] ?? copy.en;
  const row = (feature: Feature, free: ComparisonValue, paid: ComparisonValue | { starter: ComparisonValue; pro: ComparisonValue }, enterprise: ComparisonValue = true): ComparisonRow => {
    const split = typeof paid === "object" && "starter" in paid ? paid : { starter: paid, pro: paid };
    return { feature: c.features[feature], free, starter: split.starter, pro: split.pro, enterprise };
  };
  const allowance = (count: number, rateCents: number, unit: "min" | "attempt" | "segment", gender: "f" | "m") => ({ included: c.included(count, gender), then: c.then(c.rate(rateCents), unit) });
  const mb = (bytes: number) => c.megabytes(bytes / (1024 * 1024));
  return [
    { category: c.groups[0], rows: [
      row("voiceMinutes", { included: c.included(free.voiceSecondsIncluded / 60, "f") }, { starter: allowance(starter.voiceSecondsIncluded / 60, starter.voiceOverageRatePerMinuteCents, "min", "f"), pro: allowance(pro.voiceSecondsIncluded / 60, pro.voiceOverageRatePerMinuteCents, "min", "f") }, c.custom),
      row("outboundCalls", false, { starter: allowance(starter.outboundCallAttemptsIncluded, starter.outboundCallAttemptOverageRateCents, "attempt", "f"), pro: allowance(pro.outboundCallAttemptsIncluded, pro.outboundCallAttemptOverageRateCents, "attempt", "f") }, c.custom),
      row("alertSms", false, { starter: allowance(starter.alertSmsSegmentsIncluded, starter.alertSmsOverageRatePerSegmentCents, "segment", "m"), pro: allowance(pro.alertSmsSegmentsIncluded, pro.alertSmsOverageRatePerSegmentCents, "segment", "m") }, c.custom),
      row("knowledgeStorage", mb(free.knowledgeStorageBytes), { starter: mb(starter.knowledgeStorageBytes), pro: mb(pro.knowledgeStorageBytes) }, c.custom),
      row("phoneNumbers", c.freeForDays, c.dedicated, c.multiple),
    ] },
    { category: c.groups[1], rows: [
      row("callAnswering", c.trialDays, true),
      row("callerDetails", true, true),
      row("knowledgeAnswers", true, true),
      row("workflows", true, true),
      row("spamFiltering", true, true),
      row("shortCalls", true, true),
      row("concurrentCalls", true, true),
      row("multilingual", true, true),
    ] },
    { category: c.groups[2], rows: [
      row("appointmentBooking", c.unlimited.f, c.unlimited.f, c.unlimited.f),
      row("confirmationTexts", false, true),
      row("googleCalendar", true, true),
    ] },
    { category: c.groups[3], rows: [
      row("urgentHandoff", false, true),
      row("callTransfers", false, true),
      row("afterHours", false, true),
    ] },
    { category: c.groups[4], rows: [
      row("emailNotifications", true, true),
      row("smsNotifications", false, true),
    ] },
    { category: c.groups[5], rows: [
      row("summaries", c.unlimited.m, c.unlimited.m, c.unlimited.m),
      // Recordings and transcripts are deleted after the plan's retention period.
      row("history", c.days(contentRetentionDaysByPlan.free_cloud.recordings), { starter: c.days(contentRetentionDaysByPlan.starter.recordings), pro: c.days(contentRetentionDaysByPlan.pro.recordings) }, c.custom),
      row("callerProfiles", true, true),
      row("contacts", c.unlimited.m, c.unlimited.m, c.unlimited.m),
      row("websiteImport", true, true),
    ] },
    { category: c.groups[6], rows: [
      row("hosting", c.managedCloud, c.managedCloud, c.cloudOrSelfHosted),
      row("usageBilling", false, true),
      row("support", c.support.community, { starter: c.support.email, pro: c.support.priority }, c.support.dedicated),
    ] },
  ];
}
