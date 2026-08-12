import { and, eq, gte, inArray, lte, lt, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { mapTwilioStatusToNotificationStatus, shouldApplyNotificationStatusTransition } from "@lobbystack/shared";

import { appointments, businesses, contacts, enqueueOutbox, notifications, operatorNotificationDeliveries, operatorNotificationPreferences, phoneNumbers, services, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export async function scheduleNotification(
  context: DomainContext,
  input: { businessId: string; channel: string; kind: string; relatedId?: string; scheduledFor: string },
): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [notification] = await tx.insert(notifications).values({
      businessId: input.businessId,
      channel: input.channel,
      kind: input.kind,
      ...(input.relatedId !== undefined ? { relatedId: input.relatedId } : {}),
      scheduledFor: new Date(input.scheduledFor),
      status: "pending",
    }).onConflictDoNothing().returning({ id: notifications.id });
    if (!notification) {
      const existing = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.businessId, input.businessId), eq(notifications.kind, input.kind), input.relatedId ? eq(notifications.relatedId, input.relatedId) : undefined)).limit(1);
      if (!existing[0]) {
        throw new Error("Notification could not be scheduled.");
      }
      return existing[0].id;
    }
    await enqueueOutbox(tx, {
      topic: "notification.dispatch",
      businessId: input.businessId,
      aggregateType: "notification",
      aggregateId: notification.id,
      dedupeKey: `notification:${notification.id}:dispatch`,
      availableAt: new Date(input.scheduledFor),
      payload: { notificationId: notification.id },
    });
    return notification.id;
  });
}

export type NotificationDelivery = {
  notificationId: string;
  businessId: string;
  channel: "sms" | "email";
  to: string;
  from?: string;
  subject: string;
  body: string;
};

export type NotificationDeliveryResolution =
  | { kind: "ready"; delivery: NotificationDelivery }
  | { kind: "skipped"; notificationId: string };

const notificationLeaseMs = 5 * 60_000;

export async function claimNotificationDelivery(
  context: DomainContext,
  input: { businessId: string; notificationId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - notificationLeaseMs);
    const rows = await tx.update(notifications)
      .set({ status: "processing", updatedAt: new Date() })
      .where(and(
        eq(notifications.id, input.notificationId),
        eq(notifications.businessId, input.businessId),
        lte(notifications.scheduledFor, new Date()),
        or(
          eq(notifications.status, "pending"),
          and(eq(notifications.status, "processing"), lt(notifications.updatedAt, staleBefore)),
        ),
      ))
      .returning({ id: notifications.id });
    return rows.length > 0;
  });
}

function localeFor(value: string | null | undefined): "en" | "fr" {
  return value?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function buildAppointmentNotification(input: {
  kind: string;
  locale: "en" | "fr";
  businessName: string;
  serviceName: string;
  startsAt: Date;
  timezone: string;
}): { subject: string; body: string } {
  const date = DateTime.fromJSDate(input.startsAt).setZone(input.timezone).toLocaleString(DateTime.DATETIME_MED);
  if (input.locale === "fr") {
    return {
      subject: input.kind === "appointment_reminder" ? "Rappel de rendez-vous" : "Rendez-vous confirme",
      body: input.kind === "appointment_reminder"
        ? `Rappel de ${input.businessName}: votre rendez-vous ${input.serviceName} est prevu le ${date}.`
        : `${input.businessName}: votre rendez-vous ${input.serviceName} est confirme pour le ${date}.`,
    };
  }
  return {
    subject: input.kind === "appointment_reminder" ? "Appointment reminder" : "Appointment confirmed",
    body: input.kind === "appointment_reminder"
      ? `Reminder from ${input.businessName}: your ${input.serviceName} appointment is scheduled for ${date}.`
      : `${input.businessName}: your ${input.serviceName} appointment is confirmed for ${date}.`,
  };
}

export async function resolveNotificationDelivery(
  context: DomainContext,
  input: { businessId: string; notificationId: string },
): Promise<NotificationDeliveryResolution | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({
      notificationId: notifications.id,
      channel: notifications.channel,
      kind: notifications.kind,
      scheduledFor: notifications.scheduledFor,
      relatedId: notifications.relatedId,
      appointmentStatus: appointments.status,
      startsAt: appointments.startsAt,
      timezone: appointments.timezone,
      businessName: businesses.name,
      defaultLocale: businesses.defaultLocale,
      serviceName: services.name,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
      contactLocale: contacts.preferredLocale,
      smsConsentStatus: contacts.smsConsentStatus,
      senderPhone: phoneNumbers.e164,
    })
      .from(notifications)
      .innerJoin(appointments, and(eq(appointments.id, notifications.relatedId), eq(appointments.businessId, notifications.businessId)))
      .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, notifications.businessId)))
      .innerJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, notifications.businessId)))
      .innerJoin(businesses, eq(businesses.id, notifications.businessId))
      .leftJoin(phoneNumbers, and(eq(phoneNumbers.businessId, notifications.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.smsEnabled, true)))
      .where(and(
        eq(notifications.id, input.notificationId),
        eq(notifications.businessId, input.businessId),
        inArray(notifications.status, ["pending", "processing"]),
        lte(notifications.scheduledFor, new Date()),
      ))
      .limit(1))[0];
    if (!row) {
      return null;
    }
    if (row.appointmentStatus === "canceled" || !row.relatedId) {
      return { kind: "skipped", notificationId: row.notificationId };
    }
    if (row.channel !== "sms" && row.channel !== "email") {
      return { kind: "skipped", notificationId: row.notificationId };
    }
    if (row.channel === "sms" && (row.smsConsentStatus !== "subscribed" || !row.senderPhone || !row.contactPhone)) {
      return { kind: "skipped", notificationId: row.notificationId };
    }
    if (row.channel === "email" && !row.contactEmail) {
      return { kind: "skipped", notificationId: row.notificationId };
    }
    const message = buildAppointmentNotification({
      kind: row.kind,
      locale: localeFor(row.contactLocale ?? row.defaultLocale),
      businessName: row.businessName,
      serviceName: row.serviceName,
      startsAt: row.startsAt,
      timezone: row.timezone,
    });
    return {
      kind: "ready",
      delivery: {
        notificationId: row.notificationId,
        businessId: input.businessId,
        channel: row.channel,
        to: row.channel === "sms" ? row.contactPhone! : row.contactEmail!,
        ...(row.channel === "sms" && row.senderPhone ? { from: row.senderPhone } : {}),
        subject: message.subject,
        body: message.body,
      },
    };
  });
}

export async function markNotificationSent(
  context: DomainContext,
  input: { businessId: string; notificationId: string; providerMessageId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(notifications)
      .set({ status: "sent", providerMessageId: input.providerMessageId, updatedAt: new Date() })
      .where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId), eq(notifications.status, "processing")))
      .returning({ id: notifications.id });
    return rows.length > 0;
  });
}

export async function updateNotificationDeliveryStatus(context: DomainContext, input: { businessId: string; notificationId: string; providerMessageId: string; providerStatus: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ status: notifications.status, providerMessageId: notifications.providerMessageId }).from(notifications).where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId))).limit(1))[0];
    if (!current) return false;
    const nextStatus = mapTwilioStatusToNotificationStatus(input.providerStatus);
    if (!shouldApplyNotificationStatusTransition(current.status, nextStatus)) return false;
    await tx.update(notifications).set({ ...(current.providerMessageId ? {} : { providerMessageId: input.providerMessageId }), status: nextStatus, updatedAt: new Date() }).where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId)));
    return true;
  });
}

export async function markNotificationSkipped(
  context: DomainContext,
  input: { businessId: string; notificationId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(notifications)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId), eq(notifications.status, "processing")))
      .returning({ id: notifications.id });
    return rows.length > 0;
  });
}

export async function releaseNotificationDelivery(
  context: DomainContext,
  input: { businessId: string; notificationId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(notifications)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(
        eq(notifications.id, input.notificationId),
        eq(notifications.businessId, input.businessId),
        eq(notifications.status, "processing"),
      ))
      .returning({ id: notifications.id });
    return rows.length > 0;
  });
}

export async function setNotificationPreferences(
  context: DomainContext,
  input: { userId: string; businessId: string; emailEnabled: boolean; smsEnabled: boolean; eventPreferences: OperatorNotificationEventPreferences; dailySummaryEnabled?: boolean; dailySummarySendTime?: string | null },
): Promise<void> {
  assertDailySummaryTime(input.dailySummarySendTime);
  if (input.dailySummaryEnabled && !input.dailySummarySendTime) {
    throw new Error("A daily summary send time is required when daily summaries are enabled.");
  }
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    await tx.insert(operatorNotificationPreferences).values({
      businessId: input.businessId,
      userId: input.userId,
      emailEnabled: input.emailEnabled,
      smsEnabled: input.smsEnabled,
      eventPreferences: input.eventPreferences,
      dailySummaryEnabled: input.dailySummaryEnabled ?? false,
      dailySummarySendTime: input.dailySummarySendTime ?? null,
    }).onConflictDoUpdate({
      target: [operatorNotificationPreferences.businessId, operatorNotificationPreferences.userId],
      set: { emailEnabled: input.emailEnabled, smsEnabled: input.smsEnabled, eventPreferences: input.eventPreferences, dailySummaryEnabled: input.dailySummaryEnabled ?? false, dailySummarySendTime: input.dailySummarySendTime ?? null, updatedAt: new Date() },
    });
  });
}

export const operatorNotificationEventKeys = ["voiceMessage", "pausedSms", "smsFailed", "calendarSync", "transferFailed", "aiReplyFailed"] as const;
export type OperatorNotificationEventKey = (typeof operatorNotificationEventKeys)[number];
export type OperatorNotificationEventPreferences = Record<OperatorNotificationEventKey, { email: boolean; sms: boolean }>;

export function defaultOperatorNotificationEventPreferences(): OperatorNotificationEventPreferences {
  return Object.fromEntries(operatorNotificationEventKeys.map((key) => [key, { email: true, sms: false }])) as OperatorNotificationEventPreferences;
}

const dailySummaryTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const dailySummaryLabels: Record<OperatorNotificationEventKey, string> = {
  voiceMessage: "Voice messages",
  pausedSms: "Paused SMS",
  smsFailed: "Failed SMS",
  calendarSync: "Calendar sync issues",
  transferFailed: "Transfer failures",
  aiReplyFailed: "AI reply failures",
};

function assertDailySummaryTime(value: string | null | undefined): void {
  if (value !== null && value !== undefined && !dailySummaryTimePattern.test(value)) {
    throw new Error("Daily summary time must use 24-hour HH:mm format.");
  }
}

function buildDailySummary(input: { businessName: string; date: string; counts: Record<OperatorNotificationEventKey, number>; total: number }): { subject: string; body: string } {
  const details = operatorNotificationEventKeys
    .filter((key) => input.counts[key] > 0)
    .map((key) => `${dailySummaryLabels[key]}: ${input.counts[key]}`)
    .join("; ");
  return {
    subject: `${input.businessName} daily operator summary`,
    body: `${input.businessName} operational summary for ${input.date}: ${input.total} alert${input.total === 1 ? "" : "s"}. ${details}`,
  };
}

export async function getNotificationPreferences(context: DomainContext, input: { userId: string; businessId: string }): Promise<{ emailEnabled: boolean; smsEnabled: boolean; eventPreferences: OperatorNotificationEventPreferences; dailySummaryEnabled: boolean; dailySummarySendTime: string | null }> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const row = (await tx.select().from(operatorNotificationPreferences).where(and(eq(operatorNotificationPreferences.businessId, input.businessId), eq(operatorNotificationPreferences.userId, input.userId))).limit(1))[0];
    return row ? { emailEnabled: row.emailEnabled, smsEnabled: row.smsEnabled, eventPreferences: { ...defaultOperatorNotificationEventPreferences(), ...row.eventPreferences } as OperatorNotificationEventPreferences, dailySummaryEnabled: row.dailySummaryEnabled, dailySummarySendTime: row.dailySummarySendTime } : { emailEnabled: true, smsEnabled: false, eventPreferences: defaultOperatorNotificationEventPreferences(), dailySummaryEnabled: false, dailySummarySendTime: null };
  });
}

export async function queueDailyOperatorSummaries(context: DomainContext, input: { businessId: string; now?: Date }): Promise<{ eligible: number; queued: number }> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const business = (await tx.select({ name: businesses.name, timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
    if (!business) return { eligible: 0, queued: 0 };
    const local = DateTime.fromJSDate(now).setZone(business.timezone);
    if (!local.isValid) throw new Error("Business timezone is invalid.");
    const localDate = local.toISODate();
    if (!localDate) return { eligible: 0, queued: 0 };
    const currentDayStart = local.startOf("day");
    const previousDayStart = currentDayStart.minus({ days: 1 });
    const sendTime = local.toFormat("HH:mm");
    const recipientResult = await tx.execute(sql`SELECT user_id AS "userId", email, phone, email_enabled AS "emailEnabled", sms_enabled AS "smsEnabled", daily_summary_enabled AS "dailySummaryEnabled", daily_summary_send_time AS "dailySummarySendTime", sms_consent_granted_at AS "smsConsentGrantedAt", sms_consent_revoked_at AS "smsConsentRevokedAt" FROM app.resolve_operator_notification_recipients(${input.businessId}::uuid)`);
    type SummaryRecipient = { userId: string; email: string; phone: string | null; emailEnabled: boolean; smsEnabled: boolean; dailySummaryEnabled: boolean; dailySummarySendTime: string | null; smsConsentGrantedAt: Date | null; smsConsentRevokedAt: Date | null };
    const preferences = (recipientResult.rows as SummaryRecipient[]).filter((preference) => preference.dailySummaryEnabled && preference.dailySummarySendTime === sendTime);
    if (preferences.length === 0) return { eligible: 0, queued: 0 };
    const sender = (await tx.select({ e164: phoneNumbers.e164 }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.smsEnabled, true))).limit(1))[0]?.e164;
    let queued = 0;
    for (const preference of preferences) {
      const alerts = await tx.select({ eventKind: operatorNotificationDeliveries.eventKind, eventKey: operatorNotificationDeliveries.eventKey })
        .from(operatorNotificationDeliveries)
        .where(and(
          eq(operatorNotificationDeliveries.businessId, input.businessId),
          eq(operatorNotificationDeliveries.userId, preference.userId),
          inArray(operatorNotificationDeliveries.eventKind, operatorNotificationEventKeys),
          gte(operatorNotificationDeliveries.createdAt, previousDayStart.toJSDate()),
          lt(operatorNotificationDeliveries.createdAt, currentDayStart.toJSDate()),
        ));
      const uniqueAlerts = new Map<string, OperatorNotificationEventKey>();
      for (const alert of alerts) {
        if (operatorNotificationEventKeys.includes(alert.eventKind as OperatorNotificationEventKey)) uniqueAlerts.set(alert.eventKey, alert.eventKind as OperatorNotificationEventKey);
      }
      if (uniqueAlerts.size === 0) continue;
      const counts = Object.fromEntries(operatorNotificationEventKeys.map((key) => [key, 0])) as Record<OperatorNotificationEventKey, number>;
      for (const eventKind of uniqueAlerts.values()) counts[eventKind] += 1;
      const message = buildDailySummary({ businessName: business.name, date: previousDayStart.toISODate() ?? "previous day", counts, total: uniqueAlerts.size });
      const eventKey = `dailyDigest:${input.businessId}:${localDate}:${preference.userId}`;
      const smsConsent = Boolean(preference.smsConsentGrantedAt && (!preference.smsConsentRevokedAt || preference.smsConsentGrantedAt > preference.smsConsentRevokedAt));
      const channels = [
        preference.emailEnabled ? { channel: "email", destination: preference.email } : null,
        preference.smsEnabled && smsConsent && preference.phone && sender ? { channel: "sms", destination: preference.phone, sender } : null,
      ].filter((channel): channel is { channel: string; destination: string; sender?: string } => Boolean(channel));
      for (const channel of channels) {
        const [delivery] = await tx.insert(operatorNotificationDeliveries).values({
          businessId: input.businessId,
          userId: preference.userId,
          eventKind: "dailyDigest",
          eventKey,
          channel: channel.channel,
          destination: channel.destination,
          ...(channel.sender ? { sender: channel.sender } : {}),
          subject: message.subject,
          body: message.body,
          scheduledFor: now,
          contentExpiresAt: new Date(now.getTime() + 30 * 86_400_000),
        }).onConflictDoNothing().returning({ id: operatorNotificationDeliveries.id });
        if (!delivery) continue;
        queued += 1;
        await enqueueOutbox(tx, { topic: "notification.dispatch", businessId: input.businessId, aggregateType: "operator_notification_delivery", aggregateId: delivery.id, dedupeKey: `operator-notification:${delivery.id}:dispatch`, payload: { operatorDeliveryId: delivery.id } });
      }
    }
    return { eligible: preferences.length, queued };
  });
}

export async function queueOperatorAlert(context: DomainContext, input: { businessId: string; eventKind: OperatorNotificationEventKey; eventKey: string; subject: string; body: string }): Promise<string[]> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await queueOperatorAlertInTransaction(tx, input));
}

export async function queueOperatorAlertInTransaction(tx: DatabaseTransaction, input: { businessId: string; eventKind: OperatorNotificationEventKey; eventKey: string; subject: string; body: string }): Promise<string[]> {
  type Recipient = { userId: string; email: string; phone: string | null; preferences: OperatorNotificationEventPreferences | null; emailEnabled: boolean; smsEnabled: boolean; smsConsentGrantedAt: Date | null; smsConsentRevokedAt: Date | null };
  const result = await tx.execute(sql`SELECT user_id AS "userId", email, phone, event_preferences AS preferences, email_enabled AS "emailEnabled", sms_enabled AS "smsEnabled" FROM app.resolve_operator_notification_recipients(${input.businessId}::uuid)`);
  const recipients = result.rows as Recipient[];
  const sender = (await tx.select({ e164: phoneNumbers.e164 }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.smsEnabled, true))).limit(1))[0]?.e164;
  const deliveryIds: string[] = [];
  for (const recipient of recipients) {
    const event = { ...defaultOperatorNotificationEventPreferences()[input.eventKind], ...(recipient.preferences?.[input.eventKind] ?? {}) };
      const smsConsent = Boolean(recipient.smsConsentGrantedAt && (!recipient.smsConsentRevokedAt || recipient.smsConsentGrantedAt > recipient.smsConsentRevokedAt));
      const channels = [recipient.emailEnabled !== false && event.email ? { channel: "email", destination: recipient.email } : null, recipient.smsEnabled === true && smsConsent && event.sms && recipient.phone && sender ? { channel: "sms", destination: recipient.phone, sender } : null].filter((value): value is { channel: string; destination: string; sender?: string } => Boolean(value));
    for (const channel of channels) {
      const [delivery] = await tx.insert(operatorNotificationDeliveries).values({ businessId: input.businessId, userId: recipient.userId, eventKind: input.eventKind, eventKey: input.eventKey, channel: channel.channel, destination: channel.destination, ...(channel.sender ? { sender: channel.sender } : {}), subject: input.subject, body: input.body, contentExpiresAt: new Date(Date.now() + 30 * 86_400_000) }).onConflictDoNothing().returning({ id: operatorNotificationDeliveries.id });
      if (!delivery) continue;
      deliveryIds.push(delivery.id);
      await enqueueOutbox(tx, { topic: "notification.dispatch", businessId: input.businessId, aggregateType: "operator_notification_delivery", aggregateId: delivery.id, dedupeKey: `operator-notification:${delivery.id}:dispatch`, payload: { operatorDeliveryId: delivery.id } });
    }
  }
  return deliveryIds;
}

export async function claimOperatorNotificationDelivery(context: DomainContext, input: { businessId: string; deliveryId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => (await tx.update(operatorNotificationDeliveries).set({ status: "processing", updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), or(eq(operatorNotificationDeliveries.status, "pending"), and(eq(operatorNotificationDeliveries.status, "processing"), lt(operatorNotificationDeliveries.updatedAt, new Date(Date.now() - notificationLeaseMs)))))).returning({ id: operatorNotificationDeliveries.id })).length > 0);
}

export async function loadOperatorNotificationDelivery(context: DomainContext, input: { businessId: string; deliveryId: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => (await tx.select().from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))).limit(1))[0] ?? null);
}

export async function markOperatorNotificationSent(context: DomainContext, input: { businessId: string; deliveryId: string; providerMessageId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => { await tx.update(operatorNotificationDeliveries).set({ status: "sent", providerMessageId: input.providerMessageId, sentAt: new Date(), updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))); });
}

export async function updateOperatorNotificationDeliveryStatus(context: DomainContext, input: { businessId: string; deliveryId: string; providerMessageId: string; providerStatus: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ status: operatorNotificationDeliveries.status, providerMessageId: operatorNotificationDeliveries.providerMessageId }).from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId))).limit(1))[0];
    if (!current) return false;
    const nextStatus = mapTwilioStatusToNotificationStatus(input.providerStatus);
    if (!shouldApplyNotificationStatusTransition(current.status, nextStatus)) return false;
    await tx.update(operatorNotificationDeliveries).set({ ...(current.providerMessageId ? {} : { providerMessageId: input.providerMessageId }), status: nextStatus, ...(nextStatus === "delivered" ? { sentAt: new Date() } : {}), lastError: nextStatus === "failed" ? "Twilio delivery failed." : null, updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId)));
    return true;
  });
}

export async function releaseOperatorNotificationDelivery(context: DomainContext, input: { businessId: string; deliveryId: string; error?: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => { await tx.update(operatorNotificationDeliveries).set({ status: "pending", lastError: input.error ?? null, updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))); });
}
