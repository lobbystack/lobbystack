import { z } from "zod";

export { isMaintenanceMode } from "./maintenance";
export { interfaceLocaleTags, interfaceLocales, intlLocale, isInterfaceLocale, normalizeInterfaceLocale } from "./locales";
export type { InterfaceLocale } from "./locales";
import { interfaceLocales, type InterfaceLocale } from "./locales";
export { isCertificationMode, assertCertificationRecipient, assertCertificationOperationAllowed, assertCertificationCalendar, assertCertificationBillingSandbox } from "./certification";

export type DeploymentMode = "cloud" | "self_hosted_standard" | "development";

export const deploymentModes = [
  "cloud",
  "self_hosted_standard",
  "development",
] as const satisfies ReadonlyArray<DeploymentMode>;

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

/**
 * Languages the AI receptionist speaks and the business default language.
 * Interface languages (dashboard, widget UI, email) are {@link InterfaceLocale}.
 */
export type RuntimeLocale = "en" | "fr";

export const runtimeLocales = ["en", "fr"] as const satisfies ReadonlyArray<RuntimeLocale>;

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
};

export type TransferPolicy = {
  mode: "never" | "always" | "on_request" | "on_urgent" | "during_business_hours";
  transferNumber?: string;
};

export type AppointmentChangeVerificationMode =
  | "phone_match_and_facts"
  | "otp_required"
  | "operator_only";

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

/** Missing legacy policy uses the original defaults; malformed policies disable automation. */
export function normalizeAppointmentChangePolicy(value: unknown): AppointmentChangePolicy {
  if (value == null) return { ...defaultAppointmentChangePolicy };
  const policy = value as Partial<AppointmentChangePolicy>;
  if (typeof policy.enabled === "boolean" && typeof policy.allowCancel === "boolean" && typeof policy.allowReschedule === "boolean" && ["phone_match_and_facts", "otp_required", "operator_only"].includes(policy.verificationMode ?? "")) {
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
export type BookingMode = "off" | "request" | "instant";

/** Unknown or missing values keep today's behavior: book directly. */
export function normalizeBookingMode(value: string | null | undefined): BookingMode {
  return value === "off" || value === "request" ? value : "instant";
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
  /** Employees a caller can ask for by name. Absent in snapshots built before employees existed. */
  employees?: Array<{ name: string }>;
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
export type WidgetPosition = "bottom-right" | "bottom-left" | "bottom-center";

export type WidgetLeadFormConfig = {
  enabled: boolean;
  requirePhone?: boolean;
  requireEmail?: boolean;
  showBeforeChat?: boolean;
};

export type WidgetConfig = {
  color?: string;
  position?: WidgetPosition;
  title?: string;
  subtitle?: string;
  greeting?: string;
  localeOverride?: InterfaceLocale;
  leadForm?: WidgetLeadFormConfig;
};

export const widgetPositions = [
  "bottom-right",
  "bottom-left",
  "bottom-center",
] as const satisfies ReadonlyArray<WidgetPosition>;

export const defaultWidgetConfig: WidgetConfig = {
  position: "bottom-right",
  title: "",
  leadForm: { enabled: false, requirePhone: false, requireEmail: false, showBeforeChat: false },
};

export const widgetLeadFormConfigSchema = z.object({
  enabled: z.boolean(),
  requirePhone: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  showBeforeChat: z.boolean().optional(),
});

export const widgetConfigSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  position: z.enum(widgetPositions).optional(),
  title: z.string().max(160).optional(),
  subtitle: z.string().max(320).optional(),
  greeting: z.string().max(400).optional(),
  localeOverride: z.enum(interfaceLocales).optional(),
  leadForm: widgetLeadFormConfigSchema.optional(),
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
export { normalizeAuthEmail } from "./auth";
export { assertProductionSecrets } from "./productionSecrets";

export { isTransferPermitted, normalizeTransferMode } from "./transferPolicy";

export { OPERATOR_SMS_ACCEPTED_DISCLOSURE_VERSIONS, OPERATOR_SMS_DISCLOSURE_TEXT, OPERATOR_SMS_DISCLOSURE_VERSION } from "./operatorSmsConsent";
export { canTextNumber, permanentSmsErrorCode } from "./smsReach";

export { DASHBOARD_TEST_CALL_WIDGET_ID, PROSPECT_DEMO_WIDGET_ID } from "./testCall";

export * from "./publicApi";
