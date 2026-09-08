import { and, eq, gt, lt, ne, or, sql } from "drizzle-orm";

import { appointments, auditLogs, businessHours, closures, contacts, enqueueOutbox, notifications, services, smsConsentEvents, staff, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { computeAvailability } from "../availability";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { recordCallOutcomeInTransaction } from "./callOutcome";
import { consumeAppointmentChangeVerificationInTransaction } from "./appointmentChanges";

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

export async function findAvailability(
  context: DomainContext,
  input: { userId?: string; businessId: string; serviceId: string; startsAt: string; timezone: string; staffIds?: string[] },
) {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: input.userId ? "operator" : "worker" }, async (tx) => {
    if (input.userId) {
      await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId });
    }
    const serviceRows = await tx.select({ durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId), eq(services.active, true))).limit(1);
    const service = serviceRows[0];
    if (!service) {
      throw new Error("Service is not available.");
    }
    const staffRows = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, input.businessId), eq(staff.active, true)));
    const [hoursRows, closureRows] = await Promise.all([
      tx.select().from(businessHours).where(eq(businessHours.businessId, input.businessId)),
      tx.select().from(closures).where(eq(closures.businessId, input.businessId)),
    ]);
    const selectedStaffIds = (input.staffIds ?? staffRows.map((row) => row.id));
    const existing = await tx.select({ staffId: appointments.staffId, startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(eq(appointments.businessId, input.businessId), ne(appointments.status, "canceled"), or(...selectedStaffIds.map((staffId) => eq(appointments.staffId, staffId)))));
    return computeAvailability({
      request: { serviceId: input.serviceId, startsAt: input.startsAt, timezone: input.timezone },
      serviceDurationMinutes: service.durationMinutes,
      staffIds: selectedStaffIds,
      hours: hoursRows,
      closures: closureRows.map((row) => ({ startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), reason: row.reason })),
      existingAppointments: existing.map((row) => ({ staffId: row.staffId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() })),
    });
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
    const serviceRows = await tx.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId), eq(services.active, true))).limit(1);
    const service = serviceRows[0];
    if (!service) {
      throw new Error("Service is not available.");
    }
    const staffRows = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, input.businessId), eq(staff.active, true), input.preferredStaffId ? eq(staff.id, input.preferredStaffId) : undefined));
    const selectedStaff = staffRows[0];
    if (!selectedStaff) {
      throw new Error("No staff member is available for this service.");
    }
    await lockStaff(tx, selectedStaff.id);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
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
          payload: { notificationId: reminder.id },
        });
      }
    }
    if (input.callId) await recordCallOutcomeInTransaction(tx, { businessId: input.businessId, callId: input.callId, contactId, outcome: { kind: "booked", serviceName: service.name, startsAt: startsAt.toISOString() } });
    return { appointmentId: appointment.id, contactId, staffId: selectedStaff.id };
  });
}

export async function cancelAppointment(
  context: DomainContext,
  input: { userId: string; businessId: string; appointmentId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId, minimumRole: "scheduler" });
    const [appointment] = await tx.update(appointments).set({ status: "canceled", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId))).returning({ id: appointments.id, revision: appointments.revision });
    if (!appointment) {
      throw new Error("Appointment not found.");
    }
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "appointment_change.canceled", entityType: "appointment", entityId: appointment.id, payload: { source: "operator" } });
    await tx.update(notifications)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(and(
        eq(notifications.businessId, input.businessId),
        eq(notifications.relatedId, appointment.id),
        eq(notifications.kind, "appointment_reminder"),
        eq(notifications.status, "pending"),
      ));
    await enqueueOutbox(tx, {
      topic: "calendar.syncAppointment",
      businessId: input.businessId,
      aggregateType: "appointment",
      aggregateId: appointment.id,
      dedupeKey: `appointment:${appointment.id}:calendar:cancel:${Date.now()}`,
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
  });
}

export async function rescheduleAppointmentForCaller(
  context: DomainContext,
  input: { businessId: string; appointmentId: string; callerPhone: string; startsAt: string; verificationId: string },
): Promise<{ appointmentId: string; serviceId: string; startsAt: Date; endsAt: Date } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ id: appointments.id, serviceId: appointments.serviceId, staffId: appointments.staffId, durationMinutes: services.durationMinutes }).from(appointments).innerJoin(contacts, and(eq(appointments.contactId, contacts.id), eq(contacts.businessId, input.businessId))).innerJoin(services, and(eq(appointments.serviceId, services.id), eq(services.businessId, input.businessId))).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), eq(contacts.phone, input.callerPhone))).limit(1))[0];
    if (!row) return null;
    await lockStaff(tx, row.staffId);
    const startsAt = new Date(input.startsAt);
    if (!Number.isFinite(startsAt.getTime())) throw new Error("A valid appointment start time is required.");
    const endsAt = new Date(startsAt.getTime() + row.durationMinutes * 60_000);
    const conflict = (await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, input.businessId), eq(appointments.staffId, row.staffId), ne(appointments.status, "canceled"), ne(appointments.id, row.id), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))).limit(1))[0];
    if (conflict) throw new Error("That appointment time is no longer available.");
    const consumed = await consumeAppointmentChangeVerificationInTransaction(tx, { businessId: input.businessId, verificationId: input.verificationId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, action: "reschedule" });
    if (!consumed) return null;
    const [updated] = await tx.update(appointments).set({ startsAt, endsAt, status: "confirmed", calendarSyncState: "pending", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.id, row.id), eq(appointments.businessId, input.businessId))).returning({ revision: appointments.revision });
    if (!updated) return null;
    await tx.insert(auditLogs).values({ businessId: input.businessId, eventType: "appointment_change.rescheduled", entityType: "appointment", entityId: row.id, payload: { source: "caller", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } });
    await enqueueOutbox(tx, { topic: "calendar.syncAppointment", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:calendar:reschedule:${updated.revision}`, payload: { appointmentId: row.id, action: "reschedule" } });
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:updated:${updated.revision}`, payload: { type: "appointment.updated", entityId: row.id, revision: updated.revision } });
    return { appointmentId: row.id, serviceId: row.serviceId, startsAt, endsAt };
  });
}

export async function cancelAppointmentForCaller(
  context: DomainContext,
  input: { businessId: string; appointmentId: string; callerPhone: string; verificationId: string },
): Promise<{ appointmentId: string; serviceId: string; startsAt: Date; endsAt: Date } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ id: appointments.id, serviceId: appointments.serviceId, startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).innerJoin(contacts, and(eq(appointments.contactId, contacts.id), eq(contacts.businessId, input.businessId))).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), eq(contacts.phone, input.callerPhone), ne(appointments.status, "canceled"))).limit(1))[0];
    if (!row) return null;
    const consumed = await consumeAppointmentChangeVerificationInTransaction(tx, { businessId: input.businessId, verificationId: input.verificationId, appointmentId: input.appointmentId, callerPhone: input.callerPhone, action: "cancel" });
    if (!consumed) return null;
    const [updated] = await tx.update(appointments).set({ status: "canceled", calendarSyncState: "pending", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.id, row.id), eq(appointments.businessId, input.businessId))).returning({ revision: appointments.revision });
    if (!updated) return null;
    await tx.insert(auditLogs).values({ businessId: input.businessId, eventType: "appointment_change.canceled", entityType: "appointment", entityId: row.id, payload: { source: "caller" } });
    await tx.update(notifications).set({ status: "skipped", updatedAt: new Date() }).where(and(eq(notifications.businessId, input.businessId), eq(notifications.relatedId, row.id), eq(notifications.kind, "appointment_reminder"), eq(notifications.status, "pending")));
    await enqueueOutbox(tx, { topic: "calendar.syncAppointment", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:calendar:cancel:${updated.revision}`, payload: { appointmentId: row.id, action: "cancel" } });
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "appointment", aggregateId: row.id, dedupeKey: `appointment:${row.id}:updated:${updated.revision}`, payload: { type: "appointment.updated", entityId: row.id, revision: updated.revision } });
    return { appointmentId: row.id, serviceId: row.serviceId, startsAt: row.startsAt, endsAt: row.endsAt };
  });
}
