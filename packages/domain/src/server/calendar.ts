import { calendarConnections, calendarSyncEvents } from "@lobbystack/db";
import { and, eq } from "drizzle-orm";

import {
  enqueueSideEffect,
  getAppPool,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

export async function createCalendarOAuthState(input: {
  businessId: string;
  userId: string;
  provider: string;
  pool?: TransactionContext["pool"];
}) {
  const state = `${input.businessId}:${input.userId}:${Date.now()}`;
  return { state, redirectUrl: `/api/calendar/oauth/${input.provider}/callback` };
}

export async function connectCalendar(input: {
  businessId: string;
  provider: string;
  providerAccountId: string;
  calendarId: string;
  calendarName?: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string;
  tokenExpiresAt?: Date;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [connection] = await db
        .insert(calendarConnections)
        .values({
          businessId: input.businessId,
          provider: input.provider,
          providerAccountId: input.providerAccountId,
          calendarId: input.calendarId,
          ...(input.calendarName ? { calendarName: input.calendarName } : {}),
          accessTokenEncrypted: input.accessTokenEncrypted,
          ...(input.refreshTokenEncrypted
            ? { refreshTokenEncrypted: input.refreshTokenEncrypted }
            : {}),
          ...(input.tokenExpiresAt ? { tokenExpiresAt: input.tokenExpiresAt } : {}),
          syncStatus: "active",
        })
        .returning({ id: calendarConnections.id });

      return connection ?? null;
    },
  );
}

export async function listCalendarConnections(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select({
          id: calendarConnections.id,
          provider: calendarConnections.provider,
          calendarId: calendarConnections.calendarId,
          calendarName: calendarConnections.calendarName,
          syncStatus: calendarConnections.syncStatus,
          isPrimary: calendarConnections.isPrimary,
        })
        .from(calendarConnections)
        .where(eq(calendarConnections.businessId, input.businessId)),
  );
}

export async function queueAppointmentSync(input: {
  businessId: string;
  appointmentId: string;
  connectionId: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      await db.insert(calendarSyncEvents).values({
        businessId: input.businessId,
        connectionId: input.connectionId,
        providerEventId: `pending:${input.appointmentId}`,
        appointmentId: input.appointmentId,
        action: "upsert",
        status: "pending",
      });

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "calendar.syncAppointment",
        payload: {
          businessId: input.businessId,
          appointmentId: input.appointmentId,
          connectionId: input.connectionId,
        },
        dedupeKey: `calendar:${input.appointmentId}:${input.connectionId}`,
      });
    },
  );
}

export async function reconcileBusinessCalendars(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "calendar.reconcileBusiness",
        payload: { businessId: input.businessId },
        dedupeKey: `calendar:reconcile:${input.businessId}`,
      });
    },
  );
}

export async function disconnectCalendar(input: {
  businessId: string;
  connectionId: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      await db
        .update(calendarConnections)
        .set({ syncStatus: "disconnected", updatedAt: new Date() })
        .where(
          and(
            eq(calendarConnections.id, input.connectionId),
            eq(calendarConnections.businessId, input.businessId),
          ),
        );
    },
  );
}
