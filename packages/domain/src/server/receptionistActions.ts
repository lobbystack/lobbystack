import { and, asc, eq, gte, ilike, lt, ne, or } from "drizzle-orm";
import { DateTime } from "luxon";

import { appointments, contacts, receptionistProfiles, services, withBusinessTransaction } from "@lobbystack/db";
import { normalizeAppointmentChangePolicy, type HoursWindow } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { BookingUnavailableError, type UnavailableReason } from "../availability";
import { createAppointmentChangeVerification, verifyAppointmentChangeOtp } from "./appointmentChanges";
import { personNamesMatch, serviceNamesMatch } from "./appointmentFacts";
import { bookAppointment, cancelAppointmentForCaller, checkAvailability, findAvailability, rescheduleAppointmentForCaller } from "./booking";
import { recordCallSchedulingProgress } from "./callOutcome";
import { receptionistSmsConsentAnswer, type SmsConsentAnswer } from "./contactSmsConsent";
import type { DomainContext } from "./context";
import { appendMessage, getOrCreateConversation } from "./conversations";
import { queueOperatorAlert } from "./notifications";
import { recordProductEventBestEffort } from "./productEvents";
import { CANCELLATION_REQUEST, createVoiceFollowUpTask, type FollowUpRequest } from "./voice";

// Actions the receptionist agent takes on a business's behalf, whatever the
// channel. Each one opens its own tenant-scoped transaction.

export type ReceptionistChannel = "voice" | "web_voice" | "web_chat" | "sms";

async function resolveActiveService(context: DomainContext, businessId: string, serviceName: string) {
  return await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => {
    const normalized = serviceName.trim().toLowerCase();
    return (await tx.select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true), or(eq(services.slug, normalized), ilike(services.name, serviceName.trim())))).limit(1))[0];
  });
}

/** The reason a refused booking or reschedule wasn't bookable, when it was refused for that. */
export function unavailableReasonOf(error: unknown): UnavailableReason | undefined {
  if (error instanceof BookingUnavailableError) return error.reason;
  const message = error instanceof Error ? error.message : "";
  return message.includes("no longer available") ? "taken" : undefined;
}

/**
 * Plain facts for the agent: why a time can't be booked. The agent tools add
 * what to do next.
 */
export const UNAVAILABLE_REASON_TEXT: Record<UnavailableReason, string> = {
  no_hours: "The business hasn't set its opening hours, so no time can be booked.",
  closed_day: "The business is closed that day.",
  outside_hours: "That time is outside the business's opening hours.",
  closure: "The business is closed then for a planned closure.",
  no_staff: "No staff member offers this service.",
  calendar_not_synced: "The business's calendar hasn't synced recently, so the time can't be confirmed.",
  taken: "That time is no longer available.",
};

export function bookingFailureReason(error: unknown): string {
  // Telemetry keeps its earlier names for taken and no-staff refusals.
  const unavailable = error instanceof BookingUnavailableError ? error.reason : undefined;
  if (unavailable) return unavailable === "taken" ? "slot_unavailable" : unavailable === "no_staff" ? "no_staff_available" : unavailable;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Service is not available")) return "service_unavailable";
  if (message.includes("No staff member is available")) return "no_staff_available";
  if (message.includes("no longer available")) return "slot_unavailable";
  if (message.includes("required")) return "invalid_request";
  if (message.includes("Contact could not be created")) return "contact_create_failed";
  if (message.includes("Appointment could not be created")) return "appointment_create_failed";
  if (message.includes("Booking confirmation notification")) return "notification_create_failed";
  return "unknown";
}

const OPENING_STEP_MINUTES = 30;
// Availability checks run this many at a time, so a busy day is scanned in
// full without one slow query per start time.
const OPENING_CHECK_BATCH = 6;

// Start times to try on a local date, inside business hours, nearest to the
// caller's preferred time first.
export function candidateStartTimes(input: { date: string; timezone: string; hours: HoursWindow[]; durationMinutes: number; preferredMinutes?: number; now?: Date }): string[] {
  const day = DateTime.fromISO(`${input.date}T00:00:00`, { zone: input.timezone });
  if (!day.isValid) return [];
  const weekday = day.weekday % 7;
  const now = input.now ?? new Date();
  const minutes: number[] = [];
  for (const window of input.hours.filter((item) => item.dayOfWeek === weekday)) {
    for (let start = window.openMinutes; start + input.durationMinutes <= window.closeMinutes; start += OPENING_STEP_MINUTES) minutes.push(start);
  }
  const preferred = input.preferredMinutes;
  return minutes
    .sort((left, right) => preferred === undefined ? left - right : Math.abs(left - preferred) - Math.abs(right - preferred) || left - right)
    // Set the wall-clock time; adding minutes to midnight drifts an hour on DST days.
    .map((value) => day.set({ hour: Math.floor(value / 60), minute: value % 60 }))
    .filter((start) => start.toJSDate() > now)
    .map((start) => start.toUTC().toISO()!);
}

export async function findOpenings(
  context: DomainContext,
  input: { businessId: string; serviceName: string; date: string; timezone: string; hours: HoursWindow[]; preferredHour24?: number; preferredMinute?: number; limit?: number; callId?: string },
) {
  const service = await resolveActiveService(context, input.businessId, input.serviceName);
  if (!service) return { ok: false as const, reason: "Service is not available." };
  const candidates = candidateStartTimes({
    date: input.date,
    timezone: input.timezone,
    hours: input.hours,
    durationMinutes: service.durationMinutes,
    ...(input.preferredHour24 !== undefined ? { preferredMinutes: input.preferredHour24 * 60 + (input.preferredMinute ?? 0) } : {}),
  });
  const limit = input.limit ?? 3;
  const openings: string[] = [];
  // Scan the whole day, nearest first, and stop once there are enough openings.
  for (let index = 0; index < candidates.length && openings.length < limit; index += OPENING_CHECK_BATCH) {
    const batch = candidates.slice(index, index + OPENING_CHECK_BATCH);
    const available = await Promise.all(batch.map(async (startsAt) => (await findAvailability(context, { businessId: input.businessId, serviceId: service.id, startsAt, timezone: input.timezone })).length > 0));
    for (const [position, startsAt] of batch.entries()) if (available[position] && openings.length < limit) openings.push(startsAt);
  }
  const reason = openings.length ? undefined : await noOpeningsReason(context, { businessId: input.businessId, serviceId: service.id, date: input.date, timezone: input.timezone, hours: input.hours, firstCandidate: candidates[0] });
  if (input.callId) await recordCallSchedulingProgress(context, { businessId: input.businessId, callId: input.callId, serviceName: service.name });
  return {
    ok: true as const,
    serviceName: service.name,
    date: input.date,
    timezone: input.timezone,
    openings: openings.sort().map((startsAt) => ({ startsAt, displayTime: DateTime.fromISO(startsAt).setZone(input.timezone).toFormat("cccc LLL d, h:mm a") })),
    ...(reason ? { reason } : {}),
  };
}

/** Why a day has no openings. "no_times_left" means every start time that day has passed. */
export type NoOpeningsReason = UnavailableReason | "no_times_left";

async function noOpeningsReason(context: DomainContext, input: { businessId: string; serviceId: string; date: string; timezone: string; hours: HoursWindow[]; firstCandidate: string | undefined }): Promise<NoOpeningsReason> {
  if (!input.hours.length) return "no_hours";
  const day = DateTime.fromISO(`${input.date}T00:00:00`, { zone: input.timezone });
  if (day.isValid && !input.hours.some((window) => window.dayOfWeek === day.weekday % 7)) return "closed_day";
  if (!input.firstCandidate) return "no_times_left";
  // The time nearest the caller's preference explains the day. Later times can
  // fail for another reason, such as a closure, so a taken first time doesn't
  // mean the whole day is booked.
  return (await checkAvailability(context, { businessId: input.businessId, serviceId: input.serviceId, startsAt: input.firstCandidate, timezone: input.timezone })).reason ?? "taken";
}

export async function checkOpening(
  context: DomainContext,
  input: { businessId: string; serviceName: string; startsAt: string; timezone: string; callId?: string },
) {
  const service = await resolveActiveService(context, input.businessId, input.serviceName);
  if (!service) return { ok: false as const, reason: "Service is not available." };
  const { slots, reason } = await checkAvailability(context, { businessId: input.businessId, serviceId: service.id, startsAt: input.startsAt, timezone: input.timezone });
  if (input.callId) await recordCallSchedulingProgress(context, { businessId: input.businessId, callId: input.callId, serviceName: service.name, startsAt: input.startsAt });
  return slots.length
    ? { ok: true as const, serviceName: service.name, available: true as const }
    : { ok: true as const, serviceName: service.name, available: false as const, reason: reason ?? "taken" };
}

/**
 * The caller's confirmed booking for this service and start time, if they
 * already have it. A booking request repeated after a lost or superseded
 * answer then returns that booking instead of failing as taken.
 */
export async function findCallerBooking(context: DomainContext, input: { businessId: string; serviceName: string; startsAt: string; contactPhone: string }) {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return undefined;
  // One query, matching the service the way resolveActiveService does, so a
  // booking doesn't pay an extra round trip for the lookup.
  const normalized = input.serviceName.trim().toLowerCase();
  const existing = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    return (await tx.select({ id: appointments.id, serviceName: services.name }).from(appointments)
      .innerJoin(contacts, eq(appointments.contactId, contacts.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(and(
        eq(appointments.businessId, input.businessId),
        eq(services.active, true),
        or(eq(services.slug, normalized), ilike(services.name, input.serviceName.trim())),
        eq(appointments.startsAt, startsAt),
        eq(appointments.status, "confirmed"),
        eq(contacts.phone, input.contactPhone),
      )).limit(1))[0];
  });
  return existing ? { ok: true as const, appointmentId: existing.id, serviceName: existing.serviceName, startsAt: input.startsAt, alreadyBooked: true as const } : undefined;
}

export async function bookForCaller(
  context: DomainContext,
  input: { businessId: string; serviceName: string; startsAt: string; timezone: string; contactPhone: string; contactName?: string; smsConsent?: SmsConsentAnswer; channel: ReceptionistChannel; callId?: string },
) {
  const distinctId = getPostHogDistinctIdForBusinessSystem(input.businessId);
  const service = await resolveActiveService(context, input.businessId, input.serviceName);
  if (!service) {
    await recordProductEventBestEffort(context, { name: "appointment.booking_failed", businessId: input.businessId, distinctId, properties: { reason: "service_unavailable", requestedServiceName: input.serviceName, channel: input.channel, sourceChannel: input.channel } });
    return { ok: false as const, reason: "Service is not available." };
  }
  const smsConsent = receptionistSmsConsentAnswer(input.channel, input.smsConsent);
  try {
    const appointment = await bookAppointment(context, {
      businessId: input.businessId,
      serviceId: service.id,
      startsAt: input.startsAt,
      timezone: input.timezone,
      contactPhone: input.contactPhone,
      sourceChannel: input.channel,
      ...(input.callId ? { callId: input.callId } : {}),
      ...(smsConsent ? { smsConsent } : {}),
      ...(input.contactName ? { contactName: input.contactName } : {}),
    });
    await recordProductEventBestEffort(context, { name: "appointment.booked", businessId: input.businessId, distinctId, properties: { appointmentId: appointment.appointmentId, channel: input.channel, serviceId: service.id, sourceChannel: input.channel } });
    return { ok: true as const, appointmentId: appointment.appointmentId, serviceName: service.name, startsAt: input.startsAt };
  } catch (error) {
    const reason = bookingFailureReason(error);
    await recordProductEventBestEffort(context, { name: "appointment.booking_failed", businessId: input.businessId, distinctId, properties: { reason, serviceId: service.id, requestedServiceName: input.serviceName, channel: input.channel, sourceChannel: input.channel } });
    const unavailable = unavailableReasonOf(error);
    return unavailable
      ? { ok: false as const, reason: UNAVAILABLE_REASON_TEXT[unavailable], unavailableReason: unavailable }
      : { ok: false as const, reason: "The booking could not be completed." };
  }
}

export async function lookupCallerAppointments(context: DomainContext, input: { businessId: string; callerPhone: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [rows, profile] = await Promise.all([
      tx.select({ id: appointments.id }).from(appointments).innerJoin(contacts, eq(appointments.contactId, contacts.id)).where(and(eq(appointments.businessId, input.businessId), eq(contacts.phone, input.callerPhone), eq(appointments.status, "confirmed"))).orderBy(asc(appointments.startsAt)),
      tx.select({ appointmentChangePolicy: receptionistProfiles.appointmentChangePolicy }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1),
    ]);
    const policy = normalizeAppointmentChangePolicy(profile[0]?.appointmentChangePolicy);
    // Only say whether the phone matched; never read appointment details out
    // before the caller is verified.
    return { ok: true as const, policy: { ...policy, enabled: policy.enabled && rows.length > 0 }, phoneMatched: rows.length > 0, appointmentCount: rows.length };
  });
}

/**
 * Verifies the appointment a caller wants to change. Once a cancellation is
 * verified, it says whether the caller gets texts (smsConsentOnFile), so the
 * agent knows whether to ask about a cancellation text. Before that, it
 * reveals nothing about them.
 */
export async function verifyCallerForChange(
  context: DomainContext,
  input: { businessId: string; callerPhone: string; action: "cancel" | "reschedule"; appointmentId?: string; appointmentStartsAt?: string; serviceName?: string },
) {
  const verification = await createAppointmentChangeVerification(context, input);
  if (!verification) return { ok: false as const, verified: false, reason: "The appointment could not be verified." };
  const verified = verification.status === "otp_verified" || verification.status === "facts_verified";
  return { ok: true as const, verified, requiresOtp: !verified, verificationId: verification.verificationId, appointmentId: verification.appointmentId, status: verification.status, ...(verified && input.action === "cancel" ? { smsConsentOnFile: verification.smsConsent } : {}) };
}

/** Checks the one-time code the caller reads back. Once it matches for a cancellation, it says whether the caller gets texts, as verifyCallerForChange does. */
export async function verifyCallerChangeCode(context: DomainContext, input: { businessId: string; verificationId: string; code: string }) {
  const { smsConsent, ...result } = await verifyAppointmentChangeOtp(context, input);
  return result.ok && smsConsent ? { ...result, smsConsentOnFile: smsConsent } : result;
}

export async function cancelForCaller(
  context: DomainContext,
  input: { businessId: string; callerPhone: string; appointmentId: string; verificationId?: string; finalConfirmation: boolean; smsConsent?: SmsConsentAnswer },
) {
  if (!input.finalConfirmation) return { ok: false as const, reason: "Final confirmation is required." };
  if (!input.verificationId) return { ok: false as const, reason: "The appointment change verification is required." };
  const result = await cancelAppointmentForCaller(context, { businessId: input.businessId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, verificationId: input.verificationId, ...(input.smsConsent ? { smsConsent: input.smsConsent } : {}) });
  if (!result) return { ok: false as const, reason: "The appointment could not be verified." };
  return { ok: true as const, appointmentId: input.appointmentId, startsAt: result.startsAt.toISOString(), status: "canceled", smsConsentOnFile: result.smsConsentOnFile };
}

export async function rescheduleForCaller(
  context: DomainContext,
  input: { businessId: string; callerPhone: string; appointmentId: string; startsAt: string; verificationId?: string; finalConfirmation: boolean },
) {
  if (!input.finalConfirmation) return { ok: false as const, reason: "Final confirmation is required." };
  if (!input.verificationId) return { ok: false as const, reason: "The appointment change verification is required." };
  let result: Awaited<ReturnType<typeof rescheduleAppointmentForCaller>>;
  try {
    result = await rescheduleAppointmentForCaller(context, { businessId: input.businessId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, startsAt: input.startsAt, verificationId: input.verificationId });
  } catch (error) {
    // The new time isn't bookable: say why, and keep the verification for another try.
    const unavailable = unavailableReasonOf(error);
    if (!unavailable) throw error;
    return { ok: false as const, reason: UNAVAILABLE_REASON_TEXT[unavailable], unavailableReason: unavailable };
  }
  if (!result) return { ok: false as const, reason: "The appointment could not be verified." };
  return { ok: true as const, appointmentId: input.appointmentId, startsAt: result.startsAt.toISOString(), status: "confirmed" };
}

export async function takeMessageForStaff(
  context: DomainContext,
  input: { businessId: string; message: string; channel: ReceptionistChannel; callerName?: string; callbackPhone?: string; urgency?: string; callbackWindow?: string; callId?: string; conversationId?: string; request?: FollowUpRequest },
) {
  const alert = { eventKind: "voiceMessage" as const, subject: "New voice message", body: "A caller left a voice message. Open the inbox to review it." };
  // A website chat's conversation is the visitor's own thread: a staff note
  // there would show up to them, and to the agent, as if they had written it.
  const inVisitorThread = input.channel === "web_chat" && input.conversationId !== undefined;
  if (!inVisitorThread) {
    const conversationId = input.conversationId ?? (await getOrCreateConversation(context, { businessId: input.businessId, contactPhone: input.callbackPhone ?? "unknown", channel: input.channel === "web_chat" ? "web_chat" : "voice" })).conversationId;
    await appendMessage(context, {
      businessId: input.businessId,
      conversationId,
      body: input.message,
      direction: "inbound",
      channel: "dashboard",
      operatorAlert: alert,
    });
  }
  const task = await createVoiceFollowUpTask(context, {
    businessId: input.businessId,
    message: input.message,
    channel: input.channel,
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.callerName ? { callerName: input.callerName } : {}),
    ...(input.callbackPhone ? { callbackPhone: input.callbackPhone } : {}),
    ...(input.urgency ? { urgency: input.urgency } : {}),
    ...(input.callbackWindow ? { callbackWindow: input.callbackWindow } : {}),
    ...(input.request ? { request: input.request } : {}),
  });
  if (inVisitorThread) await queueOperatorAlert(context, { businessId: input.businessId, eventKey: `${alert.eventKind}:${task.inboxItemId}`, ...alert });
  return { ok: true as const, inboxItemId: task.inboxItemId };
}


/**
 * Passes a caller's request to cancel an appointment to the team, when the
 * agent can't cancel on this call. When exactly one upcoming appointment
 * matches the caller's name, their number when they gave one, and the details
 * they gave, the request links to it so an operator can approve it in one
 * click. A date or time that doesn't parse could be any appointment, so the
 * request stays unlinked. The caller is never told whether anything matched.
 */
export async function requestCancellationForCaller(
  context: DomainContext,
  input: { businessId: string; channel: ReceptionistChannel; timezone: string; callerName: string; appointmentStartsAt?: string; serviceName?: string; callbackPhone?: string; notes?: string; callId?: string; conversationId?: string },
) {
  const callerName = input.callerName.trim();
  const serviceName = input.serviceName?.trim();
  const described = input.appointmentStartsAt?.trim();
  const when = described ? DateTime.fromISO(described, { zone: input.timezone }) : undefined;
  const hasTime = Boolean(described?.includes("T"));
  const dayStart = when?.startOf("day");
  const candidates = when && !when.isValid ? [] : await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) =>
    await tx.select({ id: appointments.id, contactName: contacts.name, serviceName: services.name, serviceSlug: services.slug, localizedNames: services.localizedNames }).from(appointments)
      .innerJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, input.businessId)))
      .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, input.businessId)))
      .where(and(
        eq(appointments.businessId, input.businessId),
        ne(appointments.status, "canceled"),
        gte(appointments.startsAt, new Date()),
        input.callbackPhone ? eq(contacts.phone, input.callbackPhone) : undefined,
        dayStart ? and(gte(appointments.startsAt, dayStart.toJSDate()), lt(appointments.startsAt, dayStart.plus({ days: 1 }).toJSDate())) : undefined,
        hasTime && when ? eq(appointments.startsAt, when.toJSDate()) : undefined,
      ))
      .orderBy(asc(appointments.startsAt))
      .limit(50));
  // Names come back spelled differently from call to call, so they match by sound, like the service names.
  const matches = candidates.filter((row) => personNamesMatch(row.contactName ?? undefined, callerName) && (!serviceName || serviceNamesMatch({ name: row.serviceName, slug: row.serviceSlug, localizedNames: row.localizedNames }, serviceName)));
  const appointmentId = matches.length === 1 ? matches[0]!.id : undefined;
  const time = when?.isValid ? when.toFormat(hasTime ? "cccc, LLLL d 'at' h:mm a" : "cccc, LLLL d") : described;
  const message = [
    `Cancellation request: ${[serviceName, time].filter(Boolean).join(", ") || "appointment"}`,
    input.notes?.trim() ? `Notes: ${input.notes.trim()}` : "",
  ].filter(Boolean).join("\n");
  return await takeMessageForStaff(context, {
    businessId: input.businessId,
    message,
    channel: input.channel,
    callerName,
    ...(input.callbackPhone ? { callbackPhone: input.callbackPhone } : {}),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    request: { request: CANCELLATION_REQUEST, ...(appointmentId ? { appointmentId } : {}) },
  });
}
