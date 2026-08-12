import { and, eq, inArray, lt, or, sql } from "drizzle-orm";

import { buildSmsSystemPrompt } from "@lobbystack/ai";
import { contacts, conversationSessions, conversations, enqueueOutbox, messages, phoneNumbers, providerEvents, receptionistProfiles, withBusinessTransaction, type Database } from "@lobbystack/db";
import { isTerminalTwilioMessageStatus, mapTwilioStatusToMessageStatus, normalizeTwilioMessageStatus, shouldApplyMessageStatusTransition } from "@lobbystack/shared";

import { loadLatestBusinessSnapshot, searchKnowledge } from "./knowledge";
import type { DomainContext } from "./context";
import { queueOperatorAlert, queueOperatorAlertInTransaction } from "./notifications";
import { recordAiGenerationEvent, type DurableAiUsage } from "./productEvents";

export type SmsReplyProvider = {
  generateReply(input: { instructions: string; prompt: string; context?: string }): Promise<{ text: string; usage?: DurableAiUsage }>;
};

export async function receiveInboundSms(
  context: DomainContext,
  input: { businessId: string; providerMessageId: string; from: string; to: string; body: string; payload: Record<string, unknown> },
): Promise<{ messageId?: string; duplicate: boolean }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [providerEvent] = await tx.insert(providerEvents).values({
      provider: "twilio",
      providerEventId: input.providerMessageId,
      eventType: "sms.received",
      businessId: input.businessId,
      payload: input.payload,
    }).onConflictDoNothing({ target: [providerEvents.provider, providerEvents.providerEventId] }).returning({ id: providerEvents.id });
    if (!providerEvent) return { duplicate: true };

    const contact = (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.from))).limit(1))[0] ?? (await tx.insert(contacts).values({ businessId: input.businessId, phone: input.from }).returning({ id: contacts.id }))[0];
    if (!contact) throw new Error("Inbound SMS contact could not be created.");
    const conversation = (await tx.select({ id: conversations.id, automationState: conversations.automationState }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.contactId, contact.id), eq(conversations.channel, "sms"), eq(conversations.status, "open"))).orderBy(sql`${conversations.updatedAt} desc`).limit(1))[0] ?? (await tx.insert(conversations).values({ businessId: input.businessId, contactId: contact.id, channel: "sms", status: "open", automationState: "ai_active" }).returning({ id: conversations.id, automationState: conversations.automationState }))[0];
    if (!conversation) throw new Error("Inbound SMS conversation could not be created.");
    const session = (await tx.select({ id: conversationSessions.id }).from(conversationSessions).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.conversationId, conversation.id), eq(conversationSessions.status, "open"))).orderBy(sql`${conversationSessions.startedAt} desc`).limit(1))[0] ?? (await tx.insert(conversationSessions).values({ businessId: input.businessId, conversationId: conversation.id, channel: "sms", status: "open" }).returning({ id: conversationSessions.id }))[0];
    if (!session) throw new Error("Inbound SMS session could not be created.");
    const [message] = await tx.insert(messages).values({ businessId: input.businessId, conversationId: conversation.id, conversationSessionId: session.id, direction: "inbound", channel: "sms", body: input.body, providerMessageId: input.providerMessageId, status: "received" }).onConflictDoNothing({ target: messages.providerMessageId }).returning({ id: messages.id });
    if (!message) {
      const existing = (await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.businessId, input.businessId), eq(messages.providerMessageId, input.providerMessageId))).limit(1))[0];
      if (!existing) throw new Error("Inbound SMS message could not be persisted.");
      await tx.update(providerEvents).set({ status: "processed", updatedAt: new Date() }).where(eq(providerEvents.id, providerEvent.id));
      return { messageId: existing.id, duplicate: false };
    }
    await tx.update(conversations).set({ updatedAt: new Date() }).where(and(eq(conversations.id, conversation.id), eq(conversations.businessId, input.businessId)));
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "message", aggregateId: message.id, dedupeKey: `message:${message.id}:created`, payload: { type: "message.upserted", entityId: message.id, conversationId: conversation.id } });
    await enqueueOutbox(tx, { topic: "sms.processInbound", businessId: input.businessId, aggregateType: "message", aggregateId: message.id, dedupeKey: `message:${message.id}:process-inbound`, payload: { messageId: message.id, conversationId: conversation.id } });
    if (conversation.automationState !== "ai_active") await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "pausedSms", eventKey: `pausedSms:${message.id}`, subject: "New message needs a reply", body: "A customer replied while AI responses are paused. Open the inbox to respond." });
    await tx.update(providerEvents).set({ status: "processed", updatedAt: new Date() }).where(eq(providerEvents.id, providerEvent.id));
    return { messageId: message.id, duplicate: false };
  });
}

export async function generateAndQueueSmsReply(
  context: DomainContext,
  input: { businessId: string; messageId: string },
  provider: SmsReplyProvider,
): Promise<string | null> {
  const [state, snapshot] = await Promise.all([
    readInboundMessage(context.db, input),
    loadLatestBusinessSnapshot(context, { businessId: input.businessId }),
  ]);
  if (!state || state.automationState !== "ai_active") return null;
  const knowledge = await searchKnowledge(context, { businessId: input.businessId, query: state.body, limit: 4 });
  let reply: Awaited<ReturnType<SmsReplyProvider["generateReply"]>>;
  try {
    reply = await provider.generateReply({
      instructions: snapshot
        ? buildSmsSystemPrompt(snapshot)
        : state.smsInstructions ?? "Reply briefly and helpfully. Never invent availability or prices.",
      prompt: state.body,
      ...(knowledge.length > 0 ? { context: knowledge.map((item) => `${item.title}: ${item.content}`).join("\n\n") } : {}),
    });
  } catch (error) {
    await queueOperatorAlert(context, { businessId: input.businessId, eventKind: "aiReplyFailed", eventKey: `aiReplyFailed:${input.messageId}`, subject: "AI reply could not be generated", body: "An inbound message needs attention because the AI reply failed. Open the inbox to respond." });
    throw error;
  }
  const messageId = await import("./conversations").then(async ({ appendMessage }) => await appendMessage(context, {
    businessId: input.businessId,
    conversationId: state.conversationId,
    body: reply.text.trim().slice(0, 10_000),
    direction: "outbound",
    channel: "sms",
    aiGenerated: true,
  }));
  if (reply.usage) {
    await recordAiGenerationEvent(context, {
      ...reply.usage,
      businessId: input.businessId,
      operation: "sms.reply",
      conversationId: state.conversationId,
      messageId,
    }).catch(() => undefined);
  }
  return messageId;
}

async function readInboundMessage(db: Database, input: { businessId: string; messageId: string }): Promise<{
  body: string;
  conversationId: string;
  automationState: string;
  smsInstructions: string | null;
} | null> {
  return await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ body: messages.body, conversationId: messages.conversationId, automationState: conversations.automationState, smsInstructions: receptionistProfiles.smsInstructions })
      .from(messages)
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.businessId, input.businessId)))
      .leftJoin(receptionistProfiles, eq(receptionistProfiles.businessId, input.businessId))
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.direction, "inbound"), eq(messages.channel, "sms")))
      .limit(1))[0];
    return row ?? null;
  });
}

export async function claimSmsDelivery(context: DomainContext, input: { businessId: string; messageId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - 10 * 60_000);
    const rows = await tx.update(messages)
      .set({ status: "sending", revision: sql`${messages.revision} + 1`, updatedAt: new Date() })
      .where(and(
        eq(messages.id, input.messageId),
        eq(messages.businessId, input.businessId),
        eq(messages.direction, "outbound"),
        eq(messages.channel, "sms"),
        or(eq(messages.status, "queued"), and(eq(messages.status, "sending"), lt(messages.updatedAt, staleBefore))),
      ))
      .returning({ id: messages.id });
    return rows.length > 0;
  });
}

export async function loadSmsDeliveryTarget(db: Database, input: { businessId: string; messageId: string }): Promise<{ to: string; from: string; body: string } | null> {
  return await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ to: contacts.phone, from: phoneNumbers.e164, body: messages.body })
      .from(messages)
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.businessId, input.businessId)))
      .innerJoin(contacts, and(eq(contacts.id, conversations.contactId), eq(contacts.businessId, input.businessId)))
      .innerJoin(phoneNumbers, and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.smsEnabled, true)))
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.direction, "outbound"), eq(messages.channel, "sms"), inArray(messages.status, ["queued", "sending"])))
      .limit(1))[0];
    return row ?? null;
  });
}

export async function markSmsSent(context: DomainContext, input: { businessId: string; messageId: string; providerMessageId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ status: messages.status, providerMessageId: messages.providerMessageId }).from(messages).where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId))).limit(1))[0];
    if (!current) return;
    const applySent = shouldApplyMessageStatusTransition(current.status, "sent");
    await tx.update(messages).set({ ...(current.providerMessageId ? {} : { providerMessageId: input.providerMessageId }), ...(applySent ? { status: "sent", providerStatus: "sent" } : {}), revision: sql`${messages.revision} + 1`, updatedAt: new Date() }).where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId)));
    if (!applySent) return;
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "message", aggregateId: input.messageId, dedupeKey: `message:${input.messageId}:sent:${input.providerMessageId}`, payload: { type: "message.deliveryUpdated", entityId: input.messageId } });
    await enqueueOutbox(tx, { topic: "sms.syncPrice", businessId: input.businessId, aggregateType: "message", aggregateId: input.messageId, dedupeKey: `message:${input.messageId}:price:sent`, payload: { providerMessageId: input.providerMessageId, providerStatus: "sent" } });
  });
}

export async function releaseSmsDelivery(context: DomainContext, input: { businessId: string; messageId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(messages)
      .set({ status: "queued", revision: sql`${messages.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.status, "sending")));
  });
}

export async function updateSmsDeliveryStatus(
  context: DomainContext,
  input: { businessId: string; providerMessageId: string; providerStatus: string; messageId?: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ id: messages.id, status: messages.status })
      .from(messages)
      .where(and(eq(messages.businessId, input.businessId), input.messageId ? eq(messages.id, input.messageId) : eq(messages.providerMessageId, input.providerMessageId)))
      .limit(1))[0];
    if (!current) {
      return false;
    }

    const nextStatus = mapTwilioStatusToMessageStatus(input.providerStatus);
    if (!shouldApplyMessageStatusTransition(current.status, nextStatus)) {
      return false;
    }

    await tx.update(messages).set({
      providerMessageId: input.providerMessageId,
      status: nextStatus,
      providerStatus: normalizeTwilioMessageStatus(input.providerStatus),
      revision: sql`${messages.revision} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(messages.id, current.id), eq(messages.businessId, input.businessId)));
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "message",
      aggregateId: current.id,
      dedupeKey: `message:${current.id}:delivery:${nextStatus}`,
      payload: { type: "message.deliveryUpdated", entityId: current.id },
    });
    if (isTerminalTwilioMessageStatus(input.providerStatus)) {
      await enqueueOutbox(tx, {
        topic: "sms.syncPrice",
        businessId: input.businessId,
        aggregateType: "message",
        aggregateId: current.id,
        dedupeKey: `message:${current.id}:price:${normalizeTwilioMessageStatus(input.providerStatus)}`,
        payload: { providerMessageId: input.providerMessageId, providerStatus: input.providerStatus },
      });
    }
    if (nextStatus === "failed" || nextStatus === "undelivered") await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "smsFailed", eventKey: `smsFailed:${current.id}`, subject: "SMS delivery failed", body: "A message could not be delivered. Open the inbox to review it." });
    return true;
  });
}

export async function recordSmsProviderPricing(
  context: DomainContext,
  input: { businessId: string; providerMessageId: string; providerUpdatedAt?: string; providerPrice?: number; providerPriceUnit?: string; providerCostUsd?: number; providerNumSegments?: number },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [message] = await tx.update(messages).set({
      ...(input.providerUpdatedAt ? { providerUpdatedAt: new Date(input.providerUpdatedAt) } : {}),
      ...(input.providerPrice !== undefined ? { providerPrice: input.providerPrice } : {}),
      ...(input.providerPriceUnit !== undefined ? { providerPriceUnit: input.providerPriceUnit } : {}),
      ...(input.providerCostUsd !== undefined ? { providerCostUsd: input.providerCostUsd } : {}),
      ...(input.providerNumSegments !== undefined ? { providerNumSegments: input.providerNumSegments } : {}),
      revision: sql`${messages.revision} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(messages.businessId, input.businessId), eq(messages.providerMessageId, input.providerMessageId))).returning({ id: messages.id, revision: messages.revision });
    if (!message) return false;
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "message", aggregateId: message.id, dedupeKey: `message:${message.id}:pricing:${message.revision}`, payload: { type: "message.deliveryUpdated", entityId: message.id, revision: message.revision } });
    return true;
  });
}
