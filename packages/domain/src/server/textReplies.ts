import { and, count, desc, eq, gt, sql } from "drizzle-orm";

import { contacts, conversations, enqueueOutbox, messages, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";
import { insertMessageInTransaction } from "./conversations";
import { queueOperatorAlertInTransaction } from "./notifications";
import { loadTextReplyReachInTransaction, queueUnansweredTextAlertInTransaction, textReplyBlockedReason } from "./sms";

/**
 * Replies in the window that hand a conversation to the team. A loop with
 * another bot replies every few seconds, and each text costs money, so this
 * trips sooner than Instagram's guard.
 */
export const TEXT_REPLY_LOOP_LIMIT = 5;
export const TEXT_REPLY_LOOP_WINDOW_MS = 5 * 60_000;
/** Replies in a day that hand a conversation to the team, however slowly they came. */
export const TEXT_REPLY_CONVERSATION_DAILY_LIMIT = 20;
/** Replies a business sends in a day, so a burst of texts can't run up its carrier bill. */
export const TEXT_REPLY_BUSINESS_DAILY_LIMIT = 500;

const DAY_MS = 24 * 60 * 60_000;

export type TextReplyContext = {
  phone: string;
  history: Array<{ direction: "inbound" | "outbound"; body: string }>;
};

/**
 * What the receptionist needs to answer a text, or null when it shouldn't: the
 * team has the conversation, a newer text arrived (its own job answers them
 * together), the text can't go out, or a limit stopped it. The team hears
 * about any of these that leaves the customer waiting.
 */
export async function loadTextReplyContext(context: DomainContext, input: { businessId: string; conversationId: string; messageId: string; now?: Date }): Promise<TextReplyContext | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    if (!await stillAnsweringInTransaction(tx, input)) return null;
    const reach = await loadTextReplyReachInTransaction(tx, input);
    if (textReplyBlockedReason(reach) || !reach.phone) {
      await queueUnansweredTextAlertInTransaction(tx, input);
      return null;
    }
    const now = input.now ?? new Date();
    const aiReply = and(eq(messages.direction, "outbound"), eq(messages.channel, "sms"), eq(messages.aiGenerated, true));
    const [limits] = await tx.select({
      business: count(),
      conversationDay: sql<number>`count(*) filter (where ${messages.conversationId} = ${input.conversationId})`.mapWith(Number),
      conversationLoop: sql<number>`count(*) filter (where ${messages.conversationId} = ${input.conversationId} and ${messages.createdAt} > ${new Date(now.getTime() - TEXT_REPLY_LOOP_WINDOW_MS).toISOString()}::timestamptz)`.mapWith(Number),
    }).from(messages).where(and(eq(messages.businessId, input.businessId), aiReply, gt(messages.createdAt, new Date(now.getTime() - DAY_MS))));
    if ((limits?.conversationLoop ?? 0) >= TEXT_REPLY_LOOP_LIMIT || (limits?.conversationDay ?? 0) >= TEXT_REPLY_CONVERSATION_DAILY_LIMIT) {
      await handOffToTeamInTransaction(tx, { ...input, now });
      return null;
    }
    if ((limits?.business ?? 0) >= TEXT_REPLY_BUSINESS_DAILY_LIMIT) {
      await queueUnansweredTextAlertInTransaction(tx, input);
      return null;
    }
    const rows = await tx.select({ direction: messages.direction, body: messages.body }).from(messages)
      .where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId), eq(messages.channel, "sms"))).orderBy(desc(messages.createdAt)).limit(20);
    return { phone: reach.phone, history: rows.reverse().map((row) => ({ direction: row.direction === "inbound" ? "inbound" : "outbound", body: row.body })) };
  });
}

async function handOffToTeamInTransaction(tx: DatabaseTransaction, input: { businessId: string; conversationId: string; now: Date }): Promise<void> {
  await tx.update(conversations).set({ automationState: "human_handoff", automationPausedAt: input.now, automationPausedByUserId: null, updatedAt: input.now })
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
  await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "conversation", aggregateId: input.conversationId, dedupeKey: `conversation:${input.conversationId}:text-reply-limit:${input.now.getTime()}`, payload: { type: "conversation.updated", entityId: input.conversationId } });
  await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "aiReplyFailed", eventKey: `text-reply-limit:${input.conversationId}:${input.now.toISOString().slice(0, 13)}`, subject: "Text conversation paused", body: "The receptionist stopped answering a text conversation after sending too many replies, which can mean another automated sender. Open Messages to take it over or turn the receptionist back on." });
}

/**
 * Whether the receptionist still answers `messageId`: the conversation is an
 * open text one it handles, the contact isn't blocked, and that message is
 * still the newest text. Locks the conversation, so the answer holds until the
 * transaction ends.
 */
async function stillAnsweringInTransaction(tx: DatabaseTransaction, input: { businessId: string; conversationId: string; messageId: string }): Promise<boolean> {
  const [conversation] = await tx.select({ automationState: conversations.automationState, channel: conversations.channel, status: conversations.status, contactBlockedAt: contacts.operatorBlockedAt })
    .from(conversations).leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId))).limit(1).for("update", { of: conversations });
  if (!conversation || conversation.channel !== "sms" || conversation.status !== "open" || conversation.automationState !== "ai_active" || conversation.contactBlockedAt) return false;
  const [latest] = await tx.select({ id: messages.id, direction: messages.direction }).from(messages)
    .where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId), eq(messages.channel, "sms"))).orderBy(desc(messages.createdAt)).limit(1);
  return latest?.id === input.messageId && latest.direction === "inbound";
}

/**
 * Saves the receptionist's reply to `answeringMessageId` and queues it to send,
 * or returns null when, while the reply was written, the team took the
 * conversation over or a newer text arrived.
 */
export async function saveTextReply(context: DomainContext, input: { businessId: string; conversationId: string; answeringMessageId: string; body: string }): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    if (!await stillAnsweringInTransaction(tx, { businessId: input.businessId, conversationId: input.conversationId, messageId: input.answeringMessageId })) return null;
    return await insertMessageInTransaction(tx, { businessId: input.businessId, conversationId: input.conversationId, body: input.body, direction: "outbound", channel: "sms", aiGenerated: true });
  });
}

/** Alerts the team to a text the receptionist couldn't answer, such as after a failed reply or an empty allowance. */
export async function alertUnansweredText(context: DomainContext, input: { businessId: string; conversationId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await queueUnansweredTextAlertInTransaction(tx, input));
}
