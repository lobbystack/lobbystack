import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { businessMemberships, businesses, calendarConnections, calls, contacts, conversations, createDatabaseClient, messages, operatorNotificationDeliveries, outboxMessages, users, withBusinessTransaction } from "@lobbystack/db";
import { appendMessage, claimOperatorNotificationDelivery, claimSmsDelivery, defaultOperatorNotificationEventPreferences, generateAndQueueSmsReply, getNotificationPreferences, loadOperatorNotificationDelivery, markCalendarConnectionSync, markOperatorNotificationSent, markSmsSent, queueDailyOperatorSummaries, queueOperatorAlert, receiveInboundSms, setNotificationPreferences, setTransferState, updateSmsDeliveryStatus } from "@lobbystack/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const auth = createDatabaseClient("lobbystack_auth");
  const app = createDatabaseClient("lobbystack_app");
  const worker = createDatabaseClient("lobbystack_worker");
  const ownerId = randomUUID();
  const foreignOwnerId = randomUUID();
  const businessId = randomUUID();
  const foreignBusinessId = randomUUID();
  try {
    await auth.db.insert(users).values([
      { id: ownerId, email: `${ownerId}@example.test`, normalizedEmail: `${ownerId}@example.test` },
      { id: foreignOwnerId, email: `${foreignOwnerId}@example.test`, normalizedEmail: `${foreignOwnerId}@example.test` },
    ]);
    for (const [id, slug, userId] of [[businessId, `notifications-${businessId}`, ownerId], [foreignBusinessId, `notifications-${foreignBusinessId}`, foreignOwnerId]] as const) {
      await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async (tx) => {
        await tx.insert(businesses).values({ id, slug, name: slug, timezone: "UTC", businessType: "test" });
        await tx.insert(businessMemberships).values({ businessId: id, userId, role: "business_owner", status: "active" });
      });
    }
    const defaults = await getNotificationPreferences({ db: app.db }, { userId: ownerId, businessId });
    assert(defaults.emailEnabled && !defaults.smsEnabled && defaults.eventPreferences.voiceMessage.email, "Notification defaults are incorrect.");
    const events = defaultOperatorNotificationEventPreferences();
    events.voiceMessage.sms = true;
    events.calendarSync.email = false;
    await setNotificationPreferences({ db: app.db }, { userId: ownerId, businessId, emailEnabled: true, smsEnabled: true, eventPreferences: events, dailySummaryEnabled: true, dailySummarySendTime: "09:30" });
    const saved = await getNotificationPreferences({ db: app.db }, { userId: ownerId, businessId });
    assert(saved.smsEnabled && saved.eventPreferences.voiceMessage.sms && !saved.eventPreferences.calendarSync.email && saved.dailySummarySendTime === "09:30", "Notification preferences did not persist.");
    let crossTenantDenied = false;
    try { await getNotificationPreferences({ db: app.db }, { userId: ownerId, businessId: foreignBusinessId }); } catch { crossTenantDenied = true; }
    assert(crossTenantDenied, "Cross-tenant notification preference access was not denied.");
    const deliveryIds = await queueOperatorAlert({ db: worker.db }, { businessId, eventKind: "voiceMessage", eventKey: `voice-message:${businessId}`, subject: "New voice message", body: "An operator-safe alert." });
    assert(deliveryIds.length === 1, "Preference-aware operator delivery fanout was incorrect.");
    assert((await queueOperatorAlert({ db: worker.db }, { businessId, eventKind: "voiceMessage", eventKey: `voice-message:${businessId}`, subject: "Duplicate", body: "Duplicate" })).length === 0, "Duplicate operator alert was not idempotent.");
    const claimed = await claimOperatorNotificationDelivery({ db: worker.db }, { businessId, deliveryId: deliveryIds[0]! });
    const target = await loadOperatorNotificationDelivery({ db: worker.db }, { businessId, deliveryId: deliveryIds[0]! });
    assert(claimed && target?.channel === "email" && target.destination.endsWith("@example.test"), "Operator delivery could not be claimed and resolved.");
    await markOperatorNotificationSent({ db: worker.db }, { businessId, deliveryId: deliveryIds[0]!, providerMessageId: "certification-message" });
    const persisted = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => ({ delivery: (await tx.select().from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.id, deliveryIds[0]!)))[0], outbox: await tx.select().from(outboxMessages).where(eq(outboxMessages.aggregateId, deliveryIds[0]!)) }));
    assert(persisted.delivery?.status === "sent" && persisted.outbox.length === 1, "Operator delivery completion or outbox intent was not durable.");
    events.calendarSync.email = true;
    await setNotificationPreferences({ db: app.db }, { userId: ownerId, businessId, emailEnabled: true, smsEnabled: false, eventPreferences: events, dailySummaryEnabled: true, dailySummarySendTime: "09:30" });
    const fixtures = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      const contact = (await tx.insert(contacts).values({ businessId, phone: "+14165550101" }).returning({ id: contacts.id }))[0]!;
      const conversation = (await tx.insert(conversations).values({ businessId, contactId: contact.id, channel: "sms", status: "open", automationState: "human_handoff" }).returning({ id: conversations.id }))[0]!;
      const outbound = (await tx.insert(messages).values({ businessId, conversationId: conversation.id, direction: "outbound", channel: "sms", body: "Certification message", providerMessageId: `SM-${randomUUID()}`, status: "sent" }).returning({ id: messages.id, providerMessageId: messages.providerMessageId }))[0]!;
      const staleOutbound = (await tx.insert(messages).values({ businessId, conversationId: conversation.id, direction: "outbound", channel: "sms", body: "Stale lease certification", status: "sending", updatedAt: new Date(Date.now() - 11 * 60_000) }).returning({ id: messages.id }))[0]!;
      const calendar = (await tx.insert(calendarConnections).values({ businessId, ownerUserId: ownerId, provider: "google", externalAccountId: `certification-${randomUUID()}` }).returning({ id: calendarConnections.id }))[0]!;
      const call = (await tx.insert(calls).values({ businessId, conversationId: conversation.id, contactId: contact.id, providerCallId: `CA-${randomUUID()}`, transport: "twilio", startedAt: new Date() }).returning({ id: calls.id }))[0]!;
      return { conversationId: conversation.id, outboundMessageId: outbound.id, outboundProviderId: outbound.providerMessageId!, staleOutboundMessageId: staleOutbound.id, calendarId: calendar.id, callId: call.id };
    });
    await appendMessage({ db: worker.db }, { businessId, conversationId: fixtures.conversationId, body: "Voice message certification", direction: "inbound", channel: "dashboard", operatorAlert: { eventKind: "voiceMessage", subject: "New voice message", body: "A caller left a voice message. Open the inbox to review it." } });
    const paused = await receiveInboundSms({ db: worker.db }, { businessId, providerMessageId: `SM-${randomUUID()}`, from: "+14165550101", to: "+14165550199", body: "Paused SMS certification", payload: {} });
    assert(paused.messageId, "Paused inbound SMS was not persisted.");
    await updateSmsDeliveryStatus({ db: worker.db }, { businessId, providerMessageId: fixtures.outboundProviderId, providerStatus: "undelivered" });
    assert(await claimSmsDelivery({ db: worker.db }, { businessId, messageId: fixtures.staleOutboundMessageId }), "A stale outbound SMS lease was not recovered.");
    await updateSmsDeliveryStatus({ db: worker.db }, { businessId, messageId: fixtures.staleOutboundMessageId, providerMessageId: "SM-callback-first", providerStatus: "delivered" });
    await markSmsSent({ db: worker.db }, { businessId, messageId: fixtures.staleOutboundMessageId, providerMessageId: "SM-callback-first" });
    const callbackFirstState = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => (await tx.select({ status: messages.status, providerMessageId: messages.providerMessageId }).from(messages).where(and(eq(messages.id, fixtures.staleOutboundMessageId), eq(messages.businessId, businessId))).limit(1))[0]);
    assert(callbackFirstState?.status === "delivered" && callbackFirstState.providerMessageId === "SM-callback-first", "Callback-first SMS status was regressed by the send response.");
    await markCalendarConnectionSync({ db: worker.db }, { businessId, connectionId: fixtures.calendarId, error: "Certification failure" });
    await setTransferState({ db: worker.db }, { businessId, callId: fixtures.callId, transferState: "failed" });
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => { await tx.update(conversations).set({ automationState: "ai_active" }).where(and(eq(conversations.id, fixtures.conversationId), eq(conversations.businessId, businessId))); });
    let aiFailurePropagated = false;
    try { await generateAndQueueSmsReply({ db: worker.db }, { businessId, messageId: paused.messageId }, { generateReply: async () => { throw new Error("Certification AI failure"); } }); } catch { aiFailurePropagated = true; }
    assert(aiFailurePropagated, "AI reply generation failure did not propagate for retry.");
    const sourceDeliveries = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => await tx.select({ eventKind: operatorNotificationDeliveries.eventKind, eventKey: operatorNotificationDeliveries.eventKey }).from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.businessId, businessId)));
    for (const eventKind of ["voiceMessage", "pausedSms", "smsFailed", "calendarSync", "transferFailed", "aiReplyFailed"]) assert(sourceDeliveries.some((delivery) => delivery.eventKind === eventKind), `${eventKind} source did not create an operator delivery.`);
    assert(sourceDeliveries.every((delivery) => !delivery.eventKey.includes("Certification message") && !delivery.eventKey.includes("Paused SMS certification")), "Operator event keys contained customer content.");
    const summaryNow = new Date(Date.now() + 24 * 60 * 60_000);
    summaryNow.setUTCHours(9, 30, 0, 0);
    const summary = await queueDailyOperatorSummaries({ db: worker.db }, { businessId, now: summaryNow });
    assert(summary.queued === 1, "Daily operator summary was not queued at the configured local time.");
    const duplicateSummary = await queueDailyOperatorSummaries({ db: worker.db }, { businessId, now: summaryNow });
    assert(duplicateSummary.queued === 0, "Daily operator summary was not idempotent.");
    const digest = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => (await tx.select().from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.businessId, businessId), eq(operatorNotificationDeliveries.eventKind, "dailyDigest"))))[0]);
    assert(digest?.body.includes("operational summary") && !digest.body.includes("Paused SMS certification") && !digest.body.includes("Certification message"), "Daily summary contained customer content.");
    console.log(JSON.stringify({ defaultsResolved: true, preferencesPersisted: true, crossTenantDenied: true, operatorDeliveryDurable: true, duplicateSafe: true, productionSourcesWired: true, sourceEventKeysContentSafe: true, dailySummaryQueued: true, dailySummaryIdempotent: true, dailySummaryContentSafe: true, staleSmsLeaseRecovered: true, callbackFirstStatusMonotonic: true }));
  } finally {
    for (const id of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async (tx) => await tx.delete(businesses).where(eq(businesses.id, id))).catch(() => undefined);
    await auth.db.delete(users).where(and(eq(users.id, ownerId), eq(users.normalizedEmail, `${ownerId}@example.test`))).catch(() => undefined);
    await auth.db.delete(users).where(and(eq(users.id, foreignOwnerId), eq(users.normalizedEmail, `${foreignOwnerId}@example.test`))).catch(() => undefined);
    await Promise.all([auth.pool.end(), app.pool.end(), worker.pool.end()]);
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
