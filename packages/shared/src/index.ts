import { z } from "zod";

export { isMaintenanceMode } from "./maintenance";
export { interfaceLocaleTags, interfaceLocales, intlLocale, isInterfaceLocale, isRuntimeLocale, normalizeInterfaceLocale, normalizeRuntimeLocale, runtimeLocaleName, runtimeLocales } from "./locales";
export type { InterfaceLocale, RuntimeLocale } from "./locales";
import { interfaceLocales, runtimeLocales, type InterfaceLocale, type RuntimeLocale } from "./locales";
import { appointmentChangeVerificationModes, bookingModes, transferModes } from "./receptionist";
import { WIDGET_COLOR_PATTERN, widgetPositionSchema, type WidgetPosition } from "./widget";
export * from "./receptionist";
export * from "./chatChannels";
export * from "./branding";
export * from "./brandLinks";
export { isCertificationMode, assertCertificationRecipient, assertCertificationOperationAllowed, assertCertificationCalendar, assertCertificationBillingSandbox } from "./certification";

export type DeploymentMode = "cloud" | "self_hosted_standard" | "development";

export const deploymentModes = [
  "cloud",
  "self_hosted_standard",
  "development",
] as const satisfies ReadonlyArray<DeploymentMode>;

/** The deployment mode a DEPLOYMENT_MODE value names, or undefined when it names none. */
export function parseDeploymentMode(value: string | undefined): DeploymentMode | undefined {
  const trimmed = value?.trim();
  return deploymentModes.find((mode) => mode === trimmed);
}

export const DEFAULT_WEB_CALL_MAX_DURATION_MS = 5 * 60 * 1000;
export const MAX_WEB_CALL_MAX_DURATION_MS = 30 * 60 * 1000;
/** The longest a GPT-Live phone call runs, and the most minutes one call reserves. */
export const MAX_PHONE_CALL_MS = 30 * 60 * 1000;
/**
 * A phone call reserves this many seconds at a time and the worker tops it up
 * while the call runs, so one call never holds a small plan's every minute.
 */
export const PHONE_RESERVATION_SLICE_SECONDS = 300;

/** Latency, tokens and cost of one AI model call, as AI generation events record them. */
export type AiUsage = {
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalCostUsd?: number;
  pricingVersion?: string;
  pricingSource?: string;
  pricingEffectiveDate?: string;
  ratesUsdPerMillionTokens?: Record<string, number>;
};

export type BusinessType =
  | "clinic"
  | "repair_shop"
  | "salon"
  | "service_company"
  | "other";

export type BusinessRole =
  | "platform_admin"
  | "business_owner"
  | "business_admin"
  | "scheduler"
  | "viewer";

export type HoursWindow = {
  dayOfWeek: number;
  openMinutes: number;
  closeMinutes: number;
};

export type ClosureWindow = {
  startsAt: string;
  endsAt: string;
  reason: string;
};

export type ServiceSummary = {
  id: string;
  name: string;
  localizedNames?: Partial<Record<RuntimeLocale, string>>;
  durationMinutes: number;
  description?: string;
  price?: ServicePrice;
};

export const servicePriceTypes = ["fixed", "from", "range", "in_person"] as const;
export type ServicePriceType = (typeof servicePriceTypes)[number];

/**
 * A service's price, in whole numbers of the currency's smallest unit: a fixed
 * price, a starting price, a range, or set in person once the business knows
 * the customer (no amount). discountPercent (above 0, up to 100) comes off every amount.
 */
export type ServicePrice =
  | { type: "fixed" | "from"; amountMinor: number; currency: string; discountPercent?: number }
  | { type: "range"; amountMinor: number; maxAmountMinor: number; currency: string; discountPercent?: number }
  | { type: "in_person" };

/** A service's stored price columns as a price, or undefined when the business hasn't set one. */
export function servicePriceFromColumns(row: { priceType: ServicePriceType; priceMinor: number | null; priceMaxMinor: number | null; discountPercent?: number }, currency: string): ServicePrice | undefined {
  if (row.priceType === "in_person") return { type: "in_person" };
  if (row.priceMinor === null) return undefined;
  const discount = row.discountPercent ? { discountPercent: row.discountPercent } : {};
  if (row.priceType === "range") return row.priceMaxMinor === null ? undefined : { type: "range", amountMinor: row.priceMinor, maxAmountMinor: row.priceMaxMinor, currency, ...discount };
  return { type: row.priceType, amountMinor: row.priceMinor, currency, ...discount };
}

/** An amount after a percentage discount, rounded to the currency's smallest unit. */
export function discountedAmount(amountMinor: number, discountPercent: number): number {
  return Math.round(amountMinor * (100 - discountPercent) / 100);
}

/** A discount from 0 to 100 percent, with at most two decimal places. */
export function isDiscountPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 && Math.abs(Math.round(value * 100) - value * 100) < 1e-9;
}

let currencyCodes: Set<string> | undefined;

/** Whether a value is a current ISO 4217 code, from the runtime's list of currencies. */
export function isCurrencyCode(value: unknown): value is string {
  currencyCodes ??= new Set(Intl.supportedValuesOf("currency"));
  return typeof value === "string" && currencyCodes.has(value);
}

// ISO 4217 minor units. Not read from Intl: browsers and Node disagree (Chrome gives RSD 0 decimals, Node 2),
// and the server and dashboard must agree on what a stored amount means.
const ZERO_DECIMAL_CURRENCIES = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** The digits after the decimal point prices in this currency use: 2 for EUR and RSD, 0 for JPY, 3 for KWD. */
export function currencyFractionDigits(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  return THREE_DECIMAL_CURRENCIES.has(currency) ? 3 : 2;
}

export type ServicePriceLabels = { from: (amount: string) => string; range: (min: string, max: string) => string; inPerson: string; discounted: (regular: string, percent: number, discounted: string) => string };

const ENGLISH_PRICE_LABELS: ServicePriceLabels = { from: (amount) => `from ${amount}`, range: (min, max) => `${min} to ${max}`, inPerson: "set in person", discounted: (regular, percent, discounted) => `${discounted} after a ${percent}% discount (regular ${regular})` };

/** An amount in the currency's smallest unit, as "RSD 700" in the given locale. */
export function formatPriceAmount(amountMinor: number, currency: string, locale = "en"): string {
  const digits = currencyFractionDigits(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: amountMinor % 10 ** digits === 0 ? 0 : digits, maximumFractionDigits: digits }).format(amountMinor / 10 ** digits).replace(/[\u00a0\u202f]/gu, " ");
}

/**
 * "RSD 700", "from RSD 700", "RSD 700 to RSD 1,000" or "set in person", in the
 * given locale. A discounted price gives the price after the discount, the
 * discount and the regular price.
 */
export function formatServicePrice(price: ServicePrice, locale = "en", labels: ServicePriceLabels = ENGLISH_PRICE_LABELS): string {
  if (price.type === "in_person") return labels.inPerson;
  const describe = (percent: number) => {
    const amount = formatPriceAmount(discountedAmount(price.amountMinor, percent), price.currency, locale);
    if (price.type === "from") return labels.from(amount);
    if (price.type === "range") return labels.range(amount, formatPriceAmount(discountedAmount(price.maxAmountMinor, percent), price.currency, locale));
    return amount;
  };
  return price.discountPercent ? labels.discounted(describe(0), price.discountPercent, describe(price.discountPercent)) : describe(0);
}

const TIMEZONE_CURRENCIES: Record<string, string> = {
  "Europe/Belgrade": "RSD", "Europe/London": "GBP", "Europe/Zurich": "CHF", "America/Mexico_City": "MXN",
  "America/Toronto": "CAD", "America/Vancouver": "CAD", "America/Edmonton": "CAD", "America/Winnipeg": "CAD", "America/Halifax": "CAD", "America/St_Johns": "CAD", "America/Regina": "CAD", "America/Montreal": "CAD",
};
const EURO_TIMEZONES = new Set(["Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Brussels", "Europe/Vienna", "Europe/Lisbon", "Europe/Dublin", "Europe/Athens", "Europe/Helsinki", "Europe/Ljubljana", "Europe/Zagreb", "Europe/Podgorica", "Europe/Luxembourg", "Europe/Bratislava", "Europe/Tallinn", "Europe/Riga", "Europe/Vilnius", "Europe/Malta", "Atlantic/Canary"]);

/** A new business's currency, from the timezone it picked. USD when the zone doesn't say. */
export function defaultCurrencyForTimezone(timezone: string): string {
  if (TIMEZONE_CURRENCIES[timezone]) return TIMEZONE_CURRENCIES[timezone];
  if (EURO_TIMEZONES.has(timezone)) return "EUR";
  if (timezone.startsWith("Australia/")) return "AUD";
  return "USD";
}

export type SnapshotEmployee = { name: string; services?: string[]; hours?: HoursWindow[]; timeOff?: Array<{ startsOn: string; endsOn: string }> };

export type TransferPolicy = {
  mode: (typeof transferModes)[number];
  transferNumber?: string;
};

export type AppointmentChangeVerificationMode = (typeof appointmentChangeVerificationModes)[number];

export type AppointmentChangePolicy = {
  enabled: boolean;
  allowCancel: boolean;
  allowReschedule: boolean;
  verificationMode: AppointmentChangeVerificationMode;
};

export const defaultAppointmentChangePolicy: AppointmentChangePolicy = {
  enabled: true,
  allowCancel: true,
  allowReschedule: true,
  verificationMode: "phone_match_and_facts",
};

const greetings: Record<RuntimeLocale, (name: string) => string> = {
  en: (name) => `Thanks for calling ${name}. How can I help you today?`,
  fr: (name) => `Merci d'avoir appelé ${name}. Comment puis-je vous aider aujourd'hui ?`,
  es: (name) => `Gracias por llamar a ${name}. ¿En qué puedo ayudarle hoy?`,
  sr: (name) => `Hvala što ste pozvali ${name}. Kako mogu da vam pomognem danas?`,
  de: (name) => `Vielen Dank für Ihren Anruf bei ${name}. Wie kann ich Ihnen heute helfen?`,
  pt: (name) => `Obrigado por ligar para ${name}. Como posso ajudar você hoje?`,
  it: (name) => `Grazie per aver chiamato ${name}. Come posso aiutarla oggi?`,
  nl: (name) => `Bedankt voor het bellen naar ${name}. Waarmee kan ik u vandaag helpen?`,
};

/**
 * A new business's greeting, in its caller language, which the call opens in.
 * It ends with a question so callers know it's their turn to talk.
 */
export function defaultGreeting(businessName: string, locale: RuntimeLocale = "en"): string {
  return greetings[locale](businessName.trim());
}

/**
 * Whether LobbyStack wrote this greeting for the language, so it can follow a
 * change of caller language. Businesses created before the default asked a
 * question have "Thanks for calling {name}."
 */
export function isDefaultGreeting(greeting: string, businessName: string, locale: RuntimeLocale): boolean {
  return greeting === defaultGreeting(businessName, locale) || (locale === "en" && greeting === `Thanks for calling ${businessName.trim()}.`);
}

/** Missing legacy policy uses the original defaults; malformed policies disable automation. */
export function normalizeAppointmentChangePolicy(value: unknown): AppointmentChangePolicy {
  if (value == null) return { ...defaultAppointmentChangePolicy };
  const policy = value as Partial<AppointmentChangePolicy>;
  if (typeof policy.enabled === "boolean" && typeof policy.allowCancel === "boolean" && typeof policy.allowReschedule === "boolean" && (appointmentChangeVerificationModes as readonly string[]).includes(policy.verificationMode ?? "")) {
    return { enabled: policy.enabled, allowCancel: policy.allowCancel, allowReschedule: policy.allowReschedule, verificationMode: policy.verificationMode! };
  }
  return { enabled: false, allowCancel: false, allowReschedule: false, verificationMode: "operator_only" };
}

export type KnowledgeSnippet = {
  id: string;
  title: string;
  content: string;
  tags: Array<string>;
  priority: number;
};

export type AgentRuleSummary = {
  id: string;
  title: string;
  content: string;
  order: number;
};

/** How the agent handles appointment requests. */
export type BookingMode = (typeof bookingModes)[number];

/** Unknown or missing values keep today's behavior: book directly. */
export function normalizeBookingMode(value: string | null | undefined): BookingMode {
  return (bookingModes as readonly string[]).includes(value ?? "") ? value as BookingMode : "instant";
}

export type BusinessContextSnapshot = {
  businessId: string;
  version: string;
  generatedAt: string;
  displayName: string;
  legalName?: string;
  timezone: string;
  defaultLocale: RuntimeLocale;
  businessType: BusinessType;
  /** Optional analytics consent captured at call start; absence is not consent. */
  telemetryEnabled?: boolean;
  greeting: string;
  voiceInstructions: string;
  smsInstructions: string;
  chatInstructions: string;
  summary: string;
  bookingPolicy: string;
  knowledgeDigest: string;
  transferPolicy: TransferPolicy;
  appointmentChangePolicy?: AppointmentChangePolicy;
  /** Absent in snapshots built before booking modes existed; treat as "instant". */
  bookingMode?: BookingMode;
  hours: Array<HoursWindow>;
  closures: Array<ClosureWindow>;
  services: Array<ServiceSummary>;
  /**
   * Employees a caller can ask for by name, with the services each does, their
   * own working hours when they don't work the business's, and their time off
   * that hasn't ended (inclusive YYYY-MM-DD days). Absent in snapshots built
   * before employees existed.
   */
  employees?: Array<SnapshotEmployee>;
  rules?: Array<AgentRuleSummary>;
  knowledgeSnippets?: Array<KnowledgeSnippet>;
  contactChannels: {
    phoneNumber?: string;
    /** The number customer texts come from: the shared sender on cloud, the business's own number when self-hosted. */
    smsNumber?: string;
    email?: string;
  };
};

export type AvailabilitySlot = {
  staffId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
};

export type AppointmentRequest = {
  serviceId: string;
  startsAt: string;
  timezone: string;
  preferredStaffId?: string;
};

export type SmsConversationInput = {
  businessId: string;
  conversationId: string;
  body: string;
  contactPhone: string;
};

export const demoBusinessId = "demo-clinic";

export const demoSnapshot: BusinessContextSnapshot = {
  businessId: demoBusinessId,
  version: "seed-v1",
  generatedAt: new Date("2026-03-08T00:00:00.000Z").toISOString(),
  displayName: "Maple Family Clinic",
  timezone: "America/Toronto",
  defaultLocale: "en",
  businessType: "clinic",
  greeting: "Thank you for calling Maple Family Clinic.",
  voiceInstructions:
    "Answer politely, keep medical responses administrative only, and transfer urgent issues.",
  smsInstructions:
    "Reply clearly in short SMS messages. Ask one question at a time when booking.",
  chatInstructions:
    "Be friendly and concise in the website chat widget. Answer in short paragraphs, use plain language, and invite callers to book or leave their details for follow-up.",
  summary:
    "A family clinic offering checkups, follow-ups, and vaccine appointments.",
  bookingPolicy: "Do not book same-day appointments after 4pm local time.",
  knowledgeDigest:
    "Front desk handles scheduling, referrals, and administrative questions. Parking is behind the building and urgent medical issues should be transferred.",
  transferPolicy: {
    mode: "on_urgent",
    transferNumber: "+14165551234",
  },
  appointmentChangePolicy: defaultAppointmentChangePolicy,
  hours: [
    { dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    { dayOfWeek: 2, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    { dayOfWeek: 3, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    { dayOfWeek: 4, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    { dayOfWeek: 5, openMinutes: 9 * 60, closeMinutes: 16 * 60 },
  ],
  closures: [],
  services: [
    { id: "svc-checkup", name: "General Checkup", durationMinutes: 30 },
    { id: "svc-vaccine", name: "Vaccination Visit", durationMinutes: 15 },
  ],
  rules: [
    {
      id: "rule-1",
      title: "Urgent escalation",
      content: "Transfer urgent medical issues before answering administrative questions.",
      order: 1000,
    },
  ],
  knowledgeSnippets: [
    {
      id: "snippet-1",
      title: "Parking",
      content: "Parking is available behind the building.",
      tags: ["parking"],
      priority: 10,
    },
  ],
  contactChannels: {
    phoneNumber: "+14165550000",
    smsNumber: "+14165550000",
    email: "frontdesk@mapleclinic.example",
  },
};

// Website chat widget contracts.
export { normalizeWidgetOrigin, WIDGET_COLOR_PATTERN, widgetEmbedSnippet, widgetPositions, widgetPositionSchema, type WidgetPosition } from "./widget";

/**
 * What the loader takes from the dashboard: the bubble look the key's config
 * sets, and the language the chat opens in.
 */
export type WidgetAppearance = { color?: string; position?: WidgetPosition; locale?: InterfaceLocale };

/** The global the keyed loader fills before its own code runs, one entry per widget key. */
export const WIDGET_APPEARANCE_GLOBAL = "__lobbyStackWidgetAppearance";

export type WidgetLeadFormConfig = {
  enabled: boolean;
  requirePhone?: boolean;
  requireEmail?: boolean;
  showBeforeChat?: boolean;
};

/**
 * Live chat with the team: during opening hours, a visitor who asks for a
 * person gets someone from the team in the chat, who replies from Messages.
 */
export type WidgetLiveChatConfig = {
  enabled: boolean;
};

export type WidgetConfig = {
  color?: string;
  position?: WidgetPosition;
  title?: string;
  subtitle?: string;
  greeting?: string;
  localeOverride?: InterfaceLocale;
  leadForm?: WidgetLeadFormConfig;
  liveChat?: WidgetLiveChatConfig;
};

export const defaultWidgetConfig: WidgetConfig = {
  position: "bottom-right",
  title: "",
  leadForm: { enabled: false, requirePhone: false, requireEmail: false, showBeforeChat: false },
  liveChat: { enabled: false },
};

export const widgetLeadFormConfigSchema = z.object({
  enabled: z.boolean(),
  requirePhone: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  showBeforeChat: z.boolean().optional(),
});

export const widgetConfigSchema = z.object({
  color: z.string().regex(WIDGET_COLOR_PATTERN).optional(),
  position: widgetPositionSchema.optional(),
  title: z.string().max(160).optional(),
  subtitle: z.string().max(320).optional(),
  greeting: z.string().max(400).optional(),
  localeOverride: z.enum(interfaceLocales).optional(),
  leadForm: widgetLeadFormConfigSchema.optional(),
  liveChat: z.object({ enabled: z.boolean() }).optional(),
});

export const widgetSessionRequestSchema = z.object({
  widgetKey: z.string().min(1),
  visitorId: z.guid(),
});
export type WidgetSessionRequest = z.infer<typeof widgetSessionRequestSchema>;

export const widgetSessionResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
  visitorId: z.guid(),
});
export type WidgetSessionResponse = z.infer<typeof widgetSessionResponseSchema>;

export const widgetChatRequestSchema = z.object({
  visitorId: z.guid(),
  messageId: z.guid(),
  content: z.string().min(1).max(4_000),
  locale: z.enum(runtimeLocales).optional(),
});

export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;

export const widgetLeadRequestSchema = z.object({
  visitorId: z.guid(),
  name: z.string().max(160).optional(),
  email: z.email().max(320).optional(),
  phone: z.string().max(32).optional(),
});

export type WidgetLeadRequest = z.infer<typeof widgetLeadRequestSchema>;

export const widgetKeyConfigSchema = z.object({
  id: z.guid(),
  label: z.string().nullable(),
  status: z.enum(["active", "disabled", "revoked"]),
  allowedOrigins: z.array(z.string()),
  config: widgetConfigSchema,
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type WidgetKeyConfig = z.infer<typeof widgetKeyConfigSchema>;

export {
  isTerminalTwilioMessageStatus,
  mapTwilioStatusToMessageStatus,
  mapTwilioStatusToNotificationStatus,
  normalizeTwilioMessageStatus,
  shouldApplyMessageStatusTransition,
  shouldApplyNotificationStatusTransition,
} from "./twilioMessageStatus";
export type {
  NotificationDeliveryStatus,
  SmsMessageStatus,
} from "./twilioMessageStatus";
/** Strips trailing slashes with a linear scan; a `/\/+$/` regex backtracks on long runs of slashes. */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

export * from "./billing";
export * from "./product-capabilities";
export * from "./planCards";
export * from "./planComparison";
export { normalizeAuthEmail } from "./auth";
export { assertProductionSecrets } from "./productionSecrets";

export { isBusinessOpen, isTransferPermitted, normalizeTransferMode } from "./transferPolicy";
export { isTransferCountry, isTransferPhone, TRANSFER_COUNTRY_CALLING_CODES, type TransferCountry } from "./transferCountries";

export { OPERATOR_SMS_ACCEPTED_DISCLOSURE_VERSIONS, OPERATOR_SMS_DISCLOSURE_TEXT, OPERATOR_SMS_DISCLOSURE_VERSION } from "./operatorSmsConsent";
export { canTextNumber, permanentSmsErrorCode } from "./smsReach";

export { DASHBOARD_TEST_CALL_WIDGET_ID, PROSPECT_DEMO_WIDGET_ID } from "./testCall";

export * from "./publicApi";
