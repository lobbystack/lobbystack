import { NextResponse } from "next/server";
import { z } from "zod";

import { inboxChannels, listInboxItems, MAX_INBOX_ITEMS } from "@lobbystack/domain";
import { instagramConfigured } from "@/lib/instagram-oauth";
import { operatorRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  channel: z.enum(inboxChannels).optional(),
  agentId: z.uuid().optional(),
  search: z.string().max(120).optional(),
  // What waits on the team, as Home's Action required lists it.
  status: z.enum(["open"]).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_INBOX_ITEMS).optional(),
});

/** Calls, texts, website chats and Instagram threads in one list, newest first, with the business's active agents and whether Instagram is offered. */
export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const params = new URL(request.url).searchParams;
  const query = querySchema.parse(Object.fromEntries(["channel", "agentId", "search", "status", "cursor", "limit"].flatMap((name) => {
    const value = params.get(name);
    return value ? [[name, value]] : [];
  })));
  const { status, ...filters } = query;
  const page = await listInboxItems(domain, { userId, businessId, ...filters, ...(status === "open" ? { open: true } : {}) });
  // The Instagram filter shows once this server has a Meta app. The Inbox is activity, so it needs nothing from the setup-only Integrations routes.
  return NextResponse.json({ ...page, instagramOffered: instagramConfigured() });
});
