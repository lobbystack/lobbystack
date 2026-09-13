import { createHash } from "node:crypto";
import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { appointments, calendarConnections, contacts, services, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { CALENDAR_SYNC_HORIZON_MS, markCalendarConnectionSync, resolveCalendarAccessToken, updateAppointmentSyncState, updateAppointmentSyncStateInTransaction, upsertBusyBlocks, type DomainContext } from "@lobbystack/domain";
import { SecretBox, type GoogleCalendarProvider } from "@lobbystack/providers";
import type { JobResult } from "./handlers";

export type CalendarOperations = Pick<GoogleCalendarProvider, "getBusyBlocks" | "upsertEvent" | "deleteEvent" | "refreshAccessToken">;
type Dependencies = { domain: DomainContext; calendar?: CalendarOperations };

function accessToken(dependencies: Dependencies, businessId: string, connectionId: string, forceRefresh = false): Promise<string> {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !dependencies.calendar) throw new Error("Calendar synchronization is not configured.");
  const box = new SecretBox(key);
  return resolveCalendarAccessToken(dependencies.domain, {
    businessId, connectionId, forceRefresh,
    decryptToken: (value) => box.decrypt(value), encryptToken: (value) => box.encrypt(value),
    refreshAccessToken: (input) => dependencies.calendar!.refreshAccessToken(input),
  });
}

export async function syncAppointmentCalendar(dependencies: Dependencies, input: { businessId: string; appointmentId: string }): Promise<JobResult> {
  const { businessId, appointmentId } = input;
  if (!dependencies.calendar || !appointmentId) return { status: "skipped", entityId: appointmentId };
  const provider = dependencies.calendar;
  const load = async (tx: DatabaseTransaction) => (await tx.select({
    id: appointments.id, status: appointments.status, startsAt: appointments.startsAt, endsAt: appointments.endsAt,
    externalEventId: appointments.calendarExternalId, serviceName: services.name, contactName: contacts.name,
    connectionId: calendarConnections.id, calendarId: calendarConnections.selectedCalendarId, connectionStatus: calendarConnections.status,
  }).from(appointments)
    .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, businessId)))
    .leftJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, businessId)))
    .innerJoin(calendarConnections, and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected"), or(isNull(calendarConnections.staffId), eq(calendarConnections.staffId, appointments.staffId))))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId)))
    .orderBy(sql`(${calendarConnections.staffId} is not null) desc`, asc(calendarConnections.id)).limit(1))[0];
  const initial = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, load);
  if (!initial?.calendarId) {
    await updateAppointmentSyncState(dependencies.domain, { businessId, appointmentId, state: "not_required" });
    return { status: "skipped", entityId: appointmentId };
  }
  try {
    // Commit refreshed credentials independently before external event writes.
    // No nested pool acquisition while the appointment sync lock is held.
    const token = await accessToken(dependencies, businessId, initial.connectionId, initial.connectionStatus === "error");
    return await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`calendar:appointment:${appointmentId}`}, 0))`);
      const current = await load(tx);
      if (!current?.calendarId) return { status: "skipped", entityId: appointmentId };
      if (current.connectionId !== initial.connectionId || current.calendarId !== initial.calendarId) throw new Error("Calendar selection changed during synchronization.");
      const clientEventId = `a${createHash("sha256").update(current.id).digest("hex").slice(0, 31)}`;
      // Durable current state wins over a delayed or out-of-order job payload.
      if (current.status === "canceled" || current.status === "cancelled") {
        await provider.deleteEvent({ accessToken: token, calendarId: current.calendarId, eventId: current.externalEventId ?? clientEventId });
        await updateAppointmentSyncStateInTransaction(tx, { businessId, appointmentId, state: "synced" });
      } else {
        const external = await provider.upsertEvent({ accessToken: token, calendarId: current.calendarId, clientEventId, ...(current.externalEventId ? { eventId: current.externalEventId } : {}), title: current.serviceName, startsAt: current.startsAt.toISOString(), endsAt: current.endsAt.toISOString(), ...(current.contactName ? { description: `Appointment for ${current.contactName}` } : {}) });
        await updateAppointmentSyncStateInTransaction(tx, { businessId, appointmentId, state: "synced", externalEventId: external.externalEventId });
      }
      return { status: "completed", entityId: appointmentId };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar synchronization failed.";
    await updateAppointmentSyncState(dependencies.domain, { businessId, appointmentId, state: "failed", error: message });
    if (message !== "Calendar selection changed during synchronization.") await markCalendarConnectionSync(dependencies.domain, { businessId, connectionId: initial.connectionId, error: message });
    throw error;
  }
}

export async function reconcileBusinessCalendar(dependencies: Dependencies, businessId: string): Promise<JobResult> {
  if (!dependencies.calendar) return { status: "skipped", entityId: businessId };
  const connections = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => tx.select({ id: calendarConnections.id, calendarId: calendarConnections.selectedCalendarId, staffId: calendarConnections.staffId, status: calendarConnections.status }).from(calendarConnections).where(and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected"))));
  let synced = 0;
  let failures = 0;
  for (const connection of connections) {
    // Connecting OAuth does not authorize writes to the implicit primary calendar.
    if (!connection.calendarId) continue;
    try {
      const token = await accessToken(dependencies, businessId, connection.id, connection.status === "error");
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + CALENDAR_SYNC_HORIZON_MS);
      const blocks = await dependencies.calendar.getBusyBlocks({ accessToken: token, calendarId: connection.calendarId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
      await upsertBusyBlocks(dependencies.domain, { businessId, connectionId: connection.id, calendarId: connection.calendarId, markSynced: true, syncStartedAt: startsAt, blocks: blocks.map((block) => ({ ...block, ...(connection.staffId ? { staffId: connection.staffId } : {}) })) });
      synced++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Calendar synchronization failed.";
      if (message === "Calendar selection changed during synchronization.") continue;
      await markCalendarConnectionSync(dependencies.domain, { businessId, connectionId: connection.id, error: message });
      failures++;
    }
  }
  if (failures) throw new Error(`Calendar synchronization failed for ${failures} connection(s).`);
  return { status: synced ? "completed" : "skipped", entityId: `${businessId}:${synced}` };
}
