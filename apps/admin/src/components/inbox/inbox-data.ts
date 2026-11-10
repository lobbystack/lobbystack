// What the Inbox page reads from its URL and asks /api/inbox for. The URL
// holds the filters (`channel`, `agent`, `status`) and the open item (`call`
// or `conversation`), so Home, an agent's menu or an email can link to any of
// them.

import type { CallOutcome } from "../../../../../packages/domain/src/server/callOutcome";

export const INBOX_CHANNELS = ["phone_call", "web_chat", "instagram", "sms", "web_call"] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

export type InboxAgent = { id: string; name: string };

export type InboxItem = {
  key: string;
  kind: "call" | "conversation";
  id: string;
  channel: InboxChannel;
  agent: InboxAgent | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  preview: string | null;
  outcome: CallOutcome | null;
  status: string;
  automationState: string | null;
  occurredAt: string;
};

export type InboxPage = { items: InboxItem[]; nextCursor: string | null; agents: InboxAgent[]; instagramOffered?: boolean };

export type InboxFilters = { channel: InboxChannel | null; agentId: string | null; open: boolean; search: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The filters a URL asks for. A value the API would refuse counts as no filter. */
export function inboxFilters(params: URLSearchParams, search = ""): InboxFilters {
  const channel = params.get("channel");
  const agentId = params.get("agent");
  return {
    channel: (INBOX_CHANNELS as readonly string[]).includes(channel ?? "") ? channel as InboxChannel : null,
    agentId: agentId && UUID.test(agentId) ? agentId : null,
    open: params.get("status") === "open",
    search: search.trim().slice(0, 120),
  };
}

export const INBOX_PAGE_SIZE = 50;

export function inboxRequestUrl(filters: InboxFilters, cursor?: string | null): string {
  const query = new URLSearchParams({ limit: String(INBOX_PAGE_SIZE) });
  if (filters.channel) query.set("channel", filters.channel);
  if (filters.agentId) query.set("agentId", filters.agentId);
  if (filters.open) query.set("status", "open");
  if (filters.search) query.set("search", filters.search);
  if (cursor) query.set("cursor", cursor);
  return `/api/inbox?${query.toString()}`;
}

/** The same page with some parameters changed; null removes one. */
export function inboxHref(pathname: string, params: URLSearchParams, change: Record<string, string | null>): string {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(change)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** The parameters that open an item, closing any other. */
export function openItemChange(item: Pick<InboxItem, "kind" | "id">): Record<string, string | null> {
  return item.kind === "call" ? { call: item.id, conversation: null } : { conversation: item.id, call: null };
}

/** The item a URL opens, as an Inbox key, or null. */
export function openKey(params: URLSearchParams): string | null {
  const call = params.get("call");
  if (call) return `call:${call}`;
  const conversation = params.get("conversation");
  return conversation ? `conversation:${conversation}` : null;
}
