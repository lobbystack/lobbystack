import { v } from "convex/values";

export type RuntimeLocale = "en" | "fr";
export type RuntimeLocaleDetection = RuntimeLocale | "unknown";
export type RuntimeLocaleSource =
  | "business_default"
  | "contact_preference"
  | "explicit_customer"
  | "detected_conversation";

export const runtimeLocaleValidator = v.union(v.literal("en"), v.literal("fr"));
export const runtimeLocaleSourceValidator = v.union(
  v.literal("business_default"),
  v.literal("contact_preference"),
  v.literal("explicit_customer"),
  v.literal("detected_conversation"),
);

const AMBIGUOUS_SHORT_MESSAGES = new Set([
  "ok",
  "okay",
  "yes",
  "yeah",
  "yep",
  "oui",
  "allo",
  "hello",
  "hi",
  "bonjour",
  "salut",
  "merci",
]);

const ENGLISH_MARKERS = [
  "what time",
  "do you have",
  "can i book",
  "i need to",
  "please answer in english",
  "speak english",
  "in english",
  "book an appointment",
  "closing hours",
  "reschedule",
  "cancel my appointment",
];

const FRENCH_MARKERS = [
  "quelle heure",
  "est ce que vous",
  "est-ce que vous",
  "je voudrais",
  "j aimerais",
  "j'aimerais",
  "en francais",
  "en français",
  "parlez francais",
  "parlez français",
  "reponds en francais",
  "réponds en français",
  "prendre rendez vous",
  "prendre rendez-vous",
  "heures d ouverture",
  "heures d'ouverture",
  "annuler mon rendez vous",
  "annuler mon rendez-vous",
];

const ENGLISH_TOKENS = new Set([
  "appointment",
  "book",
  "booking",
  "hours",
  "open",
  "close",
  "closing",
  "schedule",
  "available",
  "availability",
  "english",
  "please",
  "reminder",
  "reschedule",
  "cancel",
]);

const FRENCH_TOKENS = new Set([
  "rendez",
  "vous",
  "horaire",
  "horaires",
  "ouvert",
  "ouverte",
  "ferme",
  "fermez",
  "fermeture",
  "francais",
  "français",
  "disponible",
  "disponibilite",
  "disponibilité",
  "aujourd",
  "demain",
  "annuler",
  "reporter",
  "rappel",
]);

const LIST_FORMATTERS = {
  fr: new Intl.ListFormat("fr-CA", { style: "long", type: "conjunction" }),
} as const;

function foldLanguageText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeLanguageText(value: string): Array<string> {
  return foldLanguageText(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreLanguage(tokens: Array<string>, markers: Array<string>, keywords: Set<string>): number {
  const folded = tokens.join(" ");
  let score = 0;

  for (const marker of markers) {
    if (folded.includes(foldLanguageText(marker))) {
      score += 3;
    }
  }

  for (const token of tokens) {
    if (keywords.has(token)) {
      score += 1;
    }
  }

  return score;
}

function getLocaleTag(locale: RuntimeLocale): string {
  return locale === "fr" ? "fr-CA" : "en-CA";
}

function formatEnglishRuntimeTime(date: Date, options: { timeZone: string }): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: options.timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function normalizeRuntimeLocale(value: string | null | undefined): RuntimeLocale | null {
  if (value === "en" || value === "fr") {
    return value;
  }
  return null;
}

export function resolveRuntimeLocale(
  value: string | null | undefined,
  fallback: RuntimeLocale = "en",
): RuntimeLocale {
  return normalizeRuntimeLocale(value) ?? fallback;
}

export function getRuntimeLanguageName(locale: RuntimeLocale): string {
  return locale === "fr" ? "French" : "English";
}

export function detectExplicitRuntimeLocaleRequest(text: string): RuntimeLocale | null {
  const normalized = foldLanguageText(text);

  if (
    /\b(en francais|francais svp|reponds en francais|parle en francais|parlez francais|french please|in french|speak french)\b/u.test(
      normalized,
    )
  ) {
    return "fr";
  }

  if (
    /\b(in english|english please|please answer in english|speak english|answer in english)\b/u.test(
      normalized,
    )
  ) {
    return "en";
  }

  return null;
}

export function classifyRuntimeLocale(text: string): RuntimeLocaleDetection {
  const explicit = detectExplicitRuntimeLocaleRequest(text);
  if (explicit) {
    return explicit;
  }

  const tokens = tokenizeLanguageText(text);
  if (tokens.length === 0) {
    return "unknown";
  }

  if (
    tokens.length <= 2 &&
    tokens.every((token) => AMBIGUOUS_SHORT_MESSAGES.has(token))
  ) {
    return "unknown";
  }

  const englishScore = scoreLanguage(tokens, ENGLISH_MARKERS, ENGLISH_TOKENS);
  const frenchScore = scoreLanguage(tokens, FRENCH_MARKERS, FRENCH_TOKENS);

  if (frenchScore >= 3 && frenchScore > englishScore) {
    return "fr";
  }

  if (englishScore >= 3 && englishScore > frenchScore) {
    return "en";
  }

  return "unknown";
}

export function formatRuntimeDateLabel(
  startsAt: string,
  timezone: string,
  locale: RuntimeLocale,
): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return startsAt;
  }

  return new Intl.DateTimeFormat(getLocaleTag(locale), {
    timeZone: timezone,
    weekday: "long",
    month: locale === "fr" ? "long" : "short",
    day: "numeric",
  }).format(date);
}

export function formatRuntimeWeekday(
  startsAt: string,
  timezone: string,
  locale: RuntimeLocale,
): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return startsAt;
  }

  return new Intl.DateTimeFormat(getLocaleTag(locale), {
    timeZone: timezone,
    weekday: "long",
  }).format(date);
}

export function formatRuntimeAppointmentDateTime(
  startsAt: string,
  timezone: string,
  locale: RuntimeLocale,
): string {
  const dateText = formatRuntimeDateLabel(startsAt, timezone, locale);
  const timeText = formatRuntimeTimeFromIso(startsAt, timezone, locale);
  return locale === "fr" ? `${dateText} à ${timeText}` : `${dateText} at ${timeText}`;
}

export function formatRuntimeTimeFromIso(
  startsAt: string,
  timezone: string,
  locale: RuntimeLocale,
): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return startsAt;
  }

  if (locale === "en") {
    return formatEnglishRuntimeTime(date, { timeZone: timezone });
  }

  return new Intl.DateTimeFormat(getLocaleTag(locale), {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRuntimeTimeOfDay(
  totalMinutes: number,
  locale: RuntimeLocale,
): string {
  const reference = new Date(
    Date.UTC(2026, 0, 1, Math.floor(totalMinutes / 60), totalMinutes % 60),
  );

  if (locale === "en") {
    return formatEnglishRuntimeTime(reference, { timeZone: "UTC" });
  }

  return new Intl.DateTimeFormat(getLocaleTag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(reference);
}

export function describeRuntimeTimePreference(
  input: {
    hour24: number;
    minute: number;
    approximate: boolean;
  },
  locale: RuntimeLocale,
): string {
  if (!input.approximate) {
    return formatRuntimeTimeOfDay(input.hour24 * 60 + input.minute, locale);
  }

  if (input.hour24 === 10) {
    return locale === "fr" ? "le matin" : "the morning";
  }
  if (input.hour24 === 12) {
    return locale === "fr" ? "midi" : "noon";
  }
  if (input.hour24 === 14) {
    return locale === "fr" ? "l'après-midi" : "the afternoon";
  }
  if (input.hour24 === 18) {
    return locale === "fr" ? "la soirée" : "the evening";
  }

  return formatRuntimeTimeOfDay(input.hour24 * 60 + input.minute, locale);
}

export function formatRuntimeTimeList(times: Array<string>, locale: RuntimeLocale): string {
  if (locale === "en") {
    return times.join(", ");
  }

  return LIST_FORMATTERS.fr.format(times);
}

export function buildLocalizedAppointmentNotificationBody(input: {
  kind: "appointment_reminder" | "booking_confirmation";
  serviceName: string;
  startsAt: string;
  timezone: string;
  locale: RuntimeLocale;
}): string {
  const formattedTime = formatRuntimeAppointmentDateTime(
    input.startsAt,
    input.timezone,
    input.locale,
  );

  if (input.locale === "fr") {
    return input.kind === "appointment_reminder"
      ? `Rappel : votre rendez-vous pour ${input.serviceName} est prévu ${formattedTime}. Répondez à ce message si vous devez le reporter.`
      : `Votre rendez-vous pour ${input.serviceName} est confirmé pour ${formattedTime}. Répondez à ce message si vous devez le reporter.`;
  }

  return input.kind === "appointment_reminder"
    ? `Reminder: your ${input.serviceName} appointment is ${formattedTime}. Reply if you need to reschedule.`
    : `Your ${input.serviceName} appointment is booked for ${formattedTime}. Reply if you need to reschedule.`;
}
