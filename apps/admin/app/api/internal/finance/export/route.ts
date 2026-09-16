import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getFinanceExportDatabase } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOURCES = ["usage", "businesses", "service-periods", "metrics"] as const;
type Resource = (typeof RESOURCES)[number];
type Cursor = { updatedAt: string; id: string };

function authorized(request: Request): boolean {
  const expected = process.env.FINANCE_EXPORT_TOKEN;
  const supplied = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCursor(value: string | null): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as Cursor;
    return typeof parsed.updatedAt === "string" && !Number.isNaN(Date.parse(parsed.updatedAt)) && typeof parsed.id === "string" && parsed.id.length > 0 ? parsed : undefined;
  } catch { return undefined; }
}

function escape(value: string): string { return value.replaceAll("'", "''"); }
function limit(value: string | null): number {
  const parsed = Number(value ?? "100");
  return Number.isInteger(parsed) ? Math.min(500, Math.max(1, parsed)) : 100;
}
function date(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
function cursorFilter(cursor: Cursor | undefined, updatedAt: string, id: string): string {
  return cursor ? `and (${updatedAt}, ${id}) > ('${escape(cursor.updatedAt)}'::timestamptz, '${escape(cursor.id)}')` : "";
}
function range(from: string | undefined, to: string | undefined, column: string): string {
  return `${from ? `and ${column} >= '${from}'::date` : ""} ${to ? `and ${column} < ('${to}'::date + interval '1 day')` : ""}`;
}
// node-postgres materializes timestamptz as Date, which drops microseconds.
// Export UTC timestamp text directly so a consumer can safely advance the
// `(updatedAt, id)` cursor across records written in the same millisecond.
function exportUpdatedAt(column: string): string {
  return `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}
function envelope(resource: Resource, rows: Array<Record<string, unknown>>, size: number) {
  const data = rows.slice(0, size);
  const last = data.at(-1) as { updatedAt: string | Date; id: string } | undefined;
  const updatedAt = last?.updatedAt instanceof Date ? last.updatedAt.toISOString() : last?.updatedAt;
  return NextResponse.json({ version: "v1", resource, data, nextCursor: rows.length > size && last && updatedAt ? Buffer.from(JSON.stringify({ updatedAt, id: last.id })).toString("base64url") : null });
}

/** Disabled by default; it accepts only the dedicated finance bearer token. */
export async function GET(request: Request) {
  if (process.env.FINANCE_EXPORT_ENABLED !== "true") return new Response("Not found", { status: 404 });
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  if (!RESOURCES.includes(resource as Resource)) return NextResponse.json({ error: "Invalid resource." }, { status: 400 });
  const cursor = parseCursor(url.searchParams.get("cursor"));
  if (url.searchParams.get("cursor") && !cursor) return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  const from = date(url.searchParams.get("from"));
  const to = date(url.searchParams.get("to"));
  if ((url.searchParams.get("from") && !from) || (url.searchParams.get("to") && !to)) return NextResponse.json({ error: "Dates must use YYYY-MM-DD." }, { status: 400 });
  const size = limit(url.searchParams.get("limit"));
  const db = getFinanceExportDatabase().db;

  if (resource === "usage") {
    const rows = (await db.execute<Record<string, unknown>>(`select u.id, u.business_id as "businessId", b.name as "tenantName", u.occurred_at as "occurredAt", ${exportUpdatedAt("u.updated_at")} as "updatedAt", u.event_kind as "eventKind", u.channel, case when u.event_kind like '%_provider' then 'provider' when u.operation like 'voice.%' then 'voice' when u.operation like 'web_voice.%' then 'web_voice' when u.operation like 'knowledge.%' then 'embedding' else 'ai' end as service, u.operation, u.provider, u.model, u.pricing_version as "pricingVersion", u.pricing_source as "pricingSource", u.pricing_effective_date as "pricingEffectiveDate", u.pricing_rates as "ratesUsdPerMillionTokens", u.token_usage as "tokenUsage", u.cost_usd as "costUsd", u.quantity, u.quantity_unit as "quantityUnit", u.call_id as "callId", u.conversation_id as "conversationId" from unit_economics_events u join businesses b on b.id = u.business_id where true ${range(from, to, "u.occurred_at")} ${cursorFilter(cursor, "u.updated_at", "u.id::text")} order by u.updated_at, u.id limit ${size + 1}`)).rows;
    return envelope(resource, rows, size);
  }
  if (resource === "businesses") {
    const rows = (await db.execute<Record<string, unknown>>(`select id, name as "tenantName", status, deployment_mode as "deploymentMode", created_at as "createdAt", ${exportUpdatedAt("updated_at")} as "updatedAt" from businesses where true ${cursorFilter(cursor, "updated_at", "id::text")} order by updated_at, id limit ${size + 1}`)).rows;
    return envelope(resource, rows, size);
  }
  if (resource === "service-periods") {
    const servicePeriodRange = `${from ? `and (current_period_end is null or current_period_end >= '${from}'::date)` : ""} ${to ? `and current_period_start < ('${to}'::date + interval '1 day')` : ""}`;
    const rows = (await db.execute<Record<string, unknown>>(`select id, business_id as "businessId", source, customer_id as "customerId", subscription_id as "subscriptionId", plan, billing_interval as "billingInterval", subscription_state as "subscriptionState", current_period_start as "currentPeriodStart", current_period_end as "currentPeriodEnd", ${exportUpdatedAt("updated_at")} as "updatedAt" from billing_accounts where true ${servicePeriodRange} ${cursorFilter(cursor, "updated_at", "id::text")} order by updated_at, id limit ${size + 1}`)).rows;
    return envelope(resource, rows, size);
  }

  // Source-derived updatedAt supports cursor-based revisions to daily totals.
  const rows = (await db.execute<Record<string, unknown>>(`with daily_calls as (select business_id, (started_at at time zone 'UTC')::date as day, count(*)::int as call_count, coalesce(sum(provider_duration_seconds), 0)::int as voice_seconds, max(updated_at) as updated_at from calls where true ${range(from, to, "started_at")} group by business_id, (started_at at time zone 'UTC')::date), daily_bookings as (select business_id, (created_at at time zone 'UTC')::date as day, count(*) filter (where status <> 'canceled')::int as booking_count, max(updated_at) as updated_at from appointments where true ${range(from, to, "created_at")} group by business_id, (created_at at time zone 'UTC')::date), daily as (select coalesce(c.business_id, b.business_id) as business_id, coalesce(c.day, b.day) as day, coalesce(c.call_count, 0) as call_count, coalesce(c.voice_seconds, 0) as voice_seconds, coalesce(b.booking_count, 0) as booking_count, greatest(coalesce(c.updated_at, '-infinity'::timestamptz), coalesce(b.updated_at, '-infinity'::timestamptz)) as updated_at from daily_calls c full outer join daily_bookings b on b.business_id = c.business_id and b.day = c.day) select business_id || ':' || to_char(day, 'YYYY-MM-DD') as id, business_id as "businessId", to_char(day, 'YYYY-MM-DD') as date, call_count as "callCount", voice_seconds as "voiceSeconds", booking_count as "bookingCount", ${exportUpdatedAt("updated_at")} as "updatedAt" from daily where true ${cursorFilter(cursor, "updated_at", "(business_id || ':' || to_char(day, 'YYYY-MM-DD'))")} order by updated_at, id limit ${size + 1}`)).rows;
  return envelope("metrics", rows, size);
}
