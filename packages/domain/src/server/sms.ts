import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { contacts, conversationSessions, conversations, enqueueOutbox, messages, phoneNumbers, providerEvents, smsConsentEvents, withBusinessTransaction, type Database } from "@lobbystack/db";
import { isTerminalTwilioMessageStatus, mapTwilioStatusToMessageStatus, normalizeTwilioMessageStatus, shouldApplyMessageStatusTransition } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction } from "./notifications";
import { recordUnitEconomicsEventInTransaction } from "./unitEconomics";
import { requireBusinessAdmin, requireBusinessMembership } from "../authz";

const SMS_STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT", "CANCEL"]);
const SMS_START_KEYWORDS = new Set(["START", "UNSTOP", "SUBSCRIBE"]);
const SMS_HELP_KEYWORDS = new Set(["HELP"]);
const SMS_HELP_REPLY = "LobbyStack: For help, contact hello@lobbystack.com or visit https://lobbystack.com. Reply STOP to opt out.";
const SMS_START_REPLY = "LobbyStack: You are subscribed again. Reply HELP for help or STOP to opt out.";

export type SmsConsentUpdate = { status: "subscribed" | "opted_out"; source: string };
export type SmsKeywordReply = { body: string; kind: "help" | "start" };

export function normalizeSmsKeyword(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function classifySmsConsentUpdate(input: { body: string; optOutType?: string }): SmsConsentUpdate | null {
  const normalizedOptOutType = input.optOutType?.trim().toUpperCase();
  if (normalizedOptOutType) {
    if (SMS_STOP_KEYWORDS.has(normalizedOptOutType)) return { status: "opted_out", source: `twilio_opt_out:${normalizedOptOutType}` };
    if (SMS_START_KEYWORDS.has(normalizedOptOutType)) return { status: "subscribed", source: `twilio_opt_out:${normalizedOptOutType}` };
  }
  const normalizedBody = normalizeSmsKeyword(input.body ?? "");
  if (SMS_STOP_KEYWORDS.has(normalizedBody)) return { status: "opted_out", source: `keyword:${normalizedBody}` };
  if (SMS_START_KEYWORDS.has(normalizedBody)) return { status: "subscribed", source: `keyword:${normalizedBody}` };
  return null;
}

export function classifySmsKeywordReply(input: { body: string; optOutType?: string }): SmsKeywordReply | null {
  const normalizedOptOutType = input.optOutType?.trim().toUpperCase();
  const normalizedBody = normalizeSmsKeyword(input.body ?? "");
  const keyword = normalizedOptOutType || normalizedBody;
  if (SMS_HELP_KEYWORDS.has(keyword)) return { body: SMS_HELP_REPLY, kind: "help" };
  if (SMS_START_KEYWORDS.has(keyword)) return { body: SMS_START_REPLY, kind: "start" };
  return null;
}

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

    const existingContact = (await tx.select({ id: contacts.id, smsConsentStatus: contacts.smsConsentStatus, operatorBlockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.from))).limit(1))[0];
    const contact = existingContact ?? (await tx.insert(contacts).values({ businessId: input.businessId, phone: input.from }).returning({ id: contacts.id, smsConsentStatus: contacts.smsConsentStatus, operatorBlockedAt: contacts.operatorBlockedAt }))[0];
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
    const optOutType = typeof input.payload?.OptOutType === "string" && input.payload.OptOutType ? input.payload.OptOutType : undefined;
    const consentUpdate = classifySmsConsentUpdate({ body: input.body, ...(optOutType !== undefined ? { optOutType } : {}) });
    const keywordReply = classifySmsKeywordReply({ body: input.body, ...(optOutType !== undefined ? { optOutType } : {}) });
    if (consentUpdate) {
      const now = new Date();
      await tx.update(contacts).set({ smsConsentStatus: consentUpdate.status, smsConsentSource: consentUpdate.source, smsConsentUpdatedAt: now, updatedAt: now }).where(and(eq(contacts.id, contact.id), eq(contacts.businessId, input.businessId)));
      await tx.insert(smsConsentEvents).values({ businessId: input.businessId, contactId: contact.id, phone: input.from, recipientType: "contact", action: consentUpdate.status === "opted_out" ? "opted_out" : "resubscribed", source: consentUpdate.source });
    }
    const optedOut = Boolean(contact.operatorBlockedAt) || consentUpdate?.status === "opted_out" || (contact.smsConsentStatus === "opted_out" && !consentUpdate);
    if (keywordReply && !optedOut) {
      const [replyMessage] = await tx.insert(messages).values({ businessId: input.businessId, conversationId: conversation.id, conversationSessionId: session.id, direction: "outbound", channel: "sms", body: keywordReply.body, aiGenerated: false, status: "queued", providerStatus: "compliance_reply" }).returning({ id: messages.id });
      if (replyMessage) {
        await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "message", aggregateId: replyMessage.id, dedupeKey: `message:${replyMessage.id}:created`, payload: { type: "message.upserted", entityId: replyMessage.id, conversationId: conversation.id } });
        await enqueueOutbox(tx, { topic: "sms.send", businessId: input.businessId, aggregateType: "message", aggregateId: replyMessage.id, dedupeKey: `message:${replyMessage.id}:send`, payload: { messageId: replyMessage.id } });
      }
    }
    if (!optedOut && keywordReply === null) await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "pausedSms", eventKey: `pausedSms:${message.id}`, subject: "New message needs a reply", body: "A customer sent a message. Open the inbox to respond." });
    await tx.update(providerEvents).set({ status: "processed", updatedAt: new Date() }).where(eq(providerEvents.id, providerEvent.id));
    return { messageId: message.id, duplicate: false };
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
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.direction, "outbound"), eq(messages.channel, "sms"), isNull(contacts.operatorBlockedAt), isNotNull(contacts.phone), or(eq(contacts.smsConsentStatus, "subscribed"), eq(messages.providerStatus, "compliance_reply")), inArray(messages.status, ["queued", "sending"])))
      .limit(1))[0];
    if (!row || row.to === null) return null;
    return { to: row.to, from: row.from, body: row.body };
  });
}

export async function setContactSmsManualBlock(
  context: DomainContext,
  input: { userId: string; businessId: string; contactId: string; blocked: boolean },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
     await requireBusinessAdmin(tx, input);
    const now = new Date();
    const [contact] = await tx.update(contacts)
      .set({ operatorBlockedAt: input.blocked ? now : null, updatedAt: now })
      .where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId)))
      .returning({ id: contacts.id, phone: contacts.phone });
    if (!contact) return false;
    if (contact.phone !== null) {
      await tx.insert(smsConsentEvents).values({ businessId: input.businessId, contactId: contact.id, phone: contact.phone, recipientType: "contact", action: input.blocked ? "manual_blocked" : "manual_unblocked", source: `operator:${input.userId}` });
    }
    return true;
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
    }).where(and(eq(messages.businessId, input.businessId), eq(messages.providerMessageId, input.providerMessageId))).returning({ id: messages.id, revision: messages.revision, aiGenerated: messages.aiGenerated, conversationId: messages.conversationId, createdAt: messages.createdAt });
    if (!message) return false;
    if (input.providerCostUsd !== undefined && !message.aiGenerated) {
      await recordUnitEconomicsEventInTransaction(tx, { businessId: input.businessId, eventKey: `sms_provider:${message.id}`, eventKind: "sms_provider", channel: "sms", costUsd: input.providerCostUsd, occurredAt: message.createdAt, ...(input.providerNumSegments !== undefined ? { quantity: input.providerNumSegments, quantityUnit: "segment" } : {}), provider: "twilio", messageId: message.id, conversationId: message.conversationId });
    }
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "message", aggregateId: message.id, dedupeKey: `message:${message.id}:pricing:${message.revision}`, payload: { type: "message.deliveryUpdated", entityId: message.id, revision: message.revision } });
    return true;
  });
}
