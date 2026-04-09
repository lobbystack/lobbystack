export type DeploymentMode = "cloud" | "self_hosted_standard" | "development";

export const deploymentModes = [
  "cloud",
  "self_hosted_standard",
  "development",
] as const satisfies ReadonlyArray<DeploymentMode>;

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

export type ChannelKind = "sms" | "voice" | "dashboard";
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

export type KnowledgeSnippet = {
  id: string;
  title: string;
  content: string;
  tags: Array<string>;
  priority: number;
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
  summary: string;
  bookingPolicy: string;
  knowledgeDigest: string;
  transferPolicy: TransferPolicy;
  hours: Array<HoursWindow>;
  closures: Array<ClosureWindow>;
  services: Array<ServiceSummary>;
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

export {
  billingDefaults,
  billingErrorCodes,
  billingMeterEventNames,
  billingPaidTiers,
  billingPlanCatalog,
  billingTiers,
  billingTransactionKinds,
  billingUsageKinds,
  getPolarBillableUsageCents,
  isPaidBillingTier,
} from "./billing";
export type {
  BillingErrorCode,
  BillingPaidTier,
  BillingStatus,
  BillingTier,
  BillingTransactionKind,
  BillingTransactionSummary,
  BillingUsageKind,
  BillingUsageSnapshot,
} from "./billing";

export type VoiceToolName =
  | "getBusinessHours"
  | "getBusinessServices"
  | "searchKnowledge"
  | "findAvailability"
  | "checkAvailability"
  | "bookAppointment"
  | "transferCall"
  | "takeMessage";

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
  summary:
    "A family clinic offering checkups, follow-ups, and vaccine appointments.",
  bookingPolicy: "Do not book same-day appointments after 4pm local time.",
  knowledgeDigest:
    "Front desk handles scheduling, referrals, and administrative questions. Parking is behind the building and urgent medical issues should be transferred.",
  transferPolicy: {
    mode: "on_urgent",
    transferNumber: "+14165551234",
  },
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
  escapeXmlText,
  normalizeTwilioFormFields,
  validateTwilioSignature,
} from "./twilioSecurity";
export type { TwilioSignatureInput } from "./twilioSecurity";
export {
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
