import { and, asc, desc, eq, sql } from "drizzle-orm";

import { calls, contacts, conversations, conversationSessions, enqueueOutbox, messages, transcripts, widgetVisitors, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import { buildConversationSessionSummary } from "./conversationSummary";
import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction, type OperatorNotificationEventKey } from "./notifications";

export { buildConversationSessionSummary } from "./conversationSummary";

export async function finalizeConversationSession(
  context: DomainContext,
  input: { businessId: string; callId: string },
): Promise<{ sessionId?: string; finalized: boolean }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const call = (await tx.select({ conversationId: calls.conversationId, disposition: calls.disposition, startedAt: calls.startedAt, endedAt: calls.endedAt }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1))[0];
    if (!call?.conversationId) return { finalized: false };
    const conversation = (await tx.select({ summary: conversations.summary, currentIntent: conversations.currentIntent, locale: conversations.locale }).from(conversations).where(and(eq(conversations.id, call.conversationId), eq(conversations.businessId, input.businessId))).limit(1))[0];
    if (!conversation) return { finalized: false };
    const existing = (await tx.select({ id: conversationSessions.id, summaryGeneratedAt: conversationSessions.summaryGeneratedAt }).from(conversationSessions).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.callId, input.callId))).limit(1))[0];
    if (existing?.summaryGeneratedAt) return { sessionId: existing.id, finalized: false };
    const transcript = await tx.select({ text: transcripts.text }).from(transcripts).where(and(eq(transcripts.businessId, input.businessId), eq(transcripts.callId, input.callId), eq(transcripts.final, true))).orderBy(asc(transcripts.sequence));
    const summary = buildConversationSessionSummary({ ...conversation, disposition: call.disposition, transcript: transcript.map((row) => row.text) });
    const now = call.endedAt ?? new Date();
    const session = existing ?? (await tx.insert(conversationSessions).values({ businessId: input.businessId, conversationId: call.conversationId, callId: input.callId, channel: "voice", status: "open", startedAt: call.startedAt }).onConflictDoNothing({ target: conversationSessions.callId }).returning({ id: conversationSessions.id }))[0];
    if (!session) return { finalized: false };
    await tx.update(conversationSessions).set({ status: "closed", closedAt: now, lastMessageAt: now, summaryGeneratedAt: new Date(), summaryKind: summary.kind, summary, updatedAt: new Date() }).where(and(eq(conversationSessions.id, session.id), eq(conversationSessions.businessId, input.businessId)));
    const summaryText = summary.kind === "summary" ? summary.summary : summary.kind === "message_taking" ? summary.summary : summary.disposition;
    await tx.update(conversations).set({ status: "closed", ...(summaryText ? { summary: summaryText } : {}), revision: sql`${conversations.revision} + 1`, updatedAt: new Date() }).where(and(eq(conversations.id, call.conversationId), eq(conversations.businessId, input.businessId)));
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "conversation", aggregateId: call.conversationId, dedupeKey: `conversation:${call.conversationId}:finalized:${session.id}`, payload: { type: "conversation.updated", entityId: call.conversationId } });
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
    const contact = (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.contactPhone))).limit(1))[0] ?? (await tx.insert(contacts).values({ businessId: input.businessId, phone: input.contactPhone }).returning({ id: contacts.id }))[0];
    if (!contact) {
      throw new Error("Contact could not be created.");
    }
    const current = await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.contactId, contact.id), eq(conversations.channel, input.channel), eq(conversations.status, "open"))).orderBy(desc(conversations.updatedAt)).limit(1);
    const conversationId = current[0]?.id ?? (await tx.insert(conversations).values({ businessId: input.businessId, contactId: contact.id, channel: input.channel, status: "open", automationState: "ai_active" }).returning({ id: conversations.id }))[0]?.id;
    if (!conversationId) {
      throw new Error("Conversation could not be created.");
    }
    return { conversationId, contactId: contact.id };
  });
}

export async function appendMessage(
  context: DomainContext,
  input: { businessId: string; conversationId: string; body: string; direction: "inbound" | "outbound"; channel: "sms" | "dashboard" | "web_chat"; providerMessageId?: string; aiGenerated?: boolean; userId?: string; operatorAlert?: { eventKind: OperatorNotificationEventKey; subject: string; body: string } },
): Promise<string> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: input.userId ? "operator" : "worker" }, async (tx) => {
    if (input.userId) {
      await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId });
    }
    const session = (await tx.select({ id: conversationSessions.id }).from(conversationSessions).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.conversationId, input.conversationId), eq(conversationSessions.status, "open"))).orderBy(desc(conversationSessions.startedAt)).limit(1))[0] ?? (await tx.insert(conversationSessions).values({ businessId: input.businessId, conversationId: input.conversationId, channel: input.channel, status: "open" }).returning({ id: conversationSessions.id }))[0];
    const [message] = await tx.insert(messages).values({
      businessId: input.businessId,
      conversationId: input.conversationId,
      conversationSessionId: session?.id,
      direction: input.direction,
      channel: input.channel,
      body: input.body,
      ...(input.providerMessageId !== undefined ? { providerMessageId: input.providerMessageId } : {}),
      aiGenerated: input.aiGenerated ?? false,
      status: input.direction === "outbound" ? "queued" : "received",
    }).onConflictDoNothing({ target: messages.providerMessageId }).returning({ id: messages.id });
    if (!message) {
      if (input.providerMessageId) {
        const existing = (await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.businessId, input.businessId), eq(messages.providerMessageId, input.providerMessageId))).limit(1))[0];
        if (existing) return existing.id;
      }
      throw new Error("Message could not be persisted.");
    }
    await tx.update(conversations).set({ updatedAt: new Date(), revision: conversations.revision }).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "message",
      aggregateId: message.id,
      dedupeKey: `message:${message.id}:created`,
      payload: { type: "message.upserted", entityId: message.id, conversationId: input.conversationId },
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
    if (input.operatorAlert) await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKey: `${input.operatorAlert.eventKind}:${message.id}`, ...input.operatorAlert });
    return message.id;
  });
}

export async function setAutomationState(
  context: DomainContext,
  input: { userId: string; businessId: string; conversationId: string; state: "ai_active" | "human_handoff" },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    await tx.update(conversations).set({ automationState: input.state, automationPausedAt: input.state === "human_handoff" ? new Date() : null, automationPausedByUserId: input.state === "human_handoff" ? input.userId : null, updatedAt: new Date() }).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "conversation",
      aggregateId: input.conversationId,
      dedupeKey: `conversation:${input.conversationId}:automation:${input.state}:${Date.now()}`,
      payload: { type: "conversation.updated", entityId: input.conversationId },
    });
  });
}

export async function registerWidgetVisitor(
  context: DomainContext,
  input: { businessId: string; visitorId: string; name?: string; email?: string; phone?: string; metadata?: Record<string, unknown> },
): Promise<{ visitorId: string; contactId: string | null }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const existing = (await tx.select({ id: widgetVisitors.id, contactId: widgetVisitors.contactId, metadata: widgetVisitors.metadata }).from(widgetVisitors).where(and(eq(widgetVisitors.id, input.visitorId), eq(widgetVisitors.businessId, input.businessId))).limit(1))[0];
    let contactId = existing?.contactId ?? null;
    const suppliedIdentity = input.email !== undefined || input.phone !== undefined;
    if (!contactId && suppliedIdentity) {
      const contact = (input.email !== undefined ? (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.email, input.email!))).limit(1))[0] : undefined)
        ?? (input.phone ? (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.phone))).limit(1))[0] : undefined);
      if (contact) {
        contactId = contact.id;
      } else {
        const [created] = await tx.insert(contacts).values({ businessId: input.businessId, ...(input.name ? { name: input.name } : {}), ...(input.email !== undefined ? { email: input.email } : {}), ...(input.phone ? { phone: input.phone } : {}) }).returning({ id: contacts.id });
        contactId = created?.id ?? null;
      }
      if (contactId && (input.name || input.phone)) {
        await tx.update(contacts).set({ ...(input.name ? { name: input.name } : {}), ...(input.phone ? { phone: input.phone } : {}), updatedAt: new Date() }).where(and(eq(contacts.id, contactId), eq(contacts.businessId, input.businessId)));
      }
    }
    const mergedMetadata = { ...(typeof existing?.metadata === "object" && existing.metadata !== null ? existing.metadata : {}), ...(input.metadata ?? {}) };
    if (existing) {
      await tx.update(widgetVisitors).set({ ...(input.name ? { name: input.name } : {}), ...(input.email !== undefined ? { email: input.email } : {}), ...(input.metadata ? { metadata: mergedMetadata } : {}), ...(contactId ? { contactId } : {}), lastSeenAt: new Date(), updatedAt: new Date() }).where(and(eq(widgetVisitors.id, input.visitorId), eq(widgetVisitors.businessId, input.businessId)));
    } else {
      await tx.insert(widgetVisitors).values({ id: input.visitorId, businessId: input.businessId, ...(input.name ? { name: input.name } : {}), ...(input.email !== undefined ? { email: input.email } : {}), metadata: mergedMetadata, ...(contactId ? { contactId } : {}), lastSeenAt: new Date(), updatedAt: new Date() }).onConflictDoUpdate({ target: widgetVisitors.id, set: { ...(input.name ? { name: input.name } : {}), ...(input.email !== undefined ? { email: input.email } : {}), metadata: mergedMetadata, ...(contactId ? { contactId } : {}), lastSeenAt: new Date(), updatedAt: new Date() } });
    }
    return { visitorId: input.visitorId, contactId };
  });
}

export async function getOrCreateWidgetConversation(
  context: DomainContext,
  input: { businessId: string; widgetVisitorId: string },
): Promise<{ conversationId: string }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const visitor = (await tx.select({ id: widgetVisitors.id }).from(widgetVisitors).where(and(eq(widgetVisitors.id, input.widgetVisitorId), eq(widgetVisitors.businessId, input.businessId))).limit(1))[0];
    if (!visitor) throw new Error("Widget visitor not found.");
    const current = await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.widgetVisitorId, input.widgetVisitorId), eq(conversations.channel, "web_chat"), eq(conversations.status, "open"))).orderBy(desc(conversations.updatedAt)).limit(1);
    const conversationId = current[0]?.id ?? (await tx.insert(conversations).values({ businessId: input.businessId, widgetVisitorId: input.widgetVisitorId, channel: "web_chat", status: "open", automationState: "ai_active" }).onConflictDoNothing().returning({ id: conversations.id }))[0]?.id;
    if (!conversationId) {
      const existing = await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.widgetVisitorId, input.widgetVisitorId), eq(conversations.channel, "web_chat"))).orderBy(desc(conversations.updatedAt)).limit(1);
      throw new Error(existing[0] ? "Widget conversation already exists and is closed." : "Conversation could not be created.");
    }
    return { conversationId };
  });
}

export async function loadWidgetChatHistory(
  context: DomainContext,
  input: { businessId: string; conversationId: string },
): Promise<Array<{ id: string; direction: "inbound" | "outbound"; body: string; createdAt: Date }>> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.select({ id: messages.id, direction: messages.direction, body: messages.body, createdAt: messages.createdAt }).from(messages).where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId))).orderBy(asc(messages.createdAt)).limit(200);
    return rows.map((row) => ({ ...row, direction: row.direction === "inbound" ? "inbound" : "outbound" }));
  });
}

