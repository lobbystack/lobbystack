import { and, eq, ne, sql } from "drizzle-orm";
import { assertCertificationCalendar } from "@lobbystack/shared";

import { appointments, calendarBusyBlocks, calendarConnections, enqueueOutbox, staff, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction } from "./notifications";

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
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [connection] = await tx.insert(calendarConnections).values({
      businessId: input.businessId,
      ownerUserId: input.userId,
      provider: input.provider,
      externalAccountId: input.externalAccountId,
      ...(input.staffId !== undefined ? { staffId: input.staffId } : {}),
      ...(input.encryptedAccessToken !== undefined ? { encryptedAccessToken: input.encryptedAccessToken } : {}),
      ...(input.encryptedRefreshToken !== undefined ? { encryptedRefreshToken: input.encryptedRefreshToken } : {}),
      ...(input.tokenExpiresAt !== undefined ? { tokenExpiresAt: new Date(input.tokenExpiresAt) } : {}),
      status: "connected",
    }).onConflictDoUpdate({
      target: [calendarConnections.provider, calendarConnections.externalAccountId],
      set: {
        ownerUserId: input.userId,
        ...(input.staffId !== undefined ? { staffId: input.staffId } : {}),
        ...(input.encryptedAccessToken !== undefined ? { encryptedAccessToken: input.encryptedAccessToken } : {}),
        ...(input.encryptedRefreshToken !== undefined ? { encryptedRefreshToken: input.encryptedRefreshToken } : {}),
        ...(input.tokenExpiresAt !== undefined ? { tokenExpiresAt: new Date(input.tokenExpiresAt) } : {}),
        status: "connected",
        updatedAt: new Date(),
      },
    }).returning({ id: calendarConnections.id });
    if (!connection) {
      throw new Error("Calendar connection could not be created.");
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
}

export async function upsertBusyBlocks(
  context: DomainContext,
  input: { businessId: string; connectionId: string; calendarId?: string; markSynced?: boolean; syncStartedAt?: Date; blocks: Array<{ startsAt: string; endsAt: string; externalEventId?: string; staffId?: string }> },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [connection] = await tx.select().from(calendarConnections).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).limit(1).for("update");
    if (!connection || connection.status === "disconnected" || (input.calendarId !== undefined && connection.selectedCalendarId !== input.calendarId)) throw new Error("Calendar selection changed during synchronization.");
    await tx.delete(calendarBusyBlocks).where(and(eq(calendarBusyBlocks.businessId, input.businessId), eq(calendarBusyBlocks.connectionId, input.connectionId)));
    if (input.blocks.length > 0) {
      await tx.insert(calendarBusyBlocks).values(input.blocks.map((block) => ({
        businessId: input.businessId,
        connectionId: input.connectionId,
        startsAt: new Date(block.startsAt),
        endsAt: new Date(block.endsAt),
        ...(block.externalEventId !== undefined ? { externalEventId: block.externalEventId } : {}),
        ...(block.staffId !== undefined ? { staffId: block.staffId } : {}),
      })));
    }
    if (input.markSynced) await tx.update(calendarConnections).set({ status: "connected", lastSyncError: null, lastSyncedAt: input.syncStartedAt ?? new Date(), updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
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
      ...(input.externalEventId !== undefined ? { calendarExternalId: input.externalEventId } : {}),
      revision: sql`${appointments.revision} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId))).returning({ id: appointments.id, revision: appointments.revision });
    if (appointment) {
      await enqueueOutbox(tx, {
        topic: "realtime.publish",
        businessId: input.businessId,
        aggregateType: "appointment",
        aggregateId: appointment.id,
        dedupeKey: `appointment:${appointment.id}:updated:${appointment.revision}`,
        payload: { type: "appointment.updated", entityId: appointment.id, revision: appointment.revision },
      });
      if (input.error || input.state === "failed") await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "calendarSync", eventKey: `calendarSync:appointment:${appointment.id}:${appointment.revision}`, subject: "Calendar sync failed", body: "An appointment could not be synced to the connected calendar. Open integrations to review the connection." });
    }
}

export async function markCalendarConnectionSync(
  context: DomainContext,
  input: { businessId: string; connectionId: string; error?: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const connection = await tx.update(calendarConnections).set({
      status: input.error ? "error" : "connected",
      ...(input.error ? { lastSyncError: input.error.slice(0, 2000) } : { lastSyncError: null }),
      ...(!input.error ? { lastSyncedAt: new Date() } : {}),
      updatedAt: new Date(),
    }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected"))).returning({ id: calendarConnections.id });
    if (connection.length && input.error) await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "calendarSync", eventKey: `calendarSync:connection:${input.connectionId}`, subject: "Calendar connection needs attention", body: "LobbyStack could not sync the connected calendar. Open integrations to reconnect it." });
  });
}

export async function disconnectCalendar(
  context: DomainContext,
  input: { userId: string; businessId: string; connectionId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await tx.update(calendarConnections).set({ status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
    await tx.delete(calendarBusyBlocks).where(and(eq(calendarBusyBlocks.connectionId, input.connectionId), eq(calendarBusyBlocks.businessId, input.businessId)));
  });
}

export async function listCalendarConnections(
  context: DomainContext,
  input: { userId: string; businessId: string },
): Promise<Array<{ id: string; provider: string; externalAccountId: string; staffId: string | null; selectedCalendarId: string | null; status: string; lastSyncError: string | null; lastSyncedAt: Date | null; updatedAt: Date }>> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await tx.select({ id: calendarConnections.id, provider: calendarConnections.provider, externalAccountId: calendarConnections.externalAccountId, staffId: calendarConnections.staffId, selectedCalendarId: calendarConnections.selectedCalendarId, status: calendarConnections.status, lastSyncError: calendarConnections.lastSyncError, lastSyncedAt: calendarConnections.lastSyncedAt, updatedAt: calendarConnections.updatedAt }).from(calendarConnections).where(and(eq(calendarConnections.businessId, input.businessId), ne(calendarConnections.status, "disconnected")));
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

export async function assignCalendarStaff(
  context: DomainContext,
  input: { userId: string; businessId: string; connectionId: string; staffId: string | null },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (input.staffId) {
      const member = (await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, input.staffId), eq(staff.businessId, input.businessId), eq(staff.active, true))).limit(1))[0];
      if (!member) throw new Error("Staff member not found.");
    }
    const changed = await tx.update(calendarConnections).set({ staffId: input.staffId, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).returning({ id: calendarConnections.id });
    if (!changed.length) throw new Error("Calendar connection not found.");
    await enqueueOutbox(tx, { topic: "calendar.reconcileBusiness", businessId: input.businessId, aggregateType: "calendar_connection", aggregateId: input.connectionId, dedupeKey: `calendar:${input.connectionId}:staff:${Date.now()}`, payload: { connectionId: input.connectionId } });
  });
}

export async function selectCalendar(
  context: DomainContext,
  input: { userId: string; businessId: string; connectionId: string; calendarId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    assertCertificationCalendar(input.calendarId);
    if (!input.calendarId.trim() || input.calendarId.length > 255) throw new Error("A valid calendar selection is required.");
    const changed = await tx.update(calendarConnections).set({ selectedCalendarId: input.calendarId.trim(), status: "syncing", lastSyncedAt: null, lastSyncError: null, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).returning({ id: calendarConnections.id });
    if (!changed.length) throw new Error("Calendar connection not found.");
    await enqueueOutbox(tx, { topic: "calendar.reconcileBusiness", businessId: input.businessId, aggregateType: "calendar_connection", aggregateId: input.connectionId, dedupeKey: `calendar:${input.connectionId}:select:${Date.now()}`, payload: { connectionId: input.connectionId } });
  });
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
