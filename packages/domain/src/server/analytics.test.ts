import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { calls, unitEconomicsRollups } from "@lobbystack/db";

import { analyticsBucketExpression, analyticsBucketStarts, analyticsCallChannel, analyticsMessageChannel, analyticsMonthStartExpression } from "./analytics";

const dialect = new PgDialect();

describe("analytics SQL", () => {
  it("uses the same allowlisted date_trunc expression for select, grouping, and ordering", () => {
    const bucket = analyticsBucketExpression(calls.startedAt, "week");
    const query = dialect.sqlToQuery(sql`select ${bucket} from ${calls} group by ${bucket} order by ${bucket}`);

    expect(query.sql.match(/date_trunc\('week'/g)).toHaveLength(3);
    expect(query.sql.match(/\+ interval '1 day'\) - interval '1 day'/g)).toHaveLength(3);
    expect(query.params).toEqual([]);
  });

  it("converts YYYY-MM rollup keys to the first day of the month", () => {
    const query = dialect.sqlToQuery(analyticsMonthStartExpression(unitEconomicsRollups.monthKey));

    expect(query.sql).toContain(`to_date("unit_economics_rollups"."month_key" || '-01', 'YYYY-MM-DD')`);
    expect(query.params).toEqual([]);
  });

  it("fills empty weekly series from Sunday through the selected range", () => {
    expect(analyticsBucketStarts(
      new Date("2026-08-05T12:00:00.000Z"),
      new Date("2026-09-04T23:59:59.999Z"),
      "week",
    )).toEqual([
      "2026-08-02T00:00:00.000Z",
      "2026-08-09T00:00:00.000Z",
      "2026-08-16T00:00:00.000Z",
      "2026-08-23T00:00:00.000Z",
      "2026-08-30T00:00:00.000Z",
    ]);
  });

  it("caps generated buckets to protect large hourly requests", () => {
    expect(analyticsBucketStarts(
      new Date("2020-01-01T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
      "hour",
    )).toHaveLength(500);
  });
});


describe("analytics channels", () => {
  it("splits calls into phone and web calls by transport", () => {
    expect(["voice", "phone", "sip", "pstn", "web_voice", "web", "webrtc"].map(analyticsCallChannel)).toEqual([
      "phone_call", "phone_call", "phone_call", "phone_call", "web_call", "web_call", "web_call",
    ]);
  });

  it("gives website chat its own bucket and keeps unknown channels in Other", () => {
    expect(["sms", "web_chat", "widget", "voice", "web_voice", "dashboard", "email", ""].map(analyticsMessageChannel)).toEqual([
      "sms", "web_chat", "web_chat", "phone_call", "web_call", "other", "other", "other",
    ]);
  });
});
