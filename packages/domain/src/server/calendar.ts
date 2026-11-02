import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lt, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { assertCertificationCalendar } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { appointments, auditLogs, calendarBusyBlocks, calendarConnections, enqueueOutbox, staff, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import { isBookingCalendarProvider, pickCalendarWriter } from "../calendarWriter";
import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction, saveAppointmentVideoUrlInTransaction } from "./notifications";
import { recordProductEventBestEffort } from "./productEvents";

export async function resolveCalendarAccessToken(context: DomainContext, input: {
  businessId: string;
  connectionId: string;
  decryptToken: (value: string) => string;
  encryptToken: (value: string) => string;
  refreshAccessToken: (input: { refreshToken: string }) => Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }>;
  now?: Date;
  forceRefresh?: boolean;
  /** Also a disconnected connection that kept its tokens to cancel its bookings and remove its webhook. */
  retired?: boolean;
}): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // Serializes concurrent scheduled/appointment refreshes for one account.
    const [connection] = await tx.select().from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).limit(1).for("update");
    const kept = connection?.encryptedAccessToken !== null || connection?.encryptedRefreshToken !== null;
    const usable = connection && connection.businessId === input.businessId && (connection.status !== "disconnected" || (input.retired === true && kept));
    if (!connection || !usable) throw new Error("Calendar connection is unavailable.");
    const now = input.now ?? new Date();
    if (!input.forceRefresh && connection.encryptedAccessToken && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > now.getTime() + 60_000) return input.decryptToken(connection.encryptedAccessToken);
    if (!connection.encryptedRefreshToken) throw Object.assign(new Error("Calendar authorization requires reconnection."), { reconnectRequired: true });
    const refreshed = await input.refreshAccessToken({ refreshToken: input.decryptToken(connection.encryptedRefreshToken) });
    if (!refreshed.accessToken || !Number.isFinite(refreshed.expiresIn) || refreshed.expiresIn <= 0) throw new Error("The calendar provider returned an invalid refreshed token.");
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
    const writers = await writerSnapshot(tx, input.businessId);
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
        // A disconnect forgot the webhook's secret, so a revived row registers a webhook again. registerWebhook
        // replaces the old one, which posts to this same URL, so nothing is left in Cal.com. A connected row keeps its own.
        externalWebhookId: sql`case when ${calendarConnections.status} = 'disconnected' then null else ${calendarConnections.externalWebhookId} end`,
        encryptedWebhookSecret: sql`case when ${calendarConnections.status} = 'disconnected' then null else ${calendarConnections.encryptedWebhookSecret} end`,
        // A revived row picks its calendar again. Kept, the old one would outrank Google at once and move its bookings.
        selectedCalendarId: sql`case when ${calendarConnections.status} = 'disconnected' then null else ${calendarConnections.selectedCalendarId} end`,
        disconnectedAt: null,
        status: "connected",
        updatedAt: new Date(),
      },
    }).returning({ id: calendarConnections.id, staffId: calendarConnections.staffId });
    if (!connection) {
      throw new Error("Calendar connection could not be created.");
    }
    // Reconnecting with another Google account inserts a new row; retire the old business-wide one
    // so its dead token cannot block every booking.
    let replaced: RetiredRow[] = [];
    if (!connection.staffId) {
      replaced = await retireConnections(tx, input.businessId, and(eq(calendarConnections.provider, input.provider), isNull(calendarConnections.staffId), ne(calendarConnections.id, connection.id)));
      if (replaced.length) {
        await tx.insert(auditLogs).values(replaced.map(({ id }) => ({ businessId: input.businessId, actorUserId: input.userId, eventType: "calendar_connection.disconnected", entityType: "calendar_connection", entityId: id, payload: { provider: input.provider, replacedBy: connection.id } })));
        await tx.delete(calendarBusyBlocks).where(and(eq(calendarBusyBlocks.businessId, input.businessId), inArray(calendarBusyBlocks.connectionId, replaced.map(({ id }) => id))));
      }
    }
    // Only the bookings whose writer changed move, so a Cal.com connection that keeps writing keeps its bookings.
    await finishRetirement(tx, input.businessId, replaced, await releaseMovedAppointments(tx, input.businessId, writers));
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
  input: { businessId: string; appointmentId: string; state: string; externalEventId?: string; videoUrl?: string | null; error?: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await updateAppointmentSyncStateInTransaction(tx, input);
  });
}

export async function updateAppointmentSyncStateInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; appointmentId: string; state: string; externalEventId?: string; videoUrl?: string | null; error?: string },
): Promise<void> {
    if (input.videoUrl !== undefined) await saveAppointmentVideoUrlInTransaction(tx, { businessId: input.businessId, appointmentId: input.appointmentId, videoUrl: input.videoUrl });
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
  const writers = await writerSnapshot(tx, input.businessId);
  const retired = await retireConnections(tx, input.businessId, eq(calendarConnections.id, input.connectionId));
  const [disconnected] = retired;
  // The bookings it held move to the connection that writes them now. Its Google calendar keeps their events;
  // its Cal.com bookings are cancelled by the retirement job, with the tokens kept for that.
  if (disconnected) await finishRetirement(tx, input.businessId, retired, await releaseMovedAppointments(tx, input.businessId, writers));
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
  // Assigned to a staff member, the connection writes only their bookings; made business-wide, it can take over
  // everyone's. Either way only the bookings whose writer changes move, each out of the calendar that held it.
  const writers = await writerSnapshot(tx, input.businessId);
  await tx.update(calendarConnections).set({ staffId: input.staffId, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
  await releaseMovedAppointments(tx, input.businessId, writers);
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
  const writers = await writerSnapshot(tx, input.businessId);
  await tx.update(calendarConnections).set({ selectedCalendarId: input.calendarId.trim(), status: "syncing", lastSyncedAt: null, lastSyncError: null, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
  // Bookings leave the calendar that held them only when their writer or its calendar changes. Picking a calendar
  // can make this connection the writer, as when a Cal.com event type takes over from Google.
  await releaseMovedAppointments(tx, input.businessId, writers);
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

type WriterRow = { id: string; provider: string; staffId: string | null; selectedCalendarId: string | null; status: string };

/** Every connection of the business, live or not, to compare who writes each booking before and after a change. */
async function writerSnapshot(tx: DatabaseTransaction, businessId: string): Promise<WriterRow[]> {
  return await tx.select({ id: calendarConnections.id, provider: calendarConnections.provider, staffId: calendarConnections.staffId, selectedCalendarId: calendarConnections.selectedCalendarId, status: calendarConnections.status }).from(calendarConnections).where(eq(calendarConnections.businessId, businessId));
}

/** The connection the sync job writes a staff member's bookings to, as pickCalendarWriter ranks the live ones covering them. */
function writerFor(rows: WriterRow[], staffId: string): WriterRow | undefined {
  return pickCalendarWriter(rows.filter((row) => row.status !== "disconnected" && (row.staffId === null || row.staffId === staffId)));
}

// Upcoming appointments keep the event id of the calendar they were written to. When a change moves an
// appointment to another writer, or its writer to another calendar, clear the id so the reconcile backfill
// writes it where it now belongs, and delete the old event, on the old writer, so that calendar doesn't keep
// a stale appointment. A writer the change disconnected has no tokens, so its calendar keeps the event.
/** A booking a disconnected Cal.com connection made, which its retirement job cancels in Cal.com. */
export type RetiredBooking = { connectionId: string; calendarId: string; appointmentId: string; eventId: string };

async function releaseMovedAppointments(tx: DatabaseTransaction, businessId: string, before: WriterRow[]): Promise<RetiredBooking[]> {
  const after = await writerSnapshot(tx, businessId);
  const moves = (rows: Array<{ id: string; staffId: string }>) => rows.flatMap((appointment) => {
    const was = writerFor(before, appointment.staffId);
    const now = writerFor(after, appointment.staffId);
    return was?.id === now?.id && was?.selectedCalendarId === now?.selectedCalendarId ? [] : [{ id: appointment.id, was }];
  });
  // Work the moved set out first, then lock only those rows and read their event ids under the lock.
  const candidates = moves(await tx.select({ id: appointments.id, staffId: appointments.staffId }).from(appointments).where(and(eq(appointments.businessId, businessId), eq(appointments.status, "confirmed"), gt(appointments.endsAt, new Date()))));
  if (!candidates.length) return [];
  const locked = await tx.select({ id: appointments.id, staffId: appointments.staffId, eventId: appointments.calendarExternalId, revision: appointments.revision }).from(appointments).where(and(eq(appointments.businessId, businessId), eq(appointments.status, "confirmed"), inArray(appointments.id, candidates.map(({ id }) => id)))).for("update");
  const moved = moves(locked).map((move) => ({ ...move, ...locked.find((row) => row.id === move.id)! }));
  if (!moved.length) return [];
  await tx.update(appointments).set({ calendarExternalId: null, videoUrl: null, calendarSyncState: "not_required", revision: sql`${appointments.revision} + 1`, updatedAt: new Date() }).where(and(eq(appointments.businessId, businessId), inArray(appointments.id, moved.map(({ id }) => id))));
  const retired: RetiredBooking[] = [];
  for (const { id, eventId, revision, was } of moved) {
    if (!eventId || !was?.selectedCalendarId) continue;
    const live = after.some((row) => row.id === was.id && row.status !== "disconnected");
    if (live) await enqueueOutbox(tx, { topic: "calendar.deleteEvent", businessId, aggregateType: "appointment", aggregateId: id, dedupeKey: `appointment:${id}:calendar:release:${was.id}:${revision}`, payload: { appointmentId: id, connectionId: was.id, calendarId: was.selectedCalendarId, eventId } });
    // A Cal.com booking stays bookable on its public page, so its retirement job cancels it while the tokens last.
    else if (isBookingCalendarProvider(was.provider)) retired.push({ connectionId: was.id, calendarId: was.selectedCalendarId, appointmentId: id, eventId });
  }
  return retired;
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
    listCalendars: (input: { accessToken: string }) => Promise<Array<{ id: string; summary: string; primary: boolean; accessRole?: string; unwritableReason?: string }>>;
  },
): Promise<Array<{ id: string; summary: string; primary: boolean; accessRole?: string; unwritableReason?: string; selected: boolean }>> {
  const connection = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return (await tx.select({ encryptedAccessToken: calendarConnections.encryptedAccessToken, selectedCalendarId: calendarConnections.selectedCalendarId, status: calendarConnections.status }).from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).limit(1))[0] ?? null;
  });
  if (!connection || connection.status === "disconnected" || (!connection.encryptedAccessToken && !input.resolveAccessToken)) throw new Error("Calendar connection requires reconnection before calendars can be discovered.");
  const accessToken = input.resolveAccessToken ? await input.resolveAccessToken(input.connectionId) : input.decryptAccessToken(connection.encryptedAccessToken!);
  const calendars = await input.listCalendars({ accessToken });
  return calendars.map((calendar) => ({ ...calendar, selected: calendar.id === connection.selectedCalendarId }));
}

// Cal.com webhooks. Each Cal.com connection registers one, at a URL that names
// the connection, so a booking made in Cal.com syncs busy time right away.

/** The business of a live Cal.com or Calendly connection, found before any business context exists, or null. */
export async function resolveBusinessByCalendarWebhook(context: DomainContext, connectionId: string): Promise<string | null> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => (await tx.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_calendar_webhook(${connectionId}::uuid) as business_id`)).rows[0]?.business_id ?? null);
}

/** The connection's provider and webhook, or null once it's disconnected. */
export async function getCalendarWebhook(context: DomainContext, input: { businessId: string; connectionId: string }): Promise<{ provider: string; externalWebhookId: string | null; encryptedWebhookSecret: string | null } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => (await tx.select({ provider: calendarConnections.provider, externalWebhookId: calendarConnections.externalWebhookId, encryptedWebhookSecret: calendarConnections.encryptedWebhookSecret }).from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"))).limit(1))[0] ?? null);
}

/** How long a sync may take to register a webhook before another may try. */
export const WEBHOOK_REGISTRATION_LEASE_MS = 2 * 60_000;

/**
 * Registers the connection's webhook once. A sync first claims a short lease
 * on the row, calls `register` outside any transaction, then saves the webhook
 * only while it still holds the lease and the connection is live. Another sync
 * that finds the lease taken gets "busy" and registers nothing. A webhook
 * the save can't keep, because the connection was disconnected meanwhile or
 * the lease ran out, goes to `discard`.
 */
export async function registerCalendarWebhookOnce(context: DomainContext, input: {
  businessId: string;
  connectionId: string;
  register: () => Promise<{ externalWebhookId: string; encryptedWebhookSecret: string }>;
  discard: (externalWebhookId: string) => Promise<void>;
  now?: () => Date;
}): Promise<"registered" | "exists" | "busy" | "disconnected"> {
  const now = input.now ?? (() => new Date());
  const scope = { businessId: input.businessId, actorType: "worker" as const };
  const row = and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId));
  const lease = new Date(now().getTime() + WEBHOOK_REGISTRATION_LEASE_MS);
  const claimed = await withBusinessTransaction(context.db, scope, async (tx) => {
    const won = await tx.update(calendarConnections).set({ webhookRegistrationUntil: lease }).where(and(row, ne(calendarConnections.status, "disconnected"), isNull(calendarConnections.externalWebhookId), or(isNull(calendarConnections.webhookRegistrationUntil), lt(calendarConnections.webhookRegistrationUntil, now())))).returning({ id: calendarConnections.id });
    if (won.length) return "claimed" as const;
    const [current] = await tx.select({ status: calendarConnections.status, externalWebhookId: calendarConnections.externalWebhookId }).from(calendarConnections).where(row).limit(1);
    return !current || current.status === "disconnected" ? "disconnected" as const : current.externalWebhookId ? "exists" as const : "busy" as const;
  });
  if (claimed !== "claimed") return claimed;
  const holdsLease = and(row, eq(calendarConnections.webhookRegistrationUntil, lease));
  let webhook: { externalWebhookId: string; encryptedWebhookSecret: string };
  try {
    webhook = await input.register();
  } catch (error) {
    await withBusinessTransaction(context.db, scope, async (tx) => { await tx.update(calendarConnections).set({ webhookRegistrationUntil: null }).where(holdsLease); });
    throw error;
  }
  const saved = await withBusinessTransaction(context.db, scope, async (tx) => await tx.update(calendarConnections).set({ externalWebhookId: webhook.externalWebhookId, encryptedWebhookSecret: webhook.encryptedWebhookSecret, webhookRegistrationUntil: null, updatedAt: new Date() }).where(and(holdsLease, ne(calendarConnections.status, "disconnected"))).returning({ id: calendarConnections.id }));
  if (saved.length) return "registered";
  await input.discard(webhook.externalWebhookId).catch(() => undefined);
  return "disconnected";
}

/**
 * A disconnected connection that still holds the tokens its retirement needs,
 * which resolveCalendarAccessToken reads with `retired`, and its webhook if it
 * has one. Null once the tokens are gone, or when the connection was revived.
 */
export async function getRetiredCalendarConnection(context: DomainContext, input: { businessId: string; connectionId: string }): Promise<{ provider: string; externalWebhookId: string | null } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({ provider: calendarConnections.provider, externalWebhookId: calendarConnections.externalWebhookId, accessToken: calendarConnections.encryptedAccessToken, refreshToken: calendarConnections.encryptedRefreshToken }).from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), eq(calendarConnections.status, "disconnected"))).limit(1);
    return row && (row.accessToken !== null || row.refreshToken !== null) ? { provider: row.provider, externalWebhookId: row.externalWebhookId } : null;
  });
}

/** How long a disconnected connection may keep tokens for a webhook removal before the sweep forgets them. */
export const RETIRED_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60_000;

/**
 * Forgets the tokens and webhook of every connection, in any business,
 * disconnected more than a week ago, whatever became of its retirement job.
 * Its webhook's deliveries reach a disconnected connection, which the route
 * ignores. Returns how many it cleared.
 */
export async function forgetStaleRetiredCalendarTokens(context: DomainContext, input: { now?: Date } = {}): Promise<number> {
  const cutoff = new Date((input.now ?? new Date()).getTime() - RETIRED_TOKEN_RETENTION_MS);
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => Number((await tx.execute<{ cleared: number }>(sql`select app.forget_stale_retired_calendar_tokens(${cutoff.toISOString()}::timestamptz) as cleared`)).rows[0]?.cleared ?? 0));
}

/** Forgets a disconnected connection's tokens and webhook once the webhook is gone. A reconnected connection keeps them. */
export async function forgetRetiredCalendarWebhook(context: DomainContext, input: { businessId: string; connectionId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(calendarConnections).set({ encryptedAccessToken: null, encryptedRefreshToken: null, externalWebhookId: null, encryptedWebhookSecret: null, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), eq(calendarConnections.status, "disconnected")));
  });
}

/** Syncs the connection after a verified delivery. `deliveryKey` keeps a redelivery from queuing twice. */
export async function queueCalendarWebhookSync(context: DomainContext, input: { businessId: string; connectionId: string; deliveryKey: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await enqueueOutbox(tx, { topic: "calendar.reconcileBusiness", businessId: input.businessId, aggregateType: "calendar_connection", aggregateId: input.connectionId, dedupeKey: `calendar:${input.connectionId}:webhook:${input.deliveryKey}`, payload: { connectionId: input.connectionId, scope: "connection" } });
  });
}

type RetiredRow = { id: string; provider: string; staffId: string | null; externalWebhookId: string | null };

/** Disconnects the connections `where` matches in the business. finishRetirement then forgets or keeps their tokens. */
async function retireConnections(tx: DatabaseTransaction, businessId: string, where: SQL | undefined): Promise<RetiredRow[]> {
  return await tx.update(calendarConnections).set({ status: "disconnected", disconnectedAt: new Date(), encryptedWebhookSecret: null, webhookRegistrationUntil: null, updatedAt: new Date() }).where(and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected"), where)).returning({ id: calendarConnections.id, provider: calendarConnections.provider, staffId: calendarConnections.staffId, externalWebhookId: calendarConnections.externalWebhookId });
}

/**
 * Forgets the retired connections' tokens, except a Cal.com connection with a
 * webhook to remove or bookings to cancel there. That one keeps its tokens for
 * the calendar.retireWebhook job, which runs only once this commits.
 */
async function finishRetirement(tx: DatabaseTransaction, businessId: string, retired: RetiredRow[], bookings: RetiredBooking[]): Promise<void> {
  const forget: string[] = [];
  for (const row of retired) {
    const cancel = bookings.filter((booking) => booking.connectionId === row.id).map(({ appointmentId, calendarId, eventId }) => ({ appointmentId, calendarId, eventId }));
    if (!isBookingCalendarProvider(row.provider) || (!row.externalWebhookId && !cancel.length)) { forget.push(row.id); continue; }
    await enqueueOutbox(tx, { topic: "calendar.retireWebhook", businessId, aggregateType: "calendar_connection", aggregateId: row.id, dedupeKey: `calendar:${row.id}:retire:${Date.now()}`, payload: { connectionId: row.id, cancel } });
  }
  if (forget.length) await tx.update(calendarConnections).set({ encryptedAccessToken: null, encryptedRefreshToken: null }).where(and(eq(calendarConnections.businessId, businessId), inArray(calendarConnections.id, forget)));
}

