import { and, eq, sql } from "drizzle-orm";

import { calls, contacts, conversations, firstRealConversations, messages, transcripts, type DatabaseTransaction } from "@lobbystack/db";
import { isNonBillableCallDisposition, WIDGET_VOICE_ID } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem, getPostHogDistinctIdForUser } from "@lobbystack/telemetry";

import { recordProductEventInTransaction } from "./productEvents";

type RealConversationChannel = "voice" | "web_voice" | "web_chat" | "instagram" | "sms";

const CHAT_CHANNELS: ReadonlySet<string> = new Set(["web_chat", "instagram", "sms"] satisfies RealConversationChannel[]);

/** Endings where nobody talked with the agent, so the call is never a real conversation. */
const NOT_A_CONVERSATION = new Set(["setup_failed", "blocked_contact"]);

type EndedCall = {
  id: string;
  conversationId: string | null;
  contactId: string | null;
  transport: string;
  widgetId: string | null;
  prospectDemoId: string | null;
  mediaStartedAt: Date | null;
  disposition: string | null;
  status: string;
};

/**
 * Whether a call can be a customer's, from what the call row says. On the web
 * only the embedded website widget qualifies: the other browser calls are the
 * operator's test call, a prospect demo and the landing page's public demo.
 */
export function isRealCallCandidate(call: Omit<EndedCall, "id" | "conversationId" | "contactId">): boolean {
  if (call.status !== "completed" && call.status !== "transferred") return false;
  if (call.mediaStartedAt === null || call.prospectDemoId !== null) return false;
  if (isNonBillableCallDisposition(call.disposition) || NOT_A_CONVERSATION.has(call.disposition ?? "")) return false;
  return call.transport !== "web_voice" || call.widgetId === WIDGET_VOICE_ID;
}

/** When the business had its first real conversation, or null before it has one. The row outlives the conversation, so the answer never goes back to null. */
export async function readFirstRealConversationAt(tx: DatabaseTransaction, businessId: string): Promise<Date | null> {
  return (await tx.select({ occurredAt: firstRealConversations.occurredAt }).from(firstRealConversations).where(eq(firstRealConversations.businessId, businessId)).limit(1))[0]?.occurredAt ?? null;
}

async function alreadyRecorded(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  return (await tx.select({ businessId: firstRealConversations.businessId }).from(firstRealConversations).where(eq(firstRealConversations.businessId, businessId)).limit(1)).length > 0;
}

/**
 * Claims the business's one row and writes the event with it, so a retry or a
 * second conversation racing this one can't report another first. A business
 * with telemetry off keeps the row and sends nothing.
 */
async function claim(tx: DatabaseTransaction, input: { businessId: string; channel: RealConversationChannel; conversationId: string | null; customerPhone: string | null }): Promise<void> {
  const facts = (await tx.execute<{ owner_user_id: string | null; team_phone: boolean }>(sql`select owner_user_id, team_phone from app.first_real_conversation_facts(${input.businessId}::uuid, ${input.customerPhone})`)).rows[0];
  if (facts?.team_phone) return;
  const [claimed] = await tx.insert(firstRealConversations).values({ businessId: input.businessId, channel: input.channel, ...(input.conversationId ? { conversationId: input.conversationId } : {}) }).onConflictDoNothing().returning({ businessId: firstRealConversations.businessId });
  if (!claimed) return;
  await recordProductEventInTransaction(tx, {
    name: "conversation.first_real_recorded",
    businessId: input.businessId,
    // The owner's person, so PostHog's test user filters and signup funnels reach this event.
    distinctId: facts?.owner_user_id ? getPostHogDistinctIdForUser(facts.owner_user_id) : getPostHogDistinctIdForBusinessSystem(input.businessId),
    properties: { channel: input.channel, ...(input.conversationId ? { conversationId: input.conversationId } : {}) },
  });
}

/**
 * Records a call a team member took, if it's the business's first real
 * conversation: a customer reached the business's number and someone answered.
 * The call has no conversation or transcript, so the seconds the carrier
 * bridged stand in for the caller speaking.
 */
export async function recordFirstStaffAnsweredCallInTransaction(tx: DatabaseTransaction, input: { businessId: string; contactId: string | null; seconds: number }): Promise<void> {
  const { businessId, contactId } = input;
  if (input.seconds <= 0 || await alreadyRecorded(tx, businessId)) return;
  const contact = contactId ? (await tx.select({ phone: contacts.phone }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.businessId, businessId))).limit(1))[0] : undefined;
  await claim(tx, { businessId, channel: "voice", conversationId: null, customerPhone: contact?.phone ?? null });
}

/** Records a call that just ended, if it's the business's first real conversation. A caller who never spoke doesn't count. */
export async function recordFirstRealCallInTransaction(tx: DatabaseTransaction, input: { businessId: string; call: EndedCall }): Promise<void> {
  const { businessId, call } = input;
  if (!call.conversationId || !isRealCallCandidate(call) || await alreadyRecorded(tx, businessId)) return;
  const [callerTurn] = await tx.select({ id: transcripts.id }).from(transcripts).where(and(eq(transcripts.businessId, businessId), eq(transcripts.callId, call.id), eq(transcripts.speaker, "caller"))).limit(1);
  if (!callerTurn) return;
  const contact = call.contactId ? (await tx.select({ phone: contacts.phone }).from(contacts).where(and(eq(contacts.id, call.contactId), eq(contacts.businessId, businessId))).limit(1))[0] : undefined;
  await claim(tx, { businessId, channel: call.transport === "web_voice" ? "web_voice" : "voice", conversationId: call.conversationId, customerPhone: contact?.phone ?? null });
}

/**
 * Records a reply just saved in a chat, if it's the business's first real
 * conversation: a customer wrote and the agent or the team answered. Replies
 * are the point, since a message nobody answered isn't a conversation.
 */
export async function recordFirstRealChatInTransaction(tx: DatabaseTransaction, input: { businessId: string; conversationId: string }): Promise<void> {
  const { businessId, conversationId } = input;
  if (await alreadyRecorded(tx, businessId)) return;
  const conversation = (await tx.select({ channel: conversations.channel, contactId: conversations.contactId }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId))).limit(1))[0];
  if (!conversation || !CHAT_CHANNELS.has(conversation.channel)) return;
  const [customerMessage] = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.businessId, businessId), eq(messages.conversationId, conversationId), eq(messages.direction, "inbound"))).limit(1);
  if (!customerMessage) return;
  const contact = conversation.contactId ? (await tx.select({ phone: contacts.phone }).from(contacts).where(and(eq(contacts.id, conversation.contactId), eq(contacts.businessId, businessId))).limit(1))[0] : undefined;
  await claim(tx, { businessId, channel: conversation.channel as RealConversationChannel, conversationId, customerPhone: contact?.phone ?? null });
}
