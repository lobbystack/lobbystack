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
export type KnowledgeSourceType = "upload" | "faq" | "generated_snapshot";
export type DocumentMimeType =
  | "application/pdf"
  | "text/plain"
  | "text/markdown";

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
  priorityFaqs: Array<KnowledgeSnippet>;
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
  | "transferCall"
  | "takeMessage";

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
