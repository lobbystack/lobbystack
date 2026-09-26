import { and, asc, eq, ilike, or } from "drizzle-orm";
import { DateTime } from "luxon";

import { appointments, contacts, receptionistProfiles, services, withBusinessTransaction } from "@lobbystack/db";
import { normalizeAppointmentChangePolicy, type HoursWindow } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { createAppointmentChangeVerification } from "./appointmentChanges";
import { bookAppointment, cancelAppointmentForCaller, findAvailability, rescheduleAppointmentForCaller } from "./booking";
import { recordCallSchedulingProgress } from "./callOutcome";
import type { DomainContext } from "./context";
import { appendMessage, getOrCreateConversation } from "./conversations";
import { recordProductEvent } from "./productEvents";
import { createVoiceFollowUpTask } from "./voice";

// Actions the receptionist agent takes on a business's behalf, whatever the
// channel. Each one opens its own tenant-scoped transaction.

export type ReceptionistChannel = "voice" | "web_voice" | "web_chat" | "sms";

async function resolveActiveService(context: DomainContext, businessId: string, serviceName: string) {
  return await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => {
    const normalized = serviceName.trim().toLowerCase();
    return (await tx.select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true), or(eq(services.slug, normalized), ilike(services.name, serviceName.trim())))).limit(1))[0];
  });
}

async function safeRecordProductEvent(context: DomainContext, input: Parameters<typeof recordProductEvent>[1]): Promise<void> {
  try {
    await recordProductEvent(context, input);
  } catch {
    // Product telemetry is best-effort and must never fail the caller's request.
  }
}

export function bookingFailureReason(error: unknown): string {
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
const MAX_OPENING_CHECKS = 16;

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
    .map((value) => day.plus({ minutes: value }))
    .filter((start) => start.toJSDate() > now)
    .map((start) => start.toUTC().toISO()!)
    .slice(0, MAX_OPENING_CHECKS);
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
  for (const startsAt of candidates) {
    if (openings.length >= limit) break;
    const slots = await findAvailability(context, { businessId: input.businessId, serviceId: service.id, startsAt, timezone: input.timezone });
    if (slots.length) openings.push(startsAt);
  }
  if (input.callId) await recordCallSchedulingProgress(context, { businessId: input.businessId, callId: input.callId, serviceName: service.name });
  return {
    ok: true as const,
    serviceName: service.name,
    date: input.date,
    timezone: input.timezone,
    openings: openings.sort().map((startsAt) => ({ startsAt, displayTime: DateTime.fromISO(startsAt).setZone(input.timezone).toFormat("cccc LLL d, h:mm a") })),
  };
}

export async function checkOpening(
  context: DomainContext,
  input: { businessId: string; serviceName: string; startsAt: string; timezone: string; callId?: string },
) {
  const service = await resolveActiveService(context, input.businessId, input.serviceName);
  if (!service) return { ok: false as const, reason: "Service is not available." };
  const slots = await findAvailability(context, { businessId: input.businessId, serviceId: service.id, startsAt: input.startsAt, timezone: input.timezone });
  if (input.callId) await recordCallSchedulingProgress(context, { businessId: input.businessId, callId: input.callId, serviceName: service.name, startsAt: input.startsAt });
  return { ok: true as const, serviceName: service.name, available: slots.length > 0 };
}

export async function bookForCaller(
  context: DomainContext,
  input: { businessId: string; serviceName: string; startsAt: string; timezone: string; contactPhone: string; contactName?: string; smsConsentGranted?: boolean; channel: ReceptionistChannel; callId?: string },
) {
  const distinctId = getPostHogDistinctIdForBusinessSystem(input.businessId);
  const service = await resolveActiveService(context, input.businessId, input.serviceName);
  if (!service) {
    await safeRecordProductEvent(context, { name: "appointment.booking_failed", businessId: input.businessId, distinctId, properties: { reason: "service_unavailable", requestedServiceName: input.serviceName, channel: input.channel, sourceChannel: input.channel } });
    return { ok: false as const, reason: "Service is not available." };
  }
  try {
    const appointment = await bookAppointment(context, {
      businessId: input.businessId,
      serviceId: service.id,
      startsAt: input.startsAt,
      timezone: input.timezone,
      contactPhone: input.contactPhone,
      sourceChannel: input.channel,
      ...(input.callId ? { callId: input.callId } : {}),
      ...(input.smsConsentGranted ? { smsConsentGranted: true } : {}),
      ...(input.contactName ? { contactName: input.contactName } : {}),
    });
    await safeRecordProductEvent(context, { name: "appointment.booked", businessId: input.businessId, distinctId, properties: { appointmentId: appointment.appointmentId, channel: input.channel, serviceId: service.id, sourceChannel: input.channel } });
    return { ok: true as const, appointmentId: appointment.appointmentId, serviceName: service.name, startsAt: input.startsAt };
  } catch (error) {
    const reason = bookingFailureReason(error);
    await safeRecordProductEvent(context, { name: "appointment.booking_failed", businessId: input.businessId, distinctId, properties: { reason, serviceId: service.id, requestedServiceName: input.serviceName, channel: input.channel, sourceChannel: input.channel } });
    return { ok: false as const, reason: reason === "slot_unavailable" ? "That time is no longer available." : "The booking could not be completed." };
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

export async function verifyCallerForChange(
  context: DomainContext,
  input: { businessId: string; callerPhone: string; action: "cancel" | "reschedule"; appointmentId?: string; callerName?: string; appointmentStartsAt?: string; serviceName?: string },
) {
  const verification = await createAppointmentChangeVerification(context, input);
  if (!verification) return { ok: false as const, verified: false, reason: "The appointment could not be verified." };
  const verified = verification.status === "otp_verified" || verification.status === "facts_verified";
  return { ok: true as const, verified, requiresOtp: !verified, verificationId: verification.verificationId, appointmentId: verification.appointmentId, status: verification.status };
}

export async function cancelForCaller(
  context: DomainContext,
  input: { businessId: string; callerPhone: string; appointmentId: string; verificationId?: string; finalConfirmation: boolean },
) {
  if (!input.finalConfirmation) return { ok: false as const, reason: "Final confirmation is required." };
  if (!input.verificationId) return { ok: false as const, reason: "The appointment change verification is required." };
  const result = await cancelAppointmentForCaller(context, { businessId: input.businessId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, verificationId: input.verificationId });
  if (!result) return { ok: false as const, reason: "The appointment could not be verified." };
  return { ok: true as const, appointmentId: input.appointmentId, startsAt: result.startsAt.toISOString(), status: "canceled" };
}

export async function rescheduleForCaller(
  context: DomainContext,
  input: { businessId: string; callerPhone: string; appointmentId: string; startsAt: string; verificationId?: string; finalConfirmation: boolean },
) {
  if (!input.finalConfirmation) return { ok: false as const, reason: "Final confirmation is required." };
  if (!input.verificationId) return { ok: false as const, reason: "The appointment change verification is required." };
  const result = await rescheduleAppointmentForCaller(context, { businessId: input.businessId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, startsAt: input.startsAt, verificationId: input.verificationId });
  if (!result) return { ok: false as const, reason: "The appointment could not be verified." };
  return { ok: true as const, appointmentId: input.appointmentId, startsAt: result.startsAt.toISOString(), status: "confirmed" };
}

export async function takeMessageForStaff(
  context: DomainContext,
  input: { businessId: string; message: string; channel: ReceptionistChannel; callerName?: string; callbackPhone?: string; urgency?: string; callbackWindow?: string; callId?: string; conversationId?: string },
) {
  const conversationId = input.conversationId ?? (await getOrCreateConversation(context, { businessId: input.businessId, contactPhone: input.callbackPhone ?? "unknown", channel: input.channel === "web_chat" ? "web_chat" : "voice" })).conversationId;
  await appendMessage(context, {
    businessId: input.businessId,
    conversationId,
    body: input.message,
    direction: "inbound",
    channel: "dashboard",
    operatorAlert: { eventKind: "voiceMessage", subject: "New voice message", body: "A caller left a voice message. Open the inbox to review it." },
  });
  const task = await createVoiceFollowUpTask(context, {
    businessId: input.businessId,
    message: input.message,
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.callerName ? { callerName: input.callerName } : {}),
    ...(input.callbackPhone ? { callbackPhone: input.callbackPhone } : {}),
    ...(input.urgency ? { urgency: input.urgency } : {}),
    ...(input.callbackWindow ? { callbackWindow: input.callbackWindow } : {}),
  });
  return { ok: true as const, inboxItemId: task.inboxItemId };
}
