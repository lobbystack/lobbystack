import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { contacts, conversations, messages, widgetVisitors } from "@lobbystack/db";
import { appendMessage, setAutomationState } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => ({ messages: await tx.select({ id: messages.id, conversationId: messages.conversationId, contactName: contacts.name, contactPhone: contacts.phone, visitorName: widgetVisitors.name, visitorEmail: widgetVisitors.email, channel: conversations.channel, automationState: conversations.automationState, body: messages.body, direction: messages.direction, status: messages.status, createdAt: messages.createdAt }).from(messages).leftJoin(conversations, eq(messages.conversationId, conversations.id)).leftJoin(contacts, eq(conversations.contactId, contacts.id)).leftJoin(widgetVisitors, eq(conversations.widgetVisitorId, widgetVisitors.id)).where(eq(messages.businessId, businessId)).orderBy(desc(messages.createdAt)).limit(200) }))); } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request) as { conversationId?: string; body?: string; channel?: "sms" | "dashboard" | "web_chat" };
    const businessId = businessIdFromRequest(request);
    if (!businessId || !body.conversationId || !body.body) return NextResponse.json({ error: "businessId, conversationId, and body are required." }, { status: 400 });
    const session = await (await import("@/lib/api-helpers")).requireApiSession(request);
    return NextResponse.json({ messageId: await appendMessage(createDomainContext(), { businessId, conversationId: body.conversationId, body: body.body, direction: "outbound", channel: body.channel ?? "dashboard", userId: session.user.id }), }, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJson(request) as { conversationId?: string; automationState?: "ai_active" | "human_handoff" };
    const businessId = businessIdFromRequest(request);
    if (!businessId || !body.conversationId || (body.automationState !== "ai_active" && body.automationState !== "human_handoff")) return NextResponse.json({ error: "conversationId and a valid automationState are required." }, { status: 400 });
    const session = await (await import("@/lib/api-helpers")).requireApiSession(request);
    await setAutomationState(createDomainContext(), { userId: session.user.id, businessId, conversationId: body.conversationId, state: body.automationState });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
