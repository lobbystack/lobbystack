import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { businesses, calls, contacts, conversations, conversationSessions, enqueueOutbox, messages, transcripts, widgetVisitors, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { isTextChatChannel } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { requireBusinessMembership } from "../authz";
import { contentExpiryForPlan, isContentRetentionEnabled, resolveBusinessBillingPlan } from "./contentRetentionPolicy";
import { resolveCallOutcome } from "./callOutcome";
import { findOrCreateContactByPhone } from "./contacts";
import { buildConversationSessionSummary, extractCallerContext, normalizeCallSummaryLocale, sanitizeGeneratedCallerName, type CallSummaryLocale, type ConversationTranscriptTurn, type GeneratedCallSummary } from "./conversationSummary";
import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction, type OperatorNotificationEventKey } from "./notifications";
import { recordProductEventBestEffort } from "./productEvents";
import { emitWebhookEventInTransaction } from "./publicApi/webhooks";
import { smsReplyBlockedInTransaction } from "./sms";

export { buildConversationSessionSummary, type CallSummaryLocale, type ConversationTranscriptTurn, type GeneratedCallSummary } from "./conversationSummary";

const FACTUAL_OUTCOME_KINDS = new Set(["booked", "booking_in_progress", "message_taking"]);

export type CallSummaryInput = {
  conversationId: string;
  locale: CallSummaryLocale;
  disposition: string | null;
  transcript: ConversationTranscriptTurn[];
  /** False when a booking or message already describes the call; the list shows that instead. */
  needsSummary: boolean;
  /** True when the call's contact has no name yet. */
  needsCallerName: boolean;
};

/**
 * Read what the worker needs to write a call summary. Returns undefined when
 * the call is already finalized or there is nothing a summary would change.
 */
export async function loadCallSummaryInput(
  context: DomainContext,
  input: { businessId: string; callId: string },
): Promise<CallSummaryInput | undefined> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({
      conversationId: calls.conversationId,
      disposition: calls.disposition,
      contactId: calls.contactId,
      contactName: contacts.name,
      conversationLocale: conversations.locale,
      currentIntent: conversations.currentIntent,
      businessLocale: businesses.defaultLocale,
    }).from(calls)
      .innerJoin(businesses, eq(businesses.id, calls.businessId))
      .leftJoin(conversations, and(eq(conversations.id, calls.conversationId), eq(conversations.businessId, calls.businessId)))
      .leftJoin(contacts, and(eq(contacts.id, calls.contactId), eq(contacts.businessId, calls.businessId)))
      .where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId)))
      .limit(1))[0];
    if (!row?.conversationId) return undefined;
    const session = (await tx.select({ summaryGeneratedAt: conversationSessions.summaryGeneratedAt, summary: conversationSessions.summary }).from(conversationSessions).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.callId, input.callId))).limit(1))[0];
    if (session?.summaryGeneratedAt) return undefined;
    const needsSummary = row.currentIntent !== "message_taking" && !FACTUAL_OUTCOME_KINDS.has(resolveCallOutcome({ persisted: session?.summary }).kind);
    const needsCallerName = Boolean(row.contactId) && !row.contactName?.trim();
    if (!needsSummary && !needsCallerName) return undefined;
    const transcript = await tx.select({ speaker: transcripts.speaker, text: transcripts.text }).from(transcripts).where(and(eq(transcripts.businessId, input.businessId), eq(transcripts.callId, input.callId), eq(transcripts.final, true))).orderBy(asc(transcripts.sequence));
    return {
      conversationId: row.conversationId,
      locale: normalizeCallSummaryLocale(row.conversationLocale ?? row.businessLocale),
      disposition: row.disposition,
      transcript,
      needsSummary,
      needsCallerName,
    };
  });
}

export async function finalizeConversationSession(
  context: DomainContext,
  input: { businessId: string; callId: string; generated?: GeneratedCallSummary | undefined },
): Promise<{ sessionId?: string; finalized: boolean }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const call = (await tx.select({ conversationId: calls.conversationId, contactId: calls.contactId, disposition: calls.disposition, startedAt: calls.startedAt, endedAt: calls.endedAt }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1).for("update"))[0];
    if (!call?.conversationId) return { finalized: false };
    const conversation = (await tx.select({ summary: conversations.summary, currentIntent: conversations.currentIntent, locale: conversations.locale }).from(conversations).where(and(eq(conversations.id, call.conversationId), eq(conversations.businessId, input.businessId))).limit(1))[0];
    if (!conversation) return { finalized: false };
    const existing = (await tx.select({ id: conversationSessions.id, summaryGeneratedAt: conversationSessions.summaryGeneratedAt, summary: conversationSessions.summary }).from(conversationSessions).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.callId, input.callId))).limit(1))[0];
    if (existing?.summaryGeneratedAt) return { sessionId: existing.id, finalized: false };
    const transcript = await tx.select({ speaker: transcripts.speaker, text: transcripts.text }).from(transcripts).where(and(eq(transcripts.businessId, input.businessId), eq(transcripts.callId, input.callId), eq(transcripts.final, true))).orderBy(asc(transcripts.sequence));
    const locale = conversation.locale ?? (await tx.select({ defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0]?.defaultLocale;
    const callerContext = extractCallerContext(transcript);
    const callerName = sanitizeGeneratedCallerName(input.generated?.callerName, transcript) ?? callerContext.callerName;
    const factual = resolveCallOutcome({ persisted: existing?.summary });
    const summary = FACTUAL_OUTCOME_KINDS.has(factual.kind) ? factual : buildConversationSessionSummary({ ...conversation, locale: normalizeCallSummaryLocale(locale), generatedSummary: input.generated?.summary, disposition: call.disposition, transcript });
    const now = call.endedAt ?? new Date();
    const session = existing ?? (await tx.insert(conversationSessions).values({ businessId: input.businessId, conversationId: call.conversationId, callId: input.callId, channel: "voice", status: "open", startedAt: call.startedAt }).onConflictDoNothing({ target: conversationSessions.callId, where: sql`${conversationSessions.callId} is not null` }).returning({ id: conversationSessions.id }))[0];
    if (!session) return { finalized: false };
    await tx.update(conversationSessions).set({ status: "closed", closedAt: now, lastMessageAt: now, summaryGeneratedAt: new Date(), summaryKind: summary.kind, summary, updatedAt: new Date() }).where(and(eq(conversationSessions.id, session.id), eq(conversationSessions.businessId, input.businessId)));
    if (call.contactId && callerName) {
      await tx.update(contacts).set({ name: callerName, updatedAt: new Date() }).where(and(eq(contacts.id, call.contactId), eq(contacts.businessId, input.businessId), sql`${contacts.name} is null`));
    }
    const summaryText = summary.kind === "summary" ? summary.summary : summary.kind === "message_taking" ? summary.summary : undefined;
    await tx.update(conversations).set({ status: "closed", ...(summaryText ? { summary: summaryText } : {}), revision: sql`${conversations.revision} + 1`, updatedAt: new Date() }).where(and(eq(conversations.id, call.conversationId), eq(conversations.businessId, input.businessId)));
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "conversation", aggregateId: call.conversationId, dedupeKey: `conversation:${call.conversationId}:finalized:${session.id}`, payload: { type: "conversation.updated", entityId: call.conversationId } });
    await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "call.completed", resourceId: input.callId });
    return { sessionId: session.id, finalized: true };
  });
}

export async function getOrCreateConversation(
  context: DomainContext,
  input: { businessId: string; contactPhone: string; channel: string; userId?: string },
): Promise<{ conversationId: string; contactId: string }> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: input.userId ? "operator" : "worker" }, async (tx) => {
    if (input.userId) {
      await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId });
    }
    const { contact, created } = await findOrCreateContactByPhone(tx, { businessId: input.businessId, phone: input.contactPhone });
    if (created) await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "contact.created", resourceId: contact.id });
    const current = await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.contactId, contact.id), eq(conversations.channel, input.channel), eq(conversations.status, "open"))).orderBy(desc(conversations.updatedAt)).limit(1);
    const conversationId = current[0]?.id ?? (await tx.insert(conversations).values({ businessId: input.businessId, contactId: contact.id, channel: input.channel, status: "open", automationState: "ai_active" }).returning({ id: conversations.id }))[0]?.id;
    if (!conversationId) {
      throw new Error("Conversation could not be created.");
    }
    return { conversationId, contactId: contact.id };
  });
}

type MessageInput = { businessId: string; conversationId: string; body: string; direction: "inbound" | "outbound"; channel: "sms" | "dashboard" | "web_chat" | "instagram"; providerMessageId?: string; aiGenerated?: boolean; userId?: string };

/**
 * Saves a message in the caller's transaction and queues its realtime update
 * and, for an outbound text, its delivery. Null when a message with the same
 * provider ID is already saved; nothing is queued then.
 */
export async function insertMessageInTransaction(tx: DatabaseTransaction, input: MessageInput): Promise<string | null> {
  const session = (await tx.select({ id: conversationSessions.id }).from(conversationSessions).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.conversationId, input.conversationId), eq(conversationSessions.status, "open"))).orderBy(desc(conversationSessions.startedAt)).limit(1))[0] ?? (await tx.insert(conversationSessions).values({ businessId: input.businessId, conversationId: input.conversationId, channel: input.channel, status: "open" }).returning({ id: conversationSessions.id }))[0];
  const retentionPlan = isContentRetentionEnabled() ? await resolveBusinessBillingPlan(tx, input.businessId) : null;
  const [message] = await tx.insert(messages).values({
    businessId: input.businessId,
    conversationId: input.conversationId,
    conversationSessionId: session?.id,
    direction: input.direction,
    channel: input.channel,
    body: input.body,
    contentExpiresAt: retentionPlan ? contentExpiryForPlan(retentionPlan, "messages") : null,
    providerMessageId: input.providerMessageId,
    ...(input.userId ? { sentByUserId: input.userId } : {}),
    aiGenerated: input.aiGenerated ?? false,
    status: input.direction === "outbound" ? "queued" : "received",
  }).onConflictDoNothing({ target: messages.providerMessageId }).returning({ id: messages.id });
  if (!message) return null;
  await tx.update(conversations).set({ updatedAt: new Date(), revision: conversations.revision }).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
  await enqueueOutbox(tx, {
    topic: "realtime.publish",
    businessId: input.businessId,
    aggregateType: "message",
    aggregateId: message.id,
    dedupeKey: `message:${message.id}:created`,
    // Who wrote it, so the website chat's live updates can pick out a team member's reply.
    payload: { type: "message.upserted", entityId: message.id, conversationId: input.conversationId, direction: input.direction, aiGenerated: input.aiGenerated ?? false },
  });
  if (input.direction === "outbound" && input.channel === "sms") {
    await enqueueOutbox(tx, {
      topic: "sms.send",
      businessId: input.businessId,
      aggregateType: "message",
      aggregateId: message.id,
      dedupeKey: `message:${message.id}:send`,
      payload: { messageId: message.id },
    });
  }
  if (input.direction === "outbound" && input.channel === "instagram") {
    await enqueueOutbox(tx, {
      topic: "instagram.send",
      businessId: input.businessId,
      aggregateType: "message",
      aggregateId: message.id,
      dedupeKey: `message:${message.id}:send`,
      payload: { messageId: message.id },
    });
  }
  return message.id;
}

export async function appendMessage(
  context: DomainContext,
  input: MessageInput & { operatorAlert?: { eventKind: OperatorNotificationEventKey; subject: string; body: string } },
): Promise<string> {
  // A team member who writes in a website or Instagram chat takes it over, so the AI stops answering alongside them.
  const takesOver = input.userId !== undefined && input.direction === "outbound" && isTextChatChannel(input.channel);
  const { messageId, takeOver } = await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: input.userId ? "operator" : "worker" }, async (tx) => {
    if (input.userId) {
      await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId, minimumRole: "scheduler" });
      // Refuse a reply that can't go out now, rather than queue a text the worker would fail.
      const blocked = input.direction === "outbound" && input.channel === "sms" ? await smsReplyBlockedInTransaction(tx, input) : null;
      if (blocked) throw Object.assign(new Error("You can't text this contact. They opted out, are blocked, or haven't texted you or agreed to texts."), { status: 409, code: blocked });
    }
    const id = await insertMessageInTransaction(tx, input);
    if (!id) {
      if (input.providerMessageId) {
        const existing = (await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.businessId, input.businessId), eq(messages.providerMessageId, input.providerMessageId))).limit(1))[0];
        if (existing) return { messageId: existing.id, takeOver: null };
      }
      throw new Error("Message could not be persisted.");
    }
    if (input.operatorAlert) await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKey: `${input.operatorAlert.eventKind}:${id}`, ...input.operatorAlert });
    const takeOver = takesOver ? await takeOverChatInTransaction(tx, { businessId: input.businessId, conversationId: input.conversationId, userId: input.userId! }) : null;
    return { messageId: id, takeOver };
  });
  if (takeOver) await recordTakeOver(context, { businessId: input.businessId, conversationId: input.conversationId, channel: input.channel, ...takeOver });
  return messageId;
}

/** What changed when a team member took a chat: the AI stopped answering, or a visitor waiting for a person got one. */
type ChatTakeOver = { pausedAi: boolean; waitedMs: number | null };

/**
 * Hands a chat to the team member who writes in it: the AI stops answering,
 * and a visitor waiting for a person has someone. Null when a team member
 * already has it.
 */
async function takeOverChatInTransaction(tx: DatabaseTransaction, input: { businessId: string; conversationId: string; userId: string }): Promise<ChatTakeOver | null> {
  const [current] = await tx.select({ automationState: conversations.automationState, teamRequestedAt: conversations.teamRequestedAt }).from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId))).limit(1).for("update");
  if (!current) return null;
  const pausedAi = current.automationState === "ai_active";
  if (!pausedAi && !current.teamRequestedAt) return null;
  const now = new Date();
  // Answering a visitor who asked for a person joins their chat, which goes back to the receptionist once the team goes quiet in it.
  await tx.update(conversations).set({ automationState: "human_handoff", automationPausedAt: now, automationPausedByUserId: input.userId, teamRequestedAt: null, teamJoinedAt: current.teamRequestedAt ? now : null, updatedAt: now }).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
  await enqueueOutbox(tx, {
    topic: "realtime.publish",
    businessId: input.businessId,
    aggregateType: "conversation",
    aggregateId: input.conversationId,
    dedupeKey: `conversation:${input.conversationId}:automation:human_handoff:${now.getTime()}`,
    payload: { type: "conversation.updated", entityId: input.conversationId },
  });
  return { pausedAi, waitedMs: current.teamRequestedAt ? Math.max(0, now.getTime() - current.teamRequestedAt.getTime()) : null };
}

async function recordTakeOver(context: DomainContext, input: { businessId: string; conversationId: string; channel: string } & ChatTakeOver): Promise<void> {
  if (input.pausedAi) {
    await recordProductEventBestEffort(context, {
      name: "conversation.automation_paused",
      businessId: input.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
      properties: { conversationId: input.conversationId, channel: input.channel },
    });
  }
  if (input.waitedMs !== null) {
    await recordProductEventBestEffort(context, {
      name: "conversation.team_joined",
      businessId: input.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
      properties: { conversationId: input.conversationId, channel: input.channel, waitSeconds: Math.round(input.waitedMs / 1000) },
    });
  }
}

export async function setAutomationState(
  context: DomainContext,
  input: { userId: string; businessId: string; conversationId: string; state: "ai_active" | "human_handoff" },
): Promise<void> {
  const change = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, { ...input, minimumRole: "scheduler" });
    const [current] = await tx.select({ channel: conversations.channel, automationState: conversations.automationState, teamRequestedAt: conversations.teamRequestedAt }).from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId))).limit(1).for("update");
    if (!current) return null;
    const now = new Date();
    // Either way, a visitor waiting for a person no longer waits: someone joined, or the AI has the chat back.
    // Only joining a waiting visitor makes a chat that goes back to the receptionist once the team goes quiet; Take over and Resume AI don't.
    const joined = input.state === "human_handoff" && current.teamRequestedAt !== null;
    await tx.update(conversations).set({ automationState: input.state, automationPausedAt: input.state === "human_handoff" ? now : null, automationPausedByUserId: input.state === "human_handoff" ? input.userId : null, teamRequestedAt: null, teamJoinedAt: joined ? now : null, updatedAt: now }).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "conversation",
      aggregateId: input.conversationId,
      dedupeKey: `conversation:${input.conversationId}:automation:${input.state}:${now.getTime()}`,
      payload: { type: "conversation.updated", entityId: input.conversationId },
    });
    return { channel: current.channel, pausedAi: current.automationState === "ai_active", waitedMs: current.teamRequestedAt ? Math.max(0, now.getTime() - current.teamRequestedAt.getTime()) : null };
  });
  if (input.state !== "human_handoff" || !change) return;
  await recordTakeOver(context, { businessId: input.businessId, conversationId: input.conversationId, ...change });
}

export async function registerWidgetVisitor(
  context: DomainContext,
  input: { businessId: string; visitorId: string; name?: string; email?: string; phone?: string; metadata?: Record<string, unknown> },
): Promise<{ visitorId: string; contactId: string | null }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // Lock the visitor so a chat that starts while it is being linked waits for the link.
    const existing = (await tx.select({ id: widgetVisitors.id, contactId: widgetVisitors.contactId, contactLinkedAt: widgetVisitors.contactLinkedAt, metadata: widgetVisitors.metadata }).from(widgetVisitors).where(and(eq(widgetVisitors.id, input.visitorId), eq(widgetVisitors.businessId, input.businessId))).limit(1).for("update"))[0];
    let contactId = existing?.contactId ?? null;
    const suppliedIdentity = input.email !== undefined || input.phone !== undefined;
    if (!contactId && suppliedIdentity) {
      const contact = (input.email !== undefined ? (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.email, input.email!))).limit(1))[0] : undefined)
        ?? (input.phone ? (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.phone))).limit(1))[0] : undefined);
      if (contact) {
        // An anonymous visitor can't prove they own this contact, so link to it but never change it.
        contactId = contact.id;
      } else {
        const [created] = await tx.insert(contacts).values({ businessId: input.businessId, ...(input.name ? { name: input.name } : {}), email: input.email, ...(input.phone ? { phone: input.phone } : {}) }).returning({ id: contacts.id });
        contactId = created?.id ?? null;
        if (contactId) await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "contact.created", resourceId: contactId });
      }
    }
    const mergedMetadata = { ...(typeof existing?.metadata === "object" && existing.metadata !== null ? existing.metadata : {}), ...(input.metadata ?? {}) };
    const newlyLinked = Boolean(contactId) && !existing?.contactId;
    if (existing) {
      await tx.update(widgetVisitors).set({ ...(input.name ? { name: input.name } : {}), email: input.email, ...(input.metadata ? { metadata: mergedMetadata } : {}), ...(contactId ? { contactId } : {}), ...(newlyLinked ? { contactLinkedAt: sql`now()` } : {}), lastSeenAt: new Date(), updatedAt: new Date() }).where(and(eq(widgetVisitors.id, input.visitorId), eq(widgetVisitors.businessId, input.businessId)));
      if (newlyLinked && contactId) {
        // The visitor's chats from before it gave its details belong to this
        // contact. Chats that already have a contact never move, and chats from
        // before an earlier link stay with nobody: they may be a deleted
        // contact's history on a shared browser.
        await tx.update(conversations).set({ contactId }).where(and(
          eq(conversations.businessId, input.businessId),
          eq(conversations.widgetVisitorId, input.visitorId),
          isNull(conversations.contactId),
          ...(existing.contactLinkedAt ? [gt(conversations.createdAt, existing.contactLinkedAt)] : []),
        ));
      }
    } else {
      // A concurrent first registration can insert the visitor between our read
      // and this insert, as when the chat opens in two tabs at once. The
      // conflict update then links the contact itself, so an anonymous insert
      // winning the race can't drop the link, and adds to the other
      // registration's metadata instead of replacing it.
      const [visitor] = await tx.insert(widgetVisitors).values({ id: input.visitorId, businessId: input.businessId, ...(input.name ? { name: input.name } : {}), email: input.email, metadata: mergedMetadata, ...(contactId ? { contactId, contactLinkedAt: sql`now()` } : {}), lastSeenAt: new Date(), updatedAt: new Date() }).onConflictDoUpdate({
        target: widgetVisitors.id,
        set: {
          ...(input.name ? { name: input.name } : {}),
          email: input.email,
          metadata: sql`${widgetVisitors.metadata} || excluded.metadata`,
          ...(contactId ? {
            contactId: sql`coalesce(${widgetVisitors.contactId}, excluded.contact_id)`,
            contactLinkedAt: sql`case when ${widgetVisitors.contactId} is null then now() else ${widgetVisitors.contactLinkedAt} end`,
          } : {}),
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      }).returning({ contactId: widgetVisitors.contactId, contactLinkedAt: widgetVisitors.contactLinkedAt });
      if (visitor?.contactId && visitor.contactId !== contactId) {
        // The other registration linked the visitor first; keep its contact.
        contactId = visitor.contactId;
      } else if (contactId) {
        // Chats the racing registration started belong to this contact.
        await tx.update(conversations).set({ contactId }).where(and(
          eq(conversations.businessId, input.businessId),
          eq(conversations.widgetVisitorId, input.visitorId),
          isNull(conversations.contactId),
        ));
      }
    }
    return { visitorId: input.visitorId, contactId };
  });
}

/**
 * A website chat with no message for this long is over: the visitor's next
 * visit shows an empty chat, and their next message closes the old one and
 * starts a new one, which the receptionist answers.
 */
export const WIDGET_CHAT_IDLE_CLOSE_MS = 24 * 60 * 60_000;

/** The visitor's open website chat, and whether it went a day without messages. A chat without messages yet stays, however old. */
async function openWidgetChat(tx: DatabaseTransaction, input: { businessId: string; widgetVisitorId: string; now: Date }) {
  const [chat] = await tx.select({ id: conversations.id, automationState: conversations.automationState }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.widgetVisitorId, input.widgetVisitorId), eq(conversations.channel, "web_chat"), eq(conversations.status, "open"))).orderBy(desc(conversations.updatedAt)).limit(1);
  if (!chat) return undefined;
  const [lastMessage] = await tx.select({ createdAt: messages.createdAt }).from(messages).where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, chat.id))).orderBy(desc(messages.createdAt)).limit(1);
  return { ...chat, wentIdle: lastMessage !== undefined && input.now.getTime() - lastMessage.createdAt.getTime() >= WIDGET_CHAT_IDLE_CLOSE_MS };
}

export async function getOrCreateWidgetConversation(
  context: DomainContext,
  input: { businessId: string; widgetVisitorId: string; now?: Date },
): Promise<{ conversationId: string; automationState: "ai_active" | "human_handoff" }> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // The update lock serializes requests for one visitor, so two first requests open one chat and agree on one when an idle one is replaced,
    // and a concurrent link waits, so a new chat either sees the contact or is claimed by the link.
    const lockVisitor = async () => (await tx.select({ id: widgetVisitors.id, contactId: widgetVisitors.contactId }).from(widgetVisitors).where(and(eq(widgetVisitors.id, input.widgetVisitorId), eq(widgetVisitors.businessId, input.businessId))).limit(1).for("update"))[0];
    let visitor = await lockVisitor();
    if (!visitor) {
      // The widget's session request registers its visitor, but a session
      // issued by the previous version during a deploy didn't.
      await tx.insert(widgetVisitors).values({ id: input.widgetVisitorId, businessId: input.businessId }).onConflictDoNothing();
      visitor = await lockVisitor();
    }
    if (!visitor) throw new Error("Widget visitor not found.");
    let current = await openWidgetChat(tx, { ...input, now });
    if (current?.wentIdle) {
      await tx.update(conversationSessions).set({ status: "closed", closedAt: now, updatedAt: now }).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.conversationId, current.id), eq(conversationSessions.status, "open")));
      await tx.update(conversations).set({ status: "closed", updatedAt: now }).where(and(eq(conversations.id, current.id), eq(conversations.businessId, input.businessId)));
      current = undefined;
    }
    const conversationId = current?.id ?? (await tx.insert(conversations).values({ businessId: input.businessId, widgetVisitorId: input.widgetVisitorId, ...(visitor.contactId ? { contactId: visitor.contactId } : {}), channel: "web_chat", status: "open", automationState: "ai_active" }).returning({ id: conversations.id }))[0]?.id;
    if (!conversationId) throw new Error("Conversation could not be created.");
    return { conversationId, automationState: current?.automationState === "human_handoff" ? "human_handoff" : "ai_active" };
  });
}

/**
 * The chat the visitor's widget shows: their open website chat, unless it went
 * a day without messages, since their next message starts a new one then.
 * Unlike getOrCreateWidgetConversation, never creates or closes a chat, so a
 * visitor who only looks leaves nothing behind.
 */
export async function findCurrentWidgetConversationId(
  context: DomainContext,
  input: { businessId: string; widgetVisitorId: string; now?: Date },
): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const chat = await openWidgetChat(tx, { ...input, now: input.now ?? new Date() });
    return chat && !chat.wentIdle ? chat.id : null;
  });
}

/**
 * The visitor's open website chat, if they have one, however long it went
 * without messages: the widget's live updates follow it, so a team member's
 * late reply still reaches a page left open. Never creates a chat.
 */
export async function findWidgetConversationId(
  context: DomainContext,
  input: { businessId: string; widgetVisitorId: string },
): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.widgetVisitorId, input.widgetVisitorId), eq(conversations.channel, "web_chat"), eq(conversations.status, "open"))).orderBy(desc(conversations.updatedAt)).limit(1);
    return row?.id ?? null;
  });
}

export async function loadWidgetChatHistory(
  context: DomainContext,
  input: { businessId: string; conversationId: string },
): Promise<Array<{ id: string; direction: "inbound" | "outbound"; body: string; createdAt: Date }>> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // The newest 200 messages, oldest first, so the list always ends with the latest turn.
    const rows = await tx.select({ id: messages.id, direction: messages.direction, body: messages.body, createdAt: messages.createdAt }).from(messages).where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId))).orderBy(desc(messages.createdAt)).limit(200);
    return rows.reverse().map((row) => ({ ...row, direction: row.direction === "inbound" ? "inbound" : "outbound" }));
  });
}
