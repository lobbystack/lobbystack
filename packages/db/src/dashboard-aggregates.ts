import { sql } from "drizzle-orm";

export type DashboardAggregates = {
  monthlyCalls: Array<{ month: string; total: number }>;
};

/**
 * Monthly call buckets are computed by PostgreSQL so the dashboard never
 * transfers raw call history. The transaction keeps the operator RLS context.
 */
export function dashboardAggregatesQuery(input: { businessId: string; chartStart: Date }) {
  return sql`
    SELECT
      (SELECT COALESCE(json_agg(json_build_object('month', month, 'total', total) ORDER BY month), '[]'::json) FROM (
        SELECT to_char(date_trunc('month', started_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS month, count(*)::int AS total
        FROM calls
        WHERE business_id = ${input.businessId}::uuid AND started_at >= ${input.chartStart}
        GROUP BY 1
      ) monthly_call_totals) AS "monthlyCalls"
  `;
}
