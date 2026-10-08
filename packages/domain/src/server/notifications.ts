import { OPERATOR_SMS_ACCEPTED_DISCLOSURE_VERSIONS, OPERATOR_SMS_DISCLOSURE_VERSION, canTextNumber, intlLocale, normalizeInterfaceLocale, type InterfaceLocale } from "@lobbystack/shared";
import { and, eq, gte, inArray, lte, lt, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { isTerminalTwilioMessageStatus, mapTwilioStatusToNotificationStatus, shouldApplyNotificationStatusTransition } from "@lobbystack/shared";

import { appointments, businesses, contacts, enqueueOutbox, notifications, operatorNotificationDeliveries, operatorNotificationPreferences, services, smsConsentEvents, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { resolveSmsSender } from "./smsSender";
import { correctUsageInTransaction, enqueueUsageSyncInTransaction } from "./usage";
import { recordUnitEconomicsEventInTransaction } from "./unitEconomics";

// Caller must hold the appointment row lock, and commit the schedule change in
// this same transaction. A new delivery ID fences even legacy queued jobs.
export async function rescheduleAppointmentReminderInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; appointmentId: string; startsAt: Date; revision: number },
): Promise<void> {
  const reminderAt = new Date(input.startsAt.getTime() - 24 * 60 * 60 * 1000);
  // Preserve provider/accounting history and the appointment link while freeing
  // the unique active-reminder slot. Never reuse a sent or processing identity.
  await tx.update(notifications).set({
    kind: `appointment_reminder_superseded:${input.revision}`,
    status: sql`case when ${notifications.status} in ('pending', 'processing') then 'skipped' else ${notifications.status} end`,
    updatedAt: new Date(),
  }).where(and(eq(notifications.businessId, input.businessId), eq(notifications.relatedId, input.appointmentId), eq(notifications.kind, "appointment_reminder")));
  if (reminderAt <= new Date()) return;
  const [reminder] = await tx.insert(notifications).values({ businessId: input.businessId, channel: "sms", kind: "appointment_reminder", relatedId: input.appointmentId, scheduledFor: reminderAt, status: "pending" }).returning({ id: notifications.id });
  if (!reminder) throw new Error("Appointment reminder could not be scheduled.");
  await enqueueOutbox(tx, { topic: "notification.dispatch", businessId: input.businessId, aggregateType: "appointment", aggregateId: input.appointmentId, dedupeKey: `notification:${reminder.id}:dispatch:${input.revision}`, availableAt: reminderAt, payload: { notificationId: reminder.id, appointmentRevision: input.revision } });
}

export type NotificationDelivery = {
  notificationId: string;
  businessId: string;
  channel: "sms" | "email";
  // Notification kind and related (appointment) id are carried through so the
  // worker can attribute a provider delivery failure without re-reading the row.
  kind: string;
  relatedId?: string;
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

function localeFor(value: string | null | undefined): InterfaceLocale {
  return normalizeInterfaceLocale(value) ?? "en";
}

/** The text a customer gets when their appointment is cancelled, the one appointment notification sent for a cancelled appointment. */
export const CANCELLATION_CONFIRMATION = "cancellation_confirmation";

/**
 * The opt-out line every appointment text ends with, as in the sample the
 * shared sender's toll-free verification approved. Carriers act on STOP and
 * HELP, so they stay in English in every language. GSM-7 only: a letter such
 * as "č" or "á" would cut a segment from 160 characters to 70.
 */
export const SMS_OPT_OUT_FOOTER: Record<InterfaceLocale, string> = {
  en: "Msg & data rates may apply. Reply STOP to opt out or HELP for help.",
  fr: "Des frais de messagerie et de données peuvent s'appliquer. Répondez STOP pour vous désabonner ou HELP pour obtenir de l'aide.",
  es: "Pueden aplicarse tarifas de mensajes y datos. Responda STOP para darse de baja o HELP para obtener ayuda.",
  sr: "Mogu se naplatiti poruke i prenos podataka. Odgovorite STOP za odjavu ili HELP za informacije.",
};

export function buildAppointmentNotification(input: {
  kind: string;
  channel: "sms" | "email";
  locale: InterfaceLocale;
  businessName: string;
  serviceName: string;
  startsAt: Date;
  timezone: string;
}): { subject: string; body: string } {
  const message = appointmentMessage(input);
  // Every customer text ends with the opt-out line, whether it comes from the
  // shared sender or a self-hosted business's own number. Emails don't.
  return input.channel === "sms" ? { ...message, body: `${message.body} ${SMS_OPT_OUT_FOOTER[input.locale]}` } : message;
}

function appointmentMessage(input: { kind: string; locale: InterfaceLocale; businessName: string; serviceName: string; startsAt: Date; timezone: string }): { subject: string; body: string } {
  // intlLocale keeps Serbian dates in Latin script ("sr-Latn").
  const date = DateTime.fromJSDate(input.startsAt).setZone(input.timezone).setLocale(intlLocale(input.locale)).toLocaleString(DateTime.DATETIME_MED);
  const reminder = input.kind === "appointment_reminder";
  // SMS bodies avoid characters outside the GSM-7 alphabet where the wording
  // allows it, so a reminder stays in as few segments as the English one.
  if (input.kind === CANCELLATION_CONFIRMATION) return cancellationNotification(input, date);
  if (input.locale === "fr") {
    return {
      subject: reminder ? "Rappel de rendez-vous" : "Rendez-vous confirme",
      body: reminder
        ? `Rappel de ${input.businessName}: votre rendez-vous ${input.serviceName} est prevu le ${date}.`
        : `${input.businessName}: votre rendez-vous ${input.serviceName} est confirme pour le ${date}.`,
    };
  }
  if (input.locale === "es") {
    return {
      subject: reminder ? "Recordatorio de cita" : "Cita confirmada",
      body: reminder
        ? `Recordatorio de ${input.businessName}: tiene una cita de ${input.serviceName} el ${date}.`
        : `${input.businessName}: confirmamos su cita de ${input.serviceName} para el ${date}.`,
    };
  }
  if (input.locale === "sr") {
    return {
      subject: reminder ? "Podsetnik za termin" : "Termin je potvrđen",
      body: reminder
        ? `Podsetnik od ${input.businessName}: imate termin za ${input.serviceName}, ${date}.`
        : `${input.businessName}: potvrdili smo termin za ${input.serviceName}, ${date}.`,
    };
  }
  return {
    subject: input.kind === "appointment_reminder" ? "Appointment reminder" : "Appointment confirmed",
    body: input.kind === "appointment_reminder"
      ? `Reminder from ${input.businessName}: your ${input.serviceName} appointment is scheduled for ${date}.`
      : `${input.businessName}: your ${input.serviceName} appointment is confirmed for ${date}.`,
  };
}

function cancellationNotification(input: { locale: InterfaceLocale; businessName: string; serviceName: string }, date: string): { subject: string; body: string } {
  if (input.locale === "fr") return { subject: "Rendez-vous annulé", body: `${input.businessName}: votre rendez-vous ${input.serviceName} du ${date} est annulé.` };
  if (input.locale === "es") return { subject: "Cita cancelada", body: `${input.businessName}: cancelamos su cita de ${input.serviceName} del ${date}.` };
  if (input.locale === "sr") return { subject: "Termin je otkazan", body: `${input.businessName}: otkazali smo termin za ${input.serviceName}, ${date}.` };
  return { subject: "Appointment cancelled", body: `${input.businessName}: your ${input.serviceName} appointment on ${date} is cancelled.` };
}

/**
 * Why an appointment notification can't go out, or null when it can. A
 * cancelled appointment gets only its cancellation text, and a cancellation
 * text needs a cancelled appointment. A text needs a contact who agreed to
 * texts, isn't blocked, and a sender that can reach them (resolveSmsSender).
 */
export function appointmentNotificationSkipReason(row: {
  kind: string;
  channel: string;
  appointmentStatus: string;
  smsConsentStatus: string | null;
  operatorBlockedAt: Date | null;
  senderPhone: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}): "appointment_status" | "channel" | "sms_consent" | "sms_blocked" | "sms_unreachable" | "no_email" | null {
  const cancelled = row.appointmentStatus === "canceled";
  if (cancelled !== (row.kind === CANCELLATION_CONFIRMATION)) return "appointment_status";
  if (row.channel !== "sms" && row.channel !== "email") return "channel";
  if (row.channel === "sms") {
    if (row.smsConsentStatus !== "subscribed") return "sms_consent";
    if (row.operatorBlockedAt !== null) return "sms_blocked";
    if (!canTextNumber(row.senderPhone, row.contactPhone)) return "sms_unreachable";
  }
  if (row.channel === "email" && !row.contactEmail) return "no_email";
  return null;
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
      operatorBlockedAt: contacts.operatorBlockedAt,
    })
      .from(notifications)
      .innerJoin(appointments, and(eq(appointments.id, notifications.relatedId), eq(appointments.businessId, notifications.businessId)))
      .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, notifications.businessId)))
      .innerJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, notifications.businessId)))
      .innerJoin(businesses, eq(businesses.id, notifications.businessId))
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
    // Customer texts go out from the number that sends operator alerts.
    const senderPhone = row.channel === "sms" ? await resolveSmsSender(tx, input.businessId) : null;
    // The channel check repeats one in the skip reason so TypeScript narrows row.channel.
    if (!row.relatedId || appointmentNotificationSkipReason({ ...row, senderPhone }) !== null || (row.channel !== "sms" && row.channel !== "email")) {
      return { kind: "skipped", notificationId: row.notificationId };
    }
    const message = buildAppointmentNotification({
      kind: row.kind,
      channel: row.channel,
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
        kind: row.kind,
        relatedId: row.relatedId,
        to: row.channel === "sms" ? row.contactPhone! : row.contactEmail!,
        ...(row.channel === "sms" && senderPhone ? { from: senderPhone } : {}),
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

export async function updateNotificationDeliveryStatus(context: DomainContext, input: { businessId: string; notificationId: string; providerMessageId: string; providerStatus: string; providerPrice?: number; providerPriceUnit?: string; providerCostUsd?: number; providerNumSegments?: number }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ status: notifications.status, providerMessageId: notifications.providerMessageId, channel: notifications.channel, createdAt: notifications.createdAt }).from(notifications).where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId))).limit(1))[0];
    if (!current) return false;
    const nextStatus = mapTwilioStatusToNotificationStatus(input.providerStatus);
    const applyStatus = shouldApplyNotificationStatusTransition(current.status, nextStatus);
    const hasProviderPricing = input.providerPrice !== undefined || input.providerPriceUnit !== undefined || input.providerCostUsd !== undefined || input.providerNumSegments !== undefined;
    if (!applyStatus && !hasProviderPricing) return false;
    await tx.update(notifications).set({ ...(current.providerMessageId ? {} : { providerMessageId: input.providerMessageId }), providerPrice: input.providerPrice, providerPriceUnit: input.providerPriceUnit, providerCostUsd: input.providerCostUsd, providerNumSegments: input.providerNumSegments, ...(applyStatus ? { status: nextStatus } : {}), updatedAt: new Date() }).where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId)));
    if (current.channel === "sms" && input.providerNumSegments !== undefined) {
      const usageEventId = await correctUsageInTransaction(tx, { businessId: input.businessId, sourceKey: `alert_sms:notification:${input.notificationId}`, usageKind: "alert_sms_segments", quantity: input.providerNumSegments, recordedAt: new Date() });
      await enqueueUsageSyncInTransaction(tx, { businessId: input.businessId, usageEventId });
    }
    if (current.channel === "sms" && isTerminalTwilioMessageStatus(input.providerStatus) && (input.providerCostUsd === undefined || input.providerNumSegments === undefined)) await enqueueOutbox(tx, { topic: "sms.syncPrice", businessId: input.businessId, aggregateType: "notification", aggregateId: input.notificationId, dedupeKey: `notification:${input.notificationId}:price:${input.providerStatus.trim().toLowerCase()}`, payload: { notificationId: input.notificationId, providerMessageId: input.providerMessageId, providerStatus: input.providerStatus } });
    if (input.providerCostUsd !== undefined) await recordUnitEconomicsEventInTransaction(tx, { businessId: input.businessId, eventKey: `notification_provider:${input.notificationId}`, eventKind: "notification_provider", channel: current.channel, costUsd: input.providerCostUsd, occurredAt: current.createdAt, ...(input.providerNumSegments !== undefined ? { quantity: input.providerNumSegments, quantityUnit: "segment" } : {}), provider: "twilio", notificationId: input.notificationId });
    return true;
  });
}

/**
 * Moves a notification this worker is processing to its next state: "skipped",
 * "failed" when the provider rejected it for good (such as a number the sender
 * can't text), or back to "pending" to retry.
 */
export async function transitionProcessingNotification(
  context: DomainContext,
  input: { businessId: string; notificationId: string },
  status: "skipped" | "failed" | "pending",
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(notifications)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId), eq(notifications.status, "processing")))
      .returning({ id: notifications.id });
    return rows.length > 0;
  });
}

type OperatorSmsConsentRecord = { smsConsentGrantedAt: Date | null; smsConsentRevokedAt: Date | null; smsConsentDisclosureVersion: string | null; smsConsentPhone: string | null };

/** Consent counts only for an accepted disclosure, while not revoked, and for the number it was given for. */
function hasOperatorSmsConsent(record: OperatorSmsConsentRecord | null | undefined, phone: string | null | undefined): boolean {
  if (!record?.smsConsentGrantedAt || !phone || record.smsConsentPhone !== phone) return false;
  if (!record.smsConsentDisclosureVersion || !OPERATOR_SMS_ACCEPTED_DISCLOSURE_VERSIONS.includes(record.smsConsentDisclosureVersion)) return false;
  return !record.smsConsentRevokedAt || record.smsConsentGrantedAt > record.smsConsentRevokedAt;
}

/**
 * Records the consent an operator gives by sending a code from the SMS alert
 * phone step, and turns SMS alerts on, in the transaction that verifies the
 * phone. A failed follow-up request can't lose it.
 */
export async function enableOperatorSmsAlertsWithConsent(tx: DatabaseTransaction, input: { businessId: string; userId: string; phone: string; now: Date }): Promise<void> {
  const consent = { smsEnabled: true, smsConsentGrantedAt: input.now, smsConsentRevokedAt: null, smsConsentDisclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION, smsConsentSource: "operator_phone_verification", smsConsentPhone: input.phone, updatedAt: input.now };
  await tx.insert(operatorNotificationPreferences).values({ businessId: input.businessId, userId: input.userId, eventPreferences: defaultOperatorNotificationEventPreferences(), ...consent })
    .onConflictDoUpdate({ target: [operatorNotificationPreferences.businessId, operatorNotificationPreferences.userId], set: consent });
  await tx.insert(smsConsentEvents).values({ businessId: input.businessId, phone: input.phone, recipientType: "operator", action: "operator_alert_consent_granted", source: "operator_phone_verification" });
}

export async function setNotificationPreferences(
  context: DomainContext,
  input: { userId: string; businessId: string; emailEnabled: boolean; smsEnabled: boolean; eventPreferences: OperatorNotificationEventPreferences; dailySummaryEnabled?: boolean; dailySummarySendTime?: string | null; smsConsent?: boolean },
): Promise<void> {
  assertDailySummaryTime(input.dailySummarySendTime);
  if (input.dailySummaryEnabled && !input.dailySummarySendTime) {
    throw new Error("A daily summary send time is required when daily summaries are enabled.");
  }
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const currentUser = (await tx.select({ phone: users.phone }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
    const previous = (await tx.select({ smsConsentGrantedAt: operatorNotificationPreferences.smsConsentGrantedAt, smsConsentRevokedAt: operatorNotificationPreferences.smsConsentRevokedAt, smsConsentDisclosureVersion: operatorNotificationPreferences.smsConsentDisclosureVersion, smsConsentPhone: operatorNotificationPreferences.smsConsentPhone }).from(operatorNotificationPreferences).where(and(eq(operatorNotificationPreferences.businessId, input.businessId), eq(operatorNotificationPreferences.userId, input.userId))).limit(1))[0];
    const existingConsent = hasOperatorSmsConsent(previous, currentUser?.phone);
    if ((input.smsEnabled || Object.values(input.eventPreferences).some(event => event.sms)) && input.smsConsent !== false && input.smsConsent !== true && !existingConsent) throw new Error("SMS notification consent is required before enabling SMS alerts.");
    const consentChanged = input.smsConsent !== undefined && Boolean(input.smsConsent) !== existingConsent;
    const consentNow = input.smsConsent === true ? new Date() : input.smsConsent === false ? new Date() : undefined;
    await tx.insert(operatorNotificationPreferences).values({
      businessId: input.businessId,
      userId: input.userId,
      emailEnabled: input.emailEnabled,
      smsEnabled: input.smsEnabled,
      eventPreferences: input.eventPreferences,
      dailySummaryEnabled: input.dailySummaryEnabled ?? false,
      dailySummarySendTime: input.dailySummarySendTime ?? null,
      ...(input.smsConsent === true ? { smsConsentGrantedAt: consentNow, smsConsentDisclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION, smsConsentPhone: currentUser?.phone ?? null } : {}),
      ...(input.smsConsent === false ? { smsConsentRevokedAt: consentNow } : {}),
      ...(input.smsConsent !== undefined ? { smsConsentSource: "operator_settings" } : {}),
    }).onConflictDoUpdate({
      target: [operatorNotificationPreferences.businessId, operatorNotificationPreferences.userId],
      set: { emailEnabled: input.emailEnabled, smsEnabled: input.smsEnabled, eventPreferences: input.eventPreferences, dailySummaryEnabled: input.dailySummaryEnabled ?? false, dailySummarySendTime: input.dailySummarySendTime ?? null, ...(input.smsConsent === true ? { smsConsentGrantedAt: consentNow, smsConsentRevokedAt: null, smsConsentDisclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION, smsConsentPhone: currentUser?.phone ?? null } : {}), ...(input.smsConsent === false ? { smsConsentRevokedAt: consentNow } : {}), ...(input.smsConsent !== undefined ? { smsConsentSource: "operator_settings" } : {}), updatedAt: new Date() },
    });
    if (consentChanged && consentNow && currentUser?.phone) await tx.insert(smsConsentEvents).values({ businessId: input.businessId, phone: currentUser.phone, recipientType: "operator", action: input.smsConsent ? "operator_alert_consent_granted" : "operator_alert_consent_revoked", source: "operator_settings" });
  });
}

export const operatorNotificationEventKeys = ["voiceMessage", "pausedSms", "smsFailed", "calendarSync", "transferFailed", "aiReplyFailed", "widgetChat", "webhookDisabled"] as const;
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
  widgetChat: "Website chat messages",
  webhookDisabled: "Webhook endpoints turned off",
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

export async function getNotificationPreferences(context: DomainContext, input: { userId: string; businessId: string; phoneVerified?: boolean }): Promise<{ emailEnabled: boolean; smsEnabled: boolean; smsConsent: boolean; eventPreferences: OperatorNotificationEventPreferences; dailySummaryEnabled: boolean; dailySummarySendTime: string | null; canUseSms: boolean; smsUnavailableReason: "phone_unverified" | "sender_missing" | null }> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const row = (await tx.select().from(operatorNotificationPreferences).where(and(eq(operatorNotificationPreferences.businessId, input.businessId), eq(operatorNotificationPreferences.userId, input.userId))).limit(1))[0];
    const phone = (await tx.select({ phone: users.phone }).from(users).where(eq(users.id, input.userId)).limit(1))[0]?.phone;
    const sender = await resolveSmsSender(tx, input.businessId);
    const phoneVerified = input.phoneVerified === true;
    const canUseSms = phoneVerified && Boolean(sender);
    // A missing sender blocks SMS for everyone, so report it ahead of the operator's own phone.
    const channelState = { canUseSms, smsUnavailableReason: !sender ? "sender_missing" as const : phoneVerified ? null : "phone_unverified" as const };
    const smsConsent = hasOperatorSmsConsent(row, phone);
    const canSendSms = canUseSms && smsConsent;
    const storedEvents = { ...defaultOperatorNotificationEventPreferences(), ...row?.eventPreferences } as OperatorNotificationEventPreferences;
    const eventPreferences = canSendSms ? storedEvents : Object.fromEntries(Object.entries(storedEvents).map(([key, value]) => [key, { ...value, sms: false }])) as OperatorNotificationEventPreferences;
    return { emailEnabled: row?.emailEnabled ?? true, smsEnabled: canSendSms && Boolean(row?.smsEnabled), smsConsent, eventPreferences, dailySummaryEnabled: row?.dailySummaryEnabled ?? false, dailySummarySendTime: row?.dailySummarySendTime ?? null, ...channelState };
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
    const recipientResult = await tx.execute(sql`SELECT user_id AS "userId", email, phone, email_enabled AS "emailEnabled", sms_enabled AS "smsEnabled", daily_summary_enabled AS "dailySummaryEnabled", daily_summary_send_time AS "dailySummarySendTime", sms_consent_granted_at AS "smsConsentGrantedAt", sms_consent_revoked_at AS "smsConsentRevokedAt", sms_consent_disclosure_version AS "smsConsentDisclosureVersion", sms_consent_phone AS "smsConsentPhone" FROM app.resolve_operator_notification_recipients(${input.businessId}::uuid)`);
    type SummaryRecipient = { userId: string; email: string; phone: string | null; emailEnabled: boolean; smsEnabled: boolean; dailySummaryEnabled: boolean; dailySummarySendTime: string | null; smsConsentGrantedAt: Date | null; smsConsentRevokedAt: Date | null; smsConsentDisclosureVersion: string | null; smsConsentPhone: string | null };
    const preferences = (recipientResult.rows as SummaryRecipient[]).filter((preference) => preference.dailySummaryEnabled && preference.dailySummarySendTime === sendTime);
    if (preferences.length === 0) return { eligible: 0, queued: 0 };
    const sender = await resolveSmsSender(tx, input.businessId);
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
      const smsConsent = hasOperatorSmsConsent(preference, preference.phone);
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
  type Recipient = { userId: string; email: string; phone: string | null; preferences: OperatorNotificationEventPreferences | null; emailEnabled: boolean; smsEnabled: boolean; smsConsentGrantedAt: Date | null; smsConsentRevokedAt: Date | null; smsConsentDisclosureVersion: string | null; smsConsentPhone: string | null };
  const result = await tx.execute(sql`SELECT user_id AS "userId", email, phone, event_preferences AS preferences, email_enabled AS "emailEnabled", sms_enabled AS "smsEnabled", sms_consent_granted_at AS "smsConsentGrantedAt", sms_consent_revoked_at AS "smsConsentRevokedAt", sms_consent_disclosure_version AS "smsConsentDisclosureVersion", sms_consent_phone AS "smsConsentPhone" FROM app.resolve_operator_notification_recipients(${input.businessId}::uuid)`);
  const recipients = result.rows as Recipient[];
  const sender = await resolveSmsSender(tx, input.businessId);
  const deliveryIds: string[] = [];
  for (const recipient of recipients) {
    const event = { ...defaultOperatorNotificationEventPreferences()[input.eventKind], ...(recipient.preferences?.[input.eventKind] ?? {}) };
      const smsConsent = hasOperatorSmsConsent(recipient, recipient.phone);
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
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const delivery = (await tx.select({ id: operatorNotificationDeliveries.id, businessId: operatorNotificationDeliveries.businessId, userId: operatorNotificationDeliveries.userId, eventKind: operatorNotificationDeliveries.eventKind, eventKey: operatorNotificationDeliveries.eventKey, channel: operatorNotificationDeliveries.channel, status: operatorNotificationDeliveries.status, destination: operatorNotificationDeliveries.destination, sender: operatorNotificationDeliveries.sender, subject: operatorNotificationDeliveries.subject, body: operatorNotificationDeliveries.body, providerMessageId: operatorNotificationDeliveries.providerMessageId, scheduledFor: operatorNotificationDeliveries.scheduledFor, sentAt: operatorNotificationDeliveries.sentAt, contentExpiresAt: operatorNotificationDeliveries.contentExpiresAt, lastError: operatorNotificationDeliveries.lastError, createdAt: operatorNotificationDeliveries.createdAt, updatedAt: operatorNotificationDeliveries.updatedAt })
      .from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))).limit(1))[0];
    if (!delivery) return null;
    if (delivery.channel === "sms") {
      type Recipient = { userId: string; phone: string | null; smsEnabled: boolean; smsConsentGrantedAt: Date | null; smsConsentRevokedAt: Date | null; smsConsentDisclosureVersion: string | null; smsConsentPhone: string | null };
      const result = await tx.execute(sql`SELECT user_id AS "userId", phone, sms_enabled AS "smsEnabled", sms_consent_granted_at AS "smsConsentGrantedAt", sms_consent_revoked_at AS "smsConsentRevokedAt", sms_consent_disclosure_version AS "smsConsentDisclosureVersion", sms_consent_phone AS "smsConsentPhone" FROM app.resolve_operator_notification_recipients(${input.businessId}::uuid)`);
      const recipient = (result.rows as Recipient[]).find((row) => row.userId === delivery.userId);
      const consent = hasOperatorSmsConsent(recipient, recipient?.phone);
      if (!recipient?.smsEnabled || !consent || !recipient.phone || recipient.phone !== delivery.destination || !delivery.sender) return null;
    }
    return delivery;
  });
}

export async function markOperatorNotificationSent(context: DomainContext, input: { businessId: string; deliveryId: string; providerMessageId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => { await tx.update(operatorNotificationDeliveries).set({ status: "sent", providerMessageId: input.providerMessageId, sentAt: new Date(), updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))); });
}

export async function markOperatorNotificationSkipped(context: DomainContext, input: { businessId: string; deliveryId: string; error?: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => { await tx.update(operatorNotificationDeliveries).set({ status: "skipped", lastError: input.error ?? null, updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))); });
}

export async function updateOperatorNotificationDeliveryStatus(context: DomainContext, input: { businessId: string; deliveryId: string; providerMessageId: string; providerStatus: string; providerPrice?: number; providerPriceUnit?: string; providerCostUsd?: number; providerNumSegments?: number }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ status: operatorNotificationDeliveries.status, providerMessageId: operatorNotificationDeliveries.providerMessageId, channel: operatorNotificationDeliveries.channel, createdAt: operatorNotificationDeliveries.createdAt }).from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId))).limit(1))[0];
    if (!current) return false;
    const nextStatus = mapTwilioStatusToNotificationStatus(input.providerStatus);
    const applyStatus = shouldApplyNotificationStatusTransition(current.status, nextStatus);
    const hasProviderPricing = input.providerPrice !== undefined || input.providerPriceUnit !== undefined || input.providerCostUsd !== undefined || input.providerNumSegments !== undefined;
    if (!applyStatus && !hasProviderPricing) return false;
    await tx.update(operatorNotificationDeliveries).set({ ...(current.providerMessageId ? {} : { providerMessageId: input.providerMessageId }), providerPrice: input.providerPrice, providerPriceUnit: input.providerPriceUnit, providerCostUsd: input.providerCostUsd, providerNumSegments: input.providerNumSegments, ...(applyStatus ? { status: nextStatus, ...(nextStatus === "delivered" ? { sentAt: new Date() } : {}), lastError: nextStatus === "failed" ? "Twilio delivery failed." : null } : {}), updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId)));
    if (current.channel === "sms" && input.providerNumSegments !== undefined) {
      const usageEventId = await correctUsageInTransaction(tx, { businessId: input.businessId, sourceKey: `alert_sms:operator_notification:${input.deliveryId}`, usageKind: "alert_sms_segments", quantity: input.providerNumSegments, recordedAt: new Date() });
      await enqueueUsageSyncInTransaction(tx, { businessId: input.businessId, usageEventId });
    }
    if (current.channel === "sms" && isTerminalTwilioMessageStatus(input.providerStatus) && (input.providerCostUsd === undefined || input.providerNumSegments === undefined)) await enqueueOutbox(tx, { topic: "sms.syncPrice", businessId: input.businessId, aggregateType: "operator_notification_delivery", aggregateId: input.deliveryId, dedupeKey: `operator-notification:${input.deliveryId}:price:${input.providerStatus.trim().toLowerCase()}`, payload: { operatorDeliveryId: input.deliveryId, providerMessageId: input.providerMessageId, providerStatus: input.providerStatus } });
    if (input.providerCostUsd !== undefined) await recordUnitEconomicsEventInTransaction(tx, { businessId: input.businessId, eventKey: `operator_notification_provider:${input.deliveryId}`, eventKind: "operator_notification_provider", channel: current.channel, costUsd: input.providerCostUsd, occurredAt: current.createdAt, ...(input.providerNumSegments !== undefined ? { quantity: input.providerNumSegments, quantityUnit: "segment" } : {}), provider: "twilio", operatorNotificationDeliveryId: input.deliveryId });
    return true;
  });
}

export async function releaseOperatorNotificationDelivery(context: DomainContext, input: { businessId: string; deliveryId: string; error?: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => { await tx.update(operatorNotificationDeliveries).set({ status: "pending", lastError: input.error ?? null, updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))); });
}
