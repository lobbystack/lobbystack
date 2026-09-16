import { sql } from "drizzle-orm";

export type DashboardAggregates = {
  callsCurrent: number;
  callsPrevious: number;
  appointmentsCurrent: number;
  appointmentsPrevious: number;
  messagesCurrent: number;
  messagesPrevious: number;
  averageDurationCurrent: number;
  averageDurationPrevious: number;
  monthlyCalls: Array<{ month: string; total: number }>;
};

/**
 * Period counts, duration averages and monthly buckets are computed by
 * PostgreSQL in a single statement so the dashboard never transfers raw call
 * history. The transaction keeps the operator RLS context.
 */
export function dashboardAggregatesQuery(input: { businessId: string; currentStart: Date; previousStart: Date; chartStart: Date }) {
  const durationExpression = sql`COALESCE(provider_duration_seconds, CASE WHEN ended_at IS NULL THEN 0 ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (ended_at - started_at))))::int END)`;
  return sql`
    SELECT
      (SELECT count(*)::int FROM calls WHERE business_id = ${input.businessId}::uuid AND started_at >= ${input.currentStart}) AS "callsCurrent",
      (SELECT count(*)::int FROM calls WHERE business_id = ${input.businessId}::uuid AND started_at >= ${input.previousStart} AND started_at < ${input.currentStart}) AS "callsPrevious",
      (SELECT count(*)::int FROM appointments WHERE business_id = ${input.businessId}::uuid AND created_at >= ${input.currentStart}) AS "appointmentsCurrent",
      (SELECT count(*)::int FROM appointments WHERE business_id = ${input.businessId}::uuid AND created_at >= ${input.previousStart} AND created_at < ${input.currentStart}) AS "appointmentsPrevious",
      (SELECT count(*)::int FROM messages WHERE business_id = ${input.businessId}::uuid AND created_at >= ${input.currentStart}) AS "messagesCurrent",
      (SELECT count(*)::int FROM messages WHERE business_id = ${input.businessId}::uuid AND created_at >= ${input.previousStart} AND created_at < ${input.currentStart}) AS "messagesPrevious",
      (SELECT COALESCE(ROUND(AVG(duration)::numeric), 0)::int FROM (
        SELECT ${durationExpression} AS duration FROM calls
        WHERE business_id = ${input.businessId}::uuid AND started_at >= ${input.currentStart}
      ) current_durations) AS "averageDurationCurrent",
      (SELECT COALESCE(ROUND(AVG(duration)::numeric), 0)::int FROM (
        SELECT ${durationExpression} AS duration FROM calls
        WHERE business_id = ${input.businessId}::uuid AND started_at >= ${input.previousStart} AND started_at < ${input.currentStart}
      ) previous_durations) AS "averageDurationPrevious",
      (SELECT COALESCE(json_agg(json_build_object('month', month, 'total', total) ORDER BY month), '[]'::json) FROM (
        SELECT to_char(date_trunc('month', started_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS month, count(*)::int AS total
        FROM calls
        WHERE business_id = ${input.businessId}::uuid AND started_at >= ${input.chartStart}
        GROUP BY 1
      ) monthly_call_totals) AS "monthlyCalls"
  `;
}

