import type {
  BusinessContextSnapshot,
  ClosureWindow,
  HoursWindow,
  KnowledgeSnippet,
  ServiceSummary,
  TransferPolicy,
} from "@ai-receptionist/shared";

type SnapshotBuilderInput = {
  businessId: string;
  version: string;
  generatedAt: string;
  displayName: string;
  legalName?: string;
  timezone: string;
  defaultLocale: BusinessContextSnapshot["defaultLocale"];
  businessType: BusinessContextSnapshot["businessType"];
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
  phoneNumber?: string;
  smsNumber?: string;
  email?: string;
};

export function buildBusinessContextSnapshot(
  input: SnapshotBuilderInput,
): BusinessContextSnapshot {
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
    hours: input.hours,
    closures: input.closures,
    services: input.services,
    priorityFaqs: input.snippets
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
