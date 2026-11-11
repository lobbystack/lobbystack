import { describe, expect, it } from "vitest";

import { blockPosition, calendarDays, closedSpans, dayLength, daySegments, instantAt, layoutColumns, monthOverflow, overlapping, rangeBounds, slotStarts, visibleHours } from "./calendar-layout";

const at = (id: string, startsAt: string, endsAt: string) => ({ id, startsAt, endsAt });

describe("calendarDays", () => {
  it("shows the day, its week from the locale's first day, or six weeks around its month", () => {
    expect(calendarDays("day", "2026-09-02", 0)).toEqual(["2026-09-02"]);
    expect(calendarDays("week", "2026-09-02", 0)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(calendarDays("week", "2026-09-02", 1)[0]).toBe("2026-08-31");
    const month = calendarDays("month", "2026-09-02", 1);
    expect(month).toHaveLength(42);
    expect([month[0], month.at(-1)]).toEqual(["2026-08-31", "2026-10-11"]);
  });
});

describe("rangeBounds and the business's clock", () => {
  it("fetches from the first day's midnight to the midnight after the last, in the business's time zone", () => {
    expect(rangeBounds(["2026-09-02"], "America/Toronto")).toEqual({ from: "2026-09-02T04:00:00.000Z", to: "2026-09-03T04:00:00.000Z" });
  });
  it("knows a day is 23 or 25 hours long when the clocks change", () => {
    expect(dayLength("2026-03-08", "America/Toronto")).toBe(23 * 60);
    expect(dayLength("2026-11-01", "America/Toronto")).toBe(25 * 60);
    expect(dayLength("2026-09-02", "America/Toronto")).toBe(24 * 60);
    expect(instantAt("2026-09-02", 9 * 60 + 30, "America/Toronto")).toBe("2026-09-02T13:30:00.000Z");
  });
});

describe("daySegments", () => {
  it("places a booking in the business's day, wherever the browser is", () => {
    // 23:30 UTC is 19:30 in Toronto, on the same day.
    expect(daySegments([at("a", "2026-09-02T23:30:00Z", "2026-09-03T00:15:00Z")], "2026-09-02", "America/Toronto")).toEqual([{ id: "a", start: 19 * 60 + 30, end: 20 * 60 + 15, allDay: false }]);
  });
  it("clips what crosses midnight to each day, and sends whole days to the all-day row", () => {
    const late = at("late", "2026-09-02T22:00:00Z", "2026-09-03T02:00:00Z");
    const off = at("off", "2026-09-02T00:00:00Z", "2026-09-04T00:00:00Z");
    expect(daySegments([late, off], "2026-09-02", "UTC")).toEqual([{ id: "off", start: 0, end: 1440, allDay: true }, { id: "late", start: 22 * 60, end: 1440, allDay: false }]);
    expect(daySegments([late], "2026-09-03", "UTC")).toEqual([{ id: "late", start: 0, end: 120, allDay: false }]);
    expect(daySegments([late], "2026-09-04", "UTC")).toEqual([]);
  });
});

describe("layoutColumns", () => {
  const segment = (id: string, start: number, end: number) => ({ id, start, end, allDay: false });
  it("gives a booking alone the full width", () => {
    expect(layoutColumns([segment("a", 540, 600)]).get("a")).toEqual({ column: 0, columns: 1 });
  });
  it("puts overlapping bookings side by side and reuses a column once it's free", () => {
    const placed = layoutColumns([segment("a", 540, 660), segment("b", 570, 600), segment("c", 600, 630), segment("d", 720, 780)]);
    expect(placed.get("a")).toEqual({ column: 0, columns: 2 });
    expect(placed.get("b")).toEqual({ column: 1, columns: 2 });
    // c starts when b ends, so it takes b's column.
    expect(placed.get("c")).toEqual({ column: 1, columns: 2 });
    // d overlaps nothing, so it has the full width again.
    expect(placed.get("d")).toEqual({ column: 0, columns: 1 });
  });
  it("splits three at once into thirds, and treats back-to-back bookings as not overlapping", () => {
    const placed = layoutColumns([segment("a", 540, 600), segment("b", 540, 600), segment("c", 550, 590), segment("d", 600, 660)]);
    expect([...["a", "b", "c"].map((id) => placed.get(id))]).toEqual([{ column: 0, columns: 3 }, { column: 1, columns: 3 }, { column: 2, columns: 3 }]);
    expect(placed.get("d")).toEqual({ column: 0, columns: 1 });
  });
});

describe("visibleHours", () => {
  const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30 }));
  it("pads the opening hours of the shown days by an hour", () => {
    expect(visibleHours({ hours: weekdays, days: ["2026-09-02"], segments: [] })).toEqual({ start: 8, end: 19 });
  });
  it("widens to fit bookings outside the hours, and falls back when the business has none", () => {
    expect(visibleHours({ hours: weekdays, days: ["2026-09-02"], segments: [{ id: "a", start: 6 * 60 + 30, end: 7 * 60, allDay: false }] })).toEqual({ start: 6, end: 19 });
    expect(visibleHours({ hours: [], days: ["2026-09-02"], segments: [] })).toEqual({ start: 8, end: 18 });
    // Sunday is closed, so a Sunday view falls back too.
    expect(visibleHours({ hours: weekdays, days: ["2026-09-06"], segments: [] })).toEqual({ start: 8, end: 18 });
  });
});

describe("blockPosition and slots", () => {
  it("places a block 48px per hour from the grid's first hour, with a minimum height", () => {
    expect(blockPosition({ start: 9 * 60 + 30, end: 10 * 60 + 15 }, 8)).toEqual({ top: 72, height: 36 });
    expect(blockPosition({ start: 9 * 60, end: 9 * 60 + 5 }, 8)).toEqual({ top: 48, height: 18 });
    expect(slotStarts(8, 10)).toEqual([480, 510, 540, 570]);
  });
});

describe("closedSpans", () => {
  const hours = [{ dayOfWeek: 3, openMinutes: 9 * 60, closeMinutes: 12 * 60 }, { dayOfWeek: 3, openMinutes: 13 * 60, closeMinutes: 17 * 60 }];
  it("hatches before opening, over lunch and after closing", () => {
    expect(closedSpans("2026-09-02", hours, 8, 18)).toEqual([{ start: 480, end: 540 }, { start: 720, end: 780 }, { start: 1020, end: 1080 }]);
  });
  it("hatches a closed day whole, and nothing for a business without hours", () => {
    expect(closedSpans("2026-09-03", hours, 8, 18)).toEqual([{ start: 480, end: 1080 }]);
    expect(closedSpans("2026-09-03", [], 8, 18)).toEqual([]);
  });
});

describe("monthOverflow", () => {
  it("shows every chip that fits, else one line fewer and +N more", () => {
    expect(monthOverflow(0, 3)).toEqual({ shown: 0, more: 0 });
    expect(monthOverflow(3, 3)).toEqual({ shown: 3, more: 0 });
    expect(monthOverflow(4, 3)).toEqual({ shown: 2, more: 2 });
    expect(monthOverflow(9, 3)).toEqual({ shown: 2, more: 7 });
  });
});

describe("overlapping", () => {
  it("finds the time off a time falls in, but not one that ends as it starts", () => {
    const closure = { id: "c", startsAt: "2026-09-02T12:00:00Z", endsAt: "2026-09-02T13:00:00Z", name: "Lunch" };
    expect(overlapping("2026-09-02T12:30:00Z", "2026-09-02T13:30:00Z", [closure])?.name).toBe("Lunch");
    expect(overlapping("2026-09-02T13:00:00Z", "2026-09-02T14:00:00Z", [closure])).toBeUndefined();
  });
});
