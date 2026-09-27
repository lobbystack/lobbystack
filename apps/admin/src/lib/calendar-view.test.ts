import { describe, expect, it } from "vitest";

import { calendarRange, layoutBlocks, shiftCalendarDate, visibleHours } from "./calendar-view";

const zone = "America/Toronto";

describe("calendarRange", () => {
  it("covers one day in the business timezone", () => {
    const range = calendarRange("day", "2030-01-08", zone);
    expect(range.start.toISO()).toBe("2030-01-08T00:00:00.000-05:00");
    expect(range.end.toISO()).toBe("2030-01-09T00:00:00.000-05:00");
    expect(range.days).toHaveLength(1);
  });

  it("starts weeks on Monday", () => {
    const range = calendarRange("week", "2030-01-10", zone);
    expect(range.start.toISODate()).toBe("2030-01-07");
    expect(range.days.map((day) => day.toISODate())).toEqual(["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11", "2030-01-12", "2030-01-13"]);
  });

  it("falls back to today for a missing or broken date", () => {
    const now = new Date("2030-03-04T15:00:00Z");
    expect(calendarRange("day", "not-a-date", zone, now).start.toISODate()).toBe("2030-03-04");
    expect(calendarRange("day", null, zone, now).start.toISODate()).toBe("2030-03-04");
  });

  it("moves by a day or a week", () => {
    expect(shiftCalendarDate(calendarRange("day", "2030-01-08", zone), 1)).toBe("2030-01-09");
    expect(shiftCalendarDate(calendarRange("week", "2030-01-08", zone), -1)).toBe("2029-12-31");
  });
});

describe("layoutBlocks", () => {
  const day = calendarRange("day", "2030-01-08", zone).start;
  it("places appointments by time and skips other days", () => {
    const blocks = layoutBlocks([
      { id: "a", startsAt: "2030-01-08T14:00:00Z", endsAt: "2030-01-08T15:00:00Z" },
      { id: "b", startsAt: "2030-01-09T14:00:00Z", endsAt: "2030-01-09T15:00:00Z" },
    ], day, 8, 18);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ top: 10, height: 10 });
  });

  it("widens the visible hours to fit early and late appointments", () => {
    expect(visibleHours([{ startsAt: "2030-01-08T11:30:00Z", endsAt: "2030-01-09T00:15:00Z" }], zone)).toEqual({ startHour: 6, endHour: 20 });
    expect(visibleHours([], zone)).toEqual({ startHour: 8, endHour: 18 });
  });
});
