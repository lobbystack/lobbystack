import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { calls, unitEconomicsRollups } from "@lobbystack/db";

import { analyticsBucketExpression, analyticsMonthStartExpression } from "./analytics";

const dialect = new PgDialect();

describe("analytics SQL", () => {
  it("uses the same allowlisted date_trunc expression for select, grouping, and ordering", () => {
    const bucket = analyticsBucketExpression(calls.startedAt, "week");
    const query = dialect.sqlToQuery(sql`select ${bucket} from ${calls} group by ${bucket} order by ${bucket}`);

    expect(query.sql.match(/date_trunc\('week'/g)).toHaveLength(3);
    expect(query.params).toEqual([]);
  });

  it("converts YYYY-MM rollup keys to the first day of the month", () => {
    const query = dialect.sqlToQuery(analyticsMonthStartExpression(unitEconomicsRollups.monthKey));

    expect(query.sql).toContain(`to_date("unit_economics_rollups"."month_key" || '-01', 'YYYY-MM-DD')`);
    expect(query.params).toEqual([]);
  });
});
