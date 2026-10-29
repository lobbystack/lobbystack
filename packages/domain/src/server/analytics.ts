import { eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { appointments, businesses, calls, conversations, messages, services, withBusinessTransaction } from "@lobbystack/db";
import { discountedAmount, isNonBillableCallDisposition, MAX_PHONE_CALL_MS, MIN_BILLABLE_VOICE_DURATION_SECONDS, nonBillableCallDispositions, servicePriceFromColumns, type ServicePriceType } from "@lobbystack/shared";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import type { ReceptionistChannel } from "./receptionistActions";

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

/** Channel buckets for the Analytics channels card, in display order. */
export const analyticsChannels = ["phone_call", "web_call", "sms", "web_chat", "other"] as const;
export type AnalyticsChannel = (typeof analyticsChannels)[number];

/** Calls split on transport, like voiceChannelForTransport: anything over the browser is a web call. */
export function analyticsCallChannel(transport: string): AnalyticsChannel {
  return transport.toLowerCase().includes("web") ? "web_call" : "phone_call";
}

/**
 * Messages count toward their conversation's channel, so staff replies and
 * voice messages land with the chat, text thread, or call they belong to.
 * A call's conversation is always `voice`.
 */
export function analyticsMessageChannel(channel: string): AnalyticsChannel {
  const value = channel.trim().toLowerCase();
  if (value === "sms") return "sms";
  if (value === "web_chat" || value === "widget") return "web_chat";
  if (value === "voice" || value === "phone") return "phone_call";
  if (value.includes("web")) return "web_call";
  return "other";
}

/**
 * The channels the receptionist books on. Bookings from the public API, MCP,
 * or the dashboard come from people, so they don't count toward booked value.
 */
export const analyticsReceptionistBookingChannels = ["voice", "web_voice", "web_chat", "instagram", "sms"] as const satisfies readonly ReceptionistChannel[];

/**
 * What one booking of a service adds to booked value, in the currency's
 * smallest unit, after the service's discount: a fixed price at its price, a
 * "from" price at its minimum, a range at its low end. A price set in person,
 * or no price at all, adds nothing and returns null.
 */
export function analyticsBookedValueMinor(service: { priceType: ServicePriceType; priceMinor: number | null; priceMaxMinor: number | null; discountPercent?: number | null }): number | null {
  // The currency only labels the price, and the amount is all this needs.
  const price = servicePriceFromColumns({ ...service, discountPercent: Number(service.discountPercent ?? 0) }, "XXX");
  if (!price || price.type === "in_person") return null;
  return discountedAmount(price.amountMinor, price.discountPercent ?? 0);
}

/** Appointments with the same price, channel, status and period, counted together. */
export type AnalyticsBookingGroup = {
  current: boolean;
  sourceChannel: string;
  status: string;
  priceType: ServicePriceType;
  priceMinor: number | null;
  priceMaxMinor: number | null;
  discountPercent: number | null;
  count: number;
};

/**
 * Booked value for the current and previous periods: the receptionist's
 * bookings that weren't cancelled, priced by analyticsBookedValueMinor.
 * Appointments don't keep the price they were booked at, so this uses each
 * service's current price.
 */
export function summarizeAnalyticsBookedValue(groups: AnalyticsBookingGroup[]): { current: number; previous: number } {
  const total = { current: 0, previous: 0 };
  for (const group of groups) {
    if (group.status === "canceled") continue;
    if (!(analyticsReceptionistBookingChannels as readonly string[]).includes(group.sourceChannel)) continue;
    const value = analyticsBookedValueMinor(group);
    if (value === null) continue;
    total[group.current ? "current" : "previous"] += value * group.count;
  }
  return total;
}

/** Ended calls with the same exclusion inputs and period, added together. */
export type AnalyticsCallGroup = {
  current: boolean;
  /** Only a disposition billing exempts; null for any other. */
  disposition: string | null;
  billingExcluded: boolean;
  transferred: boolean;
  /** The shorter of each call's provider and measured length, in whole seconds, capped at MIN_BILLABLE_VOICE_DURATION_SECONDS. */
  shortestSeconds: number;
  seconds: number;
  calls: number;
};

/**
 * Whether a call counts toward time saved. It follows the billing exemptions
 * in billableVoiceSeconds: spam and calls under ten seconds don't count, and
 * neither do calls that never bill, such as prospect demos.
 */
export function isAnalyticsHandledCall(call: { disposition: string | null; billingExcluded: boolean; shortestSeconds: number }): boolean {
  return !call.billingExcluded && !isNonBillableCallDisposition(call.disposition) && call.shortestSeconds >= MIN_BILLABLE_VOICE_DURATION_SECONDS;
}

type HandledCallTotals = { seconds: number; calls: number; withoutTransfer: number };

/** Talk time and call counts for the calls the receptionist handled, per period. */
export function summarizeAnalyticsHandledCalls(groups: AnalyticsCallGroup[]): { current: HandledCallTotals; previous: HandledCallTotals } {
  const totals = { current: { seconds: 0, calls: 0, withoutTransfer: 0 }, previous: { seconds: 0, calls: 0, withoutTransfer: 0 } };
  for (const group of groups) {
    if (!isAnalyticsHandledCall(group)) continue;
    const period = totals[group.current ? "current" : "previous"];
    period.seconds += Math.max(0, group.seconds);
    period.calls += group.calls;
    if (!group.transferred) period.withoutTransfer += group.calls;
  }
  totals.current.seconds = Math.round(totals.current.seconds);
  totals.previous.seconds = Math.round(totals.previous.seconds);
  return totals;
}

/** A share from 0 to 100 with one decimal, or null with nothing to share. */
export function analyticsPercent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
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
    // A call still open a minute past its max duration lost its worker or gateway, so it counts as missed, not live.
    // A transfer counts once the call went out: one only requested, never started or failed stayed with the receptionist.
    const outcomeKey = sql<string>`case
      when ${calls.status} = 'transferred' or ${calls.transferState} in ('referred', 'completed') then 'transferred'
      when ${calls.endedAt} is null and ${calls.status} in ('started', 'in_progress') and ${calls.startedAt} >= current_timestamp - (case when ${calls.transport} = 'web_voice' then coalesce(${calls.webCallMaxDurationMs}, 300000) else ${sql.raw(String(MAX_PHONE_CALL_MS))} end + 60000) * interval '1 millisecond' then 'live'
      when lower(coalesce(${calls.disposition}, '')) similar to '%(miss|voicemail|busy|no_answer)%' or lower(${calls.status}) like '%failed%' then 'missed'
      when ${calls.providerDurationSeconds} > 0 or ${calls.status} = 'completed' then 'completed'
      else 'missed' end`;
    const callRows = (await tx.execute<ActivityRow>(activityQuery(sql`
      select ${callBucket} as bucket, ${outcomeKey} as outcome,
        ${calls.transport} as channel,
        ${calls.startedAt} >= ${input.from.toISOString()}::timestamptz as current,
        ${calls.providerDurationSeconds} as duration
      from ${calls}
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
      select ${messageBucket} as bucket, null::text as outcome, coalesce(${conversations.channel}, ${messages.channel}) as channel,
        ${messages.createdAt} >= ${input.from.toISOString()}::timestamptz as current, null::integer as duration
      from ${messages} left join ${conversations} on ${conversations.id} = ${messages.conversationId} and ${conversations.businessId} = ${input.businessId}::uuid
      where ${messages.businessId} = ${input.businessId}::uuid
        and ${messages.createdAt} >= ${input.previousFrom.toISOString()}::timestamptz and ${messages.createdAt} < ${input.to.toISOString()}::timestamptz
    `))).rows;
    // Grouped, so the rules in summarizeAnalyticsBookedValue and summarizeAnalyticsHandledCalls run over a few rows.
    // Booked value counts bookings made in the period, by when the receptionist made them.
    const bookingGroups = (await tx.execute<Omit<AnalyticsBookingGroup, "priceMinor" | "priceMaxMinor" | "discountPercent" | "count"> & { priceMinor: string | number | null; priceMaxMinor: string | number | null; discountPercent: string | number | null; count: string }>(sql`
      select ${appointments.createdAt} >= ${input.from.toISOString()}::timestamptz as current,
        ${appointments.sourceChannel} as "sourceChannel", ${appointments.status} as status,
        ${services.priceType} as "priceType", ${services.priceMinor} as "priceMinor", ${services.priceMaxMinor} as "priceMaxMinor",
        ${services.discountPercent} as "discountPercent", count(*) as count
      from ${appointments} inner join ${services} on ${services.id} = ${appointments.serviceId} and ${services.businessId} = ${input.businessId}::uuid
      where ${appointments.businessId} = ${input.businessId}::uuid
        and ${appointments.createdAt} >= ${input.previousFrom.toISOString()}::timestamptz and ${appointments.createdAt} < ${input.to.toISOString()}::timestamptz
      group by 1, 2, 3, 4, 5, 6, 7
    `)).rows;
    const nullableNumber = (value: string | number | null) => value === null ? null : Number(value);
    const bookedValue = summarizeAnalyticsBookedValue(bookingGroups.map((row) => ({
      ...row,
      priceMinor: nullableNumber(row.priceMinor),
      priceMaxMinor: nullableNumber(row.priceMaxMinor),
      discountPercent: nullableNumber(row.discountPercent),
      count: Number(row.count),
    })));
    // Like billing, a call lasts the provider's duration, or the measured media time when the provider reported none.
    const measuredSeconds = sql`extract(epoch from ${calls.endedAt} - coalesce(${calls.mediaStartedAt}, ${calls.startedAt}))`;
    const callGroups = (await tx.execute<{ current: boolean; disposition: string | null; billingExcluded: boolean; transferred: boolean; shortestSeconds: string; seconds: string; calls: string }>(sql`
      with ended as (
        select ${calls.startedAt} >= ${input.from.toISOString()}::timestamptz as current,
          case when ${calls.disposition} in (${sql.join(nonBillableCallDispositions.map((value) => sql`${value}`), sql`, `)}) then ${calls.disposition} end as disposition,
          ${calls.billingExcluded} as billing_excluded,
          (${calls.status} = 'transferred' or ${calls.transferState} in ('referred', 'completed')) as transferred,
          coalesce(${calls.providerDurationSeconds}, ${measuredSeconds}) as duration,
          ${measuredSeconds} as measured
        from ${calls}
        where ${calls.businessId} = ${input.businessId}::uuid and ${calls.endedAt} is not null
          and ${calls.startedAt} >= ${input.previousFrom.toISOString()}::timestamptz and ${calls.startedAt} < ${input.to.toISOString()}::timestamptz
      )
      select current, disposition, billing_excluded as "billingExcluded", transferred,
        floor(least(duration, measured, ${sql.raw(String(MIN_BILLABLE_VOICE_DURATION_SECONDS))})) as "shortestSeconds",
        coalesce(sum(duration), 0) as seconds, count(*) as calls
      from ended group by 1, 2, 3, 4, 5
    `)).rows;
    const handledCalls = summarizeAnalyticsHandledCalls(callGroups.map((row) => ({ ...row, shortestSeconds: Number(row.shortestSeconds), seconds: Number(row.seconds), calls: Number(row.calls) })));
    const [business] = await tx.select({ currency: businesses.currency }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);

    const callTotals = callRows.find(row => row.kind === "total");
    const appointmentTotals = appointmentRows.find(row => row.kind === "total");
    const messageTotals = messageRows.find(row => row.kind === "total");
    const seriesRows = (rows: ActivityRow[]) => rows.filter(row => row.kind === "bucket" && Number(row.current) > 0).map(row => ({ bucket: row.bucket!, count: Number(row.current) }));
    const callSeries = seriesRows(callRows), appointmentSeries = seriesRows(appointmentRows), messageSeries = seriesRows(messageRows);
    const outcomes = callRows.filter(row => row.kind === "outcome").map(row => ({ outcome: row.category, count: row.current }));
    const channelRows = (rows: ActivityRow[]) => rows.filter(row => row.kind === "channel").map(row => ({ channel: row.category ?? "", count: row.current }));
    // Every current call and message lands in exactly one bucket, so the buckets add up to calls plus messages.
    const channels = Object.fromEntries(analyticsChannels.map((channel) => [channel, 0])) as Record<AnalyticsChannel, number>;
    for (const row of channelRows(callRows)) channels[analyticsCallChannel(row.channel)] += Number(row.count);
    for (const row of channelRows(messageRows)) channels[analyticsMessageChannel(row.channel)] += Number(row.count);

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
      /** In the business currency's smallest unit. */
      bookedValue: { currency: business?.currency ?? "USD", ...bookedValue },
      timeSavedSeconds: { current: handledCalls.current.seconds, previous: handledCalls.previous.seconds },
      callsWithoutTransferPercent: {
        current: analyticsPercent(handledCalls.current.withoutTransfer, handledCalls.current.calls),
        previous: analyticsPercent(handledCalls.previous.withoutTransfer, handledCalls.previous.calls),
      },
    };
  });
}
