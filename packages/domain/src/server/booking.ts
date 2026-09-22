import { and, asc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { appointments, auditLogs, businesses, businessHours, calendarBusyBlocks, calendarConnections, closures, contacts, enqueueOutbox, notifications, services, smsConsentEvents, staff, staffServiceAssignments, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { computeAvailability } from "../availability";
import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { recordCallOutcomeInTransaction } from "./callOutcome";
import { consumeAppointmentChangeVerificationInTransaction } from "./appointmentChanges";
import { recordProductEvent } from "./productEvents";
import { rescheduleAppointmentReminderInTransaction } from "./notifications";

type BookingInput = {
  callId?: string;
  businessId: string;
  userId?: string;
  serviceId: string;
  startsAt: string;
  timezone: string;
  contactPhone: string;
  contactName?: string;
  sourceChannel: string;
  preferredStaffId?: string;
  smsConsentGranted?: boolean;
};

async function lockStaff(tx: DatabaseTransaction, staffId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${staffId}, 0))`);
}

export const MAX_CALENDAR_SYNC_AGE_MS = 20 * 60_000;
export const CALENDAR_SYNC_HORIZON_MS = 90 * 24 * 60 * 60_000;

type AvailabilityReference = {
  businessId: string;
  serviceId: string;
  serviceName: string;
  serviceDurationMinutes: number;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  activeStaffIds: string[];
  assignedStaffIds: Set<string>;
  connections: Array<typeof calendarConnections.$inferSelect>;
  hours: Array<typeof businessHours.$inferSelect>;
  closures: Array<{ startsAt: string; endsAt: string; reason: string }>;
};

/**
 * Reads the reference data availability needs once per transaction. Callers that
 * evaluate several staff candidates reuse it instead of re-reading services,
 * staff, assignments, connections, hours, and closures for every candidate.
 */
async function loadAvailabilityReference(tx: DatabaseTransaction, input: { businessId: string; serviceId: string; startsAt: string }): Promise<AvailabilityReference> {
  const [service] = await tx.select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId), eq(services.active, true))).limit(1);
  const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!service || !business) throw new Error("Service is not available.");
  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isSafeInteger(service.durationMinutes) || service.durationMinutes <= 0) throw new Error("A valid appointment time and duration are required.");
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  const activeStaff = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, input.businessId), eq(staff.active, true))).orderBy(asc(staff.id));
  const activeStaffIds = activeStaff.map((row) => row.id);
  const assignments = await tx.select({ staffId: staffServiceAssignments.staffId }).from(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, input.businessId), eq(staffServiceAssignments.serviceId, input.serviceId)));
  const connections = activeStaffIds.length
    ? await tx.select().from(calendarConnections).where(and(eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"), or(isNull(calendarConnections.staffId), inArray(calendarConnections.staffId, activeStaffIds))))
    : [];
  const hours = await tx.select().from(businessHours).where(eq(businessHours.businessId, input.businessId));
  const closed = await tx.select().from(closures).where(and(eq(closures.businessId, input.businessId), lt(closures.startsAt, endsAt), gt(closures.endsAt, startsAt)));
  return {
    businessId: input.businessId,
    serviceId: input.serviceId,
    serviceName: service.name,
    serviceDurationMinutes: service.durationMinutes,
    timezone: business.timezone,
    startsAt,
    endsAt,
    activeStaffIds,
    assignedStaffIds: new Set(assignments.map((row) => row.staffId)),
    connections,
    hours,
    closures: closed.map((row) => ({ startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), reason: row.reason })),
  };
}

// Unassigned services retain the existing all-active-staff default. Explicit
// assignments constrain eligibility instead of being silently ignored.
function eligibleStaffIds(reference: AvailabilityReference, requestedStaffIds?: string[]): string[] {
  return reference.activeStaffIds.filter((id) => (!requestedStaffIds || requestedStaffIds.includes(id)) && (!reference.assignedStaffIds.size || reference.assignedStaffIds.has(id)));
}

function isCalendarFresh(reference: AvailabilityReference, staffId: string, now: number): boolean {
  return !reference.connections.some((connection) => connection.selectedCalendarId && (!connection.staffId || connection.staffId === staffId) && (
    connection.status !== "connected" || !connection.lastSyncedAt || now - connection.lastSyncedAt.getTime() > MAX_CALENDAR_SYNC_AGE_MS
    || reference.startsAt.getTime() < connection.lastSyncedAt.getTime() || reference.endsAt.getTime() > connection.lastSyncedAt.getTime() + CALENDAR_SYNC_HORIZON_MS
  ));
}

/**
 * Reads only staff-specific conflicts. Call after taking the staff advisory
 * lock so the conflict check reflects the holder of the lock.
 */
async function staffAvailabilityInTransaction(tx: DatabaseTransaction, reference: AvailabilityReference, input: { staffIds: string[]; ignoreAppointmentId?: string }) {
  if (!input.staffIds.length) return [];
  const existing = await tx.select({ staffId: appointments.staffId, startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(eq(appointments.businessId, reference.businessId), ne(appointments.status, "canceled"), input.ignoreAppointmentId ? ne(appointments.id, input.ignoreAppointmentId) : undefined, inArray(appointments.staffId, input.staffIds), lt(appointments.startsAt, reference.endsAt), gt(appointments.endsAt, reference.startsAt)));
  const configured = reference.connections.filter((connection) => connection.selectedCalendarId && input.staffIds.some((id) => !connection.staffId || connection.staffId === id));
  const connectionIds = configured.filter((connection) => connection.status === "connected").map((connection) => connection.id);
  const busy = connectionIds.length ? await tx.select().from(calendarBusyBlocks).where(and(eq(calendarBusyBlocks.businessId, reference.businessId), inArray(calendarBusyBlocks.connectionId, connectionIds), lt(calendarBusyBlocks.startsAt, reference.endsAt), gt(calendarBusyBlocks.endsAt, reference.startsAt))) : [];
  const staffByConnection = new Map(reference.connections.map((connection) => [connection.id, connection.staffId]));
  return computeAvailability({
    request: { serviceId: reference.serviceId, startsAt: reference.startsAt.toISOString(), timezone: reference.timezone },
    serviceDurationMinutes: reference.serviceDurationMinutes,
    staffIds: input.staffIds,
    hours: reference.hours,
    closures: reference.closures,
    existingAppointments: [
      ...existing.map((row) => ({ staffId: row.staffId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() })),
      ...busy.flatMap((row) => { const owner = row.staffId ?? staffByConnection.get(row.connectionId); return (owner ? [owner] : input.staffIds).map((staffId) => ({ staffId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() })); }),
    ],
  });
}

async function availabilityInTransaction(tx: DatabaseTransaction, input: { businessId: string; serviceId: string; startsAt: string; staffIds?: string[]; ignoreAppointmentId?: string }) {
  const reference = await loadAvailabilityReference(tx, input);
  const now = Date.now();
  const selected = eligibleStaffIds(reference, input.staffIds).filter((id) => isCalendarFresh(reference, id, now));
  if (!selected.length) return [];
  return await staffAvailabilityInTransaction(tx, reference, input.ignoreAppointmentId ? { staffIds: selected, ignoreAppointmentId: input.ignoreAppointmentId } : { staffIds: selected });
}

export async function findAvailability(
  context: DomainContext,
  input: { userId?: string; businessId: string; serviceId: string; startsAt: string; timezone: string; staffIds?: string[] },
) {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: input.userId ? "operator" : "worker" }, async (tx) => {
    if (input.userId) {
      await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId });
    }
    return await availabilityInTransaction(tx, input);
  });
}

export async function bookAppointment(
  context: DomainContext,
  input: BookingInput,
): Promise<{ appointmentId: string; contactId: string; staffId: string }> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: input.userId ? "operator" : "worker" }, async (tx) => {
    if (input.userId) {
      await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId, minimumRole: "scheduler" });
    }
    // Load reference data once, then take the advisory lock and recheck only
    // staff-specific conflicts for each candidate.
    const reference = await loadAvailabilityReference(tx, { businessId: input.businessId, serviceId: input.serviceId, startsAt: input.startsAt });
    const candidates = reference.activeStaffIds.filter((id) => !input.preferredStaffId || id === input.preferredStaffId);
    const now = Date.now();
    let selectedStaff: { id: string } | undefined;
    for (const candidateId of candidates) {
      // Keep the original lock set: every active candidate is locked before its
      // reference and conflict checks so contention behavior is unchanged.
      await lockStaff(tx, candidateId);
      if (reference.assignedStaffIds.size && !reference.assignedStaffIds.has(candidateId)) continue;
      if (!isCalendarFresh(reference, candidateId, now)) continue;
      const slots = await staffAvailabilityInTransaction(tx, reference, { staffIds: [candidateId] });
      if (slots.length) { selectedStaff = { id: candidateId }; break; }
    }
    if (!selectedStaff) {
      throw new Error("No staff member is available for this service.");
    }
    const startsAt = reference.startsAt;
    const endsAt = reference.endsAt;
    const conflicting = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, input.businessId), eq(appointments.staffId, selectedStaff.id), ne(appointments.status, "canceled"), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))).limit(1);
    if (conflicting[0]) {
      throw new Error("That appointment time is no longer available.");
    }
    const existingContacts = await tx.select({ id: contacts.id, smsConsentStatus: contacts.smsConsentStatus, operatorBlockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.contactPhone))).limit(1);
    const contactId = existingContacts[0]?.id ?? (await tx.insert(contacts).values({
      businessId: input.businessId,
      phone: input.contactPhone,
      ...(input.contactName !== undefined ? { name: input.contactName } : {}),
    }).returning({ id: contacts.id }))[0]?.id;
    if (!contactId) {
      throw new Error("Contact could not be created.");
    }
    const canGrantReminderConsent = input.smsConsentGranted === true && existingContacts[0]?.smsConsentStatus !== "opted_out" && !existingContacts[0]?.operatorBlockedAt;
    if (canGrantReminderConsent) {
      const now = new Date();
      await tx.update(contacts).set({ smsConsentStatus: "subscribed", smsConsentSource: "appointment_booking", smsConsentUpdatedAt: now, updatedAt: now }).where(and(eq(contacts.id, contactId), eq(contacts.businessId, input.businessId)));
      await tx.insert(smsConsentEvents).values({ businessId: input.businessId, contactId, phone: input.contactPhone, recipientType: "contact", action: "reminder_consent_granted", source: "appointment_booking" });
    }
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
      payload: { notificationId: confirmation.id },
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
    return { appointmentId: appointment.id, contactId, staffId: selectedStaff.id };
  });
}

async function recordAppointmentChange(
  context: DomainContext,
  input: { name: "appointment.rescheduled" | "appointment.cancelled"; businessId: string; appointmentId: string; source: string },
): Promise<void> {
  try {
    await recordProductEvent(context, {
      name: input.name,
      businessId: input.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
      properties: { appointmentId: input.appointmentId, source: input.source },
    });
  } catch {
    // Product telemetry is best-effort and must not fail the appointment change.
  }
}

export async function cancelAppointment(
  context: DomainContext,
  input: { userId: string; businessId: string; appointmentId: string },
): Promise<void> {
  const changed = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId, minimumRole: "scheduler" });
    const [appointment] = await tx.update(appointments).set({ status: "canceled", calendarSyncState: "pending", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), ne(appointments.status, "canceled"))).returning({ id: appointments.id, revision: appointments.revision });
    if (!appointment) {
      const [existing] = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId))).limit(1);
      if (existing) return false;
      throw new Error("Appointment not found.");
    }
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "appointment_change.canceled", entityType: "appointment", entityId: appointment.id, payload: { source: "operator" } });
    await tx.update(notifications)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(and(
        eq(notifications.businessId, input.businessId),
        eq(notifications.relatedId, appointment.id),
        eq(notifications.kind, "appointment_reminder"),
        inArray(notifications.status, ["pending", "processing"]),
      ));
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
    return true;
  });
  if (changed) await recordAppointmentChange(context, { name: "appointment.cancelled", businessId: input.businessId, appointmentId: input.appointmentId, source: "operator" });
}

export async function rescheduleAppointmentForCaller(
  context: DomainContext,
  input: { businessId: string; appointmentId: string; callerPhone: string; startsAt: string; verificationId: string },
): Promise<{ appointmentId: string; serviceId: string; startsAt: Date; endsAt: Date } | null> {
  const result = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ id: appointments.id, serviceId: appointments.serviceId, staffId: appointments.staffId, durationMinutes: services.durationMinutes }).from(appointments).innerJoin(contacts, and(eq(appointments.contactId, contacts.id), eq(contacts.businessId, input.businessId))).innerJoin(services, and(eq(appointments.serviceId, services.id), eq(services.businessId, input.businessId))).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), eq(contacts.phone, input.callerPhone))).limit(1))[0];
    if (!row) return null;
    await lockStaff(tx, row.staffId);
    const startsAt = new Date(input.startsAt);
    if (!Number.isFinite(startsAt.getTime())) throw new Error("A valid appointment start time is required.");
    const endsAt = new Date(startsAt.getTime() + row.durationMinutes * 60_000);
    const slots = await availabilityInTransaction(tx, { businessId: input.businessId, serviceId: row.serviceId, startsAt: input.startsAt, staffIds: [row.staffId], ignoreAppointmentId: row.id });
    if (!slots.length) throw new Error("That appointment time is no longer available.");
    const conflict = (await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, input.businessId), eq(appointments.staffId, row.staffId), ne(appointments.status, "canceled"), ne(appointments.id, row.id), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))).limit(1))[0];
    if (conflict) throw new Error("That appointment time is no longer available.");
    const consumed = await consumeAppointmentChangeVerificationInTransaction(tx, { businessId: input.businessId, verificationId: input.verificationId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, action: "reschedule" });
    if (!consumed) return null;
    const [updated] = await tx.update(appointments).set({ startsAt, endsAt, status: "confirmed", calendarSyncState: "pending", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.id, row.id), eq(appointments.businessId, input.businessId), ne(appointments.status, "canceled"))).returning({ revision: appointments.revision });
    if (!updated) return null;
    await rescheduleAppointmentReminderInTransaction(tx, { businessId: input.businessId, appointmentId: row.id, startsAt, revision: updated.revision });
    await tx.insert(auditLogs).values({ businessId: input.businessId, eventType: "appointment_change.rescheduled", entityType: "appointment", entityId: row.id, payload: { source: "caller", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } });
    await enqueueOutbox(tx, { topic: "calendar.syncAppointment", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:calendar:reschedule:${updated.revision}`, payload: { appointmentId: row.id, action: "reschedule" } });
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:updated:${updated.revision}`, payload: { type: "appointment.updated", entityId: row.id, revision: updated.revision } });
    return { appointmentId: row.id, serviceId: row.serviceId, startsAt, endsAt };
  });
  if (result) {
    await recordAppointmentChange(context, { name: "appointment.rescheduled", businessId: input.businessId, appointmentId: result.appointmentId, source: "caller" });
  }
  return result;
}

export async function cancelAppointmentForCaller(
  context: DomainContext,
  input: { businessId: string; appointmentId: string; callerPhone: string; verificationId: string },
): Promise<{ appointmentId: string; serviceId: string; startsAt: Date; endsAt: Date } | null> {
  const result = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ id: appointments.id, serviceId: appointments.serviceId, startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).innerJoin(contacts, and(eq(appointments.contactId, contacts.id), eq(contacts.businessId, input.businessId))).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), eq(contacts.phone, input.callerPhone), ne(appointments.status, "canceled"))).limit(1))[0];
    if (!row) return null;
    const consumed = await consumeAppointmentChangeVerificationInTransaction(tx, { businessId: input.businessId, verificationId: input.verificationId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, action: "cancel" });
    if (!consumed) return null;
    const [updated] = await tx.update(appointments).set({ status: "canceled", calendarSyncState: "pending", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.id, row.id), eq(appointments.businessId, input.businessId), ne(appointments.status, "canceled"))).returning({ revision: appointments.revision });
    if (!updated) return null;
    await tx.insert(auditLogs).values({ businessId: input.businessId, eventType: "appointment_change.canceled", entityType: "appointment", entityId: row.id, payload: { source: "caller" } });
    await tx.update(notifications).set({ status: "skipped", updatedAt: new Date() }).where(and(eq(notifications.businessId, input.businessId), eq(notifications.relatedId, row.id), eq(notifications.kind, "appointment_reminder"), inArray(notifications.status, ["pending", "processing"])));
    await enqueueOutbox(tx, { topic: "calendar.syncAppointment", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:calendar:cancel:${updated.revision}`, payload: { appointmentId: row.id, action: "cancel" } });
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:updated:${updated.revision}`, payload: { type: "appointment.updated", entityId: row.id, revision: updated.revision } });
    return { appointmentId: row.id, serviceId: row.serviceId, startsAt: row.startsAt, endsAt: row.endsAt };
  });
  if (result) {
    await recordAppointmentChange(context, { name: "appointment.cancelled", businessId: input.businessId, appointmentId: result.appointmentId, source: "caller" });
  }
  return result;
}
