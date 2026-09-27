import type {
  BusinessContextSnapshot,
  AgentRuleSummary,
  ClosureWindow,
  HoursWindow,
  KnowledgeSnippet,
  ServiceSummary,
  TransferPolicy,
  AppointmentChangePolicy,
  BookingMode,
  ReceptionistSnapshot,
  RuntimeLocale,
} from "@lobbystack/shared";

/** One receptionist as stored, before fallback instructions are filled in. */
export type ReceptionistBuilderInput = {
  id: string;
  name: string;
  isDefault: boolean;
  greeting: string;
  tone: string;
  summary: string;
  bookingPolicy: string;
  voiceInstructions?: string;
  smsInstructions?: string;
  chatInstructions?: string;
  transferPolicy: TransferPolicy;
  appointmentChangePolicy?: AppointmentChangePolicy;
  bookingMode?: BookingMode;
  voice?: string;
  language?: RuntimeLocale;
  rules: Array<AgentRuleSummary>;
  excludedServiceIds?: Array<string>;
  excludedKnowledgeDocumentIds?: Array<string>;
  excludedSnippetIds?: Array<string>;
  knowledgeDigest?: string;
};

type SnapshotBuilderInput = {
  businessId: string;
  version: string;
  generatedAt: string;
  displayName: string;
  legalName?: string;
  timezone: string;
  defaultLocale: BusinessContextSnapshot["defaultLocale"];
  businessType: BusinessContextSnapshot["businessType"];
  telemetryEnabled?: boolean;
  greeting: string;
  tone: string;
  bookingPolicy: string;
  voiceInstructions?: string;
  smsInstructions?: string;
  chatInstructions?: string;
  summary: string;
  hours: Array<HoursWindow>;
  closures: Array<ClosureWindow>;
  services: Array<ServiceSummary>;
  rules?: Array<AgentRuleSummary>;
  snippets: Array<KnowledgeSnippet>;
  knowledgeDigest?: string;
  transferPolicy: TransferPolicy;
  appointmentChangePolicy?: AppointmentChangePolicy;
  bookingMode?: BookingMode;
  phoneNumber?: string;
  smsNumber?: string;
  email?: string;
  receptionists?: Array<ReceptionistBuilderInput>;
};

export const MAX_AGENT_RULES_PER_SNAPSHOT = 50;
export const MAX_AGENT_RULE_TITLE_CHARS = 160;
export const MAX_AGENT_RULE_CONTENT_CHARS = 4000;

function commonConstraints(input: { displayName: string; timezone: string }): string {
  return [
    `You are the AI receptionist for ${input.displayName}.`,
    `Use the business timezone ${input.timezone}.`,
    "Use structured business facts as the source of truth for hours, services, and transfer rules.",
    "Never promise a booking until the booking tool confirms success.",
  ].join(" ");
}

function resolvedInstructions(business: { displayName: string; timezone: string }, input: { tone: string; voiceInstructions?: string; smsInstructions?: string; chatInstructions?: string }) {
  const constraints = commonConstraints(business);
  return {
    voiceInstructions: input.voiceInstructions ?? `${constraints} Speak in a ${input.tone} tone. Keep answers concise and helpful.`,
    smsInstructions: input.smsInstructions ?? `${constraints} Reply clearly in SMS form. Ask one follow-up question at a time.`,
    chatInstructions: input.chatInstructions ?? `${constraints} Be friendly and concise. Use short paragraphs and plain language.`,
  };
}

function snapshotRules(rules: Array<AgentRuleSummary> | undefined): Array<AgentRuleSummary> {
  return (rules ?? [])
    .slice()
    .sort((left, right) => left.order - right.order)
    .slice(0, MAX_AGENT_RULES_PER_SNAPSHOT)
    .map((rule) => ({
      ...rule,
      title: rule.title.slice(0, MAX_AGENT_RULE_TITLE_CHARS),
      content: rule.content.slice(0, MAX_AGENT_RULE_CONTENT_CHARS),
    }));
}

function receptionistSnapshot(business: { displayName: string; timezone: string }, input: ReceptionistBuilderInput): ReceptionistSnapshot {
  return {
    id: input.id,
    name: input.name,
    isDefault: input.isDefault,
    greeting: input.greeting,
    ...resolvedInstructions(business, input),
    summary: input.summary,
    bookingPolicy: input.bookingPolicy,
    transferPolicy: input.transferPolicy,
    ...(input.appointmentChangePolicy ? { appointmentChangePolicy: input.appointmentChangePolicy } : {}),
    ...(input.bookingMode ? { bookingMode: input.bookingMode } : {}),
    ...(input.voice ? { voice: input.voice } : {}),
    ...(input.language ? { language: input.language } : {}),
    rules: snapshotRules(input.rules),
    excludedServiceIds: input.excludedServiceIds ?? [],
    excludedKnowledgeDocumentIds: input.excludedKnowledgeDocumentIds ?? [],
    excludedSnippetIds: input.excludedSnippetIds ?? [],
    ...(input.knowledgeDigest !== undefined ? { knowledgeDigest: input.knowledgeDigest } : {}),
  };
}

export function buildBusinessContextSnapshot(
  input: SnapshotBuilderInput,
): BusinessContextSnapshot {
  const instructions = resolvedInstructions(input, input);

  return {
    businessId: input.businessId,
    version: input.version,
    generatedAt: input.generatedAt,
    displayName: input.displayName,
    ...(input.legalName ? { legalName: input.legalName } : {}),
    timezone: input.timezone,
    defaultLocale: input.defaultLocale,
    businessType: input.businessType,
    ...(input.telemetryEnabled !== undefined ? { telemetryEnabled: input.telemetryEnabled } : {}),
    greeting: input.greeting,
    ...instructions,
    summary: input.summary,
    bookingPolicy: input.bookingPolicy,
    knowledgeDigest: input.knowledgeDigest ?? "",
    transferPolicy: input.transferPolicy,
    ...(input.appointmentChangePolicy ? { appointmentChangePolicy: input.appointmentChangePolicy } : {}),
    ...(input.bookingMode ? { bookingMode: input.bookingMode } : {}),
    hours: input.hours,
    closures: input.closures,
    services: input.services,
    rules: snapshotRules(input.rules),
    knowledgeSnippets: input.snippets
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 8),
    contactChannels: {
      ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
      ...(input.smsNumber ? { smsNumber: input.smsNumber } : {}),
      ...(input.email ? { email: input.email } : {}),
    },
    ...(input.receptionists?.length ? { receptionists: input.receptionists.map((receptionist) => receptionistSnapshot(input, receptionist)) } : {}),
  };
}
