import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { agentRules, businesses, type DatabaseTransaction } from "@lobbystack/db";
import { channelRuleTitle, normalizeRuntimeLocale, type RuleChannel } from "@lobbystack/shared";

import { deleteAgentRuleInTransaction, insertAgentRuleInTransaction, updateAgentRuleInTransaction } from "./rules";

// The per-channel instructions agents had before migration 0203, read from
// and written to the rules kept to each channel. The public API still offers
// voice_instructions, sms_instructions and chat_instructions this way, so
// clients from before keep working. Each is the agent's first rule for its
// channel. Chat instructions covered website chat and Instagram: they read the
// website chat rule and write both.

export type LegacyInstructions = { voiceInstructions: string | null; smsInstructions: string | null; chatInstructions: string | null };
export type LegacyInstructionField = keyof LegacyInstructions;

const LEGACY_CHANNELS: Record<LegacyInstructionField, readonly RuleChannel[]> = {
  voiceInstructions: ["voice"],
  smsInstructions: ["sms"],
  chatInstructions: ["web_chat", "instagram"],
};

export const legacyInstructionFields = Object.keys(LEGACY_CHANNELS) as LegacyInstructionField[];

type ChannelRule = Pick<typeof agentRules.$inferSelect, "id" | "agentId" | "channel" | "content" | "active">;

/** What each old field reads from these rules of one agent, in order: its channel's first rule, while it's on. */
export function legacyInstructionsFrom(rules: readonly Pick<ChannelRule, "channel" | "content" | "active">[]): LegacyInstructions {
  const read = (channel: RuleChannel) => {
    const rule = rules.find((candidate) => candidate.channel === channel);
    return rule?.active ? rule.content : null;
  };
  return { voiceInstructions: read("voice"), smsInstructions: read("sms"), chatInstructions: read("web_chat") };
}

async function channelRulesOf(tx: DatabaseTransaction, businessId: string, agentIds: readonly string[]): Promise<ChannelRule[]> {
  if (!agentIds.length) return [];
  return await tx.select({ id: agentRules.id, agentId: agentRules.agentId, channel: agentRules.channel, content: agentRules.content, active: agentRules.active })
    .from(agentRules)
    .where(and(eq(agentRules.businessId, businessId), inArray(agentRules.agentId, [...agentIds]), isNotNull(agentRules.channel)))
    .orderBy(asc(agentRules.sortOrder), asc(agentRules.createdAt), asc(agentRules.id));
}

/** The old fields of each agent named, by id. */
export async function loadLegacyInstructions(tx: DatabaseTransaction, businessId: string, agentIds: readonly string[]): Promise<Map<string, LegacyInstructions>> {
  const rules = await channelRulesOf(tx, businessId, agentIds);
  return new Map(agentIds.map((agentId) => [agentId, legacyInstructionsFrom(rules.filter((rule) => rule.agentId === agentId))]));
}

/** An agent row with its deprecated instruction columns replaced by what its channel rules say. */
export async function withLegacyInstructions<T extends { id: string; businessId: string }>(tx: DatabaseTransaction, row: T): Promise<T & LegacyInstructions> {
  return { ...row, ...(await loadLegacyInstructions(tx, row.businessId, [row.id])).get(row.id)! };
}

/**
 * Writes the old fields given onto the agent's channel rules. Text changes the
 * channel's first rule and turns it on, or adds one titled after the channel
 * in the business's language. Null deletes that rule. Each change refreshes
 * the snapshot. Callers authorize and check the text first.
 */
export async function saveLegacyInstructionsInTransaction(tx: DatabaseTransaction, input: { businessId: string; agentId: string; patch: Partial<LegacyInstructions> }): Promise<void> {
  const fields = legacyInstructionFields.filter((field) => input.patch[field] !== undefined);
  if (!fields.length) return;
  const [business] = await tx.select({ defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  const locale = normalizeRuntimeLocale(business?.defaultLocale);
  const rules = await channelRulesOf(tx, input.businessId, [input.agentId]);
  const scope = { businessId: input.businessId, agentId: input.agentId };
  for (const field of fields) {
    const value = input.patch[field]?.trim() || null;
    for (const channel of LEGACY_CHANNELS[field]) {
      const current = rules.find((rule) => rule.channel === channel);
      if (value === null) {
        if (current) await deleteAgentRuleInTransaction(tx, { ...scope, ruleId: current.id });
      } else if (!current) {
        await insertAgentRuleInTransaction(tx, { ...scope, title: channelRuleTitle(channel, locale), content: value, channel });
      } else if (current.content !== value || !current.active) {
        await updateAgentRuleInTransaction(tx, { ...scope, ruleId: current.id, content: value, active: true });
      }
    }
  }
}
