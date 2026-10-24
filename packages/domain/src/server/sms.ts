import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { businesses, contacts, conversationSessions, conversations, enqueueOutbox, messages, providerEvents, smsConsentEvents, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { DEFAULT_APP_NAME, brandLinks, contactEmailFor, isTerminalTwilioMessageStatus, mapTwilioStatusToMessageStatus, normalizeTwilioMessageStatus, shouldApplyMessageStatusTransition } from "@lobbystack/shared";

import { deploymentAppName } from "./branding";
import { findOrCreateContactByPhone } from "./contacts";
import type { DomainContext } from "./context";
import { contentExpiryForPlan, isContentRetentionEnabled, resolveBusinessBillingPlan } from "./contentRetentionPolicy";
import { queueOperatorAlertInTransaction, smsOptInConfirmationInTransaction, type SmsOptInConfirmation } from "./notifications";
import { emitWebhookEventInTransaction } from "./publicApi/webhooks";
import { businessSmsNumber } from "./smsSender";
import { recordUnitEconomicsEventInTransaction } from "./unitEconomics";
import { requireBusinessAdmin, requireBusinessMembership } from "../authz";

const SMS_STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT", "CANCEL"]);
const SMS_START_KEYWORDS = new Set(["START", "UNSTOP", "SUBSCRIBE"]);
const SMS_HELP_KEYWORDS = new Set(["HELP"]);

export type SmsConsentUpdate = { status: "subscribed" | "opted_out"; source: string };
export type SmsKeywordReply = { kind: "help" | "start" };

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

// HELP and START replies name the host, the deployment's verified sender, and
// the business or businesses that text the number (docs/white-label.md,
// "Texts"). STOP gets Twilio's own reply: Twilio blocks every text to a phone
// once it sends STOP. A START reply that names a business also gives the
// frequency and rates, so it confirms the opt-in itself.

/** The businesses a reply names: "A", "A and B", "A, B, and C", or "A, B, and 2 other businesses". */
export function smsBusinessList(names: readonly string[]): string {
  const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} other businesses`] : names;
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(shown);
}

/**
 * The HELP reply from a business's own number, with the deployment's address
 * and website when it sets them (see docs/branding.md).
 */
export function smsHelpReply(input: { appName?: string; businessName: string }): string {
  const links = brandLinks();
  return `${input.appName ?? DEFAULT_APP_NAME} sends appointment texts for ${input.businessName}. For help, contact ${contactEmailFor(links, "sms")} or visit ${links.siteUrl}. Reply STOP to opt out.`;
}

/** The START reply from a business's own number. */
export function smsStartReply(input: { appName?: string; businessName: string }): string {
  return `${input.appName ?? DEFAULT_APP_NAME}: You can get appointment texts from ${input.businessName} again. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.`;
}

export function classifySmsKeywordReply(input: { body: string; optOutType?: string }): SmsKeywordReply | null {
  const normalizedOptOutType = input.optOutType?.trim().toUpperCase();
  const normalizedBody = normalizeSmsKeyword(input.body ?? "");
  const keyword = normalizedOptOutType || normalizedBody;
  if (SMS_HELP_KEYWORDS.has(keyword)) return { kind: "help" };
  if (SMS_START_KEYWORDS.has(keyword)) return { kind: "start" };
  return null;
}

/** Marks a contact's consent status as set by a text to the shared sender: "shared_sender:STOP". */
const SHARED_SENDER_SOURCE = "shared_sender";

/**
 * The shared sender's HELP reply. It names the businesses that text this
 * phone, most recent first, and only the host when none does.
 */
export function sharedSenderHelpReply(input: { appName?: string; businessNames?: readonly string[] } = {}): string {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const names = input.businessNames ?? [];
  const email = contactEmailFor(brandLinks(), "sms");
  if (!names.length) return `${appName}: For help with an appointment, call the business you booked with. For anything else, email ${email}. Reply STOP to opt out.`;
  return `${appName} sends appointment texts for ${smsBusinessList(names)}. For help with an appointment, call ${names.length === 1 ? names[0] : "the business you booked with"}. For anything else, email ${email}. Reply STOP to opt out.`;
}

/** The shared sender's START reply, naming the businesses that text this phone again. */
export function sharedSenderStartReply(input: { appName?: string; businessNames?: readonly string[] } = {}): string {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const names = input.businessNames ?? [];
  if (!names.length) return `${appName}: You can get texts from this number again. Reply HELP for help or STOP to opt out.`;
  return `${appName}: You can get appointment texts from ${smsBusinessList(names)} again. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.`;
}

/**
 * Handles a text a phone sent to the shared sender, the number that texts for
 * every cloud business (see resolveSmsSender). No business owns it and it
 * holds no conversations, so it answers only STOP, START and HELP; anything
 * else gets no reply and isn't stored.
 *
 * Twilio blocks every text from the shared number to a phone that sent STOP,
 * so STOP opts the phone out at every business that has it as a contact,
 * keeping the status each contact had. START undoes exactly that: a contact
 * the STOP opted out gets its earlier status back (subscribed, declined, or
 * never asked). A contact that opted out some other way, such as STOP to a
 * self-hosted business's own number, stays opted out. Returns the reply to
 * send back for HELP and START.
 */
export async function receiveSharedSenderSms(
  context: DomainContext,
  input: { from: string; body: string; optOutType?: string },
): Promise<{ reply: string | null; contactsChanged: number }> {
  const consentUpdate = classifySmsConsentUpdate(input);
  const keywordReply = classifySmsKeywordReply(input);
  if (!consentUpdate && !keywordReply) return { reply: null, contactsChanged: 0 };
  const listed = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx.execute<{ business_id: string }>(sql`select app.list_businesses_by_contact_phone(${input.from}) as business_id`));
  const businessIds = listed.rows.map((row) => row.business_id);
  let contactsChanged = 0;
  if (consentUpdate) {
    // "keyword:STOP" or "twilio_opt_out:STOP" becomes "shared_sender:STOP".
    const source = `${SHARED_SENDER_SOURCE}:${consentUpdate.source.slice(consentUpdate.source.indexOf(":") + 1)}`;
    // One transaction per business, so each change runs under that business's
    // RLS context. Both changes are idempotent, so a retried webhook finishes
    // any business a failure skipped.
    for (const businessId of businessIds) {
      contactsChanged += await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => consentUpdate.status === "opted_out"
        ? await optOutForSharedSender(tx, { businessId, phone: input.from, source })
        : await restoreAfterSharedSenderOptOut(tx, { businessId, phone: input.from, source }));
    }
  }
  if (!keywordReply) return { reply: null, contactsChanged };
  const replyInput = { appName: await deploymentAppName(context.db), businessNames: await businessesTextingPhone(context, { businessIds, phone: input.from }) };
  return { reply: keywordReply.kind === "help" ? sharedSenderHelpReply(replyInput) : sharedSenderStartReply(replyInput), contactsChanged };
}

/**
 * The names of the businesses that text this phone from the shared sender:
 * those with a contact at it who agreed to texts and isn't blocked. The most
 * recent opt-in comes first.
 */
async function businessesTextingPhone(context: DomainContext, input: { businessIds: readonly string[]; phone: string }): Promise<string[]> {
  const found: Array<{ name: string; since: number }> = [];
  for (const businessId of input.businessIds) {
    const row = await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => (await tx.select({ name: businesses.name, confirmedAt: contacts.smsOptInConfirmedAt, consentUpdatedAt: contacts.smsConsentUpdatedAt })
      .from(contacts)
      .innerJoin(businesses, eq(businesses.id, contacts.businessId))
      .where(and(eq(contacts.businessId, businessId), eq(contacts.phone, input.phone), eq(contacts.smsConsentStatus, "subscribed"), isNull(contacts.operatorBlockedAt)))
      .limit(1))[0]);
    if (row) found.push({ name: row.name, since: (row.confirmedAt ?? row.consentUpdatedAt)?.getTime() ?? 0 });
  }
  return found.sort((a, b) => b.since - a.since).map((business) => business.name);
}

async function optOutForSharedSender(tx: DatabaseTransaction, input: { businessId: string; phone: string; source: string }): Promise<number> {
  const now = new Date();
  // SET reads the row as it was, so the old status is what gets kept.
  const changed = await tx.update(contacts)
    .set({ smsConsentStatusBeforeOptOut: sql`${contacts.smsConsentStatus}`, smsConsentStatus: "opted_out", smsConsentSource: input.source, smsConsentUpdatedAt: now, smsOptInConfirmedAt: null, updatedAt: now })
    .where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.phone), or(isNull(contacts.smsConsentStatus), ne(contacts.smsConsentStatus, "opted_out"))))
    .returning({ id: contacts.id });
  for (const contact of changed) await tx.insert(smsConsentEvents).values({ businessId: input.businessId, contactId: contact.id, phone: input.phone, recipientType: "contact", action: "opted_out", source: input.source });
  return changed.length;
}

async function restoreAfterSharedSenderOptOut(tx: DatabaseTransaction, input: { businessId: string; phone: string; source: string }): Promise<number> {
  const now = new Date();
  const restored = await tx.update(contacts)
    // The START reply names the business, so it confirms a restored opt-in.
    .set({ smsConsentStatus: sql`${contacts.smsConsentStatusBeforeOptOut}`, smsConsentStatusBeforeOptOut: null, smsConsentSource: input.source, smsConsentUpdatedAt: now, smsOptInConfirmedAt: sql`case when ${contacts.smsConsentStatusBeforeOptOut} = 'subscribed' then now() end`, updatedAt: now })
    .where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.phone), eq(contacts.smsConsentStatus, "opted_out"), sql`starts_with(${contacts.smsConsentSource}, ${`${SHARED_SENDER_SOURCE}:`})`))
    .returning({ id: contacts.id, status: contacts.smsConsentStatus });
  for (const contact of restored) await tx.insert(smsConsentEvents).values({ businessId: input.businessId, contactId: contact.id, phone: input.phone, recipientType: "contact", action: contact.status === "subscribed" ? "resubscribed" : "opt_out_cleared", source: input.source });
  return restored.length;
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

    const { contact, created: contactCreated } = await findOrCreateContactByPhone(tx, { businessId: input.businessId, phone: input.from });
    if (contactCreated) await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "contact.created", resourceId: contact.id });
    const conversation = (await tx.select({ id: conversations.id, automationState: conversations.automationState }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.contactId, contact.id), eq(conversations.channel, "sms"), eq(conversations.status, "open"))).orderBy(sql`${conversations.updatedAt} desc`).limit(1))[0] ?? (await tx.insert(conversations).values({ businessId: input.businessId, contactId: contact.id, channel: "sms", status: "open", automationState: "ai_active" }).returning({ id: conversations.id, automationState: conversations.automationState }))[0];
    if (!conversation) throw new Error("Inbound SMS conversation could not be created.");
    const session = (await tx.select({ id: conversationSessions.id }).from(conversationSessions).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.conversationId, conversation.id), eq(conversationSessions.status, "open"))).orderBy(sql`${conversationSessions.startedAt} desc`).limit(1))[0] ?? (await tx.insert(conversationSessions).values({ businessId: input.businessId, conversationId: conversation.id, channel: "sms", status: "open" }).returning({ id: conversationSessions.id }))[0];
    if (!session) throw new Error("Inbound SMS session could not be created.");
    const retentionPlan = isContentRetentionEnabled() ? await resolveBusinessBillingPlan(tx, input.businessId) : null;
    const contentExpiresAt = retentionPlan ? contentExpiryForPlan(retentionPlan, "messages") : null;
    const [message] = await tx.insert(messages).values({ businessId: input.businessId, conversationId: conversation.id, conversationSessionId: session.id, direction: "inbound", channel: "sms", body: input.body, contentExpiresAt, providerMessageId: input.providerMessageId, status: "received" }).onConflictDoNothing({ target: messages.providerMessageId }).returning({ id: messages.id });
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
      // STOP clears the opt-in confirmation. START's reply confirms the opt-in itself.
      const confirmedAt = consentUpdate.status === "subscribed" && !contact.operatorBlockedAt ? now : null;
      await tx.update(contacts).set({ smsConsentStatus: consentUpdate.status, smsConsentSource: consentUpdate.source, smsConsentUpdatedAt: now, smsOptInConfirmedAt: confirmedAt, updatedAt: now }).where(and(eq(contacts.id, contact.id), eq(contacts.businessId, input.businessId)));
      await tx.insert(smsConsentEvents).values({ businessId: input.businessId, contactId: contact.id, phone: input.from, recipientType: "contact", action: consentUpdate.status === "opted_out" ? "opted_out" : "resubscribed", source: consentUpdate.source });
    }
    const optedOut = Boolean(contact.operatorBlockedAt) || consentUpdate?.status === "opted_out" || (contact.smsConsentStatus === "opted_out" && !consentUpdate);
    if (keywordReply && !optedOut) {
      const business = (await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
      const replyInput = { appName: await deploymentAppName(tx), businessName: business?.name ?? "" };
      const body = keywordReply.kind === "help" ? smsHelpReply(replyInput) : smsStartReply(replyInput);
      const [replyMessage] = await tx.insert(messages).values({ businessId: input.businessId, conversationId: conversation.id, conversationSessionId: session.id, direction: "outbound", channel: "sms", body, contentExpiresAt, aiGenerated: false, status: "queued", providerStatus: "compliance_reply" }).returning({ id: messages.id });
      if (replyMessage) {
        await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "message", aggregateId: replyMessage.id, dedupeKey: `message:${replyMessage.id}:created`, payload: { type: "message.upserted", entityId: replyMessage.id, conversationId: conversation.id } });
        await enqueueOutbox(tx, { topic: "sms.send", businessId: input.businessId, aggregateType: "message", aggregateId: replyMessage.id, dedupeKey: `message:${replyMessage.id}:send`, payload: { messageId: replyMessage.id } });
      }
    }
    // Any text but STOP, START or HELP alerts, opted-out customers' included:
    // they can still write in. One alert per conversation each hour.
    if (!contact.operatorBlockedAt && !consentUpdate && !keywordReply) await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "pausedSms", eventKey: `pausedSms:${conversation.id}:${new Date().toISOString().slice(0, 13)}`, subject: "New message needs a reply", body: "A customer sent a message. Open the inbox to respond." });
    await tx.update(providerEvents).set({ status: "processed", updatedAt: new Date() }).where(eq(providerEvents.id, providerEvent.id));
    return { messageId: message.id, duplicate: false };
  });
}

const smsDeliveryLeaseMs = 10 * 60_000;

export async function claimSmsDelivery(context: DomainContext, input: { businessId: string; messageId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - smsDeliveryLeaseMs);
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

/** When a send holds this message, the time its lease ends and another run may claim it. */
export async function smsDeliveryLeaseEndsAt(context: DomainContext, input: { businessId: string; messageId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ updatedAt: messages.updatedAt }).from(messages).where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.direction, "outbound"), eq(messages.channel, "sms"), eq(messages.status, "sending"))).limit(1))[0];
    return row ? new Date(row.updatedAt.getTime() + smsDeliveryLeaseMs) : null;
  });
}

export type SmsReplyBlockedReason = "sms_blocked" | "sms_unreachable" | "no_sms_sender" | "sms_consent";

type SmsReach = { phone: string | null; operatorBlockedAt: Date | null; smsConsentStatus: string | null; customerTexted: boolean; from: string | null };

/**
 * Why a text in a conversation can't go out, or null when it can. The contact
 * must not be blocked, and must have agreed to texts or have texted this
 * conversation without opting out. A STOP, START or HELP reply needs only an
 * unblocked contact.
 */
export function smsReplyBlockedReason(reach: SmsReach, complianceReply = false): SmsReplyBlockedReason | null {
  if (reach.operatorBlockedAt) return "sms_blocked";
  if (!reach.phone) return "sms_unreachable";
  if (!reach.from) return "no_sms_sender";
  if (complianceReply || reach.smsConsentStatus === "subscribed") return null;
  return reach.customerTexted && reach.smsConsentStatus !== "opted_out" ? null : "sms_consent";
}

async function loadSmsReach(tx: DatabaseTransaction, input: { businessId: string; conversationId: string }): Promise<SmsReach & { contactId: string | null }> {
  const contact = (await tx.select({ id: contacts.id, phone: contacts.phone, operatorBlockedAt: contacts.operatorBlockedAt, smsConsentStatus: contacts.smsConsentStatus, smsConsentUpdatedAt: contacts.smsConsentUpdatedAt })
    .from(conversations)
    .innerJoin(contacts, and(eq(contacts.id, conversations.contactId), eq(contacts.businessId, input.businessId)))
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)))
    .limit(1))[0];
  // Only a text since the number or consent last changed counts: an earlier one may have come from the old number.
  const since = contact?.smsConsentUpdatedAt ? gt(messages.createdAt, contact.smsConsentUpdatedAt) : undefined;
  const inbound = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId), eq(messages.direction, "inbound"), eq(messages.channel, "sms"), since)).limit(1);
  return { contactId: contact?.id ?? null, phone: contact?.phone ?? null, operatorBlockedAt: contact?.operatorBlockedAt ?? null, smsConsentStatus: contact?.smsConsentStatus ?? null, customerTexted: inbound.length > 0, from: await businessSmsNumber(tx, input.businessId) };
}

/** Why an operator's SMS reply in this conversation can't go out, or null. The worker checks the same rule again before it sends. */
export async function smsReplyBlockedInTransaction(tx: DatabaseTransaction, input: { businessId: string; conversationId: string }): Promise<SmsReplyBlockedReason | null> {
  return smsReplyBlockedReason(await loadSmsReach(tx, input));
}

/**
 * What to send for a queued text, why it can't go out, or null when no such
 * text is waiting. A reply to a customer who agreed to texts and hasn't had
 * one yet comes after the opt-in confirmation; a STOP, START or HELP reply
 * never does.
 */
export async function loadSmsDeliveryTarget(db: Database, input: { businessId: string; messageId: string }): Promise<{ to: string; from: string; body: string; optIn?: SmsOptInConfirmation } | { blocked: SmsReplyBlockedReason } | null> {
  return await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const message = (await tx.select({ conversationId: messages.conversationId, body: messages.body, providerStatus: messages.providerStatus })
      .from(messages)
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.direction, "outbound"), eq(messages.channel, "sms"), inArray(messages.status, ["queued", "sending"])))
      .limit(1))[0];
    if (!message) return null;
    const reach = await loadSmsReach(tx, { businessId: input.businessId, conversationId: message.conversationId });
    const complianceReply = message.providerStatus === "compliance_reply";
    const blocked = smsReplyBlockedReason(reach, complianceReply);
    if (blocked || !reach.phone || !reach.from) return { blocked: blocked ?? "sms_unreachable" };
    const optIn = !complianceReply && reach.contactId ? await smsOptInConfirmationInTransaction(tx, { businessId: input.businessId, contactId: reach.contactId }) : undefined;
    return { to: reach.phone, from: reach.from, body: message.body, ...(optIn ? { optIn } : {}) };
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

/** Closes a text the worker holds that won't go out, and alerts operators the way a failed delivery does. */
export async function failSmsDelivery(context: DomainContext, input: { businessId: string; messageId: string; reason: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [failed] = await tx.update(messages)
      .set({ status: "failed", providerStatus: input.reason.slice(0, 64), revision: sql`${messages.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.status, "sending")))
      .returning({ id: messages.id });
    if (!failed) return;
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "message", aggregateId: failed.id, dedupeKey: `message:${failed.id}:delivery:failed`, payload: { type: "message.deliveryUpdated", entityId: failed.id } });
    await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "smsFailed", eventKey: `smsFailed:${failed.id}`, subject: "SMS delivery failed", body: "A message could not be delivered. Open the inbox to review it." });
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
    const current = (await tx.select({ id: messages.id, status: messages.status, conversationId: messages.conversationId })
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
      providerPrice: input.providerPrice,
      providerPriceUnit: input.providerPriceUnit,
      providerCostUsd: input.providerCostUsd,
      providerNumSegments: input.providerNumSegments,
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
