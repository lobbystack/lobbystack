import type { RuntimeLocale } from "./runtimeLocale";

type BusinessType =
  | "clinic"
  | "repair_shop"
  | "salon"
  | "service_company"
  | "other";

type HoursWindow = {
  dayOfWeek: number;
  openMinutes: number;
  closeMinutes: number;
};

type ClosureWindow = {
  startsAt: string;
  endsAt: string;
  reason: string;
};

type ServiceSummary = {
  id: string;
  name: string;
  localizedNames?: Partial<Record<RuntimeLocale, string>>;
  durationMinutes: number;
  description?: string;
};

type KnowledgeSnippet = {
  id: string;
  title: string;
  content: string;
  tags: Array<string>;
  priority: number;
};

type TransferPolicy = {
  mode: "never" | "always" | "on_request" | "on_urgent" | "during_business_hours";
  transferNumber?: string;
};

type AppointmentChangePolicy = {
  enabled: boolean;
  allowCancel: boolean;
  allowReschedule: boolean;
  verificationMode: "phone_match_and_facts" | "otp_required" | "operator_only";
};

type SnapshotBuilderInput = {
  businessId: string;
  version: string;
  generatedAt: string;
  displayName: string;
  legalName?: string;
  timezone: string;
  defaultLocale: RuntimeLocale;
  businessType: BusinessType;
  greeting: string;
  tone: string;
  bookingPolicy: string;
  voiceInstructions?: string;
  smsInstructions?: string;
  summary: string;
  hours: Array<HoursWindow>;
  closures: Array<ClosureWindow>;
  services: Array<ServiceSummary>;
  snippets: Array<KnowledgeSnippet>;
  knowledgeDigest?: string;
  transferPolicy: TransferPolicy;
  appointmentChangePolicy?: AppointmentChangePolicy;
  phoneNumber?: string;
  smsNumber?: string;
  email?: string;
};

/**
 * Builds the compact snapshot fetched once at call start by the voice gateway.
 */
export function buildBusinessContextSnapshot(input: SnapshotBuilderInput) {
  const commonConstraints = [
    `You are the AI receptionist for ${input.displayName}.`,
    `Use the business timezone ${input.timezone}.`,
    "Use structured business facts as the source of truth for hours, services, and transfer rules.",
    "Never promise a booking until the booking tool confirms success.",
  ].join(" ");

  return {
    businessId: input.businessId,
    version: input.version,
    generatedAt: input.generatedAt,
    displayName: input.displayName,
    ...(input.legalName ? { legalName: input.legalName } : {}),
    timezone: input.timezone,
    defaultLocale: input.defaultLocale,
    businessType: input.businessType,
    greeting: input.greeting,
    voiceInstructions:
      input.voiceInstructions ??
      `${commonConstraints} Speak in a ${input.tone} tone. Keep answers concise and helpful.`,
    smsInstructions:
      input.smsInstructions ??
      `${commonConstraints} Reply clearly in SMS form. Ask one follow-up question at a time.`,
    summary: input.summary,
    bookingPolicy: input.bookingPolicy,
    knowledgeDigest: input.knowledgeDigest ?? "",
    transferPolicy: input.transferPolicy,
    ...(input.appointmentChangePolicy
      ? { appointmentChangePolicy: input.appointmentChangePolicy }
      : {}),
    hours: input.hours,
    closures: input.closures,
    services: input.services,
    knowledgeSnippets: input.snippets
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 8),
    contactChannels: {
      ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
      ...(input.smsNumber ? { smsNumber: input.smsNumber } : {}),
      ...(input.email ? { email: input.email } : {}),
    },
  };
}
