import type {
  BusinessContextSnapshot,
  AgentRuleSummary,
  ClosureWindow,
  HoursWindow,
  KnowledgeSnippet,
  ServiceSummary,
  SnapshotAgent,
  SnapshotEmployee,
  StaffFirstPolicy,
  TransferPolicy,
  AppointmentChangePolicy,
  BookingMode,
  ReceptionistVoice,
} from "@lobbystack/shared";
import { RULE_CONTENT_CALL_MAX_LENGTH, RULE_TITLE_MAX_LENGTH, RULES_CALL_MAX } from "@lobbystack/shared";

type SnapshotAgentInput = Omit<SnapshotAgent, "voiceInstructions" | "smsInstructions" | "chatInstructions" | "rules"> & {
  voiceInstructions?: string;
  smsInstructions?: string;
  chatInstructions?: string;
  rules?: Array<AgentRuleSummary>;
};

type SnapshotBuilderInput = {
  businessId: string;
  version: string;
  generatedAt: string;
  displayName: string;
  legalName?: string;
  timezone: string;
  defaultLocale: BusinessContextSnapshot["defaultLocale"];
  teamLocale?: BusinessContextSnapshot["defaultLocale"];
  businessType: BusinessContextSnapshot["businessType"];
  telemetryEnabled?: boolean;
  greeting: string;
  voice?: ReceptionistVoice;
  tone: string;
  bookingPolicy: string;
  voiceInstructions?: string;
  smsInstructions?: string;
  chatInstructions?: string;
  summary: string;
  hours: Array<HoursWindow>;
  closures: Array<ClosureWindow>;
  services: Array<ServiceSummary>;
  employees?: Array<SnapshotEmployee>;
  rules?: Array<AgentRuleSummary>;
  agents?: Array<SnapshotAgentInput>;
  snippets: Array<KnowledgeSnippet>;
  knowledgeDigest?: string;
  transferPolicy: TransferPolicy;
  staffFirstPolicy?: StaffFirstPolicy;
  appointmentChangePolicy?: AppointmentChangePolicy;
  bookingMode?: BookingMode;
  phoneNumber?: string;
  smsNumber?: string;
  email?: string;
};

export const MAX_AGENT_RULES_PER_SNAPSHOT = RULES_CALL_MAX;
export const MAX_AGENT_RULE_TITLE_CHARS = RULE_TITLE_MAX_LENGTH;
export const MAX_AGENT_RULE_CONTENT_CHARS = RULE_CONTENT_CALL_MAX_LENGTH;
// Knowledge search matches all of these; prompts list only the top few (agent-core's PROMPT_MAX_FAQS).
export const MAX_KNOWLEDGE_SNIPPETS_PER_SNAPSHOT = 50;

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

export function buildBusinessContextSnapshot(
  input: SnapshotBuilderInput,
): BusinessContextSnapshot {
  const commonConstraints = [
    `You are the AI receptionist for ${input.displayName}.`,
    `Use the business timezone ${input.timezone}.`,
    "Use structured business facts as the source of truth for hours, services, and transfer rules.",
    "Never promise a booking until the booking tool confirms success.",
  ].join(" ");
  const instructions = (agent: Pick<SnapshotAgentInput, "tone" | "voiceInstructions" | "smsInstructions" | "chatInstructions">) => ({
    voiceInstructions:
      agent.voiceInstructions ??
      `${commonConstraints} Speak in a ${agent.tone} tone. Keep answers concise and helpful.`,
    smsInstructions:
      agent.smsInstructions ??
      `${commonConstraints} Reply clearly in SMS form. Ask one follow-up question at a time.`,
    chatInstructions:
      agent.chatInstructions ??
      `${commonConstraints} Be friendly and concise. Use short paragraphs and plain language.`,
  });

  return {
    businessId: input.businessId,
    version: input.version,
    generatedAt: input.generatedAt,
    displayName: input.displayName,
    ...(input.legalName ? { legalName: input.legalName } : {}),
    timezone: input.timezone,
    defaultLocale: input.defaultLocale,
    ...(input.teamLocale ? { teamLocale: input.teamLocale } : {}),
    businessType: input.businessType,
    ...(input.telemetryEnabled !== undefined ? { telemetryEnabled: input.telemetryEnabled } : {}),
    greeting: input.greeting,
    ...(input.voice ? { voice: input.voice } : {}),
    ...instructions(input),
    summary: input.summary,
    bookingPolicy: input.bookingPolicy,
    knowledgeDigest: input.knowledgeDigest ?? "",
    transferPolicy: input.transferPolicy,
    ...(input.staffFirstPolicy ? { staffFirstPolicy: input.staffFirstPolicy } : {}),
    ...(input.appointmentChangePolicy ? { appointmentChangePolicy: input.appointmentChangePolicy } : {}),
    ...(input.bookingMode ? { bookingMode: input.bookingMode } : {}),
    hours: input.hours,
    closures: input.closures,
    services: input.services,
    ...(input.employees?.length ? { employees: input.employees } : {}),
    rules: snapshotRules(input.rules),
    ...(input.agents ? { agents: input.agents.map((agent) => ({ ...agent, ...instructions(agent), rules: snapshotRules(agent.rules) })) } : {}),
    knowledgeSnippets: input.snippets
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .slice(0, MAX_KNOWLEDGE_SNIPPETS_PER_SNAPSHOT),
    contactChannels: {
      ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
      ...(input.smsNumber ? { smsNumber: input.smsNumber } : {}),
      ...(input.email ? { email: input.email } : {}),
    },
  };
}

/**
 * The snapshot as one agent sees it: that agent's fields replace the flat ones.
 * No agentId, or a snapshot built before agents existed, leaves the flat fields,
 * which are the default agent. Null when the snapshot lists agents and this
 * isn't one of them: don't treat that as the default, because the caller would
 * hear the wrong voice. getBusinessSnapshotForAgent refreshes and retries.
 */
export function snapshotForAgent(snapshot: BusinessContextSnapshot, agentId?: string | null): BusinessContextSnapshot | null {
  if (!agentId || !snapshot.agents) return snapshot;
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (!agent) return null;
  // An optional field this agent lacks must not keep the default agent's value.
  const { staffFirstPolicy: _staffFirstPolicy, appointmentChangePolicy: _appointmentChangePolicy, ...shared } = snapshot;
  return {
    ...shared,
    agentId: agent.id,
    agentName: agent.name,
    tone: agent.tone,
    greeting: agent.greeting,
    voice: agent.voice,
    voiceInstructions: agent.voiceInstructions,
    smsInstructions: agent.smsInstructions,
    chatInstructions: agent.chatInstructions,
    bookingPolicy: agent.bookingPolicy,
    bookingMode: agent.bookingMode,
    transferPolicy: agent.transferPolicy,
    ...(agent.staffFirstPolicy ? { staffFirstPolicy: agent.staffFirstPolicy } : {}),
    ...(agent.appointmentChangePolicy ? { appointmentChangePolicy: agent.appointmentChangePolicy } : {}),
    rules: agent.rules,
  };
}
