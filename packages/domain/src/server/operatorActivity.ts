import { and, asc, desc, eq, gt, gte, isNull, lt, ne, notInArray, sql } from "drizzle-orm";

import { agentOfRow, agents, appointments, calls, contacts, phoneNumbers, services, staff, type DatabaseTransaction } from "@lobbystack/db";
import { normalizeStaffFirstMode, type StaffFirstMode } from "@lobbystack/shared";

/**
 * Lists for the operator dashboard. Each row carries the contact's name, phone,
 * and email plus the channel, so the dashboard can label contacts without a
 * saved name. Callers run these inside an operator business transaction.
 */

/** Browser calls: the operator's test call, demos and the website widget. None of them came in on a number. */
const BROWSER_TRANSPORTS = ["web_voice", "web", "webrtc"];

export type PhoneLine = { e164: string; agentId: string; agentName: string; staffFirstMode: StaffFirstMode };

/**
 * The numbers callers dial, each with the agent that answers it and whether
 * the team's phone rings first, for the phone card on Home. The oldest number
 * comes first, so the card keeps its order as numbers are added.
 */
export async function listPhoneLines(tx: DatabaseTransaction, businessId: string): Promise<PhoneLine[]> {
  const rows = await tx.select({ e164: phoneNumbers.e164, agentId: agents.id, agentName: agents.name, staffFirstMode: agents.staffFirstMode })
    .from(phoneNumbers)
    .innerJoin(agents, agentOfRow(phoneNumbers.businessId, phoneNumbers.agentId))
    .where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.voiceEnabled, true), isNull(phoneNumbers.reclaimScheduledAt)))
    .orderBy(asc(phoneNumbers.createdAt), asc(phoneNumbers.id));
  return rows.map((row) => ({ ...row, staffFirstMode: normalizeStaffFirstMode(row.staffFirstMode) }));
}

/** Whether anyone has called one of the business's numbers yet, answered by the agent or the team. */
export async function hasPhoneCall(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  const [call] = await tx.select({ id: calls.id }).from(calls).where(and(eq(calls.businessId, businessId), notInArray(calls.transport, BROWSER_TRANSPORTS), isNull(calls.prospectDemoId))).limit(1);
  return Boolean(call);
}

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
    // The rest of what the appointment details sheet shows, so Home opens it without another request.
    endsAt: appointments.endsAt,
    calendarSyncState: appointments.calendarSyncState,
    staffId: appointments.staffId,
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
    serviceId: appointments.serviceId,
    notes: appointments.notes,
    internalNotes: appointments.internalNotes,
  }).from(appointments).leftJoin(contacts, eq(appointments.contactId, contacts.id)).leftJoin(services, eq(appointments.serviceId, services.id)).leftJoin(staff, eq(appointments.staffId, staff.id)).where(and(eq(appointments.businessId, businessId), ne(appointments.status, "canceled"), gte(appointments.startsAt, from))).orderBy(appointments.startsAt).limit(limit);
}

/** How far back the appointments page keeps showing appointments that have ended. */
export const PAST_APPOINTMENT_DAYS = 31;

/** What the appointments page and its details panel show. */
const dashboardAppointmentColumns = {
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
  serviceId: appointments.serviceId,
  // The dashboard is the one place internal notes are read.
  notes: appointments.notes,
  internalNotes: appointments.internalNotes,
};

function selectDashboardAppointments(tx: DatabaseTransaction) {
  return tx.select(dashboardAppointmentColumns)
    .from(appointments)
    .innerJoin(contacts, eq(contacts.id, appointments.contactId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(staff, eq(staff.id, appointments.staffId));
}

/**
 * Appointments that aren't cancelled for the appointments page: those that
 * haven't ended by `now`, preceded by those that ended in the last
 * `PAST_APPOINTMENT_DAYS` days. Each side has its own `limit`, so a busy past
 * never crowds out what's coming.
 */
export async function listCurrentAppointments(tx: DatabaseTransaction, businessId: string, now: Date, limit = 100) {
  const select = () => selectDashboardAppointments(tx);
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

/** The longest range the appointments calendar asks for at once: six weeks of a month view, with room for time zone edges. */
export const MAX_APPOINTMENT_RANGE_DAYS = 45;

/**
 * Every appointment that overlaps [from, to), cancelled ones included, for
 * the appointments calendar, which shows cancellations struck through.
 */
export async function listAppointmentsBetween(tx: DatabaseTransaction, businessId: string, from: Date, to: Date, limit = 1000) {
  return await selectDashboardAppointments(tx)
    .where(and(eq(appointments.businessId, businessId), lt(appointments.startsAt, to), gt(appointments.endsAt, from)))
    .orderBy(asc(appointments.startsAt), asc(appointments.id))
    .limit(limit);
}
