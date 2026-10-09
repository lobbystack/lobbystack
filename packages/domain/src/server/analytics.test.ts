import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { calls } from "@lobbystack/db";

import { analyticsBucketExpression, analyticsBucketStarts, analyticsCallChannel, analyticsMessageChannel } from "./analytics";

const dialect = new PgDialect();

describe("analytics SQL", () => {
  it("uses the same allowlisted date_trunc expression for select, grouping, and ordering", () => {
    const bucket = analyticsBucketExpression(calls.startedAt, "week");
    const query = dialect.sqlToQuery(sql`select ${bucket} from ${calls} group by ${bucket} order by ${bucket}`);

    expect(query.sql.match(/date_trunc\('week'/g)).toHaveLength(3);
    expect(query.sql.match(/\+ interval '1 day'\) - interval '1 day'/g)).toHaveLength(3);
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

  it("fits the longest hourly range the analytics route allows (20 days) without dropping the newest hour", () => {
    const from = new Date("2026-01-03T00:30:00.000Z");
    const to = new Date(from.getTime() + 20 * 86_400_000);
    const buckets = analyticsBucketStarts(from, to, "hour");
    expect(buckets.length).toBeLessThan(500);
    expect(new Date(buckets.at(-1)!).getTime() + 3_600_000).toBeGreaterThan(to.getTime());
  });

  it("fits the longest weekly range the analytics route allows (3493 days) without dropping the newest week", () => {
    // Saturday start: the first bucket begins six days before the range.
    const from = new Date("2026-01-03T00:00:00.000Z");
    const to = new Date(from.getTime() + 3493 * 86_400_000);
    const buckets = analyticsBucketStarts(from, to, "week");
    expect(buckets.length).toBeLessThanOrEqual(500);
    expect(new Date(buckets.at(-1)!).getTime() + 7 * 86_400_000).toBeGreaterThan(to.getTime());
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
