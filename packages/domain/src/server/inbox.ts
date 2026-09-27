import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { calls, contacts, conversations, messages, widgetVisitors, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

/** What the inbox groups by: phone and browser calls, website chats, and texts. */
export type InboxChannel = "call" | "chat" | "text";

export type InboxItem = {
  /** `call:<id>` or `conversation:<id>`, unique across kinds. */
  key: string;
  kind: "call" | "conversation";
  id: string;
  channel: InboxChannel;
  agentId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  preview: string | null;
  status: string;
  automationState: string | null;
  occurredAt: Date;
};

const MAX_INBOX_ITEMS = 100;

/**
 * One inbox for the business: calls, website chats and texts, newest first.
 * `channel` and `agentId` narrow it; `search` matches names, numbers and text.
 */
export async function listInboxItems(
  context: DomainContext,
  input: { userId: string; businessId: string; channel?: InboxChannel; agentId?: string; search?: string; limit?: number },
): Promise<InboxItem[]> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), MAX_INBOX_ITEMS);
  const search = input.search?.trim().slice(0, 120);
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const wantCalls = !input.channel || input.channel === "call";
    const conversationChannels = !input.channel ? ["web_chat", "sms"] : input.channel === "chat" ? ["web_chat"] : input.channel === "text" ? ["sms"] : [];

    const callRows = wantCalls ? await tx.select({
      id: calls.id,
      agentId: calls.agentId,
      status: calls.status,
      disposition: calls.disposition,
      summary: conversations.summary,
      startedAt: calls.startedAt,
      contactName: contacts.name,
      contactPhone: contacts.phone,
    }).from(calls)
      .leftJoin(contacts, eq(calls.contactId, contacts.id))
      .leftJoin(conversations, eq(calls.conversationId, conversations.id))
      .where(and(
        eq(calls.businessId, input.businessId),
        ...(input.agentId ? [eq(calls.agentId, input.agentId)] : []),
        ...(search ? [or(ilike(contacts.name, `%${search}%`), ilike(contacts.phone, `%${search}%`), ilike(conversations.summary, `%${search}%`))!] : []),
      ))
      .orderBy(desc(calls.startedAt))
      .limit(limit) : [];

    // The latest message of each conversation, found without scanning every message.
    const latest = sql<string | null>`(select ${messages.body} from ${messages} where ${messages.conversationId} = ${conversations.id} order by ${messages.createdAt} desc limit 1)`;
    const latestAt = sql<Date | null>`(select max(${messages.createdAt}) from ${messages} where ${messages.conversationId} = ${conversations.id})`;
    const conversationRows = conversationChannels.length ? await tx.select({
      id: conversations.id,
      agentId: conversations.agentId,
      channel: conversations.channel,
      status: conversations.status,
      automationState: conversations.automationState,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      visitorName: widgetVisitors.name,
      visitorEmail: widgetVisitors.email,
      preview: latest,
      latestAt,
      updatedAt: conversations.updatedAt,
    }).from(conversations)
      .leftJoin(contacts, eq(conversations.contactId, contacts.id))
      .leftJoin(widgetVisitors, eq(conversations.widgetVisitorId, widgetVisitors.id))
      .where(and(
        eq(conversations.businessId, input.businessId),
        inArray(conversations.channel, conversationChannels),
        sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id})`,
        ...(input.agentId ? [eq(conversations.agentId, input.agentId)] : []),
        ...(search ? [or(ilike(contacts.name, `%${search}%`), ilike(contacts.phone, `%${search}%`), ilike(widgetVisitors.name, `%${search}%`), ilike(widgetVisitors.email, `%${search}%`), sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id} and ${messages.body} ilike ${`%${search}%`})`)!] : []),
      ))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit) : [];

    const items: InboxItem[] = [
      ...callRows.map((row) => ({
        key: `call:${row.id}`,
        kind: "call" as const,
        id: row.id,
        channel: "call" as const,
        agentId: row.agentId,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        contactEmail: null,
        preview: row.summary ?? row.disposition,
        status: row.status,
        automationState: null,
        occurredAt: row.startedAt,
      })),
      ...conversationRows.map((row) => ({
        key: `conversation:${row.id}`,
        kind: "conversation" as const,
        id: row.id,
        channel: row.channel === "web_chat" ? "chat" as const : "text" as const,
        agentId: row.agentId,
        contactName: row.contactName ?? row.visitorName,
        contactPhone: row.contactPhone,
        contactEmail: row.visitorEmail,
        preview: row.preview,
        status: row.status,
        automationState: row.automationState,
        occurredAt: row.latestAt ? new Date(row.latestAt) : row.updatedAt,
      })),
    ];
    return items.sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()).slice(0, limit);
  });
}
