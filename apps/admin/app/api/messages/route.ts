import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { contacts, conversations, messages, widgetVisitors } from "@lobbystack/db";
import { appendMessage, setAutomationState } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { asApiResponse, businessIdFromRequest, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

const conversationFields = { conversationId: conversations.id, contactName: contacts.name, contactPhone: contacts.phone, visitorName: widgetVisitors.name, visitorEmail: widgetVisitors.email, channel: conversations.channel, automationState: conversations.automationState };

/** Without conversationId: one row per conversation (its latest message), newest first, paged. With it: that thread. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    if (conversationId !== null && !isUuid(conversationId)) return jsonError("conversationId must be a UUID.", 400);
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      if (conversationId) {
        // shortcut: returns the newest 500 messages of a thread; add "load older" paging if threads grow past that.
        const thread = await tx.select({ id: messages.id, ...conversationFields, body: messages.body, direction: messages.direction, status: messages.status, createdAt: messages.createdAt }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).leftJoin(contacts, eq(conversations.contactId, contacts.id)).leftJoin(widgetVisitors, eq(conversations.widgetVisitorId, widgetVisitors.id)).where(and(eq(messages.businessId, businessId), eq(messages.conversationId, conversationId))).orderBy(desc(messages.createdAt)).limit(500);
        return { messages: thread.reverse() };
      }
      const limit = Math.min(Math.max(Math.trunc(Number(url.searchParams.get("limit")) || 50), 1), 100);
      const offset = Math.max(Math.trunc(Number(url.searchParams.get("offset")) || 0), 0);
      const search = url.searchParams.get("search")?.trim();
      const channel = url.searchParams.get("channel");
      const latest = tx.select({ id: messages.id, body: messages.body, direction: messages.direction, status: messages.status, createdAt: messages.createdAt }).from(messages).where(eq(messages.conversationId, conversations.id)).orderBy(desc(messages.createdAt)).limit(1).as("latest");
      const rows = await tx.select({ id: latest.id, ...conversationFields, body: latest.body, direction: latest.direction, status: latest.status, createdAt: latest.createdAt }).from(conversations).innerJoinLateral(latest, sql`true`).leftJoin(contacts, eq(conversations.contactId, contacts.id)).leftJoin(widgetVisitors, eq(conversations.widgetVisitorId, widgetVisitors.id)).where(and(
        eq(conversations.businessId, businessId),
        channel === "web_chat" ? eq(conversations.channel, "web_chat") : channel === "sms" ? ne(conversations.channel, "web_chat") : undefined,
        search ? or(...[contacts.name, contacts.phone, widgetVisitors.name, widgetVisitors.email, latest.body].map((column) => ilike(column, `%${search}%`))) : undefined,
      )).orderBy(desc(latest.createdAt), desc(conversations.id)).limit(limit + 1).offset(offset);
      return { messages: rows.slice(0, limit), hasNext: rows.length > limit };
    }));
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request) as { conversationId?: string; body?: string; channel?: "sms" | "dashboard" | "web_chat" };
    const businessId = businessIdFromRequest(request);
    if (!businessId || !body.conversationId || !body.body) return jsonError("businessId, conversationId, and body are required.", 400);
    const session = await (await import("@/lib/api-helpers")).requireApiSession(request);
    return NextResponse.json({ messageId: await appendMessage(createDomainContext(), { businessId, conversationId: body.conversationId, body: body.body, direction: "outbound", channel: body.channel ?? "dashboard", userId: session.user.id }), }, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJson(request) as { conversationId?: string; automationState?: "ai_active" | "human_handoff" };
    const businessId = businessIdFromRequest(request);
    if (!businessId || !body.conversationId || (body.automationState !== "ai_active" && body.automationState !== "human_handoff")) return jsonError("conversationId and a valid automationState are required.", 400);
    const session = await (await import("@/lib/api-helpers")).requireApiSession(request);
    await setAutomationState(createDomainContext(), { userId: session.user.id, businessId, conversationId: body.conversationId, state: body.automationState });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
