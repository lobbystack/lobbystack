import { and, desc, eq, ilike, inArray, lt, or, sql, type Column, type SQL } from "drizzle-orm";

import { agentOfRow, agents, calls, contacts, conversations, conversationSessions, inboxItems, messages, widgetVisitors, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import { listActiveAgentsInTransaction } from "./agents";
import { resolveCallOutcome, type CallOutcome } from "./callOutcome";
import type { DomainContext } from "./context";

// The Inbox: every call, text, website chat and Instagram thread of a
// business in one list, newest first, each with the agent that handled it.

export const inboxChannels = ["phone_call", "web_call", "sms", "web_chat", "instagram"] as const;
export type InboxChannel = (typeof inboxChannels)[number];

const conversationChannels = ["sms", "web_chat", "instagram"] as const satisfies readonly InboxChannel[];
type ConversationChannel = (typeof conversationChannels)[number];

export type InboxAgent = { id: string; name: string };

export type InboxItem = {
  /** `call:<id>` or `conversation:<id>`, unique across kinds. */
  key: string;
  kind: "call" | "conversation";
  id: string;
  channel: InboxChannel;
  /** The agent that handled it, archived or not. A row the agent backfill hasn't reached shows the default agent. */
  agent: InboxAgent | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  preview: string | null;
  /** What came of a call, as the call's own page says it. Conversations have none. */
  outcome: CallOutcome | null;
  status: string;
  automationState: string | null;
  /** When the call started, or when the conversation's latest message came in. */
  occurredAt: Date;
};

export type InboxPage = {
  items: InboxItem[];
  /** Pass back as `cursor` for the next page; null on the last one. */
  nextCursor: string | null;
  /** The business's active agents, the default first, for the agent filter. */
  agents: InboxAgent[];
};

export type InboxInput = {
  userId: string;
  businessId: string;
  channel?: InboxChannel | undefined;
  agentId?: string | undefined;
  search?: string | undefined;
  /** Only what Home's Action required lists: calls with an open follow-up and conversations handed to the team. */
  open?: boolean | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

export const MAX_INBOX_ITEMS = 100;

/** A call sorts below a conversation at the same instant, and ids break the rest of a tie. */
const kindRank = { call: 0, conversation: 1 } as const;

// The position is kept to the microsecond, as PostgreSQL stores it, so no
// row between two milliseconds is skipped or repeated across pages.
type Position = { at: string; kind: InboxItem["kind"]; id: string };

const UTC_MICROSECONDS = "YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function cursorError(): Error {
  return Object.assign(new Error("The inbox cursor is invalid."), { status: 400, code: "inbox_cursor_invalid" });
}

export function encodeInboxCursor(position: Position): string {
  return Buffer.from(JSON.stringify([position.at, position.kind, position.id])).toString("base64url");
}

export function decodeInboxCursor(cursor: string): Position {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw cursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) throw cursorError();
  const [at, kind, id] = parsed as unknown[];
  if (typeof at !== "string" || !AT_PATTERN.test(at) || (kind !== "call" && kind !== "conversation") || typeof id !== "string" || !UUID_PATTERN.test(id)) throw cursorError();
  return { at, kind, id };
}

/** Newest first: by time, then a conversation before a call, then the larger id. */
function comparePositions(left: Position, right: Position): number {
  if (left.at !== right.at) return left.at < right.at ? 1 : -1;
  if (left.kind !== right.kind) return kindRank[right.kind] - kindRank[left.kind];
  return left.id === right.id ? 0 : left.id < right.id ? 1 : -1;
}

/** Rows of one kind that come after the cursor. */
function afterCursor(cursor: Position | undefined, kind: InboxItem["kind"], at: SQL, id: Column): SQL | undefined {
  if (!cursor) return undefined;
  const before = sql`${at} < ${cursor.at}::timestamptz`;
  const sameInstant = sql`${at} = ${cursor.at}::timestamptz`;
  if (kindRank[kind] < kindRank[cursor.kind]) return or(before, sameInstant);
  if (kindRank[kind] > kindRank[cursor.kind]) return before;
  return or(before, and(sameInstant, lt(id, cursor.id)));
}

const isWebCall = sql`lower(${calls.transport}) like '%web%'`;

function callChannelFilter(channel: InboxChannel | undefined): SQL | undefined {
  if (channel === "web_call") return isWebCall;
  if (channel === "phone_call") return sql`not (${isWebCall})`;
  return undefined;
}

function wantedConversationChannels(channel: InboxChannel | undefined): ConversationChannel[] {
  if (!channel) return [...conversationChannels];
  return (conversationChannels as readonly InboxChannel[]).includes(channel) ? [channel as ConversationChannel] : [];
}

function agentOf(id: string | null, name: string | null): InboxAgent | null {
  return id && name !== null ? { id, name } : null;
}

/**
 * One page of the Inbox, newest first. `channel` and `agentId` narrow it, and
 * `search` matches names, numbers, emails, a call's summary and a thread's
 * latest message, and `open` keeps what waits on the team. Calls and conversations are read apart and merged, each
 * source limited to one page past the cursor.
 */
export async function listInboxItems(context: DomainContext, input: InboxInput): Promise<InboxPage> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), MAX_INBOX_ITEMS);
  const search = input.search?.trim().slice(0, 120) || undefined;
  const cursor = input.cursor ? decodeInboxCursor(input.cursor) : undefined;
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const pattern = search ? `%${search}%` : undefined;
    const wantCalls = !input.channel || input.channel === "phone_call" || input.channel === "web_call";
    const channels = wantedConversationChannels(input.channel);

    const callAt = sql<string>`to_char(${calls.startedAt} at time zone 'UTC', ${UTC_MICROSECONDS})`;
    const callRows = wantCalls ? await tx.select({
      id: calls.id,
      at: callAt,
      transport: calls.transport,
      status: calls.status,
      disposition: calls.disposition,
      summary: conversations.summary,
      currentIntent: conversations.currentIntent,
      persistedOutcome: conversationSessions.summary,
      startedAt: calls.startedAt,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
      agentId: agents.id,
      agentName: agents.name,
    }).from(calls)
      .leftJoin(contacts, eq(calls.contactId, contacts.id))
      .leftJoin(conversations, eq(calls.conversationId, conversations.id))
      .leftJoin(conversationSessions, and(eq(conversationSessions.callId, calls.id), eq(conversationSessions.businessId, calls.businessId)))
      .leftJoin(agents, agentOfRow(calls.businessId, calls.agentId))
      .where(and(
        eq(calls.businessId, input.businessId),
        callChannelFilter(input.channel),
        input.agentId ? eq(calls.agentId, input.agentId) : undefined,
        input.open ? sql`exists (select 1 from ${inboxItems} where ${inboxItems.businessId} = ${input.businessId} and ${inboxItems.relatedCallId} = ${calls.id} and ${inboxItems.kind} = 'voice_message' and ${inboxItems.status} = 'open')` : undefined,
        pattern ? or(ilike(contacts.name, pattern), ilike(contacts.phone, pattern), ilike(conversations.summary, pattern), ilike(calls.disposition, pattern)) : undefined,
        afterCursor(cursor, "call", sql`${calls.startedAt}`, calls.id),
      ))
      .orderBy(desc(calls.startedAt), desc(calls.id))
      .limit(limit + 1) : [];

    // Each conversation's latest message, read through messages_conversation_idx.
    const latest = tx.select({ body: messages.body, createdAt: messages.createdAt }).from(messages).where(eq(messages.conversationId, conversations.id)).orderBy(desc(messages.createdAt)).limit(1).as("latest");
    const conversationRows = channels.length ? await tx.select({
      id: conversations.id,
      at: sql<string>`to_char(${latest.createdAt} at time zone 'UTC', ${UTC_MICROSECONDS})`,
      channel: conversations.channel,
      status: conversations.status,
      automationState: conversations.automationState,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
      visitorName: widgetVisitors.name,
      visitorEmail: widgetVisitors.email,
      preview: latest.body,
      latestAt: latest.createdAt,
      agentId: agents.id,
      agentName: agents.name,
    }).from(conversations)
      .innerJoinLateral(latest, sql`true`)
      .leftJoin(contacts, eq(conversations.contactId, contacts.id))
      .leftJoin(widgetVisitors, eq(conversations.widgetVisitorId, widgetVisitors.id))
      .leftJoin(agents, agentOfRow(conversations.businessId, conversations.agentId))
      .where(and(
        eq(conversations.businessId, input.businessId),
        inArray(conversations.channel, channels),
        input.agentId ? eq(conversations.agentId, input.agentId) : undefined,
        input.open ? eq(conversations.automationState, "human_handoff") : undefined,
        pattern ? or(ilike(contacts.name, pattern), ilike(contacts.phone, pattern), ilike(contacts.email, pattern), ilike(widgetVisitors.name, pattern), ilike(widgetVisitors.email, pattern), ilike(latest.body, pattern)) : undefined,
        afterCursor(cursor, "conversation", sql`${latest.createdAt}`, conversations.id),
      ))
      .orderBy(desc(latest.createdAt), desc(conversations.id))
      .limit(limit + 1) : [];

    const merged: Array<InboxItem & { position: Position }> = [
      ...callRows.map((row) => ({
        key: `call:${row.id}`,
        kind: "call" as const,
        id: row.id,
        channel: (row.transport.toLowerCase().includes("web") ? "web_call" : "phone_call") as InboxChannel,
        agent: agentOf(row.agentId, row.agentName),
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail,
        preview: row.summary === row.disposition ? null : row.summary,
        outcome: resolveCallOutcome({ persisted: row.persistedOutcome, currentIntent: row.currentIntent, summary: row.summary, disposition: row.disposition }),
        status: row.status,
        automationState: null,
        occurredAt: row.startedAt,
        position: { at: row.at, kind: "call" as const, id: row.id },
      })),
      ...conversationRows.map((row) => ({
        key: `conversation:${row.id}`,
        kind: "conversation" as const,
        id: row.id,
        channel: row.channel as InboxChannel,
        agent: agentOf(row.agentId, row.agentName),
        contactName: row.contactName ?? row.visitorName,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail ?? row.visitorEmail,
        preview: row.preview,
        outcome: null,
        status: row.status,
        automationState: row.automationState,
        occurredAt: new Date(row.latestAt),
        position: { at: row.at, kind: "conversation" as const, id: row.id },
      })),
    ].sort((left, right) => comparePositions(left.position, right.position));

    const page = merged.slice(0, limit);
    const last = page.at(-1);
    const active = await listActiveAgentsInTransaction(tx, input.businessId);
    return {
      items: page.map(({ position: _position, ...item }) => item),
      nextCursor: merged.length > limit && last ? encodeInboxCursor(last.position) : null,
      agents: active.map((agent) => ({ id: agent.id, name: agent.name })),
    };
  });
}
