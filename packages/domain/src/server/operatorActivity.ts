import { and, asc, desc, eq, gte, lt, ne, sql } from "drizzle-orm";

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
    // Null for the default staff member that stands for the business itself.
    employeeName: sql<string | null>`case when ${staff.isEmployee} then ${staff.name} end`,
  }).from(appointments).leftJoin(contacts, eq(appointments.contactId, contacts.id)).leftJoin(services, eq(appointments.serviceId, services.id)).leftJoin(staff, eq(appointments.staffId, staff.id)).where(and(eq(appointments.businessId, businessId), ne(appointments.status, "canceled"), gte(appointments.startsAt, from))).orderBy(appointments.startsAt).limit(limit);
}

/** How far back the appointments page keeps showing appointments that have ended. */
export const PAST_APPOINTMENT_DAYS = 31;

/**
 * Appointments that aren't cancelled for the appointments page: those that
 * haven't ended by `now`, preceded by those that ended in the last
 * `PAST_APPOINTMENT_DAYS` days. Each side has its own `limit`, so a busy past
 * never crowds out what's coming.
 */
export async function listCurrentAppointments(tx: DatabaseTransaction, businessId: string, now: Date, limit = 100) {
  const select = () => tx.select({
    id: appointments.id,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    timezone: appointments.timezone,
    status: appointments.status,
    sourceChannel: appointments.sourceChannel,
    calendarSyncState: appointments.calendarSyncState,
    createdAt: appointments.createdAt,
    staffId: appointments.staffId,
    contactName: contacts.name,
    contactPhone: contacts.phone,
    contactEmail: contacts.email,
    serviceName: services.name,
    staffName: staff.name,
    employeeName: sql<string | null>`case when ${staff.isEmployee} then ${staff.name} end`,
  })
    .from(appointments)
    .innerJoin(contacts, eq(contacts.id, appointments.contactId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(staff, eq(staff.id, appointments.staffId));
  const active = and(eq(appointments.businessId, businessId), ne(appointments.status, "canceled"));
  const pastFrom = new Date(now.getTime() - PAST_APPOINTMENT_DAYS * 24 * 60 * 60 * 1000);
  const past = await select()
    .where(and(active, lt(appointments.endsAt, now), gte(appointments.endsAt, pastFrom)))
    .orderBy(desc(appointments.startsAt))
    .limit(limit);
  const current = await select()
    .where(and(active, gte(appointments.endsAt, now)))
    .orderBy(asc(appointments.startsAt))
    .limit(limit);
  return [...past.reverse(), ...current];
}
