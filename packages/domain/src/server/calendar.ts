import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
import { assertCertificationCalendar } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { appointments, auditLogs, calendarBusyBlocks, calendarConnections, enqueueOutbox, staff, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction } from "./notifications";
import { recordProductEventBestEffort } from "./productEvents";

export async function resolveCalendarAccessToken(context: DomainContext, input: {
  businessId: string;
  connectionId: string;
  decryptToken: (value: string) => string;
  encryptToken: (value: string) => string;
  refreshAccessToken: (input: { refreshToken: string }) => Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }>;
  now?: Date;
  forceRefresh?: boolean;
}): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // Serializes concurrent scheduled/appointment refreshes for one account.
    const [connection] = await tx.select().from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).limit(1).for("update");
    if (!connection || connection.businessId !== input.businessId || connection.status === "disconnected") throw new Error("Calendar connection is unavailable.");
    const now = input.now ?? new Date();
    if (!input.forceRefresh && connection.encryptedAccessToken && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > now.getTime() + 60_000) return input.decryptToken(connection.encryptedAccessToken);
    if (!connection.encryptedRefreshToken) throw new Error("Google Calendar authorization requires reconnection.");
    const refreshed = await input.refreshAccessToken({ refreshToken: input.decryptToken(connection.encryptedRefreshToken) });
    if (!refreshed.accessToken || !Number.isFinite(refreshed.expiresIn) || refreshed.expiresIn <= 0) throw new Error("Google Calendar returned an invalid refreshed token.");
    await tx.update(calendarConnections).set({
      encryptedAccessToken: input.encryptToken(refreshed.accessToken),
      ...(refreshed.refreshToken ? { encryptedRefreshToken: input.encryptToken(refreshed.refreshToken) } : {}),
      tokenExpiresAt: new Date(now.getTime() + refreshed.expiresIn * 1000),
      updatedAt: new Date(),
    }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
    return refreshed.accessToken;
  });
}

export async function connectCalendar(
  context: DomainContext,
  input: { userId: string; businessId: string; provider: string; externalAccountId: string; staffId?: string; encryptedAccessToken?: string; encryptedRefreshToken?: string; tokenExpiresAt?: string },
): Promise<string> {
  const connectionId = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [connection] = await tx.insert(calendarConnections).values({
      businessId: input.businessId,
      ownerUserId: input.userId,
      provider: input.provider,
      externalAccountId: input.externalAccountId,
      staffId: input.staffId,
      encryptedAccessToken: input.encryptedAccessToken,
      encryptedRefreshToken: input.encryptedRefreshToken,
      ...(input.tokenExpiresAt !== undefined ? { tokenExpiresAt: new Date(input.tokenExpiresAt) } : {}),
      status: "connected",
    }).onConflictDoUpdate({
      target: [calendarConnections.businessId, calendarConnections.provider, calendarConnections.externalAccountId],
      set: {
        ownerUserId: input.userId,
        staffId: input.staffId,
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        ...(input.tokenExpiresAt !== undefined ? { tokenExpiresAt: new Date(input.tokenExpiresAt) } : {}),
        status: "connected",
        updatedAt: new Date(),
      },
    }).returning({ id: calendarConnections.id, staffId: calendarConnections.staffId });
    if (!connection) {
      throw new Error("Calendar connection could not be created.");
    }
    // Reconnecting with another Google account inserts a new row; retire the old business-wide one
    // so its dead token cannot block every booking.
    if (!connection.staffId) {
      const replaced = await tx.update(calendarConnections).set({ status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null, updatedAt: new Date() }).where(and(eq(calendarConnections.businessId, input.businessId), eq(calendarConnections.provider, input.provider), isNull(calendarConnections.staffId), ne(calendarConnections.id, connection.id), ne(calendarConnections.status, "disconnected"))).returning({ id: calendarConnections.id });
      if (replaced.length) {
        await tx.insert(auditLogs).values(replaced.map(({ id }) => ({ businessId: input.businessId, actorUserId: input.userId, eventType: "calendar_connection.disconnected", entityType: "calendar_connection", entityId: id, payload: { provider: input.provider, replacedBy: connection.id } })));
        await tx.delete(calendarBusyBlocks).where(and(eq(calendarBusyBlocks.businessId, input.businessId), inArray(calendarBusyBlocks.connectionId, replaced.map(({ id }) => id))));
        // The replaced connection's tokens are gone, so its calendar keeps the old events.
        await releaseCalendarAppointments(tx, { businessId: input.businessId, owner: null });
      }
    }
    await enqueueOutbox(tx, {
      topic: "calendar.reconcileBusiness",
      businessId: input.businessId,
      aggregateType: "calendar_connection",
      aggregateId: connection.id,
      dedupeKey: `calendar:${connection.id}:reconcile:${Date.now()}`,
      payload: { connectionId: connection.id },
    });
    return connection.id;
  });
  await recordProductEventBestEffort(context, {
    name: "integration.calendar_connected",
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    properties: { provider: input.provider, scope: input.staffId ? "staff" : "business" },
  });
  return connectionId;
}

// Postgres caps one statement at 65,535 bound values and a busy-block row binds up to six.
const BUSY_BLOCK_INSERT_CHUNK = 5_000;

export async function upsertBusyBlocks(
  context: DomainContext,
  input: { businessId: string; connectionId: string; calendarId: string; syncStartedAt?: Date; blocks: Array<{ startsAt: string; endsAt: string; externalEventId?: string; staffId?: string }> },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [connection] = await tx.select().from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).limit(1).for("update");
    if (!connection || connection.status === "disconnected" || connection.selectedCalendarId !== input.calendarId) throw new Error("Calendar selection changed during synchronization.");
    await tx.delete(calendarBusyBlocks).where(and(eq(calendarBusyBlocks.businessId, input.businessId), eq(calendarBusyBlocks.connectionId, input.connectionId)));
    const rows = input.blocks.map((block) => ({
      businessId: input.businessId,
      connectionId: input.connectionId,
      startsAt: new Date(block.startsAt),
      endsAt: new Date(block.endsAt),
      externalEventId: block.externalEventId,
      staffId: block.staffId,
    }));
    for (let index = 0; index < rows.length; index += BUSY_BLOCK_INSERT_CHUNK) await tx.insert(calendarBusyBlocks).values(rows.slice(index, index + BUSY_BLOCK_INSERT_CHUNK));
    await tx.update(calendarConnections).set({ status: "connected", lastSyncError: null, lastSyncedAt: input.syncStartedAt ?? new Date(), updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "calendar_connection",
      aggregateId: input.connectionId,
      dedupeKey: `calendar:${input.connectionId}:busy:${Date.now()}`,
      payload: { type: "knowledge.progressed", entityId: input.connectionId },
    });
  });
}

// Bookings made while no calendar covered them were marked not_required and never
// reach the calendar on their own. Queue them once a covering calendar syncs.
export async function queueUnsyncedAppointmentSyncs(
  context: DomainContext,
  input: { businessId: string; connectionId: string; now?: Date },
): Promise<number> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [connection] = await tx.select({ staffId: calendarConnections.staffId, selectedCalendarId: calendarConnections.selectedCalendarId, status: calendarConnections.status }).from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).limit(1);
    if (!connection?.selectedCalendarId || connection.status === "disconnected") return 0;
    // Calendar ids run to 255 characters; a hash keeps the key inside its 255-character column.
    const calendarKey = createHash("sha256").update(connection.selectedCalendarId).digest("hex").slice(0, 16);
    const pending = await tx.select({ id: appointments.id, revision: appointments.revision }).from(appointments).where(and(
      eq(appointments.businessId, input.businessId),
      eq(appointments.status, "confirmed"),
      eq(appointments.calendarSyncState, "not_required"),
      isNull(appointments.calendarExternalId),
      gt(appointments.endsAt, input.now ?? new Date()),
      connection.staffId ? eq(appointments.staffId, connection.staffId) : notOwnedByStaffCalendar(tx, input.businessId),
    ));
    for (const appointment of pending) {
      await enqueueOutbox(tx, {
        topic: "calendar.syncAppointment",
        businessId: input.businessId,
        aggregateType: "appointment",
        aggregateId: appointment.id,
        // One backfill per connection, calendar and revision: a calendar switch bumps the revision, so returning to an
        // earlier calendar writes released bookings again. The staff filter keeps a booking the job skips from requeueing.
        dedupeKey: `appointment:${appointment.id}:calendar:backfill:${input.connectionId}:${calendarKey}:${appointment.revision}`,
        payload: { appointmentId: appointment.id, action: "backfill" },
      });
    }
    return pending.length;
  });
}

export async function updateAppointmentSyncState(
  context: DomainContext,
  input: { businessId: string; appointmentId: string; state: string; externalEventId?: string; error?: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await updateAppointmentSyncStateInTransaction(tx, input);
  });
}

export async function updateAppointmentSyncStateInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; appointmentId: string; state: string; externalEventId?: string; error?: string },
): Promise<void> {
    const [appointment] = await tx.update(appointments).set({
      calendarSyncState: input.state,
      calendarExternalId: input.externalEventId,
      revision: sql`${appointments.revision} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId))).returning({ id: appointments.id, revision: appointments.revision, startsAt: appointments.startsAt, status: appointments.status });
    if (appointment) {
      await enqueueOutbox(tx, {
        topic: "realtime.publish",
        businessId: input.businessId,
        aggregateType: "appointment",
        aggregateId: appointment.id,
        dedupeKey: `appointment:${appointment.id}:updated:${appointment.revision}`,
        payload: { type: "appointment.updated", entityId: appointment.id, revision: appointment.revision },
      });
      // Every attempt bumps the revision, so keying on it would alert once per job retry. Key on the
      // time and status instead: a rescheduled or canceled appointment can alert again.
      if (input.error || input.state === "failed") await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "calendarSync", eventKey: `calendarSync:appointment:${appointment.id}:${appointment.startsAt.toISOString()}:${appointment.status}`, subject: "Calendar sync failed", body: "An appointment could not be synced to the connected calendar. Open integrations to review the connection." });
    }
}

export async function markCalendarConnectionSync(
  context: DomainContext,
  input: { businessId: string; connectionId: string; error: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const connection = await tx.update(calendarConnections).set({ status: "error", lastSyncError: input.error.slice(0, 2000), updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"))).returning({ id: calendarConnections.id });
    if (connection.length) await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "calendarSync", eventKey: `calendarSync:connection:${input.connectionId}`, subject: "Calendar connection needs attention", body: "LobbyStack could not sync the connected calendar. Open integrations to reconnect it." });
  });
}

/**
 * Forgets a connection's tokens and busy times. Returns its provider, or null
 * when the business has no such connection or it was already disconnected.
 */
export async function disconnectCalendarInTransaction(tx: DatabaseTransaction, input: { businessId: string; connectionId: string }): Promise<{ provider: string } | null> {
  const [disconnected] = await tx.update(calendarConnections).set({ status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"))).returning({ provider: calendarConnections.provider, staffId: calendarConnections.staffId });
  // Its bookings move to the connection that now owns them. The tokens are gone, so the calendar keeps its events.
  if (disconnected) await releaseCalendarAppointments(tx, { businessId: input.businessId, owner: disconnected.staffId });
  await tx.delete(calendarBusyBlocks).where(and(eq(calendarBusyBlocks.connectionId, input.connectionId), eq(calendarBusyBlocks.businessId, input.businessId)));
  return disconnected ? { provider: disconnected.provider } : null;
}

export async function disconnectCalendar(
  context: DomainContext,
  input: { userId: string; businessId: string; connectionId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const disconnected = await disconnectCalendarInTransaction(tx, input);
    if (disconnected) await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "calendar_connection.disconnected", entityType: "calendar_connection", entityId: input.connectionId, payload: { provider: disconnected.provider } });
  });
}

export type CalendarConnectionRow = { id: string; provider: string; externalAccountId: string; staffId: string | null; selectedCalendarId: string | null; status: string; lastSyncError: string | null; lastSyncedAt: Date | null; createdAt: Date; updatedAt: Date };

/** The business's calendar connections, oldest first, or just `connectionId`. Disconnected ones are left out. */
export async function listCalendarConnectionsInTransaction(tx: DatabaseTransaction, input: { businessId: string; connectionId?: string }): Promise<CalendarConnectionRow[]> {
  return await tx.select({ id: calendarConnections.id, provider: calendarConnections.provider, externalAccountId: calendarConnections.externalAccountId, staffId: calendarConnections.staffId, selectedCalendarId: calendarConnections.selectedCalendarId, status: calendarConnections.status, lastSyncError: calendarConnections.lastSyncError, lastSyncedAt: calendarConnections.lastSyncedAt, createdAt: calendarConnections.createdAt, updatedAt: calendarConnections.updatedAt }).from(calendarConnections).where(and(eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"), input.connectionId === undefined ? undefined : eq(calendarConnections.id, input.connectionId))).orderBy(asc(calendarConnections.createdAt), asc(calendarConnections.id));
}

export async function listCalendarConnections(
  context: DomainContext,
  input: { userId: string; businessId: string },
): Promise<CalendarConnectionRow[]> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await listCalendarConnectionsInTransaction(tx, input);
  });
}

export async function listCalendarStaff(
  context: DomainContext,
  input: { userId: string; businessId: string },
): Promise<Array<{ id: string; name: string }>> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await tx.select({ id: staff.id, name: staff.name }).from(staff).where(and(eq(staff.businessId, input.businessId), eq(staff.active, true))).orderBy(staff.name);
  });
}

/**
 * Makes a connection a staff member's calendar, or with null the business's,
 * and reads it again. A disconnected connection counts as not found.
 */
export async function assignCalendarStaffInTransaction(tx: DatabaseTransaction, input: { businessId: string; connectionId: string; staffId: string | null }): Promise<"assigned" | "staff_not_found" | "not_found"> {
  if (input.staffId) {
    const member = (await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, input.staffId), eq(staff.businessId, input.businessId), eq(staff.active, true))).limit(1))[0];
    if (!member) return "staff_not_found";
  }
  // A disconnected connection stays disconnected.
  const [current] = await tx.select({ staffId: calendarConnections.staffId, selectedCalendarId: calendarConnections.selectedCalendarId }).from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"))).limit(1).for("update");
  if (!current) return "not_found";
  // Assigned to a staff member, the connection keeps only their bookings; the rest leave its calendar.
  // Made business-wide, it keeps its staff member's bookings and the others' backfill into it.
  if (input.staffId && input.staffId !== current.staffId) await releaseCalendarAppointments(tx, { businessId: input.businessId, owner: current.staffId, keepStaffId: input.staffId, calendar: current.selectedCalendarId ? { connectionId: input.connectionId, calendarId: current.selectedCalendarId } : undefined });
  await tx.update(calendarConnections).set({ staffId: input.staffId, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
  await enqueueOutbox(tx, { topic: "calendar.reconcileBusiness", businessId: input.businessId, aggregateType: "calendar_connection", aggregateId: input.connectionId, dedupeKey: `calendar:${input.connectionId}:staff:${Date.now()}`, payload: { connectionId: input.connectionId } });
  return "assigned";
}

export async function assignCalendarStaff(
  context: DomainContext,
  input: { userId: string; businessId: string; connectionId: string; staffId: string | null },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const outcome = await assignCalendarStaffInTransaction(tx, input);
    if (outcome === "staff_not_found") throw new Error("Staff member not found.");
    if (outcome === "not_found") throw new Error("Calendar connection not found.");
  });
}

/**
 * Points a connection at one of its account's calendars and reads it from
 * scratch. Returns false when the business has no such connection, or it was
 * disconnected, which a selection must not bring back.
 */
export async function selectCalendarInTransaction(tx: DatabaseTransaction, input: { businessId: string; connectionId: string; calendarId: string }): Promise<boolean> {
  assertCertificationCalendar(input.calendarId);
  if (!input.calendarId.trim() || input.calendarId.length > 255) throw new Error("A valid calendar selection is required.");
  // A disconnected connection stays disconnected.
  const [current] = await tx.select({ staffId: calendarConnections.staffId, selectedCalendarId: calendarConnections.selectedCalendarId }).from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"))).limit(1).for("update");
  if (!current) return false;
  await tx.update(calendarConnections).set({ selectedCalendarId: input.calendarId.trim(), status: "syncing", lastSyncedAt: null, lastSyncError: null, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
  if (current.selectedCalendarId !== input.calendarId.trim()) await releaseCalendarAppointments(tx, { businessId: input.businessId, owner: current.staffId, calendar: current.selectedCalendarId ? { connectionId: input.connectionId, calendarId: current.selectedCalendarId } : undefined });
  await enqueueOutbox(tx, { topic: "calendar.reconcileBusiness", businessId: input.businessId, aggregateType: "calendar_connection", aggregateId: input.connectionId, dedupeKey: `calendar:${input.connectionId}:select:${Date.now()}`, payload: { connectionId: input.connectionId } });
  return true;
}

export async function selectCalendar(
  context: DomainContext,
  input: { userId: string; businessId: string; connectionId: string; calendarId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (!await selectCalendarInTransaction(tx, input)) throw new Error("Calendar connection not found.");
  });
}

// Upcoming appointments keep the event id of the calendar they were written to. When a connection
// stops writing a booking to that calendar (another calendar, another owner, or no connection), clear
// the id so the reconcile backfill writes the booking where it now belongs, and with `calendar`, delete
// the old event so that calendar doesn't keep a stale appointment. `owner` is the connection's staff
// member, or null for a business-wide one; a staff member's own calendar takes precedence over it.
async function releaseCalendarAppointments(tx: DatabaseTransaction, input: { businessId: string; owner: string | null; keepStaffId?: string; calendar?: { connectionId: string; calendarId: string } | undefined }): Promise<void> {
  const released = await tx.select({ id: appointments.id, eventId: appointments.calendarExternalId, revision: appointments.revision }).from(appointments).where(and(
    eq(appointments.businessId, input.businessId),
    eq(appointments.status, "confirmed"),
    gt(appointments.endsAt, new Date()),
    input.owner ? eq(appointments.staffId, input.owner) : notOwnedByStaffCalendar(tx, input.businessId),
    input.keepStaffId ? ne(appointments.staffId, input.keepStaffId) : undefined,
  )).for("update");
  if (!released.length) return;
  await tx.update(appointments).set({ calendarExternalId: null, calendarSyncState: "not_required", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.businessId, input.businessId), inArray(appointments.id, released.map(({ id }) => id))));
  const calendar = input.calendar;
  if (!calendar) return;
  for (const { id, eventId, revision } of released) {
    if (eventId) await enqueueOutbox(tx, { topic: "calendar.deleteEvent", businessId: input.businessId, aggregateType: "appointment", aggregateId: id, dedupeKey: `appointment:${id}:calendar:release:${calendar.connectionId}:${revision}`, payload: { appointmentId: id, ...calendar, eventId } });
  }
}

// The sync job writes a booking to its staff member's connection whenever one exists, even one with no calendar.
function notOwnedByStaffCalendar(tx: DatabaseTransaction, businessId: string) {
  return notExists(tx.select({ id: calendarConnections.id }).from(calendarConnections).where(and(eq(calendarConnections.businessId, businessId), eq(calendarConnections.staffId, appointments.staffId), ne(calendarConnections.status, "disconnected"))));
}

export async function refreshCalendar(
  context: DomainContext,
  input: { userId: string; businessId: string; connectionId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const connection = (await tx.select({ id: calendarConnections.id }).from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"))).limit(1))[0];
    if (!connection) throw new Error("Calendar connection not found.");
    await enqueueOutbox(tx, { topic: "calendar.reconcileBusiness", businessId: input.businessId, aggregateType: "calendar_connection", aggregateId: input.connectionId, dedupeKey: `calendar:${input.connectionId}:refresh:${Date.now()}`, payload: { connectionId: input.connectionId } });
  });
}

export async function discoverCalendars(
  context: DomainContext,
  input: {
    userId: string;
    businessId: string;
    connectionId: string;
    decryptAccessToken: (value: string) => string;
    resolveAccessToken?: (connectionId: string) => Promise<string>;
    listCalendars: (input: { accessToken: string }) => Promise<Array<{ id: string; summary: string; primary: boolean; accessRole?: string }>>;
  },
): Promise<Array<{ id: string; summary: string; primary: boolean; accessRole?: string; selected: boolean }>> {
  const connection = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return (await tx.select({ encryptedAccessToken: calendarConnections.encryptedAccessToken, selectedCalendarId: calendarConnections.selectedCalendarId, status: calendarConnections.status }).from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).limit(1))[0] ?? null;
  });
  if (!connection || connection.status === "disconnected" || (!connection.encryptedAccessToken && !input.resolveAccessToken)) throw new Error("Calendar connection requires reconnection before calendars can be discovered.");
  const accessToken = input.resolveAccessToken ? await input.resolveAccessToken(input.connectionId) : input.decryptAccessToken(connection.encryptedAccessToken!);
  const calendars = await input.listCalendars({ accessToken });
  return calendars.map((calendar) => ({ ...calendar, selected: calendar.id === connection.selectedCalendarId }));
}
