import { z } from "zod";

export { resolveOpenAiPricing } from "./aiPricing";
export type { AiPricingRatesUsdPerMillionTokens, VersionedAiPricing } from "./aiPricing";

export type DeploymentMode = "cloud" | "self_hosted_standard" | "development";

export const deploymentModes = [
  "cloud",
  "self_hosted_standard",
  "development",
] as const satisfies ReadonlyArray<DeploymentMode>;

export const DEFAULT_WEB_CALL_MAX_DURATION_MS = 5 * 60 * 1000;
export const MAX_WEB_CALL_MAX_DURATION_MS = 30 * 60 * 1000;
export const WEB_CALL_STALE_GRACE_MS = 60 * 1000;

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

export type ChannelKind = "sms" | "voice" | "dashboard" | "web_chat";
export type DocumentMimeType =
  | "application/pdf"
  | "text/plain"
  | "text/markdown";
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

export type BusinessContextSnapshot = {
  businessId: string;
  version: string;
  generatedAt: string;
  displayName: string;
  legalName?: string;
  timezone: string;
  defaultLocale: RuntimeLocale;
  businessType: BusinessType;
  greeting: string;
  voiceInstructions: string;
  smsInstructions: string;
  chatInstructions: string;
  summary: string;
  bookingPolicy: string;
  knowledgeDigest: string;
  transferPolicy: TransferPolicy;
  appointmentChangePolicy?: AppointmentChangePolicy;
  hours: Array<HoursWindow>;
  closures: Array<ClosureWindow>;
  services: Array<ServiceSummary>;
  rules?: Array<AgentRuleSummary>;
  knowledgeSnippets?: Array<KnowledgeSnippet>;
  contactChannels: {
    phoneNumber?: string;
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

export type VoiceToolName =
  | "getBusinessHours"
  | "getBusinessServices"
  | "searchKnowledge"
  | "findAvailability"
  | "checkAvailability"
  | "bookAppointment"
  | "lookupAppointmentForChange"
  | "verifyAppointmentForChange"
  | "sendAppointmentChangeOtp"
  | "verifyAppointmentChangeOtp"
  | "cancelAppointment"
  | "rescheduleAppointment"
  | "transferCall"
  | "takeMessage"
  | "endCall"
  | "setCallHold";

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
  localeOverride?: RuntimeLocale;
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
  localeOverride: z.enum(runtimeLocales).optional(),
  leadForm: widgetLeadFormConfigSchema.optional(),
});

export const widgetVisitorIdentitySchema = z.object({
  widgetKey: z.string().min(1),
  visitorId: z.string().uuid(),
  name: z.string().max(160).optional(),
  email: z.string().email().max(320).optional(),
  phone: z.string().max(32).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type WidgetVisitorIdentity = z.infer<typeof widgetVisitorIdentitySchema>;

export const widgetSessionRequestSchema = z.object({
  widgetKey: z.string().min(1),
  visitorId: z.string().uuid(),
});
export type WidgetSessionRequest = z.infer<typeof widgetSessionRequestSchema>;

export const widgetSessionResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  visitorId: z.string().uuid(),
});
export type WidgetSessionResponse = z.infer<typeof widgetSessionResponseSchema>;

export type WidgetChatRole = "user" | "assistant";

export type WidgetChatPart =
  | { type: "text"; text: string }
  | { type: "text-delta"; delta: string }
  | { type: "tool-invocation"; toolInvocation: Record<string, unknown> };

export type WidgetChatReplyRole = "assistant" | "human";

export const widgetChatRequestSchema = z.object({
  visitorId: z.string().uuid(),
  messageId: z.string().uuid(),
  content: z.string().min(1).max(4_000),
  locale: z.enum(runtimeLocales).optional(),
});

export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;

export const widgetChatResponseSchema = z.object({
  messageId: z.string().uuid(),
  role: z.enum(["assistant", "human"]),
  content: z.string(),
  automationState: z.enum(["ai_active", "human_handoff"]).optional(),
});

export type WidgetChatResponse = z.infer<typeof widgetChatResponseSchema>;

export const widgetLeadRequestSchema = z.object({
  visitorId: z.string().uuid(),
  name: z.string().max(160).optional(),
  email: z.string().email().max(320).optional(),
  phone: z.string().max(32).optional(),
});

export type WidgetLeadRequest = z.infer<typeof widgetLeadRequestSchema>;

export const widgetChatMessageRecordSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type WidgetChatMessageRecord = z.infer<typeof widgetChatMessageRecordSchema>;

export const widgetKeyConfigSchema = z.object({
  id: z.string().uuid(),
  label: z.string().nullable(),
  status: z.enum(["active", "disabled", "revoked"]),
  allowedOrigins: z.array(z.string()),
  config: widgetConfigSchema,
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type WidgetKeyConfig = z.infer<typeof widgetKeyConfigSchema>;

export {
  getTerminalTwilioCallReconciliationFields,
  isNormalizableRuntimeDisposition,
  isTerminalTwilioCallStatus,
  mapTwilioCallStatusToDisposition,
  normalizeTwilioCallStatus,
  shouldPreserveSpecificCallOutcome,
} from "./voiceCallStatus";
export type {
  CallOutcomeRecord,
  TerminalTwilioCallReconciliationFields,
} from "./voiceCallStatus";
export {
  buildTwilioSignaturePayload,
  computeTwilioSignature,
  resolveTwilioWebhookUrl,
  escapeXmlText,
  normalizeTwilioFormFields,
  validateTwilioSignature,
} from "./twilioSecurity";
export type { TwilioSignatureInput } from "./twilioSecurity";
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
export * from "./billing";
export { normalizeAuthEmail } from "./auth";

export { isTransferPermitted, normalizeTransferMode } from "./transferPolicy";

export { OPERATOR_SMS_DISCLOSURE_TEXT, OPERATOR_SMS_DISCLOSURE_VERSION } from "./operatorSmsConsent";
