import { and, asc, count, desc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";

import { agentRules, agents, conversations, inOrder, instagramAccounts, phoneNumbers, widgetKeys, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { billingErrorCodes, defaultAppointmentChangePolicy, type Entitlement } from "@lobbystack/shared";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import { enqueueAgentSnapshotRefresh } from "./agentSnapshot";
import type { DomainContext } from "./context";
import { loadEntitlement } from "./entitlement";
import { enqueueNumberAgentChange, enqueueRefusedCallForwardRefresh } from "./numberTrials";

// A business's agents (ADR 0012). Each channel answers as one agent, and the
// default agent answers wherever no other one does. An agent is archived
// rather than deleted, so history keeps its name.

export type Agent = typeof agents.$inferSelect;
export type AgentChannelKind = "phone_number" | "widget_key" | "instagram_account";

export const AGENT_NAME_MAX_LENGTH = 80;

export type AgentSummary = Pick<Agent, "id" | "name" | "isDefault" | "createdAt" | "updatedAt"> & {
  /** On a plan that keeps fewer agents than the business has, the default agent answers for this one. */
  paused: boolean;
  phoneNumbers: number;
  widgetKeys: number;
  instagramAccounts: number;
};

function agentError(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

function agentName(value: string): string {
  const name = value.trim();
  if (!name || name.length > AGENT_NAME_MAX_LENGTH) throw agentError("name is invalid.", 400, "agent_name_invalid");
  return name;
}

/**
 * The agents a plan pauses: past `includedAgents`, every agent but the
 * default, newest last to keep. Paused agents keep their settings and
 * channels, and come back when the plan allows them again.
 */
export function pausedAgentIds(entitlement: Pick<Entitlement, "includedAgents">, active: ReadonlyArray<Pick<Agent, "id" | "isDefault" | "createdAt">>): Set<string> {
  const limit = entitlement.includedAgents;
  if (limit === null || active.length <= limit) return new Set();
  const kept = [...active].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime()).slice(0, Math.max(limit, 1));
  return new Set(active.filter((agent) => !kept.some((keep) => keep.id === agent.id)).map((agent) => agent.id));
}

/** Holds the business's agents until the transaction ends, so a create, archive or default change can't race another. */
async function lockAgentsInTransaction(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agents:${businessId}`}, 0))`);
}

/** Active agents, the default first and then the oldest. */
export async function listActiveAgentsInTransaction(tx: DatabaseTransaction, businessId: string): Promise<Agent[]> {
  return await tx.select().from(agents).where(and(eq(agents.businessId, businessId), isNull(agents.archivedAt))).orderBy(desc(agents.isDefault), asc(agents.createdAt), asc(agents.id));
}

/** The business's active agent with this id. A 404 otherwise. */
export async function requireActiveAgentInTransaction(tx: DatabaseTransaction, businessId: string, agentId: string): Promise<Agent> {
  const [agent] = await tx.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.businessId, businessId), isNull(agents.archivedAt))).limit(1);
  if (!agent) throw agentError("Agent not found.", 404, "agent_not_found");
  return agent;
}

async function defaultAgentInTransaction(tx: DatabaseTransaction, businessId: string): Promise<Agent> {
  const [agent] = await tx.select().from(agents).where(and(eq(agents.businessId, businessId), eq(agents.isDefault, true))).limit(1);
  if (!agent) throw agentError("This business has no default agent.", 409, "agent_default_missing");
  return agent;
}

export async function listAgents(context: DomainContext, input: { userId: string; businessId: string }): Promise<AgentSummary[]> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const active = await listActiveAgentsInTransaction(tx, input.businessId);
    // One transaction runs one query at a time.
    const [numbers, widgets, instagram, entitlement] = await inOrder([
      () => tx.select({ agentId: phoneNumbers.agentId, total: count() }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), notInArray(phoneNumbers.status, ["reclaimed", "released"]))).groupBy(phoneNumbers.agentId),
      () => tx.select({ agentId: widgetKeys.agentId, total: count() }).from(widgetKeys).where(and(eq(widgetKeys.businessId, input.businessId), ne(widgetKeys.status, "revoked"))).groupBy(widgetKeys.agentId),
      () => tx.select({ agentId: instagramAccounts.agentId, total: count() }).from(instagramAccounts).where(eq(instagramAccounts.businessId, input.businessId)).groupBy(instagramAccounts.agentId),
      () => loadEntitlement(tx, input.businessId),
    ]);
    const counted = (rows: Array<{ agentId: string | null; total: number }>, agentId: string) => Number(rows.find((row) => row.agentId === agentId)?.total ?? 0);
    const paused = pausedAgentIds(entitlement, active);
    return active.map((agent) => ({
      id: agent.id,
      name: agent.name,
      isDefault: agent.isDefault,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      paused: paused.has(agent.id),
      phoneNumbers: counted(numbers, agent.id),
      widgetKeys: counted(widgets, agent.id),
      instagramAccounts: counted(instagram, agent.id),
    }));
  });
}

export async function getAgent(context: DomainContext, input: { userId: string; businessId: string; agentId: string }): Promise<Agent> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await requireActiveAgentInTransaction(tx, input.businessId, input.agentId);
  });
}

/**
 * Adds an agent, as a copy of `copyFromAgentId` or of the default agent: its
 * settings and rules, so it can answer right away. It gets no channel until
 * someone moves one to it. A plan with `includedAgents` refuses an agent past
 * the limit with agent_limit_reached, which opens the upgrade dialog.
 */
export async function createAgentInTransaction(tx: DatabaseTransaction, input: { businessId: string; name: string; copyFromAgentId?: string | undefined }): Promise<Agent> {
  const name = agentName(input.name);
  await lockAgentsInTransaction(tx, input.businessId);
  const { includedAgents } = await loadEntitlement(tx, input.businessId);
  const [active] = await tx.select({ total: count() }).from(agents).where(and(eq(agents.businessId, input.businessId), isNull(agents.archivedAt)));
  if (includedAgents !== null && Number(active?.total ?? 0) >= includedAgents) throw agentError("Your plan includes no more agents.", 402, billingErrorCodes.agentLimitReached);
  const source = input.copyFromAgentId ? await requireActiveAgentInTransaction(tx, input.businessId, input.copyFromAgentId) : await defaultAgentInTransaction(tx, input.businessId);
  const { id: _id, isDefault: _isDefault, archivedAt: _archivedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } = source;
  const [created] = await tx.insert(agents).values({ ...settings, name, isDefault: false, appointmentChangePolicy: source.appointmentChangePolicy ?? defaultAppointmentChangePolicy }).returning();
  if (!created) throw new Error("Agent could not be created.");
  const rules = await tx.select({ title: agentRules.title, content: agentRules.content, active: agentRules.active, sortOrder: agentRules.sortOrder }).from(agentRules).where(and(eq(agentRules.businessId, input.businessId), eq(agentRules.agentId, source.id)));
  if (rules.length) await tx.insert(agentRules).values(rules.map((rule) => ({ ...rule, businessId: input.businessId, agentId: created.id })));
  await enqueueAgentSnapshotRefresh(tx, { businessId: input.businessId, agentId: created.id, change: "agent_created" });
  return created;
}

export async function createAgent(context: DomainContext, input: { userId: string; businessId: string; name: string; copyFromAgentId?: string | undefined }): Promise<Agent> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return await createAgentInTransaction(tx, input);
  });
}

export async function renameAgentInTransaction(tx: DatabaseTransaction, input: { businessId: string; agentId: string; name: string }): Promise<Agent> {
  const name = agentName(input.name);
  await requireActiveAgentInTransaction(tx, input.businessId, input.agentId);
  const [renamed] = await tx.update(agents).set({ name, updatedAt: new Date() }).where(and(eq(agents.id, input.agentId), eq(agents.businessId, input.businessId))).returning();
  if (!renamed) throw agentError("Agent not found.", 404, "agent_not_found");
  return renamed;
}

/**
 * Points a channel at another agent. Open text, website chat and Instagram
 * conversations on it follow in the same transaction, so their next reply
 * comes from the new agent. A call already under way finishes as the agent it
 * started as.
 */
export async function moveChannelInTransaction(tx: DatabaseTransaction, input: { businessId: string; kind: AgentChannelKind; channelId: string; agentId: string }): Promise<void> {
  await requireActiveAgentInTransaction(tx, input.businessId, input.agentId);
  const now = new Date();
  const table = input.kind === "phone_number" ? phoneNumbers : input.kind === "widget_key" ? widgetKeys : instagramAccounts;
  const [current] = await tx.select({ agentId: table.agentId }).from(table).where(and(eq(table.id, input.channelId), eq(table.businessId, input.businessId))).limit(1);
  if (!current) throw agentError("Channel not found.", 404, "channel_not_found");
  if (current.agentId === input.agentId) return;
  await tx.update(table).set({ agentId: input.agentId, updatedAt: now }).where(and(eq(table.id, input.channelId), eq(table.businessId, input.businessId)));
  const channel = input.kind === "phone_number" ? "sms" : input.kind === "widget_key" ? "web_chat" : "instagram";
  if (current.agentId) {
    await tx.update(conversations).set({ agentId: input.agentId, updatedAt: now }).where(and(eq(conversations.businessId, input.businessId), eq(conversations.agentId, current.agentId), eq(conversations.channel, channel), eq(conversations.status, "open")));
  }
  if (input.kind === "phone_number") await enqueueNumberAgentChange(tx, { businessId: input.businessId, phoneNumberId: input.channelId, agentId: input.agentId });
  else await enqueueAgentSnapshotRefresh(tx, { businessId: input.businessId, agentId: input.agentId, change: "channel_moved" });
}

export async function moveChannel(context: DomainContext, input: { userId: string; businessId: string; kind: AgentChannelKind; channelId: string; agentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await moveChannelInTransaction(tx, input);
  });
}

/**
 * Archives an agent. Its channels move to `reassignToAgentId`, or to the
 * default agent, first. The default agent can't be archived: the business
 * picks another default first.
 */
export async function archiveAgentInTransaction(tx: DatabaseTransaction, input: { businessId: string; agentId: string; reassignToAgentId?: string | undefined }): Promise<{ moved: number }> {
  await lockAgentsInTransaction(tx, input.businessId);
  const agent = await requireActiveAgentInTransaction(tx, input.businessId, input.agentId);
  if (agent.isDefault) throw agentError("Choose another default agent first.", 409, "agent_is_default");
  if (input.reassignToAgentId === agent.id) throw agentError("Choose another agent to take over.", 400, "agent_reassign_invalid");
  const successor = input.reassignToAgentId ? await requireActiveAgentInTransaction(tx, input.businessId, input.reassignToAgentId) : await defaultAgentInTransaction(tx, input.businessId);
  const [numbers, widgets, instagram] = await inOrder([
    () => tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.agentId, agent.id), notInArray(phoneNumbers.status, ["reclaimed", "released"]))),
    () => tx.select({ id: widgetKeys.id }).from(widgetKeys).where(and(eq(widgetKeys.businessId, input.businessId), eq(widgetKeys.agentId, agent.id), ne(widgetKeys.status, "revoked"))),
    () => tx.select({ id: instagramAccounts.id }).from(instagramAccounts).where(and(eq(instagramAccounts.businessId, input.businessId), eq(instagramAccounts.agentId, agent.id))),
  ]);
  const moves = [
    ...numbers.map(({ id }) => ({ kind: "phone_number" as const, channelId: id })),
    ...widgets.map(({ id }) => ({ kind: "widget_key" as const, channelId: id })),
    ...instagram.map(({ id }) => ({ kind: "instagram_account" as const, channelId: id })),
  ];
  for (const move of moves) await moveChannelInTransaction(tx, { businessId: input.businessId, ...move, agentId: successor.id });
  // Open conversations on channels it no longer holds go to the agent taking over too.
  await tx.update(conversations).set({ agentId: successor.id, updatedAt: new Date() }).where(and(eq(conversations.businessId, input.businessId), eq(conversations.agentId, agent.id), eq(conversations.status, "open"), inArray(conversations.channel, ["sms", "web_chat", "instagram"])));
  await tx.update(agents).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(agents.id, agent.id), eq(agents.businessId, input.businessId)));
  await enqueueAgentSnapshotRefresh(tx, { businessId: input.businessId, agentId: agent.id, change: "agent_archived" });
  return { moved: moves.length };
}

export async function archiveAgent(context: DomainContext, input: { userId: string; businessId: string; agentId: string; reassignToAgentId?: string | undefined }): Promise<{ moved: number }> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return await archiveAgentInTransaction(tx, input);
  });
}

/** Makes another agent the default, which answers wherever no other agent does. */
export async function setDefaultAgentInTransaction(tx: DatabaseTransaction, input: { businessId: string; agentId: string }): Promise<void> {
  await lockAgentsInTransaction(tx, input.businessId);
  const agent = await requireActiveAgentInTransaction(tx, input.businessId, input.agentId);
  if (agent.isDefault) return;
  const now = new Date();
  // The old default steps down first: the index allows one default per business.
  await tx.update(agents).set({ isDefault: false, updatedAt: now }).where(and(eq(agents.businessId, input.businessId), eq(agents.isDefault, true)));
  await tx.update(agents).set({ isDefault: true, updatedAt: now }).where(and(eq(agents.id, agent.id), eq(agents.businessId, input.businessId)));
  await enqueueAgentSnapshotRefresh(tx, { businessId: input.businessId, agentId: agent.id, change: "agent_updated" });
  // A refused call can forward to the default agent's transfer number.
  await enqueueRefusedCallForwardRefresh(tx, input.businessId);
}

export async function setDefaultAgent(context: DomainContext, input: { userId: string; businessId: string; agentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await setDefaultAgentInTransaction(tx, input);
  });
}
