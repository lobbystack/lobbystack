import { and, asc, desc, eq, gte, ne } from "drizzle-orm";

import { appointments, calls, contacts, services, staff, type DatabaseTransaction } from "@lobbystack/db";

/**
 * Lists for the operator dashboard. Each row carries the contact's name, phone,
 * and email plus the channel, so the dashboard can label contacts without a
 * saved name. Callers run these inside an operator business transaction.
 */

/** The most recent calls for the home page. */
export async function listRecentCalls(tx: DatabaseTransaction, businessId: string, limit = 5) {
  return await tx.select({
    id: calls.id,
    startedAt: calls.startedAt,
    status: calls.status,
    transport: calls.transport,
    providerDurationSeconds: calls.providerDurationSeconds,
    endedAt: calls.endedAt,
    contactName: contacts.name,
    contactPhone: contacts.phone,
    contactEmail: contacts.email,
  }).from(calls).leftJoin(contacts, eq(calls.contactId, contacts.id)).where(eq(calls.businessId, businessId)).orderBy(desc(calls.startedAt)).limit(limit);
}

/** The next appointments that start at or after `from` and aren't cancelled, for the home page. */
export async function listUpcomingAppointments(tx: DatabaseTransaction, businessId: string, from: Date, limit = 5) {
  return await tx.select({
    id: appointments.id,
    startsAt: appointments.startsAt,
    timezone: appointments.timezone,
    status: appointments.status,
    sourceChannel: appointments.sourceChannel,
    contactName: contacts.name,
    contactPhone: contacts.phone,
    contactEmail: contacts.email,
    serviceName: services.name,
    staffName: staff.name,
  }).from(appointments).leftJoin(contacts, eq(appointments.contactId, contacts.id)).leftJoin(services, eq(appointments.serviceId, services.id)).leftJoin(staff, eq(appointments.staffId, staff.id)).where(and(eq(appointments.businessId, businessId), ne(appointments.status, "canceled"), gte(appointments.startsAt, from))).orderBy(appointments.startsAt).limit(limit);
}

/** Appointments that have not ended by `now` and aren't cancelled, for the appointments page. */
export async function listCurrentAppointments(tx: DatabaseTransaction, businessId: string, now: Date, limit = 100) {
  return await tx.select({
    id: appointments.id,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    timezone: appointments.timezone,
    status: appointments.status,
    sourceChannel: appointments.sourceChannel,
    calendarSyncState: appointments.calendarSyncState,
    contactName: contacts.name,
    contactPhone: contacts.phone,
    contactEmail: contacts.email,
    serviceName: services.name,
    staffName: staff.name,
  })
    .from(appointments)
    .innerJoin(contacts, eq(contacts.id, appointments.contactId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(staff, eq(staff.id, appointments.staffId))
    .where(and(eq(appointments.businessId, businessId), ne(appointments.status, "canceled"), gte(appointments.endsAt, now)))
    .orderBy(asc(appointments.startsAt))
    .limit(limit);
}
