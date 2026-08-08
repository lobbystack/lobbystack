import { appointments, calls, messages, usageRecords } from "@lobbystack/db";
import { and, eq, gte, sql } from "drizzle-orm";

import { getAppPool, withDomainTransaction, type TransactionContext } from "./context";

export async function getAnalyticsOverview(input: {
  businessId: string;
  since: Date;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [callStats] = await db
        .select({
          totalCalls: sql<number>`count(*)::int`,
          completedCalls: sql<number>`count(*) filter (where ${calls.status} = 'completed')::int`,
          totalDurationSeconds: sql<number>`coalesce(sum(${calls.durationSeconds}), 0)::int`,
        })
        .from(calls)
        .where(and(eq(calls.businessId, input.businessId), gte(calls.startedAt, input.since)));

      const [messageStats] = await db
        .select({
          inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
          outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
        })
        .from(messages)
        .where(and(eq(messages.businessId, input.businessId), gte(messages.createdAt, input.since)));

      const [appointmentStats] = await db
        .select({
          created: sql<number>`count(*)::int`,
          cancelled: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')::int`,
        })
        .from(appointments)
        .where(
          and(eq(appointments.businessId, input.businessId), gte(appointments.createdAt, input.since)),
        );

      const usage = await db
        .select({
          usageKind: usageRecords.usageKind,
          quantity: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)::int`,
        })
        .from(usageRecords)
        .where(
          and(eq(usageRecords.businessId, input.businessId), gte(usageRecords.recordedAt, input.since)),
        )
        .groupBy(usageRecords.usageKind);

      return {
        calls: callStats ?? { totalCalls: 0, completedCalls: 0, totalDurationSeconds: 0 },
        messages: messageStats ?? { inbound: 0, outbound: 0 },
        appointments: appointmentStats ?? { created: 0, cancelled: 0 },
        usage,
      };
    },
  );
}

export async function getDailyCallVolume(input: {
  businessId: string;
  days?: number;
  pool?: TransactionContext["pool"];
}) {
  const days = input.days ?? 14;

  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (_db, client) => {
      const result = await client.query<{ day: string; count: string }>(
        `SELECT date_trunc('day', started_at)::date::text AS day, count(*)::text AS count
         FROM app.calls
         WHERE business_id = $1
           AND started_at >= now() - ($2::int || ' days')::interval
         GROUP BY 1
         ORDER BY 1 ASC`,
        [input.businessId, days],
      );

      return result.rows.map((row) => ({ day: row.day, count: Number(row.count) }));
    },
  );
}
