import { and, count, eq, gte, lt, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { appointments, calls, messages, unitEconomicsRollups, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export const analyticsGranularities = ["hour", "day", "week", "month", "year"] as const;
export type AnalyticsGranularity = (typeof analyticsGranularities)[number];

const analyticsGranularitySql = {
  hour: sql`'hour'`,
  day: sql`'day'`,
  week: sql`'week'`,
  month: sql`'month'`,
  year: sql`'year'`,
} satisfies Record<AnalyticsGranularity, SQL>;

/** @internal Exported for focused SQL regression coverage. */
export function analyticsBucketExpression(column: SQLWrapper, granularity: AnalyticsGranularity): SQL<Date> {
  return sql<Date>`date_trunc(${analyticsGranularitySql[granularity]}, ${column})`;
}

/** @internal Exported for focused SQL regression coverage. */
export function analyticsMonthStartExpression(column: SQLWrapper): SQL<Date> {
  return sql<Date>`to_date(${column} || '-01', 'YYYY-MM-DD')`;
}

export type AnalyticsInput = {
  userId: string;
  businessId: string;
  from: Date;
  to: Date;
  previousFrom: Date;
  granularity: AnalyticsGranularity;
};

function bucketKey(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export async function getAnalytics(context: DomainContext, input: AnalyticsInput) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const callBucket = analyticsBucketExpression(calls.startedAt, input.granularity);
    const appointmentBucket = analyticsBucketExpression(appointments.startsAt, input.granularity);
    const messageBucket = analyticsBucketExpression(messages.createdAt, input.granularity);
    const economicsMonth = analyticsMonthStartExpression(unitEconomicsRollups.monthKey);
    const callFilter = and(eq(calls.businessId, input.businessId), gte(calls.startedAt, input.from), lt(calls.startedAt, input.to));
    const appointmentFilter = and(eq(appointments.businessId, input.businessId), gte(appointments.startsAt, input.from), lt(appointments.startsAt, input.to));
    const messageFilter = and(eq(messages.businessId, input.businessId), gte(messages.createdAt, input.from), lt(messages.createdAt, input.to));
    const currentCalls = await tx.select({ count: count() }).from(calls).where(callFilter);
    const previousCalls = await tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, input.businessId), gte(calls.startedAt, input.previousFrom), lt(calls.startedAt, input.from)));
    const currentAppointments = await tx.select({ count: count() }).from(appointments).where(appointmentFilter);
    const previousAppointments = await tx.select({ count: count() }).from(appointments).where(and(eq(appointments.businessId, input.businessId), gte(appointments.startsAt, input.previousFrom), lt(appointments.startsAt, input.from)));
    const currentMessages = await tx.select({ count: count() }).from(messages).where(messageFilter);
    const previousMessages = await tx.select({ count: count() }).from(messages).where(and(eq(messages.businessId, input.businessId), gte(messages.createdAt, input.previousFrom), lt(messages.createdAt, input.from)));
    const duration = await tx.select({ averageSeconds: sql<number>`coalesce(avg(${calls.providerDurationSeconds}), 0)` }).from(calls).where(callFilter);
    const callSeries = await tx.select({ bucket: callBucket, count: count() }).from(calls).where(callFilter).groupBy(callBucket).orderBy(callBucket);
    const appointmentSeries = await tx.select({ bucket: appointmentBucket, count: count() }).from(appointments).where(appointmentFilter).groupBy(appointmentBucket).orderBy(appointmentBucket);
    const messageSeries = await tx.select({ bucket: messageBucket, count: count() }).from(messages).where(messageFilter).groupBy(messageBucket).orderBy(messageBucket);
    const outcomes = await tx.select({ outcome: sql<string>`coalesce(${calls.disposition}, 'unclassified')`, count: count() }).from(calls).where(callFilter).groupBy(sql`coalesce(${calls.disposition}, 'unclassified')`).orderBy(sql`count(*) desc`);
    const economics = await tx.select({ totalCostUsd: unitEconomicsRollups.totalCostUsd, costPerVoiceCallUsd: unitEconomicsRollups.costPerVoiceCallUsd, costPerActiveUserUsd: unitEconomicsRollups.costPerActiveUserUsd }).from(unitEconomicsRollups).where(and(eq(unitEconomicsRollups.businessId, input.businessId), gte(economicsMonth, input.from), lt(economicsMonth, input.to))).orderBy(unitEconomicsRollups.monthKey).limit(1);

    const buckets = new Map<string, { bucket: string; calls: number; appointments: number; messages: number }>();
    for (const row of callSeries) buckets.set(bucketKey(row.bucket), { bucket: bucketKey(row.bucket), calls: Number(row.count), appointments: 0, messages: 0 });
    for (const row of appointmentSeries) {
      const key = bucketKey(row.bucket);
      const current = buckets.get(key) ?? { bucket: key, calls: 0, appointments: 0, messages: 0 };
      current.appointments = Number(row.count);
      buckets.set(key, current);
    }
    for (const row of messageSeries) {
      const key = bucketKey(row.bucket);
      const current = buckets.get(key) ?? { bucket: key, calls: 0, appointments: 0, messages: 0 };
      current.messages = Number(row.count);
      buckets.set(key, current);
    }

    return {
      periodDays: Math.max(1, Math.round((input.to.getTime() - input.from.getTime()) / 86_400_000)),
      from: input.from,
      to: input.to,
      granularity: input.granularity,
      calls: { current: Number(currentCalls[0]?.count ?? 0), previous: Number(previousCalls[0]?.count ?? 0) },
      appointments: { current: Number(currentAppointments[0]?.count ?? 0), previous: Number(previousAppointments[0]?.count ?? 0) },
      messages: { current: Number(currentMessages[0]?.count ?? 0), previous: Number(previousMessages[0]?.count ?? 0) },
      averageCallDurationSeconds: Number(duration[0]?.averageSeconds ?? 0),
      series: [...buckets.values()].sort((left, right) => left.bucket.localeCompare(right.bucket)),
      outcomes: outcomes.map((row) => ({ outcome: row.outcome, count: Number(row.count) })),
      unitEconomics: economics[0] ?? null,
    };
  });
}
