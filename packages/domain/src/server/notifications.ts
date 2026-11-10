import { createHash, randomUUID } from "node:crypto";

import { MAX_PHONE_CALL_MS, OPERATOR_SMS_ACCEPTED_DISCLOSURE_VERSIONS, OPERATOR_SMS_DISCLOSURE_VERSION, canTextNumber, intlLocale, normalizeInterfaceLocale, type InterfaceLocale } from "@lobbystack/shared";
import { and, eq, gte, inArray, isNull, like, lte, lt, ne, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { isTerminalTwilioMessageStatus, mapTwilioStatusToNotificationStatus, shouldApplyNotificationStatusTransition } from "@lobbystack/shared";

import { appointments, businesses, businessMemberships, calendarConnections, contacts, enqueueOutbox, notifications, operatorNotificationDeliveries, outboxMessages, operatorNotificationPreferences, prospectDemos, services, smsConsentEvents, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { CarrierId } from "@lobbystack/providers/telephony/types";

import { requireBusinessMembership } from "../authz";
import { pickCalendarWriter } from "../calendarWriter";
import { deploymentAppName } from "./branding";
import type { DomainContext } from "./context";
import { resolveSmsSender } from "./smsSender";
import { correctUsageInTransaction, enqueueUsageSyncInTransaction } from "./usage";
import { recordUnitEconomicsEventInTransaction } from "./unitEconomics";

// Caller must hold the appointment row lock, and commit the schedule change in
// this same transaction. A new delivery ID fences even legacy queued jobs.
/**
 * The dispatch job for a customer text queued during a call. It waits until
 * the call ends (releaseCallTexts), so delivery follows every answer about
 * texts the caller gave on the call, whatever order the agent saved them in.
 * A call can't outlast MAX_PHONE_CALL_MS, so the job goes out then at the latest.
 */
export function heldForCall(callId: string | undefined, payload: { notificationId: string }): { payload: Record<string, unknown>; availableAt?: Date } {
  return callId ? { payload: { ...payload, callId }, availableAt: new Date(Date.now() + MAX_PHONE_CALL_MS) } : { payload };
}

/** Sends the texts a call held back, once the call has ended. */
export async function releaseCallTexts(context: DomainContext, input: { businessId: string; callId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(outboxMessages).set({ availableAt: new Date() }).where(and(
      eq(outboxMessages.businessId, input.businessId),
      eq(outboxMessages.topic, "notification.dispatch"),
      isNull(outboxMessages.publishedAt),
      sql`${outboxMessages.payload}->>'callId' = ${input.callId}`,
    ));
  });
}

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

/** The text with a video link that a customer gets after their confirmation. Each one's kind ends in its own id, since an appointment can have several. */
export const VIDEO_LINK_UPDATE = "video_link_update";

/**
 * Saves an appointment's video link. A customer whose confirmation is still
 * waiting gets the link in it, and reminders read the saved link. Anyone else
 * gets a text of its own, which delivery sends under the usual consent rules.
 */
export async function saveAppointmentVideoUrlInTransaction(tx: DatabaseTransaction, input: { businessId: string; appointmentId: string; videoUrl: string | null }): Promise<void> {
  const [appointment] = await tx.select({ videoUrl: appointments.videoUrl, status: appointments.status, startsAt: appointments.startsAt }).from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId))).limit(1).for("update");
  if (!appointment || appointment.videoUrl === input.videoUrl) return;
  await tx.update(appointments).set({ videoUrl: input.videoUrl, updatedAt: new Date() }).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId)));
  if (!input.videoUrl || appointment.status !== "confirmed" || appointment.startsAt <= new Date()) return;
  // The lock makes a claim on the confirmation wait for this commit, so a claimed one reads the new link.
  const waiting = await tx.select({ kind: notifications.kind, status: notifications.status }).from(notifications).where(and(eq(notifications.businessId, input.businessId), eq(notifications.relatedId, input.appointmentId), or(eq(notifications.kind, "booking_confirmation"), like(notifications.kind, `${VIDEO_LINK_UPDATE}:%`)))).for("update");
  // An update still waiting sends whichever link is current when it goes out.
  if (!waiting.length || waiting.some((row) => row.status === "pending")) return;
  const [update] = await tx.insert(notifications).values({ businessId: input.businessId, channel: "sms", kind: `${VIDEO_LINK_UPDATE}:${randomUUID()}`, relatedId: input.appointmentId, scheduledFor: new Date(), status: "pending" }).returning({ id: notifications.id });
  if (!update) throw new Error("Video link notification could not be created.");
  await enqueueOutbox(tx, { topic: "notification.dispatch", businessId: input.businessId, aggregateType: "appointment", aggregateId: input.appointmentId, dedupeKey: `notification:${update.id}:dispatch`, payload: { notificationId: update.id } });
}

const VIDEO_LINK_WAIT_MS = 2 * 60_000;
const VIDEO_LINK_POLL_MS = 10_000;

/**
 * When to try a booking confirmation again, or null to send it now. A Cal.com
 * booking gets its video link from the calendar sync, so its confirmation
 * waits a short while for the sync. After that it goes out alone, and the sync
 * sends the link in a text of its own.
 */
export async function confirmationRetryAt(context: DomainContext, input: { businessId: string; notificationId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({ scheduledFor: notifications.scheduledFor, staffId: appointments.staffId })
      .from(notifications)
      .innerJoin(appointments, and(eq(appointments.id, notifications.relatedId), eq(appointments.businessId, notifications.businessId)))
      .where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId), eq(notifications.kind, "booking_confirmation"), eq(notifications.status, "pending"), eq(appointments.calendarSyncState, "pending")))
      .limit(1);
    if (!row) return null;
    const waitEndsAt = row.scheduledFor.getTime() + VIDEO_LINK_WAIT_MS;
    if (waitEndsAt <= Date.now()) return null;
    const connections = await tx.select({ id: calendarConnections.id, provider: calendarConnections.provider, staffId: calendarConnections.staffId, selectedCalendarId: calendarConnections.selectedCalendarId }).from(calendarConnections)
      .where(and(eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"), or(isNull(calendarConnections.staffId), eq(calendarConnections.staffId, row.staffId))));
    return pickCalendarWriter(connections)?.provider === "calcom" ? new Date(Math.min(waitEndsAt, Date.now() + VIDEO_LINK_POLL_MS)) : null;
  });
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
  /** The opt-in confirmation to send first, when this is the contact's first text since they said yes. */
  optIn?: SmsOptInConfirmation;
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

/** When a send holds this notification, the time its lease ends and another run may claim it. */
export async function notificationLeaseEndsAt(context: DomainContext, input: { businessId: string; notificationId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ updatedAt: notifications.updatedAt }).from(notifications).where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId), eq(notifications.status, "processing"))).limit(1))[0];
    return row ? new Date(row.updatedAt.getTime() + notificationLeaseMs) : null;
  });
}

function localeFor(value: string | null | undefined): InterfaceLocale {
  return normalizeInterfaceLocale(value) ?? "en";
}

/** The text a customer gets when their appointment is cancelled, the one appointment notification sent for a cancelled appointment. */
export const CANCELLATION_CONFIRMATION = "cancellation_confirmation";

/** The text a customer gets when their appointment moves. Its kind carries the revision, since an appointment can move more than once. */
export const RESCHEDULE_CONFIRMATION = "reschedule_confirmation";

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

/**
 * The opt-in confirmation a delivery sends before its own text: the first
 * text a business sends a customer who agreed to texts. It names the host,
 * the verified sender, and the business; every later text names only the
 * business (docs/white-label.md, "Texts"). See smsOptIn.ts.
 */
export type SmsOptInConfirmation = { contactId: string; body: string };

// GSM-7 only, like the opt-out footer that follows.
const SMS_OPT_IN_INTRO: Record<InterfaceLocale, (hostName: string, businessName: string) => string> = {
  en: (host, business) => `${host} sends appointment texts for ${business}. Msg frequency varies.`,
  fr: (host, business) => `${host} envoie les textos de rendez-vous de ${business}. Fréquence variable.`,
  es: (host, business) => `${host}: mensajes de citas de ${business}. Frecuencia variable.`,
  sr: (host, business) => `${host}: poruke o terminima za ${business}. Broj poruka varira.`,
};

/** The opt-in confirmation, in the customer's language. */
export function smsOptInConfirmationBody(input: { locale: InterfaceLocale; hostName: string; businessName: string }): string {
  return `${SMS_OPT_IN_INTRO[input.locale](input.hostName, input.businessName)} ${SMS_OPT_OUT_FOOTER[input.locale]}`;
}

/**
 * The confirmation a text to this contact needs first, or undefined when the
 * contact got one for their current yes, never said yes, or is blocked.
 */
export async function smsOptInConfirmationInTransaction(tx: DatabaseTransaction, input: { businessId: string; contactId: string }): Promise<SmsOptInConfirmation | undefined> {
  const row = (await tx.select({ status: contacts.smsConsentStatus, confirmedAt: contacts.smsOptInConfirmedAt, blockedAt: contacts.operatorBlockedAt, locale: contacts.preferredLocale, businessName: businesses.name, defaultLocale: businesses.defaultLocale })
    .from(contacts)
    .innerJoin(businesses, eq(businesses.id, contacts.businessId))
    .where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId)))
    .limit(1))[0];
  if (!row || row.status !== "subscribed" || row.confirmedAt || row.blockedAt) return undefined;
  return { contactId: input.contactId, body: smsOptInConfirmationBody({ locale: localeFor(row.locale ?? row.defaultLocale), hostName: await deploymentAppName(tx), businessName: row.businessName }) };
}

export function buildAppointmentNotification(input: {
  kind: string;
  channel: "sms" | "email";
  locale: InterfaceLocale;
  businessName: string;
  serviceName: string;
  startsAt: Date;
  timezone: string;
  /** The link for joining a video appointment. A cancellation text leaves it out. */
  videoUrl?: string | null;
}): { subject: string; body: string } {
  const appointment = appointmentMessage(input);
  const joinable = input.videoUrl && input.kind !== CANCELLATION_CONFIRMATION && !input.kind.startsWith(VIDEO_LINK_UPDATE);
  const message = joinable ? { ...appointment, body: `${appointment.body} ${VIDEO_LINK_LABEL[input.locale]}: ${input.videoUrl}` } : appointment;
  // Every customer text ends with the opt-out line, whether it comes from the
  // shared sender or a self-hosted business's own number. Emails don't.
  return input.channel === "sms" ? { ...message, body: `${message.body} ${SMS_OPT_OUT_FOOTER[input.locale]}` } : message;
}

// GSM-7 only, like the opt-out footer that follows.
const VIDEO_LINK_LABEL: Record<InterfaceLocale, string> = { en: "Join", fr: "Lien", es: "Enlace", sr: "Link" };

function appointmentMessage(input: { kind: string; locale: InterfaceLocale; businessName: string; serviceName: string; startsAt: Date; timezone: string; videoUrl?: string | null }): { subject: string; body: string } {
  // intlLocale keeps Serbian dates in Latin script ("sr-Latn").
  const date = DateTime.fromJSDate(input.startsAt).setZone(input.timezone).setLocale(intlLocale(input.locale)).toLocaleString(DateTime.DATETIME_MED);
  const reminder = input.kind === "appointment_reminder";
  // SMS bodies avoid characters outside the GSM-7 alphabet where the wording
  // allows it, so a reminder stays in as few segments as the English one.
  if (input.kind === CANCELLATION_CONFIRMATION) return cancellationNotification(input, date);
  if (input.kind.startsWith(RESCHEDULE_CONFIRMATION)) return rescheduleNotification(input, date);
  if (input.kind.startsWith(VIDEO_LINK_UPDATE)) return videoLinkNotification(input, date);
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

function rescheduleNotification(input: { locale: InterfaceLocale; businessName: string; serviceName: string }, date: string): { subject: string; body: string } {
  if (input.locale === "fr") return { subject: "Rendez-vous déplacé", body: `${input.businessName}: votre rendez-vous ${input.serviceName} est déplacé au ${date}.` };
  if (input.locale === "es") return { subject: "Cita reprogramada", body: `${input.businessName}: su cita de ${input.serviceName} queda para el ${date}.` };
  if (input.locale === "sr") return { subject: "Termin je pomeren", body: `${input.businessName}: vas termin za ${input.serviceName} je pomeren na ${date}.` };
  return { subject: "Appointment moved", body: `${input.businessName}: your ${input.serviceName} appointment has moved to ${date}.` };
}

function videoLinkNotification(input: { locale: InterfaceLocale; businessName: string; serviceName: string; videoUrl?: string | null }, date: string): { subject: string; body: string } {
  if (input.locale === "fr") return { subject: "Lien vidéo", body: `${input.businessName}: lien pour votre rendez-vous ${input.serviceName} du ${date}: ${input.videoUrl}` };
  if (input.locale === "es") return { subject: "Enlace de video", body: `${input.businessName}: enlace para su cita de ${input.serviceName} del ${date}: ${input.videoUrl}` };
  if (input.locale === "sr") return { subject: "Video link", body: `${input.businessName}: link za termin za ${input.serviceName}, ${date}: ${input.videoUrl}` };
  return { subject: "Video link", body: `${input.businessName}: link for your ${input.serviceName} appointment on ${date}: ${input.videoUrl}` };
}

/**
 * Why an appointment notification can't go out, or null when it can. A
 * cancelled appointment gets only its cancellation text, and a cancellation
 * text needs a cancelled appointment. A text needs a contact who agreed to
 * texts, isn't blocked, and a sender that can reach them (resolveSmsSender).
 * A video link text needs a link.
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
  videoUrl?: string | null;
}): "appointment_status" | "no_video_link" | "channel" | "sms_consent" | "sms_blocked" | "sms_unreachable" | "no_email" | null {
  const cancelled = row.appointmentStatus === "canceled";
  if (cancelled !== (row.kind === CANCELLATION_CONFIRMATION)) return "appointment_status";
  if (row.kind.startsWith(VIDEO_LINK_UPDATE) && !row.videoUrl) return "no_video_link";
  if (row.channel !== "sms" && row.channel !== "email") return "channel";
  if (row.channel === "sms") {
    if (row.smsConsentStatus !== "subscribed") return "sms_consent";
    if (row.operatorBlockedAt !== null) return "sms_blocked";
    if (!canTextNumber(row.senderPhone, row.contactPhone)) return "sms_unreachable";
  }
  if (row.channel === "email" && !row.contactEmail) return "no_email";
  return null;
}

/**
 * The customer's own email address, or null when there's none. A booking provider only ever sees a stand-in
 * address, which goes nowhere: `booking+<appointment id>@` the domain its integration sets.
 */
export function customerEmailAddress(email: string | null, env: Record<string, string | undefined> = process.env): string | null {
  const address = email?.trim().toLowerCase();
  if (!address || address.startsWith("booking+")) return null;
  const standInDomains = [env.CALCOM_PLACEHOLDER_EMAIL_DOMAIN, env.CALENDLY_PLACEHOLDER_EMAIL_DOMAIN].flatMap((domain) => domain?.trim() ? [domain.trim().toLowerCase()] : []);
  return standInDomains.some((domain) => address.endsWith(`@${domain}`)) ? null : email!.trim();
}

/** Tells the team which link to pass on, once per appointment and link, when LobbyStack can't reach the customer. */
async function queueVideoLinkAlertInTransaction(tx: DatabaseTransaction, input: { businessId: string; appointmentId: string; videoUrl: string; contactName: string | null; contactPhone: string | null; serviceName: string; startsAt: Date; timezone: string }): Promise<void> {
  const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: input.timezone }).format(input.startsAt);
  const customer = [input.contactName, input.contactPhone].filter(Boolean).join(", ") || "A customer";
  const link = createHash("sha256").update(input.videoUrl).digest("hex").slice(0, 16);
  await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "calendarSync", eventKey: `videoLink:appointment:${input.appointmentId}:${link}`, subject: "Send a customer their video link", body: `We couldn't reach ${customer} about their ${input.serviceName} appointment on ${when}. Send them this video link: ${input.videoUrl}` });
}

/** Alerts the team when a text or email that carried a video link was given up on. Other notifications pass through. */
export async function alertVideoLinkNotSent(context: DomainContext, input: { businessId: string; notificationId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({ kind: notifications.kind, appointmentId: appointments.id, status: appointments.status, videoUrl: appointments.videoUrl, contactName: contacts.name, contactPhone: contacts.phone, serviceName: services.name, startsAt: appointments.startsAt, timezone: appointments.timezone })
      .from(notifications)
      .innerJoin(appointments, and(eq(appointments.id, notifications.relatedId), eq(appointments.businessId, notifications.businessId)))
      .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, notifications.businessId)))
      .innerJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, notifications.businessId)))
      .where(and(eq(notifications.id, input.notificationId), eq(notifications.businessId, input.businessId))).limit(1);
    if (row?.videoUrl && row.status === "confirmed") await queueVideoLinkAlertInTransaction(tx, { ...row, businessId: input.businessId, videoUrl: row.videoUrl });
  });
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
      videoUrl: appointments.videoUrl,
      businessName: businesses.name,
      defaultLocale: businesses.defaultLocale,
      serviceName: services.name,
      contactId: contacts.id,
      contactName: contacts.name,
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
    const skipReason = appointmentNotificationSkipReason({ ...row, senderPhone });
    let channel = row.channel;
    let email = row.channel === "email" ? row.contactEmail : null;
    // A video link is what the customer needs to attend, so a customer who can't get texts gets it by email,
    // or from the team. Other appointments' texts stay texts. A contact the team blocked hears nothing.
    if (row.relatedId && row.videoUrl && (skipReason === "sms_consent" || skipReason === "sms_unreachable")) {
      email = customerEmailAddress(row.contactEmail);
      if (!email) {
        await queueVideoLinkAlertInTransaction(tx, { ...row, businessId: input.businessId, appointmentId: row.relatedId, videoUrl: row.videoUrl });
        return { kind: "skipped", notificationId: row.notificationId };
      }
      channel = "email";
      await tx.update(notifications).set({ channel, updatedAt: new Date() }).where(and(eq(notifications.id, row.notificationId), eq(notifications.businessId, input.businessId)));
    } else if (skipReason !== null) {
      return { kind: "skipped", notificationId: row.notificationId };
    }
    // The channel check repeats one in the skip reason so TypeScript narrows it.
    if (!row.relatedId || (channel !== "sms" && channel !== "email")) {
      return { kind: "skipped", notificationId: row.notificationId };
    }
    const message = buildAppointmentNotification({
      kind: row.kind,
      channel,
      locale: localeFor(row.contactLocale ?? row.defaultLocale),
      businessName: row.businessName,
      serviceName: row.serviceName,
      startsAt: row.startsAt,
      timezone: row.timezone,
      videoUrl: row.videoUrl,
    });
    const optIn = channel === "sms" ? await smsOptInConfirmationInTransaction(tx, { businessId: input.businessId, contactId: row.contactId }) : undefined;
    return {
      kind: "ready",
      delivery: {
        notificationId: row.notificationId,
        businessId: input.businessId,
        channel,
        kind: row.kind,
        relatedId: row.relatedId,
        to: channel === "sms" ? row.contactPhone! : email!,
        ...(channel === "sms" && senderPhone ? { from: senderPhone } : {}),
        subject: message.subject,
        body: message.body,
        ...(optIn ? { optIn } : {}),
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

export async function updateNotificationDeliveryStatus(context: DomainContext, input: { businessId: string; notificationId: string; providerMessageId: string; providerStatus: string; carrier?: CarrierId; providerPrice?: number; providerPriceUnit?: string; providerCostUsd?: number; providerNumSegments?: number }): Promise<boolean> {
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
    if (current.channel === "sms" && isTerminalTwilioMessageStatus(input.providerStatus) && (input.providerCostUsd === undefined || input.providerNumSegments === undefined)) await enqueueOutbox(tx, { topic: "sms.syncPrice", businessId: input.businessId, aggregateType: "notification", aggregateId: input.notificationId, dedupeKey: `notification:${input.notificationId}:price:${input.providerStatus.trim().toLowerCase()}`, payload: { notificationId: input.notificationId, providerMessageId: input.providerMessageId, providerStatus: input.providerStatus, carrier: input.carrier ?? "twilio" } });
    if (input.providerCostUsd !== undefined) await recordUnitEconomicsEventInTransaction(tx, { businessId: input.businessId, eventKey: `notification_provider:${input.notificationId}`, eventKind: "notification_provider", channel: current.channel, costUsd: input.providerCostUsd, occurredAt: current.createdAt, ...(input.providerNumSegments !== undefined ? { quantity: input.providerNumSegments, quantityUnit: "segment" } : {}), provider: input.carrier ?? "twilio", notificationId: input.notificationId });
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

type NotificationPreferencesChange = { userId: string; businessId: string; emailEnabled: boolean; smsEnabled: boolean; eventPreferences: OperatorNotificationEventPreferences; dailySummaryEnabled?: boolean; dailySummarySendTime?: string | null; smsConsent?: boolean };

export async function setNotificationPreferences(context: DomainContext, input: NotificationPreferencesChange): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    await saveNotificationPreferencesInTransaction(tx, input);
  });
}

function assertDailySummary(input: { dailySummaryEnabled?: boolean; dailySummarySendTime?: string | null }): void {
  assertDailySummaryTime(input.dailySummarySendTime);
  if (input.dailySummaryEnabled && !input.dailySummarySendTime) {
    throw new Error("A daily summary send time is required when daily summaries are enabled.");
  }
}

/**
 * Saves one person's alerts for a business, in a transaction acting as them.
 * Texts need their consent, given with this change or before it.
 */
export async function saveNotificationPreferencesInTransaction(tx: DatabaseTransaction, input: NotificationPreferencesChange): Promise<void> {
  assertDailySummary(input);
  const currentUser = (await tx.select({ phone: users.phone }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  const previous = (await tx.select({ smsEnabled: operatorNotificationPreferences.smsEnabled, eventPreferences: operatorNotificationPreferences.eventPreferences, smsConsentGrantedAt: operatorNotificationPreferences.smsConsentGrantedAt, smsConsentRevokedAt: operatorNotificationPreferences.smsConsentRevokedAt, smsConsentDisclosureVersion: operatorNotificationPreferences.smsConsentDisclosureVersion, smsConsentPhone: operatorNotificationPreferences.smsConsentPhone }).from(operatorNotificationPreferences).where(and(eq(operatorNotificationPreferences.businessId, input.businessId), eq(operatorNotificationPreferences.userId, input.userId))).limit(1))[0];
  const existingConsent = hasOperatorSmsConsent(previous, currentUser?.phone);
  // Turning a text on needs consent; keeping one the person saved before doesn't, since none is sent without it.
  const previousEvents = { ...defaultOperatorNotificationEventPreferences(), ...previous?.eventPreferences } as OperatorNotificationEventPreferences;
  const turnsTextOn = (input.smsEnabled && !previous?.smsEnabled) || operatorNotificationEventKeys.some((key) => input.eventPreferences[key]?.sms && !previousEvents[key]?.sms);
  if (turnsTextOn && input.smsConsent === undefined && !existingConsent) throw new Error("SMS notification consent is required before enabling SMS alerts.");
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
}

export const operatorNotificationEventKeys = ["callCompleted", "voiceMessage", "pausedSms", "smsFailed", "calendarSync", "transferFailed", "aiReplyFailed", "widgetChat", "liveChatRequest", "webhookDisabled"] as const;
export type OperatorNotificationEventKey = (typeof operatorNotificationEventKeys)[number];
export type OperatorNotificationEventPreferences = Record<OperatorNotificationEventKey, { email: boolean; sms: boolean }>;

export function defaultOperatorNotificationEventPreferences(): OperatorNotificationEventPreferences {
  return Object.fromEntries(operatorNotificationEventKeys.map((key) => [key, { email: true, sms: false }])) as OperatorNotificationEventPreferences;
}

/** Event preferences from a request body: an event without both switches keeps its default. */
export function normalizeOperatorNotificationEventPreferences(value: unknown): OperatorNotificationEventPreferences {
  const defaults = defaultOperatorNotificationEventPreferences();
  const raw = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return Object.fromEntries(operatorNotificationEventKeys.map((key) => {
    const event = raw[key] as { email?: unknown; sms?: unknown } | null | undefined;
    return [key, typeof event === "object" && event !== null && typeof event.email === "boolean" && typeof event.sms === "boolean" ? { email: event.email, sms: event.sms } : defaults[key]];
  })) as OperatorNotificationEventPreferences;
}

const dailySummaryTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const dailySummaryLabels: Record<OperatorNotificationEventKey, string> = {
  callCompleted: "Calls answered",
  voiceMessage: "Voice messages",
  pausedSms: "Paused SMS",
  smsFailed: "Failed SMS",
  calendarSync: "Calendar sync issues",
  transferFailed: "Transfer failures",
  aiReplyFailed: "AI reply failures",
  widgetChat: "Website chat messages",
  liveChatRequest: "Website visitors asking for a person",
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

export type NotificationPreferences = { emailEnabled: boolean; smsEnabled: boolean; smsConsent: boolean; eventPreferences: OperatorNotificationEventPreferences; dailySummaryEnabled: boolean; dailySummarySendTime: string | null; canUseSms: boolean; smsUnavailableReason: "phone_unverified" | "sender_missing" | null };

export async function getNotificationPreferences(context: DomainContext, input: { userId: string; businessId: string; phoneVerified?: boolean }): Promise<NotificationPreferences> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await loadNotificationPreferencesInTransaction(tx, input);
  });
}

/**
 * What one person saved for a business, texts included even while they can't
 * be sent, with defaults for anything never saved. Locks the saved row, so a
 * save from elsewhere waits for this transaction.
 */
export async function loadSavedNotificationPreferencesInTransaction(tx: DatabaseTransaction, input: { userId: string; businessId: string }): Promise<{ emailEnabled: boolean; smsEnabled: boolean; eventPreferences: OperatorNotificationEventPreferences; dailySummaryEnabled: boolean; dailySummarySendTime: string | null }> {
  const row = (await tx.select({ emailEnabled: operatorNotificationPreferences.emailEnabled, smsEnabled: operatorNotificationPreferences.smsEnabled, eventPreferences: operatorNotificationPreferences.eventPreferences, dailySummaryEnabled: operatorNotificationPreferences.dailySummaryEnabled, dailySummarySendTime: operatorNotificationPreferences.dailySummarySendTime }).from(operatorNotificationPreferences).where(and(eq(operatorNotificationPreferences.businessId, input.businessId), eq(operatorNotificationPreferences.userId, input.userId))).limit(1).for("update"))[0];
  return { emailEnabled: row?.emailEnabled ?? true, smsEnabled: row?.smsEnabled ?? false, eventPreferences: normalizeOperatorNotificationEventPreferences(row?.eventPreferences), dailySummaryEnabled: row?.dailySummaryEnabled ?? false, dailySummarySendTime: row?.dailySummarySendTime ?? null };
}

/** One person's alerts for a business, as they apply: texts read as off until they can be sent. */
export async function loadNotificationPreferencesInTransaction(tx: DatabaseTransaction, input: { userId: string; businessId: string; phoneVerified?: boolean }): Promise<NotificationPreferences> {
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
    // Any run from the send time until midnight sends, so a late tick, a restart or a DST jump can't skip a day.
    const preferences = (recipientResult.rows as SummaryRecipient[]).filter((preference) => preference.dailySummaryEnabled && preference.dailySummarySendTime !== null && preference.dailySummarySendTime <= sendTime);
    if (preferences.length === 0) return { eligible: 0, queued: 0 };
    const sender = await resolveSmsSender(tx, input.businessId);
    let queued = 0;
    for (const preference of preferences) {
      const eventKey = `dailyDigest:${input.businessId}:${localDate}:${preference.userId}`;
      // The per-day event key already blocks a second digest; this skips rebuilding it on every later tick.
      if ((await tx.select({ id: operatorNotificationDeliveries.id }).from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.eventKey, eventKey), eq(operatorNotificationDeliveries.userId, preference.userId))).limit(1)).length > 0) continue;
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

export async function queueOperatorAlert(context: DomainContext, input: OperatorAlertInput): Promise<string[]> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await queueOperatorAlertInTransaction(tx, input));
}

// The alerts no webhook event stands in for, about something that went wrong
// or someone waiting. A partner running a business with no owner can't hear
// of these any other way.
const partnerFallbackAlerts: ReadonlySet<OperatorNotificationEventKey> = new Set<OperatorNotificationEventKey>(["pausedSms", "transferFailed", "smsFailed", "calendarSync", "liveChatRequest", "aiReplyFailed", "webhookDisabled"]);

/**
 * Who gets an alert in place of a business's owner: the owners and admins of
 * its partner, while the business has no owner. A demo nobody claimed has no
 * owner either, and nobody takes its alerts.
 */
async function partnerFallbackRecipients(tx: DatabaseTransaction, businessId: string): Promise<Array<{ userId: string; email: string }>> {
  const [business] = await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business?.partnerId) return [];
  const [owner] = await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.role, "business_owner"), eq(businessMemberships.status, "active"))).limit(1);
  if (owner) return [];
  const [demo] = await tx.select({ id: prospectDemos.id }).from(prospectDemos).where(and(eq(prospectDemos.businessId, businessId), ne(prospectDemos.status, "claimed"))).limit(1);
  if (demo) return [];
  const periodKey = new Date().toISOString().slice(0, 7);
  return (await tx.execute<{ userId: string; email: string }>(sql`select user_id as "userId", email from app.partner_pool_alert_recipients(${business.partnerId}::uuid, ${periodKey})`)).rows;
}

export type OperatorAlertInput = {
  businessId: string;
  eventKind: OperatorNotificationEventKey;
  eventKey: string;
  subject: string;
  body: string;
  /**
   * What the email lays out beyond the subject and body. Each recipient's
   * copy gets their dashboard language as `locale`, so the email can be
   * written in it; texts keep the subject and body.
   */
  details?: Record<string, string>;
};

export async function queueOperatorAlertInTransaction(tx: DatabaseTransaction, input: OperatorAlertInput): Promise<string[]> {
  type Recipient = { userId: string; email: string; phone: string | null; preferences: OperatorNotificationEventPreferences | null; emailEnabled: boolean; smsEnabled: boolean; smsConsentGrantedAt: Date | null; smsConsentRevokedAt: Date | null; smsConsentDisclosureVersion: string | null; smsConsentPhone: string | null; locale: string | null };
  const result = await tx.execute(sql`SELECT user_id AS "userId", email, phone, event_preferences AS preferences, email_enabled AS "emailEnabled", sms_enabled AS "smsEnabled", sms_consent_granted_at AS "smsConsentGrantedAt", sms_consent_revoked_at AS "smsConsentRevokedAt", sms_consent_disclosure_version AS "smsConsentDisclosureVersion", sms_consent_phone AS "smsConsentPhone", preferred_locale AS locale FROM app.resolve_operator_alert_recipients(${input.businessId}::uuid)`);
  const recipients = result.rows as Recipient[];
  const sender = await resolveSmsSender(tx, input.businessId);
  const deliveryIds: string[] = [];
  for (const recipient of recipients) {
    const event = { ...defaultOperatorNotificationEventPreferences()[input.eventKind], ...(recipient.preferences?.[input.eventKind] ?? {}) };
      const smsConsent = hasOperatorSmsConsent(recipient, recipient.phone);
      const channels = [recipient.emailEnabled !== false && event.email ? { channel: "email", destination: recipient.email } : null, recipient.smsEnabled === true && smsConsent && event.sms && recipient.phone && sender ? { channel: "sms", destination: recipient.phone, sender } : null].filter((value): value is { channel: string; destination: string; sender?: string } => Boolean(value));
    for (const channel of channels) {
      const details = input.details && channel.channel === "email" ? { ...input.details, locale: localeFor(recipient.locale) } : undefined;
      const [delivery] = await tx.insert(operatorNotificationDeliveries).values({ businessId: input.businessId, userId: recipient.userId, eventKind: input.eventKind, eventKey: input.eventKey, channel: channel.channel, destination: channel.destination, ...(channel.sender ? { sender: channel.sender } : {}), subject: input.subject, body: input.body, ...(details ? { details } : {}), contentExpiresAt: new Date(Date.now() + 30 * 86_400_000) }).onConflictDoNothing().returning({ id: operatorNotificationDeliveries.id });
      if (!delivery) continue;
      deliveryIds.push(delivery.id);
      await enqueueOutbox(tx, { topic: "notification.dispatch", businessId: input.businessId, aggregateType: "operator_notification_delivery", aggregateId: delivery.id, dedupeKey: `operator-notification:${delivery.id}:dispatch`, payload: { operatorDeliveryId: delivery.id } });
    }
  }
  if (!partnerFallbackAlerts.has(input.eventKind)) return deliveryIds;
  // By email only: only the business's own team verifies a phone for its alerts.
  for (const person of await partnerFallbackRecipients(tx, input.businessId)) {
    const [delivery] = await tx.insert(operatorNotificationDeliveries).values({ businessId: input.businessId, userId: person.userId, eventKind: input.eventKind, eventKey: input.eventKey, channel: "email", destination: person.email, subject: input.subject, body: input.body, contentExpiresAt: new Date(Date.now() + 30 * 86_400_000) }).onConflictDoNothing().returning({ id: operatorNotificationDeliveries.id });
    if (!delivery) continue;
    deliveryIds.push(delivery.id);
    await enqueueOutbox(tx, { topic: "notification.dispatch", businessId: input.businessId, aggregateType: "operator_notification_delivery", aggregateId: delivery.id, dedupeKey: `operator-notification:${delivery.id}:dispatch`, payload: { operatorDeliveryId: delivery.id } });
  }
  return deliveryIds;
}

export async function claimOperatorNotificationDelivery(context: DomainContext, input: { businessId: string; deliveryId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => (await tx.update(operatorNotificationDeliveries).set({ status: "processing", updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), or(eq(operatorNotificationDeliveries.status, "pending"), and(eq(operatorNotificationDeliveries.status, "processing"), lt(operatorNotificationDeliveries.updatedAt, new Date(Date.now() - notificationLeaseMs)))))).returning({ id: operatorNotificationDeliveries.id })).length > 0);
}

/** When a send holds this delivery, the time its lease ends and another run may claim it. */
export async function operatorNotificationLeaseEndsAt(context: DomainContext, input: { businessId: string; deliveryId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ updatedAt: operatorNotificationDeliveries.updatedAt }).from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))).limit(1))[0];
    return row ? new Date(row.updatedAt.getTime() + notificationLeaseMs) : null;
  });
}

export async function loadOperatorNotificationDelivery(context: DomainContext, input: { businessId: string; deliveryId: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const delivery = (await tx.select({ id: operatorNotificationDeliveries.id, businessId: operatorNotificationDeliveries.businessId, userId: operatorNotificationDeliveries.userId, eventKind: operatorNotificationDeliveries.eventKind, eventKey: operatorNotificationDeliveries.eventKey, channel: operatorNotificationDeliveries.channel, status: operatorNotificationDeliveries.status, destination: operatorNotificationDeliveries.destination, sender: operatorNotificationDeliveries.sender, subject: operatorNotificationDeliveries.subject, body: operatorNotificationDeliveries.body, details: operatorNotificationDeliveries.details, providerMessageId: operatorNotificationDeliveries.providerMessageId, scheduledFor: operatorNotificationDeliveries.scheduledFor, sentAt: operatorNotificationDeliveries.sentAt, contentExpiresAt: operatorNotificationDeliveries.contentExpiresAt, lastError: operatorNotificationDeliveries.lastError, createdAt: operatorNotificationDeliveries.createdAt, updatedAt: operatorNotificationDeliveries.updatedAt })
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

export async function updateOperatorNotificationDeliveryStatus(context: DomainContext, input: { businessId: string; deliveryId: string; providerMessageId: string; providerStatus: string; carrier?: CarrierId; providerPrice?: number; providerPriceUnit?: string; providerCostUsd?: number; providerNumSegments?: number }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ status: operatorNotificationDeliveries.status, providerMessageId: operatorNotificationDeliveries.providerMessageId, channel: operatorNotificationDeliveries.channel, createdAt: operatorNotificationDeliveries.createdAt }).from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId))).limit(1))[0];
    if (!current) return false;
    const nextStatus = mapTwilioStatusToNotificationStatus(input.providerStatus);
    const applyStatus = shouldApplyNotificationStatusTransition(current.status, nextStatus);
    const hasProviderPricing = input.providerPrice !== undefined || input.providerPriceUnit !== undefined || input.providerCostUsd !== undefined || input.providerNumSegments !== undefined;
    if (!applyStatus && !hasProviderPricing) return false;
    await tx.update(operatorNotificationDeliveries).set({ ...(current.providerMessageId ? {} : { providerMessageId: input.providerMessageId }), providerPrice: input.providerPrice, providerPriceUnit: input.providerPriceUnit, providerCostUsd: input.providerCostUsd, providerNumSegments: input.providerNumSegments, ...(applyStatus ? { status: nextStatus, ...(nextStatus === "delivered" ? { sentAt: new Date() } : {}), lastError: nextStatus === "failed" ? "Carrier delivery failed." : null } : {}), updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId)));
    if (current.channel === "sms" && input.providerNumSegments !== undefined) {
      const usageEventId = await correctUsageInTransaction(tx, { businessId: input.businessId, sourceKey: `alert_sms:operator_notification:${input.deliveryId}`, usageKind: "alert_sms_segments", quantity: input.providerNumSegments, recordedAt: new Date() });
      await enqueueUsageSyncInTransaction(tx, { businessId: input.businessId, usageEventId });
    }
    if (current.channel === "sms" && isTerminalTwilioMessageStatus(input.providerStatus) && (input.providerCostUsd === undefined || input.providerNumSegments === undefined)) await enqueueOutbox(tx, { topic: "sms.syncPrice", businessId: input.businessId, aggregateType: "operator_notification_delivery", aggregateId: input.deliveryId, dedupeKey: `operator-notification:${input.deliveryId}:price:${input.providerStatus.trim().toLowerCase()}`, payload: { operatorDeliveryId: input.deliveryId, providerMessageId: input.providerMessageId, providerStatus: input.providerStatus, carrier: input.carrier ?? "twilio" } });
    if (input.providerCostUsd !== undefined) await recordUnitEconomicsEventInTransaction(tx, { businessId: input.businessId, eventKey: `operator_notification_provider:${input.deliveryId}`, eventKind: "operator_notification_provider", channel: current.channel, costUsd: input.providerCostUsd, occurredAt: current.createdAt, ...(input.providerNumSegments !== undefined ? { quantity: input.providerNumSegments, quantityUnit: "segment" } : {}), provider: input.carrier ?? "twilio", operatorNotificationDeliveryId: input.deliveryId });
    return true;
  });
}

export async function releaseOperatorNotificationDelivery(context: DomainContext, input: { businessId: string; deliveryId: string; error?: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => { await tx.update(operatorNotificationDeliveries).set({ status: "pending", lastError: input.error ?? null, updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.id, input.deliveryId), eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.status, "processing"))); });
}
