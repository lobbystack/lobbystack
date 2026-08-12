import { and, eq, sql } from "drizzle-orm";

import { appointments, calendarBusyBlocks, calendarConnections, enqueueOutbox, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction } from "./notifications";

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
  input: { businessId: string; connectionId: string; blocks: Array<{ startsAt: string; endsAt: string; externalEventId?: string; staffId?: string }> },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
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
  });
}

export async function markCalendarConnectionSync(
  context: DomainContext,
  input: { businessId: string; connectionId: string; error?: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const connection = await tx.update(calendarConnections).set({
      status: input.error ? "error" : "connected",
      ...(input.error ? { lastSyncError: input.error.slice(0, 2000) } : { lastSyncError: null }),
      updatedAt: new Date(),
    }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId))).returning({ id: calendarConnections.id });
    if (connection.length && input.error) await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "calendarSync", eventKey: `calendarSync:connection:${input.connectionId}`, subject: "Calendar connection needs attention", body: "LobbyStack could not sync the connected calendar. Open integrations to reconnect it." });
  });
}

export async function disconnectCalendar(
  context: DomainContext,
  input: { userId: string; businessId: string; connectionId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    await tx.update(calendarConnections).set({ status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null, updatedAt: new Date() }).where(and(eq(calendarConnections.id, input.connectionId), eq(calendarConnections.businessId, input.businessId)));
  });
}
