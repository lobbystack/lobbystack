import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { contacts, conversations, messages } from "@lobbystack/db";
import { appendMessage } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => ({ messages: await tx.select({ id: messages.id, conversationId: messages.conversationId, contactName: contacts.name, contactPhone: contacts.phone, body: messages.body, channel: messages.channel, direction: messages.direction, status: messages.status, createdAt: messages.createdAt }).from(messages).leftJoin(conversations, eq(messages.conversationId, conversations.id)).leftJoin(contacts, eq(conversations.contactId, contacts.id)).where(eq(messages.businessId, businessId)).orderBy(desc(messages.createdAt)).limit(100) }))); } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request) as { conversationId?: string; body?: string; channel?: "sms" | "dashboard" };
    const businessId = businessIdFromRequest(request);
    if (!businessId || !body.conversationId || !body.body) return NextResponse.json({ error: "businessId, conversationId, and body are required." }, { status: 400 });
    const session = await (await import("@/lib/api-helpers")).requireApiSession(request);
    return NextResponse.json({ messageId: await appendMessage(createDomainContext(), { businessId, conversationId: body.conversationId, body: body.body, direction: "outbound", channel: body.channel ?? "dashboard", userId: session.user.id }), }, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
