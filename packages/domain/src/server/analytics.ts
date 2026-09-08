import { and, count, desc, eq, gte, inArray, lt, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { appointments, calls, conversations, messages, unitEconomicsRollups, withBusinessTransaction } from "@lobbystack/db";

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
  if (granularity === "week") {
    return sql<Date>`date_trunc('week', ${column} + interval '1 day') - interval '1 day'`;
  }
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

function analyticsBucketStart(value: Date, granularity: AnalyticsGranularity): Date {
  if (granularity === "hour") return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), value.getUTCHours()));
  if (granularity === "week") return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() - value.getUTCDay()));
  if (granularity === "month") return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  if (granularity === "year") return new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function nextAnalyticsBucket(value: Date, granularity: AnalyticsGranularity): Date {
  if (granularity === "hour") return new Date(value.getTime() + 3_600_000);
  if (granularity === "week") return new Date(value.getTime() + 7 * 86_400_000);
  if (granularity === "month") return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
  if (granularity === "year") return new Date(Date.UTC(value.getUTCFullYear() + 1, 0, 1));
  return new Date(value.getTime() + 86_400_000);
}

/** @internal Exported for deterministic empty-series regression coverage. */
export function analyticsBucketStarts(from: Date, to: Date, granularity: AnalyticsGranularity): string[] {
  const result: string[] = [];
  for (let cursor = analyticsBucketStart(from, granularity), count = 0; cursor < to && count < 500; cursor = nextAnalyticsBucket(cursor, granularity), count += 1) {
    result.push(bucketKey(cursor));
  }
  return result;
}

type ResponseMessage = { conversationId: string; createdAt: Date; direction: string; aiGenerated: boolean };

/** Match the original dashboard: latest inbound to the first subsequent AI reply. */
export function agentResponsePoints(messages: ResponseMessage[]) {
  const pending = new Map<string, number>();
  const points: Array<{ timestamp: Date; seconds: number }> = [];
  for (const message of [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (message.direction === "inbound") {
      pending.set(message.conversationId, message.createdAt.getTime());
    } else if (message.direction === "outbound" && message.aiGenerated && pending.has(message.conversationId)) {
      points.push({ timestamp: message.createdAt, seconds: Math.max(0, Math.round((message.createdAt.getTime() - pending.get(message.conversationId)!) / 1000)) });
      pending.delete(message.conversationId);
    }
  }
  return points;
}

function averageResponse(points: Array<{ seconds: number }>): number {
  return points.length ? Math.round(points.reduce((sum, point) => sum + point.seconds, 0) / points.length) : 0;
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
    const outcomeKey = sql<string>`case
      when ${calls.transferState} is not null and ${calls.transferState} <> 'idle' then 'transferred'
      when ${calls.status} in ('in_progress', 'open') and (${calls.transport} <> 'webrtc' or ${calls.startedAt} >= current_timestamp - (coalesce(${calls.webCallMaxDurationMs}, 300000) + 60000) * interval '1 millisecond') then 'live'
      when lower(coalesce(${calls.disposition}, '')) similar to '%(miss|voicemail|busy|no_answer)%' or lower(${calls.status}) like '%failed%' then 'missed'
      when ${calls.providerDurationSeconds} > 0 or ${calls.status} = 'completed' then 'completed'
      else 'missed' end`;
    const outcomes = await tx.select({ outcome: outcomeKey, count: count() }).from(calls).where(callFilter).groupBy(outcomeKey);
    const callChannels = await tx.select({ channel: sql<string>`coalesce(${conversations.channel}, 'voice')`, count: count() }).from(calls).leftJoin(conversations, eq(calls.conversationId, conversations.id)).where(callFilter).groupBy(conversations.channel);
    const messageChannels = await tx.select({ channel: messages.channel, count: count() }).from(messages).where(messageFilter).groupBy(messages.channel);
    const channels = { voice: 0, sms: 0, other: 0 };
    for (const row of [...callChannels, ...messageChannels]) {
      const channel = row.channel.toLowerCase();
      channels[/voice|call/.test(channel) ? 'voice' : /sms|message/.test(channel) ? 'sms' : 'other'] += Number(row.count);
    }

    const economics = await tx.select({ totalCostUsd: unitEconomicsRollups.totalCostUsd, costPerVoiceCallUsd: unitEconomicsRollups.costPerVoiceCallUsd, costPerActiveUserUsd: unitEconomicsRollups.costPerActiveUserUsd }).from(unitEconomicsRollups).where(and(eq(unitEconomicsRollups.businessId, input.businessId), gte(economicsMonth, input.from), lt(economicsMonth, input.to))).orderBy(unitEconomicsRollups.monthKey).limit(1);

    const responseMessages = await tx.select({ conversationId: messages.conversationId, createdAt: messages.createdAt, direction: messages.direction, aiGenerated: messages.aiGenerated }).from(messages).where(and(eq(messages.businessId, input.businessId), gte(messages.createdAt, input.previousFrom), lt(messages.createdAt, input.to)));
    const responseConversationIds = [...new Set(responseMessages.map((message) => message.conversationId))];
    const responseSeeds = responseConversationIds.length > 0
      ? await tx.selectDistinctOn([messages.conversationId], { conversationId: messages.conversationId, createdAt: messages.createdAt, direction: messages.direction, aiGenerated: messages.aiGenerated })
          .from(messages)
          .where(and(
            eq(messages.businessId, input.businessId),
            inArray(messages.conversationId, responseConversationIds),
            lt(messages.createdAt, input.previousFrom),
            or(eq(messages.direction, "inbound"), and(eq(messages.direction, "outbound"), eq(messages.aiGenerated, true))),
          ))
          .orderBy(messages.conversationId, desc(messages.createdAt))
      : [];
    const responsePoints = agentResponsePoints([...responseSeeds, ...responseMessages]);
    const currentResponses = responsePoints.filter((point) => point.timestamp >= input.from);
    const previousResponses = responsePoints.filter((point) => point.timestamp >= input.previousFrom && point.timestamp < input.from);
    const responseBuckets = new Map<string, Array<{ seconds: number }>>();
    for (const point of currentResponses) {
      const key = bucketKey(analyticsBucketStart(point.timestamp, input.granularity));
      const values = responseBuckets.get(key) ?? [];
      values.push(point);
      responseBuckets.set(key, values);
    }

    const buckets = new Map<string, { bucket: string; calls: number; appointments: number; messages: number }>();
    for (const key of analyticsBucketStarts(input.from, input.to, input.granularity)) {
      buckets.set(key, { bucket: key, calls: 0, appointments: 0, messages: 0 });
    }
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
      agentResponseSeconds: { current: averageResponse(currentResponses), previous: averageResponse(previousResponses) },
      series: [...buckets.values()].map((point) => ({ ...point, agentResponseSeconds: averageResponse(responseBuckets.get(point.bucket) ?? []) })).sort((left, right) => left.bucket.localeCompare(right.bucket)),
      outcomes: ["completed", "transferred", "live", "missed"].map((outcome) => ({ outcome, count: Number(outcomes.find((row) => row.outcome === outcome)?.count ?? 0) })),
      channels,
      unitEconomics: economics[0] ?? null,
    };
  });
}
