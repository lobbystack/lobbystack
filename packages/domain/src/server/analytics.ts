import { and, eq, gte, lt, sql, type SQL, type SQLWrapper } from "drizzle-orm";

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

/** Bounded aggregate output; message histories stay in PostgreSQL. */
export function analyticsResponseQuery(input: AnalyticsInput): SQL {
  const bucket = analyticsBucketExpression(sql`(created_at at time zone 'UTC')`, input.granularity);
  return sql`with period as materialized (
    select id, conversation_id, created_at, direction from messages
    where business_id = ${input.businessId}::uuid
      and created_at >= ${input.previousFrom.toISOString()}::timestamptz
      and created_at < ${input.to.toISOString()}::timestamptz
      and (direction = 'inbound' or (direction = 'outbound' and ai_generated))
  ), seeds as (
    select seed.* from (select distinct conversation_id from period) active
    cross join lateral (
      select id, conversation_id, created_at, direction from messages
      where business_id = ${input.businessId}::uuid and conversation_id = active.conversation_id
        and created_at < ${input.previousFrom.toISOString()}::timestamptz
        and (direction = 'inbound' or (direction = 'outbound' and ai_generated))
      order by created_at desc, id desc limit 1
    ) seed
  ), ordered as (
    select *, lag(direction) over conversation as previous_direction,
      lag(created_at) over conversation as previous_at
    from (select * from seeds union all select * from period) relevant
    window conversation as (partition by conversation_id order by created_at, id)
  ), responses as (
    select case when created_at >= ${input.from.toISOString()}::timestamptz
      then (${bucket}) at time zone 'UTC' else null end as bucket,
      greatest(0, round(extract(epoch from created_at - previous_at))) as seconds
    from ordered where direction = 'outbound' and previous_direction = 'inbound'
      and created_at >= ${input.previousFrom.toISOString()}::timestamptz
  ) select bucket, sum(seconds) as seconds, count(*) as count from responses group by bucket`;
}

type ActivityRow = {
  kind: string; bucket: Date | string | null; category: string | null;
  current: string; previous: string; averageSeconds: string;
};

/** One scan per activity table supplies totals, series, outcomes and channels. */
function activityQuery(source: SQL): SQL {
  return sql`with activity as (${source})
    select case when grouping(bucket) = 0 then 'bucket'
      when grouping(outcome) = 0 then 'outcome'
      when grouping(channel) = 0 then 'channel' else 'total' end as kind,
      bucket, coalesce(outcome, channel) as category,
      count(*) filter (where current) as current,
      count(*) filter (where not current) as previous,
      coalesce(avg(duration) filter (where current), 0) as "averageSeconds"
    from activity group by grouping sets ((bucket), (outcome), (channel), ())`;
}

export async function getAnalytics(context: DomainContext, input: AnalyticsInput) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const callBucket = analyticsBucketExpression(calls.startedAt, input.granularity);
    const appointmentBucket = analyticsBucketExpression(appointments.startsAt, input.granularity);
    const messageBucket = analyticsBucketExpression(messages.createdAt, input.granularity);
    const economicsMonth = analyticsMonthStartExpression(unitEconomicsRollups.monthKey);
    const outcomeKey = sql<string>`case
      when ${calls.transferState} is not null and ${calls.transferState} <> 'idle' then 'transferred'
      when ${calls.status} in ('in_progress', 'open') and (${calls.transport} <> 'webrtc' or ${calls.startedAt} >= current_timestamp - (coalesce(${calls.webCallMaxDurationMs}, 300000) + 60000) * interval '1 millisecond') then 'live'
      when lower(coalesce(${calls.disposition}, '')) similar to '%(miss|voicemail|busy|no_answer)%' or lower(${calls.status}) like '%failed%' then 'missed'
      when ${calls.providerDurationSeconds} > 0 or ${calls.status} = 'completed' then 'completed'
      else 'missed' end`;
    const callRows = (await tx.execute<ActivityRow>(activityQuery(sql`
      select ${callBucket} as bucket, ${outcomeKey} as outcome,
        coalesce(${conversations.channel}, 'voice') as channel,
        ${calls.startedAt} >= ${input.from.toISOString()}::timestamptz as current,
        ${calls.providerDurationSeconds} as duration
      from ${calls} left join ${conversations} on ${calls.conversationId} = ${conversations.id}
      where ${calls.businessId} = ${input.businessId}::uuid
        and ${calls.startedAt} >= ${input.previousFrom.toISOString()}::timestamptz and ${calls.startedAt} < ${input.to.toISOString()}::timestamptz
    `))).rows;
    const appointmentRows = (await tx.execute<ActivityRow>(activityQuery(sql`
      select ${appointmentBucket} as bucket, null::text as outcome, null::text as channel,
        ${appointments.startsAt} >= ${input.from.toISOString()}::timestamptz as current, null::integer as duration
      from ${appointments} where ${appointments.businessId} = ${input.businessId}::uuid
        and ${appointments.startsAt} >= ${input.previousFrom.toISOString()}::timestamptz and ${appointments.startsAt} < ${input.to.toISOString()}::timestamptz
    `))).rows;
    const messageRows = (await tx.execute<ActivityRow>(activityQuery(sql`
      select ${messageBucket} as bucket, null::text as outcome, ${messages.channel} as channel,
        ${messages.createdAt} >= ${input.from.toISOString()}::timestamptz as current, null::integer as duration
      from ${messages} where ${messages.businessId} = ${input.businessId}::uuid
        and ${messages.createdAt} >= ${input.previousFrom.toISOString()}::timestamptz and ${messages.createdAt} < ${input.to.toISOString()}::timestamptz
    `))).rows;
    const callTotals = callRows.find(row => row.kind === "total");
    const appointmentTotals = appointmentRows.find(row => row.kind === "total");
    const messageTotals = messageRows.find(row => row.kind === "total");
    const seriesRows = (rows: ActivityRow[]) => rows.filter(row => row.kind === "bucket" && Number(row.current) > 0).map(row => ({ bucket: row.bucket!, count: Number(row.current) }));
    const callSeries = seriesRows(callRows), appointmentSeries = seriesRows(appointmentRows), messageSeries = seriesRows(messageRows);
    const outcomes = callRows.filter(row => row.kind === "outcome").map(row => ({ outcome: row.category, count: row.current }));
    const channelRows = (rows: ActivityRow[]) => rows.filter(row => row.kind === "channel").map(row => ({ channel: row.category ?? "", count: row.current }));
    const callChannels = channelRows(callRows), messageChannels = channelRows(messageRows);
    const channels = { voice: 0, sms: 0, other: 0 };
    for (const row of [...callChannels, ...messageChannels]) {
      const channel = row.channel.toLowerCase();
      channels[/voice|call/.test(channel) ? 'voice' : /sms|message/.test(channel) ? 'sms' : 'other'] += Number(row.count);
    }

    const economics = await tx.select({ totalCostUsd: unitEconomicsRollups.totalCostUsd, costPerVoiceCallUsd: unitEconomicsRollups.costPerVoiceCallUsd, costPerActiveUserUsd: unitEconomicsRollups.costPerActiveUserUsd }).from(unitEconomicsRollups).where(and(eq(unitEconomicsRollups.businessId, input.businessId), gte(economicsMonth, input.from), lt(economicsMonth, input.to))).orderBy(unitEconomicsRollups.monthKey).limit(1);

    const responseRows = (await tx.execute<{ bucket: Date | string | null; seconds: string; count: string }>(analyticsResponseQuery(input))).rows;
    const responseBuckets = new Map<string, number>();
    let currentSeconds = 0, currentCount = 0, previousSeconds = 0, previousCount = 0;
    for (const row of responseRows) {
      const seconds = Number(row.seconds), count = Number(row.count);
      if (row.bucket === null) { previousSeconds += seconds; previousCount += count; }
      else {
        currentSeconds += seconds; currentCount += count;
        responseBuckets.set(bucketKey(row.bucket), Math.round(seconds / count));
      }
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
      calls: { current: Number(callTotals?.current ?? 0), previous: Number(callTotals?.previous ?? 0) },
      appointments: { current: Number(appointmentTotals?.current ?? 0), previous: Number(appointmentTotals?.previous ?? 0) },
      messages: { current: Number(messageTotals?.current ?? 0), previous: Number(messageTotals?.previous ?? 0) },
      averageCallDurationSeconds: Number(callTotals?.averageSeconds ?? 0),
      agentResponseSeconds: { current: currentCount ? Math.round(currentSeconds / currentCount) : 0, previous: previousCount ? Math.round(previousSeconds / previousCount) : 0 },
      series: [...buckets.values()].map((point) => ({ ...point, agentResponseSeconds: (responseBuckets.get(point.bucket) ?? 0) })).sort((left, right) => left.bucket.localeCompare(right.bucket)),
      outcomes: ["completed", "transferred", "live", "missed"].map((outcome) => ({ outcome, count: Number(outcomes.find((row) => row.outcome === outcome)?.count ?? 0) })),
      channels,
      unitEconomics: economics[0] ?? null,
    };
  });
}
