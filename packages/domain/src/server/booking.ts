import { and, asc, eq, gt, inArray, isNull, lt, ne, notExists, or, sql } from "drizzle-orm";

import { appointments, auditLogs, businesses, businessHours, calendarBusyBlocks, calendarConnections, closures, contacts, enqueueOutbox, inboxItems, notifications, services, staff, staffServiceAssignments, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { AvailabilitySlot } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";
import { DateTime } from "luxon";

import { BookingUnavailableError, candidateStartTimes, freeStaffSlots, scheduleUnavailableReason, type NoOpeningsReason, type UnavailableReason } from "../availability";
import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { recordCallOutcomeInTransaction } from "./callOutcome";
import { consumeAppointmentChangeVerificationInTransaction } from "./appointmentChanges";
import { findOrCreateContactByPhone } from "./contacts";
import { recordSmsConsentAnswerInTransaction, smsConsentOnFile, type SmsConsentAnswer, type SmsConsentOnFile } from "./contactSmsConsent";
import { recordProductEventBestEffort } from "./productEvents";
import { CANCELLATION_CONFIRMATION, heldForCall, rescheduleAppointmentReminderInTransaction } from "./notifications";
import { emitWebhookEventInTransaction } from "./publicApi/webhooks";
import { CANCELLATION_REQUEST } from "./voice";

type BookingInput = {
  callId?: string;
  businessId: string;
  serviceId: string;
  startsAt: string;
  timezone: string;
  contactPhone: string;
  contactName?: string;
  sourceChannel: string;
  preferredStaffId?: string;
  /** The caller's answer to a confirmation and reminder text. Omitted means not asked. */
  smsConsent?: SmsConsentAnswer;
  /** Set when the public API or the MCP server made the booking; recorded in the audit log. */
  apiAudit?: ApiAudit;
};

/** Who made an API change: the audit row's actor user (OAuth grants act for a user) and payload (actor and credential id). */
export type ApiAudit = { actorUserId: string | null; payload: Record<string, unknown> };
async function lockStaff(tx: DatabaseTransaction, staffId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${staffId}, 0))`);
}

export const MAX_CALENDAR_SYNC_AGE_MS = 20 * 60_000;
export const CALENDAR_SYNC_HORIZON_MS = 90 * 24 * 60 * 60_000;

type Schedule = {
  businessId: string;
  serviceId: string;
  serviceName: string;
  serviceDurationMinutes: number;
  timezone: string;
  activeStaffIds: string[];
  assignedStaffIds: Set<string>;
  connections: Array<typeof calendarConnections.$inferSelect>;
  hours: Array<typeof businessHours.$inferSelect>;
  closures: Array<{ startsAt: string; endsAt: string; reason: string }>;
};

/**
 * Reads the rules for booking a service: the service, the business's
 * timezone, staff, assignments, calendars, hours, and the closures that end
 * after `from`. Booking reloads it after each staff lock so it never validates
 * against stale rules.
 */
async function loadSchedule(tx: DatabaseTransaction, input: { businessId: string; serviceId: string; from: Date }): Promise<Schedule> {
  const [service] = await tx.select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId), eq(services.active, true))).limit(1);
  const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  // 409: the API and MCP answer a turned-off service as a client error, not a 500.
  if (!service || !business) throw Object.assign(new Error("Service is not available."), { status: 409 });
  if (!Number.isFinite(input.from.getTime()) || !Number.isSafeInteger(service.durationMinutes) || service.durationMinutes <= 0) throw new Error("A valid appointment time and duration are required.");
  const activeStaff = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, input.businessId), eq(staff.active, true))).orderBy(asc(staff.id));
  const activeStaffIds = activeStaff.map((row) => row.id);
  const assignments = await tx.select({ staffId: staffServiceAssignments.staffId }).from(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, input.businessId), eq(staffServiceAssignments.serviceId, input.serviceId)));
  const connections = activeStaffIds.length
    ? await tx.select().from(calendarConnections).where(and(eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"), or(isNull(calendarConnections.staffId), inArray(calendarConnections.staffId, activeStaffIds))))
    : [];
  const hours = await tx.select().from(businessHours).where(eq(businessHours.businessId, input.businessId));
  const closed = await tx.select().from(closures).where(and(eq(closures.businessId, input.businessId), gt(closures.endsAt, input.from)));
  return {
    businessId: input.businessId,
    serviceId: input.serviceId,
    serviceName: service.name,
    serviceDurationMinutes: service.durationMinutes,
    timezone: business.timezone,
    activeStaffIds,
    assignedStaffIds: new Set(assignments.map((row) => row.staffId)),
    connections,
    hours,
    closures: closed.map((row) => ({ startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), reason: row.reason })),
  };
}

type AvailabilityReference = Schedule & { startsAt: Date; endsAt: Date };

/** The schedule for one start time. */
async function loadAvailabilityReference(tx: DatabaseTransaction, input: { businessId: string; serviceId: string; startsAt: string }): Promise<AvailabilityReference> {
  const startsAt = new Date(input.startsAt);
  const schedule = await loadSchedule(tx, { businessId: input.businessId, serviceId: input.serviceId, from: startsAt });
  return { ...schedule, startsAt, endsAt: new Date(startsAt.getTime() + schedule.serviceDurationMinutes * 60_000) };
}

// Unassigned services retain the existing all-active-staff default. Explicit
// assignments constrain eligibility instead of being silently ignored.
function eligibleStaffIds(schedule: Schedule, requestedStaffIds?: string[]): string[] {
  return schedule.activeStaffIds.filter((id) => (!requestedStaffIds || requestedStaffIds.includes(id)) && (!schedule.assignedStaffIds.size || schedule.assignedStaffIds.has(id)));
}

function isCalendarFresh(schedule: Schedule, staffId: string, startsAt: Date, now: number): boolean {
  const endsAt = startsAt.getTime() + schedule.serviceDurationMinutes * 60_000;
  return !schedule.connections.some((connection) => connection.selectedCalendarId && (!connection.staffId || connection.staffId === staffId) && (
    connection.status !== "connected" || !connection.lastSyncedAt || now - connection.lastSyncedAt.getTime() > MAX_CALENDAR_SYNC_AGE_MS
    || startsAt.getTime() < connection.lastSyncedAt.getTime() || endsAt > connection.lastSyncedAt.getTime() + CALENDAR_SYNC_HORIZON_MS
  ));
}

/**
 * The staff who could take the service at a time, judged from the schedule
 * alone, or why no one can: the opening hours and closures first, then staff
 * and calendar freshness. Their bookings decide the rest.
 */
function staffForTime(schedule: Schedule, startsAt: Date, requestedStaffIds: string[] | undefined, now: number): string[] | UnavailableReason {
  const closed = scheduleUnavailableReason({ startsAt: startsAt.toISOString(), timezone: schedule.timezone, serviceDurationMinutes: schedule.serviceDurationMinutes, hours: schedule.hours, closures: schedule.closures });
  if (closed) return closed;
  const eligible = eligibleStaffIds(schedule, requestedStaffIds);
  if (!eligible.length) return "no_staff";
  const fresh = eligible.filter((id) => isCalendarFresh(schedule, id, startsAt, now));
  return fresh.length ? fresh : "calendar_not_synced";
}

type BusyTime = { staffId: string; startsAt: string; endsAt: string };

/**
 * The booked and calendar-busy times of these staff between two instants.
 * Booking reads them after taking the staff lock, so they include the lock
 * holder's booking.
 */
async function loadBusyTimes(tx: DatabaseTransaction, schedule: Schedule, input: { staffIds: string[]; from: Date; to: Date; ignoreAppointmentId?: string | undefined }): Promise<BusyTime[]> {
  if (!input.staffIds.length) return [];
  const existing = await tx.select({ staffId: appointments.staffId, startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(eq(appointments.businessId, schedule.businessId), ne(appointments.status, "canceled"), input.ignoreAppointmentId ? ne(appointments.id, input.ignoreAppointmentId) : undefined, inArray(appointments.staffId, input.staffIds), lt(appointments.startsAt, input.to), gt(appointments.endsAt, input.from)));
  const configured = schedule.connections.filter((connection) => connection.selectedCalendarId && input.staffIds.some((id) => !connection.staffId || connection.staffId === id));
  const connectionIds = configured.filter((connection) => connection.status === "connected").map((connection) => connection.id);
  // Events LobbyStack wrote for its own appointments come back as busy blocks. Skip them:
  // the appointment rows above already hold that time for the right staff member. An event
  // someone moved or stretched in the calendar no longer matches its row, so it still blocks.
  const busy = connectionIds.length ? await tx.select().from(calendarBusyBlocks).where(and(eq(calendarBusyBlocks.businessId, schedule.businessId), inArray(calendarBusyBlocks.connectionId, connectionIds), lt(calendarBusyBlocks.startsAt, input.to), gt(calendarBusyBlocks.endsAt, input.from),
    notExists(tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, calendarBusyBlocks.businessId), eq(appointments.calendarExternalId, calendarBusyBlocks.externalEventId), eq(appointments.startsAt, calendarBusyBlocks.startsAt), eq(appointments.endsAt, calendarBusyBlocks.endsAt)))))) : [];
  const staffByConnection = new Map(schedule.connections.map((connection) => [connection.id, connection.staffId]));
  return [
    ...existing.map((row) => ({ staffId: row.staffId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() })),
    ...busy.flatMap((row) => { const owner = row.staffId ?? staffByConnection.get(row.connectionId); return (owner ? [owner] : input.staffIds).map((staffId) => ({ staffId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() })); }),
  ];
}

/** The slots at a time: the staff who could take it and aren't busy then. staffForTime has checked the schedule. */
function openSlots(schedule: Schedule, startsAt: Date, staffIds: string[], busy: BusyTime[]): AvailabilitySlot[] {
  return freeStaffSlots({
    request: { serviceId: schedule.serviceId, startsAt: startsAt.toISOString(), timezone: schedule.timezone },
    serviceDurationMinutes: schedule.serviceDurationMinutes,
    staffIds,
    existingAppointments: busy,
  });
}

type AvailabilityCheck = { slots: AvailabilitySlot[]; reason?: UnavailableReason };

async function availabilityInTransaction(tx: DatabaseTransaction, input: { businessId: string; serviceId: string; startsAt: string; staffIds?: string[]; ignoreAppointmentId?: string }): Promise<AvailabilityCheck> {
  const reference = await loadAvailabilityReference(tx, input);
  // The schedule alone can rule the time out; then no bookings are read.
  const staffIds = staffForTime(reference, reference.startsAt, input.staffIds, Date.now());
  if (typeof staffIds === "string") return { slots: [], reason: staffIds };
  const slots = openSlots(reference, reference.startsAt, staffIds, await loadBusyTimes(tx, reference, { staffIds, from: reference.startsAt, to: reference.endsAt, ignoreAppointmentId: input.ignoreAppointmentId }));
  return slots.length ? { slots } : { slots, reason: "taken" };
}

/** The open slots for a time, and when there are none, why. */
export async function checkAvailability(
  context: DomainContext,
  input: { businessId: string; serviceId: string; startsAt: string; staffIds?: string[] },
): Promise<AvailabilityCheck> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await availabilityInTransaction(tx, input));
}

export async function findAvailability(
  context: DomainContext,
  input: { businessId: string; serviceId: string; startsAt: string; staffIds?: string[] },
) {
  return (await checkAvailability(context, input)).slots;
}

/**
 * Open start times for a service on whole local days, from one read of the
 * schedule and of the staff's bookings. It tries every half hour inside the
 * opening hours, nearest the preferred time first, and returns up to `limit`
 * of them in time order. With none, the reason is why the nearest time can't
 * be booked: later times can fail for another reason, such as a closure.
 */
export async function findOpeningsInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; serviceId: string; dates: string[]; staffId?: string; preferredMinutes?: number; limit?: number },
): Promise<{ timezone: string; durationMinutes: number; openings: string[]; reason?: NoOpeningsReason }> {
  const now = new Date();
  const schedule = await loadSchedule(tx, { businessId: input.businessId, serviceId: input.serviceId, from: now });
  const found = { timezone: schedule.timezone, durationMinutes: schedule.serviceDurationMinutes };
  const candidates = input.dates.flatMap((date) => candidateStartTimes({ date, timezone: schedule.timezone, hours: schedule.hours, durationMinutes: schedule.serviceDurationMinutes, now, ...(input.preferredMinutes !== undefined ? { preferredMinutes: input.preferredMinutes } : {}) }));
  if (!candidates.length) {
    const closedDays = input.dates.every((date) => {
      const day = DateTime.fromISO(`${date}T00:00:00`, { zone: schedule.timezone });
      return day.isValid && !schedule.hours.some((window) => window.dayOfWeek === day.weekday % 7);
    });
    return { ...found, openings: [], reason: !schedule.hours.length ? "no_hours" : closedDays ? "closed_day" : "no_times_left" };
  }
  const starts = candidates.map((value) => new Date(value));
  const requested = input.staffId ? [input.staffId] : undefined;
  const busy = await loadBusyTimes(tx, schedule, {
    staffIds: eligibleStaffIds(schedule, requested),
    from: new Date(Math.min(...starts.map(Number))),
    to: new Date(Math.max(...starts.map(Number)) + schedule.serviceDurationMinutes * 60_000),
  });
  const limit = input.limit ?? Infinity;
  const openings: string[] = [];
  let reason: UnavailableReason | undefined;
  for (const [index, startsAt] of starts.entries()) {
    if (openings.length >= limit) break;
    const staffIds = staffForTime(schedule, startsAt, requested, now.getTime());
    if (typeof staffIds !== "string" && openSlots(schedule, startsAt, staffIds, busy).length) openings.push(candidates[index]!);
    else reason ??= typeof staffIds === "string" ? staffIds : "taken";
  }
  return openings.length ? { ...found, openings: openings.sort() } : { ...found, openings, reason: reason ?? "taken" };
}

export async function bookAppointment(
  context: DomainContext,
  input: BookingInput,
): Promise<{ appointmentId: string; contactId: string; staffId: string }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // The first read refuses a time the schedule rules out without taking any
    // lock, and otherwise gives a stable, sorted lock set: the staff who could
    // take the time. Reference data is reloaded after each candidate lock
    // because it may change while we wait.
    const initialReference = await loadAvailabilityReference(tx, { businessId: input.businessId, serviceId: input.serviceId, startsAt: input.startsAt });
    const candidates = staffForTime(initialReference, initialReference.startsAt, input.preferredStaffId ? [input.preferredStaffId] : undefined, Date.now());
    if (typeof candidates === "string") throw new BookingUnavailableError(candidates, "No staff member is available for this service.");
    let selectedStaff: { id: string } | undefined;
    let selectedReference: AvailabilityReference | undefined;
    for (const candidateId of candidates) {
      await lockStaff(tx, candidateId);
      const reference = await loadAvailabilityReference(tx, { businessId: input.businessId, serviceId: input.serviceId, startsAt: input.startsAt });
      const staffIds = staffForTime(reference, reference.startsAt, [candidateId], Date.now());
      if (typeof staffIds === "string") continue;
      if (openSlots(reference, reference.startsAt, staffIds, await loadBusyTimes(tx, reference, { staffIds, from: reference.startsAt, to: reference.endsAt })).length) {
        selectedStaff = { id: candidateId };
        selectedReference = reference;
        break;
      }
    }
    if (!selectedStaff || !selectedReference) throw new BookingUnavailableError("taken", "No staff member is available for this service.");
    const reference = selectedReference;
    const startsAt = reference.startsAt;
    const endsAt = reference.endsAt;
    const { contact, created: contactCreated } = await findOrCreateContactByPhone(tx, { businessId: input.businessId, phone: input.contactPhone, name: input.contactName });
    const contactId = contact.id;
    // A caller's contact is made when the call starts, before anyone knows their name.
    if (input.contactName && !contactCreated) await tx.update(contacts).set({ name: input.contactName, updatedAt: new Date() }).where(and(eq(contacts.id, contactId), eq(contacts.businessId, input.businessId), isNull(contacts.name)));
    await recordSmsConsentAnswerInTransaction(tx, { businessId: input.businessId, contactId, phone: input.contactPhone, contact, answer: input.smsConsent, source: "appointment_booking" });
    const [appointment] = await tx.insert(appointments).values({
      businessId: input.businessId,
      contactId,
      staffId: selectedStaff.id,
      serviceId: input.serviceId,
      startsAt,
      endsAt,
      timezone: input.timezone,
      status: "confirmed",
      sourceChannel: input.sourceChannel,
      calendarSyncState: "pending",
    }).returning({ id: appointments.id, revision: appointments.revision });
    if (!appointment) {
      throw new Error("Appointment could not be created.");
    }
    const [confirmation] = await tx.insert(notifications).values({
      businessId: input.businessId,
      channel: "sms",
      kind: "booking_confirmation",
      relatedId: appointment.id,
      scheduledFor: new Date(),
      status: "pending",
    }).onConflictDoNothing().returning({ id: notifications.id });
    if (!confirmation) {
      throw new Error("Booking confirmation notification could not be created.");
    }
    await enqueueOutbox(tx, {
      topic: "calendar.syncAppointment",
      businessId: input.businessId,
      aggregateType: "appointment",
      aggregateId: appointment.id,
      dedupeKey: `appointment:${appointment.id}:calendar:create`,
      payload: { appointmentId: appointment.id },
    });
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "appointment",
      aggregateId: appointment.id,
      dedupeKey: `appointment:${appointment.id}:updated:${appointment.revision}`,
      payload: { type: "appointment.updated", entityId: appointment.id, revision: appointment.revision },
    });
    await enqueueOutbox(tx, {
      topic: "notification.dispatch",
      businessId: input.businessId,
      aggregateType: "appointment",
      aggregateId: appointment.id,
      dedupeKey: `notification:${confirmation.id}:dispatch`,
      ...heldForCall(input.callId, { notificationId: confirmation.id }),
    });
    const reminderAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
    if (reminderAt > new Date()) {
      const [reminder] = await tx.insert(notifications).values({
        businessId: input.businessId,
        channel: "sms",
        kind: "appointment_reminder",
        relatedId: appointment.id,
        scheduledFor: reminderAt,
        status: "pending",
      }).onConflictDoNothing().returning({ id: notifications.id });
      if (reminder) {
        await enqueueOutbox(tx, {
          topic: "notification.dispatch",
          businessId: input.businessId,
          aggregateType: "appointment",
          aggregateId: appointment.id,
          dedupeKey: `notification:${reminder.id}:dispatch`,
          availableAt: reminderAt,
          payload: { notificationId: reminder.id, appointmentRevision: appointment.revision },
        });
      }
    }
    if (input.callId) await recordCallOutcomeInTransaction(tx, { businessId: input.businessId, callId: input.callId, contactId, outcome: { kind: "booked", serviceName: reference.serviceName, startsAt: startsAt.toISOString() } });
    if (input.apiAudit) await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.apiAudit.actorUserId, eventType: "api.appointment.booked", entityType: "appointment", entityId: appointment.id, payload: input.apiAudit.payload });
    if (contactCreated) await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "contact.created", resourceId: contactId });
    await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "appointment.booked", resourceId: appointment.id });
    return { appointmentId: appointment.id, contactId, staffId: selectedStaff.id };
  });
}

async function recordAppointmentChange(
  context: DomainContext,
  input: { name: "appointment.rescheduled" | "appointment.cancelled"; businessId: string; appointmentId: string; source: string },
): Promise<void> {
  await recordProductEventBestEffort(context, {
    name: input.name,
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    properties: { appointmentId: input.appointmentId, source: input.source },
  });
}

type AppointmentChangeSource = { source: "operator"; userId: string } | { source: "caller"; callId?: string } | { source: "api"; audit: ApiAudit };

function changeAudit(change: AppointmentChangeSource): { actorUserId: string | null; payload: Record<string, unknown> } {
  if (change.source === "operator") return { actorUserId: change.userId, payload: { source: "operator" } };
  if (change.source === "api") return { actorUserId: change.audit.actorUserId, payload: { source: "api", ...change.audit.payload } };
  return { actorUserId: null, payload: { source: "caller" } };
}

/**
 * Cancels inside the caller's transaction: skips pending reminders, queues the
 * calendar removal and the customer's cancellation text, and emits
 * appointment.cancelled. Returns "already" when the appointment was cancelled
 * before and "missing" when it does not exist. Either way, callers' requests
 * to cancel it are done.
 */
export async function cancelAppointmentInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; appointmentId: string; change: AppointmentChangeSource },
): Promise<"cancelled" | "already" | "missing"> {
  // Whatever cancels it: an operator, the caller, the public API or MCP, or
  // approving one of several requests for it.
  await tx.update(inboxItems).set({ status: "done", updatedAt: new Date() }).where(and(
    eq(inboxItems.businessId, input.businessId),
    eq(inboxItems.kind, "voice_message"),
    eq(inboxItems.status, "open"),
    sql`${inboxItems.metadata}->>'request' = ${CANCELLATION_REQUEST}`,
    sql`${inboxItems.metadata}->>'appointmentId' = ${input.appointmentId}`,
  ));
  const [appointment] = await tx.update(appointments).set({ status: "canceled", calendarSyncState: "pending", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), ne(appointments.status, "canceled"))).returning({ id: appointments.id, revision: appointments.revision, startsAt: appointments.startsAt });
  if (!appointment) {
    const [existing] = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId))).limit(1);
    return existing ? "already" : "missing";
  }
  const audit = changeAudit(input.change);
  await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: audit.actorUserId, eventType: "appointment_change.canceled", entityType: "appointment", entityId: appointment.id, payload: audit.payload });
  await tx.update(notifications)
    .set({ status: "skipped", updatedAt: new Date() })
    .where(and(
      eq(notifications.businessId, input.businessId),
      eq(notifications.relatedId, appointment.id),
      eq(notifications.kind, "appointment_reminder"),
      inArray(notifications.status, ["pending", "processing"]),
    ));
  // The customer's cancellation text. Delivery sends it only to a contact who
  // agreed to texts. An appointment that already started gets none: clearing
  // up a past one shouldn't text the customer.
  if (appointment.startsAt > new Date()) {
    const [cancellation] = await tx.insert(notifications).values({ businessId: input.businessId, channel: "sms", kind: CANCELLATION_CONFIRMATION, relatedId: appointment.id, scheduledFor: new Date(), status: "pending" }).onConflictDoNothing().returning({ id: notifications.id });
    if (cancellation) await enqueueOutbox(tx, { topic: "notification.dispatch", businessId: input.businessId, aggregateType: "appointment", aggregateId: appointment.id, dedupeKey: `notification:${cancellation.id}:dispatch`, ...heldForCall(input.change.source === "caller" ? input.change.callId : undefined, { notificationId: cancellation.id }) });
  }
  await enqueueOutbox(tx, {
    topic: "calendar.syncAppointment",
    businessId: input.businessId,
    aggregateType: "appointment",
    aggregateId: appointment.id,
    dedupeKey: `appointment:${appointment.id}:calendar:cancel:${appointment.revision}`,
    payload: { appointmentId: appointment.id, action: "cancel" },
  });
  await enqueueOutbox(tx, {
    topic: "realtime.publish",
    businessId: input.businessId,
    aggregateType: "appointment",
    aggregateId: appointment.id,
    dedupeKey: `appointment:${appointment.id}:updated:${appointment.revision}`,
    payload: { type: "appointment.updated", entityId: appointment.id, revision: appointment.revision },
  });
  await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "appointment.cancelled", resourceId: appointment.id });
  return "cancelled";
}

/**
 * An operator cancels an appointment, which also closes callers' requests to
 * cancel it. Returns "already" for an appointment cancelled before.
 */
export async function cancelAppointment(
  context: DomainContext,
  input: { userId: string; businessId: string; appointmentId: string },
): Promise<"cancelled" | "already"> {
  const result = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId, minimumRole: "scheduler" });
    const result = await cancelAppointmentInTransaction(tx, { businessId: input.businessId, appointmentId: input.appointmentId, change: { source: "operator", userId: input.userId } });
    if (result === "missing") throw Object.assign(new Error("Appointment not found."), { status: 404, code: "not_found" });
    return result;
  });
  if (result === "cancelled") await recordAppointmentChange(context, { name: "appointment.cancelled", businessId: input.businessId, appointmentId: input.appointmentId, source: "operator" });
  return result;
}

/**
 * Moves an appointment to a new time with the same staff member, inside the
 * caller's transaction. Checks availability (hours, closures, calendar busy
 * time and freshness) under the staff lock, reschedules the reminder, queues
 * the calendar update and emits appointment.rescheduled. `beforeUpdate` runs
 * after the checks and can veto the change, for example to consume a caller's
 * verification.
 */
export async function rescheduleAppointmentInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; appointmentId: string; startsAt: string; change: AppointmentChangeSource; callerPhone?: string; staffId?: string; beforeUpdate?: () => Promise<boolean> },
): Promise<{ appointmentId: string; serviceId: string; startsAt: Date; endsAt: Date } | null> {
  const row = (await tx.select({ id: appointments.id, serviceId: appointments.serviceId, staffId: appointments.staffId, durationMinutes: services.durationMinutes }).from(appointments).innerJoin(contacts, and(eq(appointments.contactId, contacts.id), eq(contacts.businessId, input.businessId))).innerJoin(services, and(eq(appointments.serviceId, services.id), eq(services.businessId, input.businessId))).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), input.callerPhone !== undefined ? eq(contacts.phone, input.callerPhone) : undefined)).limit(1))[0];
  if (!row) return null;
  // The appointment keeps its staff member unless the caller moves it to another one.
  const staffId = input.staffId ?? row.staffId;
  await lockStaff(tx, staffId);
  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime())) throw new Error("A valid appointment start time is required.");
  const endsAt = new Date(startsAt.getTime() + row.durationMinutes * 60_000);
  const availability = await availabilityInTransaction(tx, { businessId: input.businessId, serviceId: row.serviceId, startsAt: startsAt.toISOString(), staffIds: [staffId], ignoreAppointmentId: row.id });
  if (!availability.slots.length) throw new BookingUnavailableError(availability.reason ?? "taken", "That appointment time is no longer available.");
  if (input.beforeUpdate && !(await input.beforeUpdate())) return null;
  const [updated] = await tx.update(appointments).set({ startsAt, endsAt, staffId, status: "confirmed", calendarSyncState: "pending", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.id, row.id), eq(appointments.businessId, input.businessId), ne(appointments.status, "canceled"))).returning({ revision: appointments.revision });
  if (!updated) return null;
  await rescheduleAppointmentReminderInTransaction(tx, { businessId: input.businessId, appointmentId: row.id, startsAt, revision: updated.revision });
  const audit = changeAudit(input.change);
  await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: audit.actorUserId, eventType: "appointment_change.rescheduled", entityType: "appointment", entityId: row.id, payload: { ...audit.payload, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), ...(staffId !== row.staffId ? { staffId } : {}) } });
  await enqueueOutbox(tx, { topic: "calendar.syncAppointment", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:calendar:reschedule:${updated.revision}`, payload: { appointmentId: row.id, action: "reschedule" } });
  await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:updated:${updated.revision}`, payload: { type: "appointment.updated", entityId: row.id, revision: updated.revision } });
  await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "appointment.rescheduled", resourceId: row.id });
  return { appointmentId: row.id, serviceId: row.serviceId, startsAt, endsAt };
}

export async function rescheduleAppointmentForCaller(
  context: DomainContext,
  input: { businessId: string; appointmentId: string; callerPhone: string; startsAt: string; verificationId: string },
): Promise<{ appointmentId: string; serviceId: string; startsAt: Date; endsAt: Date } | null> {
  const result = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await rescheduleAppointmentInTransaction(tx, {
    businessId: input.businessId,
    appointmentId: input.appointmentId,
    startsAt: input.startsAt,
    callerPhone: input.callerPhone,
    change: { source: "caller" },
    beforeUpdate: async () => await consumeAppointmentChangeVerificationInTransaction(tx, { businessId: input.businessId, verificationId: input.verificationId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, action: "reschedule" }),
  }));
  if (result) {
    await recordAppointmentChange(context, { name: "appointment.rescheduled", businessId: input.businessId, appointmentId: result.appointmentId, source: "caller" });
  }
  return result;
}

/**
 * The verified caller cancels. Returns the cancelled appointment with the
 * caller's answer on file about texts, which the cancellation text follows.
 */
export async function cancelAppointmentForCaller(
  context: DomainContext,
  input: { businessId: string; appointmentId: string; callerPhone: string; verificationId: string; callId?: string },
): Promise<{ appointmentId: string; serviceId: string; startsAt: Date; endsAt: Date; smsConsentOnFile: SmsConsentOnFile } | null> {
  const result = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ id: appointments.id, serviceId: appointments.serviceId, startsAt: appointments.startsAt, endsAt: appointments.endsAt, contactId: contacts.id, smsConsentStatus: contacts.smsConsentStatus, operatorBlockedAt: contacts.operatorBlockedAt }).from(appointments).innerJoin(contacts, and(eq(appointments.contactId, contacts.id), eq(contacts.businessId, input.businessId))).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), eq(contacts.phone, input.callerPhone), ne(appointments.status, "canceled"))).limit(1))[0];
    if (!row) return null;
    const consumed = await consumeAppointmentChangeVerificationInTransaction(tx, { businessId: input.businessId, verificationId: input.verificationId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, action: "cancel" });
    if (!consumed) return null;
    if (await cancelAppointmentInTransaction(tx, { businessId: input.businessId, appointmentId: row.id, change: { source: "caller", ...(input.callId ? { callId: input.callId } : {}) } }) !== "cancelled") return null;
    return { appointmentId: row.id, serviceId: row.serviceId, startsAt: row.startsAt, endsAt: row.endsAt, smsConsentOnFile: smsConsentOnFile(row) };
  });
  if (result) {
    await recordAppointmentChange(context, { name: "appointment.cancelled", businessId: input.businessId, appointmentId: result.appointmentId, source: "caller" });
  }
  return result;
}
