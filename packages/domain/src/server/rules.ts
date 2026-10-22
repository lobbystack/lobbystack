import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { agentRules, enqueueOutbox, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export type AgentRule = typeof agentRules.$inferSelect;

export async function listAgentRules(context: DomainContext, input: { userId: string; businessId: string }): Promise<AgentRule[]> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await listAgentRulesInTransaction(tx, input);
  });
}

/** A business's rules in the order the receptionist reads them. */
export async function listAgentRulesInTransaction(tx: DatabaseTransaction, input: { businessId: string }): Promise<AgentRule[]> {
  return await tx.select().from(agentRules).where(eq(agentRules.businessId, input.businessId)).orderBy(asc(agentRules.sortOrder), asc(agentRules.createdAt), asc(agentRules.id));
}

export async function createAgentRule(
  context: DomainContext,
  input: { userId: string; businessId: string; title: string; content: string; active?: boolean },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return (await insertAgentRuleInTransaction(tx, input)).id;
  });
}

/**
 * Holds the business's rule order until the transaction ends, so rules added
 * or reordered at the same time don't take the same position.
 */
export async function lockAgentRulesInTransaction(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agent-rules:${businessId}`}, 0))`);
}

/** Adds a rule after the others and refreshes the snapshot calls read rules from. Callers authorize and check the fields first. */
export async function insertAgentRuleInTransaction(tx: DatabaseTransaction, input: { businessId: string; title: string; content: string; active?: boolean | undefined }): Promise<AgentRule> {
  await lockAgentRulesInTransaction(tx, input.businessId);
  const [last] = await tx.select({ sortOrder: agentRules.sortOrder }).from(agentRules).where(eq(agentRules.businessId, input.businessId)).orderBy(desc(agentRules.sortOrder)).limit(1);
  const [rule] = await tx.insert(agentRules).values({ businessId: input.businessId, title: input.title.trim(), content: input.content.trim(), active: input.active ?? true, sortOrder: (last?.sortOrder ?? -1) + 1 }).returning();
  if (!rule) throw new Error("Agent rule could not be created.");
  await publishRulesChanged(tx, input.businessId, rule.id, `agent-rule:${rule.id}:created`);
  return rule;
}

export async function updateAgentRule(
  context: DomainContext,
  input: { userId: string; businessId: string; ruleId: string; title?: string; content?: string; active?: boolean },
): Promise<void> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (input.title === undefined && input.content === undefined && input.active === undefined) throw new Error("At least one rule field is required.");
    if (!await updateAgentRuleInTransaction(tx, input)) throw new Error("Agent rule not found.");
  });
}

/** Changes the fields given and refreshes the snapshot. Null when the business has no such rule. Callers authorize first. */
export async function updateAgentRuleInTransaction(tx: DatabaseTransaction, input: { businessId: string; ruleId: string; title?: string | undefined; content?: string | undefined; active?: boolean | undefined }): Promise<AgentRule | null> {
  const values = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.content !== undefined ? { content: input.content.trim() } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    updatedAt: new Date(),
  };
  const [rule] = await tx.update(agentRules).set(values).where(and(eq(agentRules.id, input.ruleId), eq(agentRules.businessId, input.businessId))).returning();
  if (!rule) return null;
  await publishRulesChanged(tx, input.businessId, rule.id, `agent-rule:${rule.id}:updated:${Date.now()}`);
  return rule;
}

export async function deleteAgentRule(context: DomainContext, input: { userId: string; businessId: string; ruleId: string }): Promise<void> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (!await deleteAgentRuleInTransaction(tx, input)) throw new Error("Agent rule not found.");
  });
}

/** Deletes a rule and refreshes the snapshot. False when the business has no such rule. Callers authorize first. */
export async function deleteAgentRuleInTransaction(tx: DatabaseTransaction, input: { businessId: string; ruleId: string }): Promise<boolean> {
  const [rule] = await tx.delete(agentRules).where(and(eq(agentRules.id, input.ruleId), eq(agentRules.businessId, input.businessId))).returning({ id: agentRules.id });
  if (!rule) return false;
  await publishRulesChanged(tx, input.businessId, rule.id, `agent-rule:${rule.id}:deleted`);
  return true;
}

export async function reorderAgentRules(context: DomainContext, input: { userId: string; businessId: string; ruleIds: string[] }): Promise<void> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (!await reorderAgentRulesInTransaction(tx, input)) throw new Error("The rule order does not match this business.");
  });
}

/**
 * Gives the rules sent positions 0, 1, 2 and on, in that order, and refreshes
 * the snapshot. Rules left out keep their positions, which can then tie with
 * the new ones, so the API sends every rule. False, changing nothing, when an
 * id repeats or isn't one of the business's rules. Callers authorize first.
 */
export async function reorderAgentRulesInTransaction(tx: DatabaseTransaction, input: { businessId: string; ruleIds: string[] }): Promise<boolean> {
  await lockAgentRulesInTransaction(tx, input.businessId);
  const rules = await tx.select({ id: agentRules.id, sortOrder: agentRules.sortOrder }).from(agentRules).where(and(eq(agentRules.businessId, input.businessId), inArray(agentRules.id, input.ruleIds)));
  if (rules.length !== input.ruleIds.length || new Set(input.ruleIds).size !== input.ruleIds.length) return false;
  for (const [sortOrder, ruleId] of input.ruleIds.entries()) {
    // A rule already in its place keeps its row, and its updated_at, as it is.
    if (rules.find((rule) => rule.id === ruleId)?.sortOrder === sortOrder) continue;
    await tx.update(agentRules).set({ sortOrder, updatedAt: new Date() }).where(and(eq(agentRules.id, ruleId), eq(agentRules.businessId, input.businessId)));
  }
  await publishRulesChanged(tx, input.businessId, undefined, `agent-rules:${input.businessId}:reordered:${Date.now()}`);
  return true;
}

async function publishRulesChanged(tx: DatabaseTransaction, businessId: string, entityId: string | undefined, dedupeKey: string): Promise<void> {
  // The receptionist reads rules only from the business snapshot.
  await enqueueOutbox(tx, {
    topic: "snapshot.refresh",
    businessId,
    aggregateType: "agent_rule",
    ...(entityId ? { aggregateId: entityId } : {}),
    dedupeKey: `${dedupeKey}:snapshot`,
    payload: { businessId, reason: "rules_changed" },
  });
  await enqueueOutbox(tx, {
    topic: "realtime.publish",
    businessId,
    aggregateType: "agent_rule",
    ...(entityId ? { aggregateId: entityId } : {}),
    dedupeKey,
    payload: { type: "conversation.updated", ...(entityId ? { entityId } : {}) },
  });
}
