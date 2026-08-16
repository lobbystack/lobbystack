import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { agentRules, enqueueOutbox, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export type AgentRule = typeof agentRules.$inferSelect;

export async function listAgentRules(context: DomainContext, input: { userId: string; businessId: string }): Promise<AgentRule[]> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await tx.select().from(agentRules).where(eq(agentRules.businessId, input.businessId)).orderBy(asc(agentRules.sortOrder), asc(agentRules.createdAt));
  });
}

export async function createAgentRule(
  context: DomainContext,
  input: { userId: string; businessId: string; title: string; content: string; active?: boolean },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [last] = await tx.select({ sortOrder: agentRules.sortOrder }).from(agentRules).where(eq(agentRules.businessId, input.businessId)).orderBy(desc(agentRules.sortOrder)).limit(1);
    const [rule] = await tx.insert(agentRules).values({ businessId: input.businessId, title: input.title.trim(), content: input.content.trim(), active: input.active ?? true, sortOrder: (last?.sortOrder ?? -1) + 1 }).returning({ id: agentRules.id });
    if (!rule) throw new Error("Agent rule could not be created.");
    await publishRulesChanged(tx, input.businessId, rule.id, `agent-rule:${rule.id}:created`);
    return rule.id;
  });
}

export async function updateAgentRule(
  context: DomainContext,
  input: { userId: string; businessId: string; ruleId: string; title?: string; content?: string; active?: boolean },
): Promise<void> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const values = {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.content !== undefined ? { content: input.content.trim() } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: new Date(),
    };
    if (Object.keys(values).length === 1) throw new Error("At least one rule field is required.");
    const [rule] = await tx.update(agentRules).set(values).where(and(eq(agentRules.id, input.ruleId), eq(agentRules.businessId, input.businessId))).returning({ id: agentRules.id });
    if (!rule) throw new Error("Agent rule not found.");
    await publishRulesChanged(tx, input.businessId, rule.id, `agent-rule:${rule.id}:updated:${Date.now()}`);
  });
}

export async function deleteAgentRule(context: DomainContext, input: { userId: string; businessId: string; ruleId: string }): Promise<void> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [rule] = await tx.delete(agentRules).where(and(eq(agentRules.id, input.ruleId), eq(agentRules.businessId, input.businessId))).returning({ id: agentRules.id });
    if (!rule) throw new Error("Agent rule not found.");
    await publishRulesChanged(tx, input.businessId, rule.id, `agent-rule:${rule.id}:deleted`);
  });
}

export async function reorderAgentRules(context: DomainContext, input: { userId: string; businessId: string; ruleIds: string[] }): Promise<void> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const rules = await tx.select({ id: agentRules.id }).from(agentRules).where(and(eq(agentRules.businessId, input.businessId), inArray(agentRules.id, input.ruleIds)));
    if (rules.length !== input.ruleIds.length || new Set(input.ruleIds).size !== input.ruleIds.length) throw new Error("The rule order does not match this business.");
    for (const [sortOrder, ruleId] of input.ruleIds.entries()) {
      await tx.update(agentRules).set({ sortOrder, updatedAt: new Date() }).where(and(eq(agentRules.id, ruleId), eq(agentRules.businessId, input.businessId)));
    }
    await publishRulesChanged(tx, input.businessId, undefined, `agent-rules:${input.businessId}:reordered:${Date.now()}`);
  });
}

async function publishRulesChanged(tx: DatabaseTransaction, businessId: string, entityId: string | undefined, dedupeKey: string): Promise<void> {
  await enqueueOutbox(tx, {
    topic: "realtime.publish",
    businessId,
    aggregateType: "agent_rule",
    ...(entityId ? { aggregateId: entityId } : {}),
    dedupeKey,
    payload: { type: "conversation.updated", ...(entityId ? { entityId } : {}) },
  });
}
