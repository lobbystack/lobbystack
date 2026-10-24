import { and, asc, eq, gt, gte, lt, ne } from "drizzle-orm";
import { DateTime } from "luxon";

import { appointments, calls, contacts, conversationSessions, receptionistProfiles, services, staffServiceAssignments, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { normalizeAppointmentChangePolicy } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { BookingUnavailableError, type UnavailableReason } from "../availability";
import { createAppointmentChangeVerification, verifyAppointmentChangeOtp, verifyAppointmentChangePasscode } from "./appointmentChanges";
import { matchServiceName, personNamesMatch, serviceNamesMatch } from "./appointmentFacts";
import { bookAppointment, cancelAppointmentForCaller, findOpeningsInTransaction, rescheduleAppointmentForCaller, type ApiAudit } from "./booking";
import { recordCallOutcomeInTransaction } from "./callOutcome";
import { recordSmsConsentAnswerInTransaction, type SmsConsentAnswer, type SmsConsentOnFile } from "./contactSmsConsent";
import type { DomainContext } from "./context";
import { appendMessage, getOrCreateConversation } from "./conversations";
import { queueOperatorAlert } from "./notifications";
import { recordProductEventBestEffort } from "./productEvents";
import { CANCELLATION_REQUEST, createVoiceFollowUpTask, type FollowUpRequest } from "./voice";

// Actions the receptionist agent takes on a business's behalf, whatever the
// channel. Each one opens its own tenant-scoped transaction.

export type ReceptionistChannel = "voice" | "web_voice" | "web_chat" | "instagram" | "sms";

/** The active service with this id, or the one a caller's words name. */
async function activeService(tx: DatabaseTransaction, businessId: string, service: { id: string } | { name: string }) {
  const rows = await tx.select({ id: services.id, name: services.name, slug: services.slug, localizedNames: services.localizedNames }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true), "id" in service ? eq(services.id, service.id) : undefined));
  return "id" in service ? rows[0] : matchServiceName(rows, service.name);
}

/** Whether a staff member is assigned a service. An unknown service counts as done, so the booking reports it instead. */
export async function employeeDoesService(context: DomainContext, input: { businessId: string; staffId: string; serviceName: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const service = await activeService(tx, input.businessId, { name: input.serviceName });
    if (!service) return { does: true as const };
    const assigned = await tx.select({ staffId: staffServiceAssignments.staffId }).from(staffServiceAssignments)
      .where(and(eq(staffServiceAssignments.businessId, input.businessId), eq(staffServiceAssignments.staffId, input.staffId), eq(staffServiceAssignments.serviceId, service.id))).limit(1);
    return assigned.length ? { does: true as const } : { does: false as const, serviceName: service.name };
  });
}

/** Why there's nothing to book: the business offers no such service, or the time can't be booked. */
export type BookingRefusal = UnavailableReason | "unknown_service";

/**
 * Open times for the service a caller names on one local date, nearest the
 * preferred time first, or why there are none.
 */
export async function findOpenings(
  context: DomainContext,
  input: { businessId: string; serviceName: string; date: string; preferredHour24?: number; preferredMinute?: number; limit?: number; callId?: string; staffId?: string },
) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const service = await activeService(tx, input.businessId, { name: input.serviceName });
    if (!service) return { ok: false as const, reason: "unknown_service" as const };
    const found = await findOpeningsInTransaction(tx, {
      businessId: input.businessId,
      serviceId: service.id,
      dates: [input.date],
      limit: input.limit ?? 3,
      ...(input.staffId ? { staffId: input.staffId } : {}),
      ...(input.preferredHour24 !== undefined ? { preferredMinutes: input.preferredHour24 * 60 + (input.preferredMinute ?? 0) } : {}),
    });
    if (input.callId) await recordCallOutcomeInTransaction(tx, { businessId: input.businessId, callId: input.callId, outcome: { kind: "booking_in_progress", serviceName: service.name, startsAt: null } });
    return {
      ok: true as const,
      serviceName: service.name,
      date: input.date,
      timezone: found.timezone,
      openings: found.openings.map((startsAt) => ({ startsAt, displayTime: DateTime.fromISO(startsAt).setZone(found.timezone).toFormat("cccc LLL d, h:mm a") })),
      ...(found.reason ? { reason: found.reason } : {}),
    };
  });
}

/**
 * The booking a repeated request already made, so a request repeated after a
 * lost answer doesn't fail as taken. Only the call's own number finds the
 * caller's booking: a typed or spoken one would let anyone learn whose
 * appointment a time holds. Without it, only this call's own booking counts.
 */
async function earlierBooking(tx: DatabaseTransaction, input: { businessId: string; startsAt: string; contactPhone: string; callerPhone?: string; callId?: string }, service: { id: string; name: string }): Promise<{ appointmentId?: string } | undefined> {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return undefined;
  if (input.callerPhone && input.contactPhone === input.callerPhone) {
    const [row] = await tx.select({ id: appointments.id }).from(appointments).innerJoin(contacts, eq(appointments.contactId, contacts.id))
      .where(and(eq(appointments.businessId, input.businessId), eq(appointments.serviceId, service.id), eq(appointments.startsAt, startsAt), eq(appointments.status, "confirmed"), eq(contacts.phone, input.contactPhone))).limit(1);
    return row ? { appointmentId: row.id } : undefined;
  }
  if (!input.callId) return undefined;
  const [session] = await tx.select({ summary: conversationSessions.summary }).from(conversationSessions).where(and(eq(conversationSessions.businessId, input.businessId), eq(conversationSessions.callId, input.callId), eq(conversationSessions.summaryKind, "booked"))).limit(1);
  const outcome = session?.summary;
  return outcome?.serviceName === service.name && typeof outcome.startsAt === "string" && Date.parse(outcome.startsAt) === startsAt.getTime() ? {} : undefined;
}

/**
 * Books for a caller, or for the public API or MCP: the active service with
 * that id, or the one the caller's words name. A repeated request returns the
 * booking it already made (see earlierBooking). Refusals come back as a
 * reason; other errors are thrown.
 */
export async function bookForCaller(
  context: DomainContext,
  input: { businessId: string; service: { id: string } | { name: string }; startsAt: string; timezone: string; contactPhone: string; contactName?: string; channel: ReceptionistChannel | "api"; callerPhone?: string; callId?: string; preferredStaffId?: string; smsConsent?: SmsConsentAnswer; apiAudit?: ApiAudit },
): Promise<{ ok: true; appointmentId?: string; serviceName: string; startsAt: string; alreadyBooked?: true; employeeName?: string } | { ok: false; reason: BookingRefusal }> {
  const distinctId = getPostHogDistinctIdForBusinessSystem(input.businessId);
  const failed = async (reason: BookingRefusal | "unknown", serviceId?: string) => {
    // Telemetry keeps its earlier names for these refusals.
    const name = reason === "unknown_service" ? "service_unavailable" : reason === "taken" ? "slot_unavailable" : reason === "no_staff" ? "no_staff_available" : reason;
    await recordProductEventBestEffort(context, { name: "appointment.booking_failed", businessId: input.businessId, distinctId, properties: { reason: name, ...(serviceId ? { serviceId } : {}), ...("name" in input.service ? { requestedServiceName: input.service.name } : {}), channel: input.channel, sourceChannel: input.channel } });
  };
  const found = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const service = await activeService(tx, input.businessId, input.service);
    if (!service) return undefined;
    const existing = await earlierBooking(tx, input, service);
    // Kept even when the booking fails, so the call shows what the caller tried to book.
    if (!existing && input.callId) await recordCallOutcomeInTransaction(tx, { businessId: input.businessId, callId: input.callId, outcome: { kind: "booking_in_progress", serviceName: service.name, startsAt: input.startsAt } });
    return { service, existing };
  });
  if (!found) {
    await failed("unknown_service");
    return { ok: false, reason: "unknown_service" };
  }
  const { service, existing } = found;
  if (existing) return { ok: true, ...existing, serviceName: service.name, startsAt: input.startsAt, alreadyBooked: true };
  try {
    const { appointmentId, employeeName } = await bookAppointment(context, {
      businessId: input.businessId,
      serviceId: service.id,
      startsAt: input.startsAt,
      timezone: input.timezone,
      contactPhone: input.contactPhone,
      sourceChannel: input.channel,
      ...(input.callId ? { callId: input.callId } : {}),
      ...(input.contactName ? { contactName: input.contactName } : {}),
      ...(input.preferredStaffId ? { preferredStaffId: input.preferredStaffId } : {}),
      ...(input.smsConsent ? { smsConsent: input.smsConsent } : {}),
      ...(input.apiAudit ? { apiAudit: input.apiAudit } : {}),
    });
    await recordProductEventBestEffort(context, { name: "appointment.booked", businessId: input.businessId, distinctId, properties: { appointmentId, channel: input.channel, serviceId: service.id, sourceChannel: input.channel } });
    return { ok: true, appointmentId, serviceName: service.name, startsAt: input.startsAt, ...(employeeName ? { employeeName } : {}) };
  } catch (error) {
    const reason = error instanceof BookingUnavailableError ? error.reason : undefined;
    await failed(reason ?? "unknown", service.id);
    if (!reason) throw error;
    return { ok: false, reason };
  }
}

export async function lookupCallerAppointments(context: DomainContext, input: { businessId: string; callerPhone: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [rows, profile] = await Promise.all([
      // A past appointment can't be cancelled or moved, so it doesn't count.
      tx.select({ id: appointments.id }).from(appointments).innerJoin(contacts, eq(appointments.contactId, contacts.id)).where(and(eq(appointments.businessId, input.businessId), eq(contacts.phone, input.callerPhone), eq(appointments.status, "confirmed"), gt(appointments.startsAt, new Date()))).orderBy(asc(appointments.startsAt)),
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
  input: { businessId: string; callerPhone: string; callId?: string; action: "cancel" | "reschedule"; appointmentId?: string; appointmentStartsAt?: string; serviceName?: string },
) {
  const verification = await createAppointmentChangeVerification(context, input);
  if (!verification) return { ok: false as const, verified: false, reason: "The appointment could not be verified." };
  // The appointment matched, but the business requires a keypad PIN the caller can't give.
  if (verification.status === "passcode_missing") return { ok: false as const, verified: false, status: verification.status, reason: "The caller has no keypad PIN, so the change can't be verified on this call. Someone at the business can set one up." };
  if (verification.status === "passcode_locked") return { ok: false as const, verified: false, status: verification.status, reason: "The caller's keypad PIN is locked after too many wrong tries, so the change can't be verified on this call. Someone at the business can set a new PIN." };
  const verified = verification.status === "otp_verified" || verification.status === "facts_verified" || verification.status === "passcode_verified";
  const requiresPasscode = verification.status === "passcode_pending";
  return { ok: true as const, verified, requiresOtp: !verified && !requiresPasscode, ...(requiresPasscode ? { requiresPasscode } : {}), verificationId: verification.verificationId, appointmentId: verification.appointmentId, status: verification.status, ...(verified && input.action === "cancel" ? { smsConsentOnFile: verification.smsConsent } : {}) };
}

/** Checks the one-time code the caller reads back. Once it matches for a cancellation, it says whether the caller gets texts, as verifyCallerForChange does. */
export async function verifyCallerChangeCode(context: DomainContext, input: { businessId: string; verificationId: string; code: string }) {
  const { smsConsent, ...result } = await verifyAppointmentChangeOtp(context, input);
  return result.ok && smsConsent ? { ...result, smsConsentOnFile: smsConsent } : result;
}

/** Checks the PIN the caller typed on the keypad. Once it matches for a cancellation, it says whether the caller gets texts, as verifyCallerForChange does. */
export async function verifyCallerChangePasscode(context: DomainContext, input: { businessId: string; verificationId: string; passcode: string }) {
  const { smsConsent, ...result } = await verifyAppointmentChangePasscode(context, input);
  return result.ok && smsConsent ? { ...result, smsConsentOnFile: smsConsent } : result;
}

export async function cancelForCaller(
  context: DomainContext,
  input: { businessId: string; callerPhone: string; appointmentId: string; verificationId?: string; finalConfirmation: boolean; callId?: string },
) {
  if (!input.finalConfirmation) return { ok: false as const, reason: "Final confirmation is required." };
  if (!input.verificationId) return { ok: false as const, reason: "The appointment change verification is required." };
  const result = await cancelAppointmentForCaller(context, { businessId: input.businessId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, verificationId: input.verificationId, ...(input.callId ? { callId: input.callId } : {}) });
  if (!result) return { ok: false as const, reason: "The appointment could not be verified." };
  return { ok: true as const, appointmentId: input.appointmentId, startsAt: result.startsAt.toISOString(), status: "canceled", smsConsentOnFile: result.smsConsentOnFile };
}

/**
 * Records the caller's answer to "Can {business} text this number?", given at any point
 * of a phone call, for the call's own number. Texts queued during the call wait
 * for it to end, so delivery follows this answer. Returns the answer on file
 * afterwards, or null when the call isn't this caller's.
 */
export async function recordTextConsentForCaller(
  context: DomainContext,
  input: { businessId: string; callId: string; callerPhone: string; answer: "agreed" | "declined" },
): Promise<SmsConsentOnFile | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [contact] = await tx.select({ id: contacts.id, smsConsentStatus: contacts.smsConsentStatus, operatorBlockedAt: contacts.operatorBlockedAt })
      .from(calls)
      .innerJoin(contacts, and(eq(contacts.id, calls.contactId), eq(contacts.businessId, input.businessId)))
      .where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId), eq(contacts.phone, input.callerPhone)))
      .limit(1);
    if (!contact) return null;
    return await recordSmsConsentAnswerInTransaction(tx, { businessId: input.businessId, contactId: contact.id, phone: input.callerPhone, contact, answer: input.answer, source: "voice_call" });
  });
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
    if (!(error instanceof BookingUnavailableError)) throw error;
    return { ok: false as const, reason: "That time can't be booked.", unavailableReason: error.reason };
  }
  if (!result) return { ok: false as const, reason: "The appointment could not be verified." };
  return { ok: true as const, appointmentId: input.appointmentId, startsAt: result.startsAt.toISOString(), status: "confirmed" };
}

export async function takeMessageForStaff(
  context: DomainContext,
  input: { businessId: string; message: string; channel: ReceptionistChannel; callerName?: string; callbackPhone?: string; urgency?: string; callbackWindow?: string; callId?: string; conversationId?: string; request?: FollowUpRequest },
) {
  const alert = { eventKind: "voiceMessage" as const, subject: "New voice message", body: "A caller left a voice message. Open the inbox to review it." };
  // A website or Instagram chat's conversation is the person's own thread: a staff
  // note there would show up to them, and to the agent, as if they had written it.
  const inVisitorThread = (input.channel === "web_chat" || input.channel === "instagram") && input.conversationId !== undefined;
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
