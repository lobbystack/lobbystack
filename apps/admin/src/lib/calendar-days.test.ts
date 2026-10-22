import { describe, expect, it } from "vitest";

import { addDays, addMonths, dayKey, firstDayOfWeek, monthGrid, weekDays } from "./calendar-days";

describe("calendar days", () => {
  it("puts an appointment on the day the business sees, not the browser's", () => {
    expect(dayKey("2026-10-16T22:30:00Z", "Europe/Belgrade")).toBe("2026-10-17");
    expect(dayKey("2026-10-16T22:30:00Z", "America/Toronto")).toBe("2026-10-16");
  });

  it("steps across months and a daylight-saving change without skipping a day", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
  });

  it("starts weeks on Monday in Serbian and on Sunday in US English", () => {
    expect(firstDayOfWeek("sr-Latn")).toBe(1);
    expect(firstDayOfWeek("en-US")).toBe(0);
    expect(weekDays("2026-10-16", 1)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("covers a month with six full weeks", () => {
    const days = monthGrid("2026-10-16", 1);
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-09-28");
    expect(days).toContain("2026-10-31");
  });
});
