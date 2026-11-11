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
import { CHANNEL_RULE_CONTENT_CALL_MAX_LENGTH, RULE_CONTENT_CALL_MAX_LENGTH, RULE_TITLE_MAX_LENGTH, RULES_CALL_MAX, SNAPSHOT_SCHEMA_VERSION } from "@lobbystack/shared";

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

/** The snippets a snapshot keeps, highest priority first. */
export function snapshotSnippets(snippets: Array<KnowledgeSnippet>): Array<KnowledgeSnippet> {
  return snippets.slice().sort((left, right) => right.priority - left.priority).slice(0, MAX_KNOWLEDGE_SNIPPETS_PER_SNAPSHOT);
}

/** A rule kept to one channel holds what that channel's instructions did, so calls read as much of it as they read of those. */
export function snapshotRules(rules: Array<AgentRuleSummary> | undefined): Array<AgentRuleSummary> {
  return (rules ?? [])
    .slice()
    .sort((left, right) => left.order - right.order)
    .slice(0, MAX_AGENT_RULES_PER_SNAPSHOT)
    .map(({ channel, ...rule }) => ({
      ...rule,
      title: rule.title.slice(0, MAX_AGENT_RULE_TITLE_CHARS),
      content: rule.content.slice(0, channel ? CHANNEL_RULE_CONTENT_CALL_MAX_LENGTH : MAX_AGENT_RULE_CONTENT_CHARS),
      ...(channel ? { channel } : {}),
    }));
}

/**
 * An agent's default instructions for each channel, with its tone. Snapshots
 * no longer pass an owner's own text: that lives in rules kept to the
 * channel. Tests and the snapshot from before migration 0203 still can.
 */
export function agentInstructions(
  business: { displayName: string; timezone: string },
  agent: Pick<SnapshotAgentInput, "tone" | "voiceInstructions" | "smsInstructions" | "chatInstructions">,
): Pick<SnapshotAgent, "voiceInstructions" | "smsInstructions" | "chatInstructions"> {
  const commonConstraints = [
    `You are the AI receptionist for ${business.displayName}.`,
    `Use the business timezone ${business.timezone}.`,
    "Use structured business facts as the source of truth for hours, services, and transfer rules.",
    "Never promise a booking until the booking tool confirms success.",
  ].join(" ");
  return {
    voiceInstructions:
      agent.voiceInstructions ??
      `${commonConstraints} Speak in a ${agent.tone} tone. Keep answers concise and helpful.`,
    smsInstructions:
      agent.smsInstructions ??
      `${commonConstraints} Reply clearly in SMS form. Ask one follow-up question at a time.`,
    chatInstructions:
      agent.chatInstructions ??
      `${commonConstraints} Be friendly and concise. Use short paragraphs and plain language.`,
  };
}

export function buildBusinessContextSnapshot(
  input: SnapshotBuilderInput,
): BusinessContextSnapshot {
  const instructions = (agent: Pick<SnapshotAgentInput, "tone" | "voiceInstructions" | "smsInstructions" | "chatInstructions">) => agentInstructions(input, agent);

  return {
    businessId: input.businessId,
    version: input.version,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
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
    ...(input.agents ? { agents: input.agents.map((agent) => ({ ...agent, ...instructions(agent), rules: snapshotRules(agent.rules), ...(agent.knowledgeSnippets ? { knowledgeSnippets: snapshotSnippets(agent.knowledgeSnippets) } : {}) })) } : {}),
    knowledgeSnippets: snapshotSnippets(input.snippets),
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
  const named = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (!named) return null;
  // A paused agent's channels keep their number, and the default agent answers them.
  const fallback = named.paused ? snapshot.agents.find((candidate) => candidate.isDefault) : undefined;
  const agent = fallback ? { ...fallback, phoneNumber: named.phoneNumber } : named;
  // An optional field this agent lacks must not keep the default agent's value.
  const { staffFirstPolicy: _staffFirstPolicy, appointmentChangePolicy: _appointmentChangePolicy, ...shared } = snapshot;
  const { phoneNumber: _phoneNumber, ...channels } = snapshot.contactChannels ?? {};
  // A snapshot from before agents had their own number keeps the default agent's flat one.
  const phoneNumber = agent.phoneNumber === undefined && agent.isDefault ? snapshot.contactChannels?.phoneNumber : agent.phoneNumber;
  return {
    ...shared,
    contactChannels: { ...channels, ...(phoneNumber ? { phoneNumber } : {}) },
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
    // An agent whose knowledge matches the default agent's carries none of its own.
    ...(agent.knowledgeSnippets ? { knowledgeSnippets: agent.knowledgeSnippets } : {}),
    ...(agent.knowledgeDigest !== undefined ? { knowledgeDigest: agent.knowledgeDigest } : {}),
  };
}

/**
 * Whether code that knows this snapshot's shape built it. During a deploy the
 * previous worker keeps building snapshots for up to 31 minutes, without rule
 * channels or agent knowledge, so channel rules would read as rules for every
 * channel.
 */
export function isCurrentSnapshot(snapshot: Pick<BusinessContextSnapshot, "schemaVersion">): boolean {
  return (snapshot.schemaVersion ?? 0) >= SNAPSHOT_SCHEMA_VERSION;
}

/** Whether any of the business's agents has a phone number. Works on a projected snapshot too, because it keeps agents[]. */
export function businessHasPhoneNumber(snapshot: BusinessContextSnapshot): boolean {
  return Boolean(snapshot.contactChannels?.phoneNumber || snapshot.agents?.some((agent) => agent.phoneNumber));
}
