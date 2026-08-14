import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { businessMemberships, businesses, contacts, conversations, createDatabaseClient, messages, operatorNotificationDeliveries, outboxMessages, phoneNumbers, smsConsentEvents, users, withBusinessTransaction } from "@lobbystack/db";
import { appendMessage, claimOperatorNotificationDelivery, claimSmsDelivery, defaultOperatorNotificationEventPreferences, loadOperatorNotificationDelivery, loadSmsDeliveryTarget, queueOperatorAlert, receiveInboundSms, setContactSmsManualBlock, setNotificationPreferences } from "@lobbystack/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const migrator = createDatabaseClient("lobbystack_migrator");
  const worker = createDatabaseClient("lobbystack_worker");
  const app = createDatabaseClient("lobbystack_app");
  const businessId = randomUUID();
  const foreignBusinessId = randomUUID();
  const userId = randomUUID();
  const phone = "+14165550777";
  try {
    await migrator.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, phone: "+14165550778" });
    await migrator.db.insert(businesses).values([{ id: businessId, slug: `sms-consent-${businessId}`, name: "SMS consent certification", timezone: "UTC", businessType: "test" }, { id: foreignBusinessId, slug: `sms-consent-${foreignBusinessId}`, name: "Foreign SMS consent certification", timezone: "UTC", businessType: "test" }]);
    await migrator.db.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
    await migrator.db.insert(phoneNumbers).values({ businessId, e164: "+14165550779", providerPhoneId: `PN-${randomUUID()}` });

    const stopProviderId = `SM-${randomUUID()}`;
    const stopMessage = await receiveInboundSms({ db: worker.db }, { businessId, providerMessageId: stopProviderId, from: phone, to: "+14165550779", body: "STOP", payload: {} });
    assert(stopMessage.messageId, "STOP inbound was not persisted.");
    const duplicateStop = await receiveInboundSms({ db: worker.db }, { businessId, providerMessageId: stopProviderId, from: phone, to: "+14165550779", body: "STOP", payload: {} });
    assert(duplicateStop.duplicate, "Duplicate Twilio webhook was not identified.");
    const afterStop = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => ({
      contact: (await tx.select().from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.phone, phone))).limit(1))[0],
      events: await tx.select().from(smsConsentEvents).where(and(eq(smsConsentEvents.businessId, businessId), eq(smsConsentEvents.phone, phone))),
      outbox: await tx.select().from(outboxMessages).where(eq(outboxMessages.aggregateId, stopMessage.messageId!)),
    }));
    assert(afterStop.contact && afterStop.contact.smsConsentStatus === "opted_out", "STOP did not opt the contact out.");
    const contactId = afterStop.contact.id;
    assert(afterStop.events.filter((event) => event.action === "opted_out").length === 1, "Duplicate STOP created duplicate consent history.");
    assert(!afterStop.outbox.some((row) => row.topic === "sms.send"), "STOP queued a compliance reply unexpectedly.");

    assert(await setContactSmsManualBlock({ db: app.db }, { userId, businessId, contactId, blocked: true }), "Manual block was not applied.");
    const startMessage = await receiveInboundSms({ db: worker.db }, { businessId, providerMessageId: `SM-${randomUUID()}`, from: phone, to: "+14165550779", body: "START", payload: {} });
    assert(startMessage.messageId, "START inbound was not persisted.");
    const blockedState = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      const contact = (await tx.select().from(contacts).where(eq(contacts.id, contactId)).limit(1))[0];
      const conversation = (await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, businessId), eq(conversations.contactId, contactId))).limit(1))[0];
      return { contact, conversation };
    });
    assert(blockedState.contact?.smsConsentStatus === "subscribed" && blockedState.contact.operatorBlockedAt instanceof Date, "START did not clear carrier opt-out while preserving the manual block.");
    assert(blockedState.conversation, "SMS conversation was not persisted.");
    const queuedMessageId = await appendMessage({ db: worker.db }, { businessId, conversationId: blockedState.conversation.id, direction: "outbound", channel: "sms", body: "Queued before consent recheck", aiGenerated: false });
    assert(await claimSmsDelivery({ db: worker.db }, { businessId, messageId: queuedMessageId }), "Queued SMS could not be claimed.");
    assert(await loadSmsDeliveryTarget(worker.db, { businessId, messageId: queuedMessageId }) === null, "Queued SMS bypassed a manual block applied before delivery.");
    assert(await setContactSmsManualBlock({ db: app.db }, { userId, businessId, contactId, blocked: false }), "Manual unblock was not applied.");
    const helpProviderId = `SM-${randomUUID()}`;
    await receiveInboundSms({ db: worker.db }, { businessId, providerMessageId: helpProviderId, from: phone, to: "+14165550779", body: "HELP", payload: {} });
    const duplicateHelp = await receiveInboundSms({ db: worker.db }, { businessId, providerMessageId: helpProviderId, from: phone, to: "+14165550779", body: "HELP", payload: {} });
    const complianceReplies = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.businessId, businessId), eq(messages.providerStatus, "compliance_reply"))));
    assert(duplicateHelp.duplicate && complianceReplies.length === 1, "Duplicate webhook queued duplicate compliance replies.");
    const crossTenant = await setContactSmsManualBlock({ db: app.db }, { userId, businessId: foreignBusinessId, contactId, blocked: true }).catch(() => false);
    assert(!crossTenant, "Cross-tenant manual block was accepted.");

    const preferences = defaultOperatorNotificationEventPreferences();
    preferences.voiceMessage.sms = true;
    await setNotificationPreferences({ db: app.db }, { userId, businessId, emailEnabled: false, smsEnabled: true, smsConsent: true, eventPreferences: preferences });
    const [operatorDeliveryId] = await queueOperatorAlert({ db: worker.db }, { businessId, eventKind: "voiceMessage", eventKey: `voiceMessage:${randomUUID()}`, subject: "Certification", body: "Consent race certification" });
    assert(operatorDeliveryId, "Operator SMS was not queued after consent.");
    assert(await claimOperatorNotificationDelivery({ db: worker.db }, { businessId, deliveryId: operatorDeliveryId }), "Operator SMS could not be claimed.");
    await setNotificationPreferences({ db: app.db }, { userId, businessId, emailEnabled: false, smsEnabled: true, smsConsent: false, eventPreferences: preferences });
    assert(await loadOperatorNotificationDelivery({ db: worker.db }, { businessId, deliveryId: operatorDeliveryId }) === null, "Operator consent revocation was not rechecked before delivery.");

    let immutable = false;
    try { await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => await tx.update(smsConsentEvents).set({ action: "tampered" }).where(eq(smsConsentEvents.businessId, businessId))); } catch { immutable = true; }
    assert(immutable, "Consent history could be mutated.");
    const events = await migrator.db.select().from(smsConsentEvents).where(eq(smsConsentEvents.businessId, businessId));
    for (const action of ["opted_out", "resubscribed", "manual_blocked", "manual_unblocked", "operator_alert_consent_granted", "operator_alert_consent_revoked"]) assert(events.some((event) => event.action === action), `${action} consent event is missing.`);
    const delivery = (await migrator.db.select().from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.id, operatorDeliveryId)).limit(1))[0];
    assert(delivery?.status === "processing", "Certification expected the claimed operator delivery to remain available for the worker skip path.");
    console.log(JSON.stringify({ contactStopStart: true, duplicateWebhookIdempotent: true, complianceReplyDeduplicated: true, manualBlockPreserved: true, queuedMessageRaceBlocked: true, operatorConsentRechecked: true, crossTenantDenied: true, immutableHistory: true }));
  } finally {
    await migrator.db.delete(businesses).where(eq(businesses.id, businessId)).catch(() => undefined);
    await migrator.db.delete(businesses).where(eq(businesses.id, foreignBusinessId)).catch(() => undefined);
    await migrator.db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    await Promise.all([migrator.pool.end(), worker.pool.end(), app.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
