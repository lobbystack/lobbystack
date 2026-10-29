import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { calls } from "@lobbystack/db";

import {
  analyticsBookedValueMinor, analyticsBucketExpression, analyticsBucketStarts, analyticsCallChannel, analyticsMessageChannel, analyticsPercent,
  isAnalyticsHandledCall, summarizeAnalyticsBookedValue, summarizeAnalyticsHandledCalls,
  type AnalyticsBookingGroup, type AnalyticsCallGroup,
} from "./analytics";

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

describe("analytics booked value", () => {
  const group = (overrides: Partial<AnalyticsBookingGroup> = {}): AnalyticsBookingGroup => ({
    current: true, sourceChannel: "voice", status: "confirmed", priceType: "fixed", priceMinor: 5_000, priceMaxMinor: null, discountPercent: 0, count: 1, ...overrides,
  });

  it("counts a fixed price at its price, a starting price at its minimum, and a range at its low end", () => {
    expect(analyticsBookedValueMinor({ priceType: "fixed", priceMinor: 5_000, priceMaxMinor: null })).toBe(5_000);
    expect(analyticsBookedValueMinor({ priceType: "from", priceMinor: 3_000, priceMaxMinor: null })).toBe(3_000);
    expect(analyticsBookedValueMinor({ priceType: "range", priceMinor: 4_000, priceMaxMinor: 9_000 })).toBe(4_000);
  });

  it("skips prices set in person and services without a price", () => {
    expect(analyticsBookedValueMinor({ priceType: "in_person", priceMinor: null, priceMaxMinor: null })).toBeNull();
    expect(analyticsBookedValueMinor({ priceType: "in_person", priceMinor: 5_000, priceMaxMinor: null })).toBeNull();
    expect(analyticsBookedValueMinor({ priceType: "fixed", priceMinor: null, priceMaxMinor: null })).toBeNull();
    expect(analyticsBookedValueMinor({ priceType: "range", priceMinor: 4_000, priceMaxMinor: null })).toBeNull();
  });

  it("takes the service's discount off", () => {
    expect(analyticsBookedValueMinor({ priceType: "fixed", priceMinor: 70_000, priceMaxMinor: null, discountPercent: 20 })).toBe(56_000);
    expect(analyticsBookedValueMinor({ priceType: "range", priceMinor: 100_000, priceMaxMinor: 200_000, discountPercent: 12.5 })).toBe(87_500);
  });

  it("adds up the receptionist's bookings per period and leaves out cancelled ones", () => {
    expect(summarizeAnalyticsBookedValue([
      group({ count: 3 }),
      group({ sourceChannel: "web_chat", priceType: "from", priceMinor: 2_000 }),
      group({ sourceChannel: "web_voice", priceType: "range", priceMinor: 1_000, priceMaxMinor: 4_000, count: 2 }),
      group({ status: "canceled", count: 10 }),
      group({ current: false, sourceChannel: "sms", count: 2 }),
      group({ current: false, sourceChannel: "instagram", priceType: "in_person", priceMinor: null }),
    ])).toEqual({ current: 3 * 5_000 + 2_000 + 2 * 1_000, previous: 2 * 5_000 });
  });

  it("leaves out bookings people made through the API, MCP, or the dashboard", () => {
    expect(summarizeAnalyticsBookedValue([
      group({ sourceChannel: "api" }),
      group({ sourceChannel: "operator" }),
      group({ sourceChannel: "dashboard" }),
    ])).toEqual({ current: 0, previous: 0 });
  });
});

describe("analytics time saved", () => {
  const group = (overrides: Partial<AnalyticsCallGroup> = {}): AnalyticsCallGroup => ({
    current: true, disposition: null, billingExcluded: false, transferred: false, shortestSeconds: 10, seconds: 600, calls: 2, ...overrides,
  });

  it("counts calls of ten seconds or more and leaves out shorter ones, spam, and calls that never bill", () => {
    expect(isAnalyticsHandledCall(group())).toBe(true);
    expect(isAnalyticsHandledCall(group({ shortestSeconds: 9 }))).toBe(false);
    expect(isAnalyticsHandledCall(group({ shortestSeconds: 0 }))).toBe(false);
    expect(isAnalyticsHandledCall(group({ disposition: "spam_ended" }))).toBe(false);
    expect(isAnalyticsHandledCall(group({ billingExcluded: true }))).toBe(false);
  });

  it("adds up talk time per period and counts calls that ended without a transfer", () => {
    const totals = summarizeAnalyticsHandledCalls([
      group({ seconds: 600.4, calls: 2 }),
      group({ transferred: true, seconds: 300, calls: 1 }),
      group({ shortestSeconds: 4, seconds: 8, calls: 2 }),
      group({ disposition: "spam_ended", seconds: 900, calls: 3 }),
      group({ current: false, seconds: 120, calls: 1 }),
    ]);
    expect(totals.current).toEqual({ seconds: 900, calls: 3, withoutTransfer: 2 });
    expect(totals.previous).toEqual({ seconds: 120, calls: 1, withoutTransfer: 1 });
    expect(analyticsPercent(totals.current.withoutTransfer, totals.current.calls)).toBe(66.7);
    expect(analyticsPercent(0, 0)).toBeNull();
  });
});
