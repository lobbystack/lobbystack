import { afterEach, describe, expect, it } from "vitest";

import { analyticsPresetRange, analyticsRangeBounds, businessToday, lastDaysBounds, type CalendarRange } from "./analytics-range";

const day = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const days = (range: CalendarRange) => ({ from: day(range.from), to: day(range.to) });
const iso = (bounds: { from: Date; to: Date }) => ({ from: bounds.from.toISOString(), to: bounds.to.toISOString() });

// 8:30 PM on Tuesday, November 10, 2026 in Toronto (EST), already Wednesday in UTC.
const torontoEvening = new Date("2026-11-11T01:30:00.000Z");
const viewerZone = process.env.TZ;

afterEach(() => {
  if (viewerZone === undefined) delete process.env.TZ;
  else process.env.TZ = viewerZone;
});

describe("the business's today", () => {
  it("is the date where the business is, not in UTC", () => {
    expect(day(businessToday("America/Toronto", torontoEvening))).toBe("2026-11-10");
    expect(day(businessToday("UTC", torontoEvening))).toBe("2026-11-11");
    expect(day(businessToday("Asia/Tokyo", new Date("2026-11-10T16:00:00.000Z")))).toBe("2026-11-11");
  });

  it("falls back to UTC for a zone it doesn't know", () => {
    expect(day(businessToday("Mars/Olympus", torontoEvening))).toBe("2026-11-11");
    expect(day(businessToday(undefined, torontoEvening))).toBe("2026-11-11");
  });
});

describe("an evening in Toronto", () => {
  const range = analyticsPresetRange("last30", { timeZone: "America/Toronto", now: torontoEvening });

  it("counts the last 30 days up to the business's today", () => {
    expect(days(range)).toEqual({ from: "2026-10-12", to: "2026-11-10" });
  });

  it("asks for every moment of today, this evening included", () => {
    const bounds = analyticsRangeBounds(range, "America/Toronto");
    // Toronto is on EDT on October 12 and on EST by November 10.
    expect(iso(bounds)).toEqual({ from: "2026-10-12T04:00:00.000Z", to: "2026-11-11T05:00:00.000Z" });
    const callAnHourAgo = new Date(torontoEvening.getTime() - 3_600_000);
    expect(callAnHourAgo >= bounds.from && callAnHourAgo < bounds.to).toBe(true);
    expect(torontoEvening < bounds.to).toBe(true);
  });

  it("gives Home's results the same 30 days", () => {
    expect(iso(lastDaysBounds(30, "America/Toronto", torontoEvening))).toEqual(iso(analyticsRangeBounds(range, "America/Toronto")));
  });
});

describe("presets in the business's time zone", () => {
  it.each([
    ["today", "2026-11-10", "2026-11-10"],
    ["yesterday", "2026-11-09", "2026-11-09"],
    ["thisWeek", "2026-11-08", "2026-11-10"],
    ["thisMonth", "2026-11-01", "2026-11-10"],
    ["lastMonth", "2026-10-01", "2026-10-31"],
    ["last3Months", "2026-08-10", "2026-11-10"],
    ["thisYear", "2026-01-01", "2026-11-10"],
    ["lastYear", "2025-01-01", "2025-12-31"],
  ] as const)("%s runs from %s to %s on a Toronto Tuesday evening", (preset, from, to) => {
    expect(days(analyticsPresetRange(preset, { timeZone: "America/Toronto", now: torontoEvening }))).toEqual({ from, to });
  });

  it("starts all time on the day the business was created, where it is", () => {
    expect(days(analyticsPresetRange("allTime", { timeZone: "America/Toronto", now: torontoEvening, businessCreatedAt: "2026-03-01T02:00:00.000Z" }))).toEqual({ from: "2026-02-28", to: "2026-11-10" });
  });

  it("reads the same instant as a different day in Tokyo and in UTC", () => {
    const tokyoMorning = new Date("2026-11-10T16:00:00.000Z");
    expect(iso(analyticsRangeBounds(analyticsPresetRange("today", { timeZone: "Asia/Tokyo", now: tokyoMorning }), "Asia/Tokyo"))).toEqual({ from: "2026-11-10T15:00:00.000Z", to: "2026-11-11T15:00:00.000Z" });
    expect(iso(analyticsRangeBounds(analyticsPresetRange("today", { timeZone: "UTC", now: tokyoMorning }), "UTC"))).toEqual({ from: "2026-11-10T00:00:00.000Z", to: "2026-11-11T00:00:00.000Z" });
  });

  it("gives a day with a clock change its real length", () => {
    // Toronto moves its clocks forward on March 14, 2027, so that day lasts 23 hours.
    const bounds = analyticsRangeBounds(analyticsPresetRange("today", { timeZone: "America/Toronto", now: new Date("2027-03-14T18:00:00.000Z") }), "America/Toronto");
    expect(iso(bounds)).toEqual({ from: "2027-03-14T05:00:00.000Z", to: "2027-03-15T04:00:00.000Z" });
  });
});

describe("the viewer's own time zone", () => {
  it.each(["UTC", "America/Toronto", "Asia/Kolkata", "Pacific/Kiritimati"])("changes nothing when the browser is in %s", (zone) => {
    process.env.TZ = zone;
    const range = analyticsPresetRange("last30", { timeZone: "America/Toronto", now: torontoEvening });
    expect(days(range)).toEqual({ from: "2026-10-12", to: "2026-11-10" });
    expect(iso(analyticsRangeBounds(range, "America/Toronto"))).toEqual({ from: "2026-10-12T04:00:00.000Z", to: "2026-11-11T05:00:00.000Z" });
  });
});
