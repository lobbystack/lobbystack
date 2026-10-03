import { describe, expect, it } from "vitest";

import { normalizeHoursWindows, sameHoursWindows } from "./hours";

describe("normalizeHoursWindows", () => {
  it("keeps split days and sorts by day and opening time", () => {
    expect(normalizeHoursWindows([
      { dayOfWeek: 2, openMinutes: 13 * 60, closeMinutes: 17 * 60 },
      { dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
      { dayOfWeek: 2, openMinutes: 9 * 60, closeMinutes: 12 * 60 },
    ])).toEqual([
      { dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 },
      { dayOfWeek: 2, openMinutes: 540, closeMinutes: 720 },
      { dayOfWeek: 2, openMinutes: 780, closeMinutes: 1020 },
    ]);
  });

  it("allows a window that ends at midnight and one that starts when another ends", () => {
    expect(normalizeHoursWindows([{ dayOfWeek: 5, openMinutes: 18 * 60, closeMinutes: 1440 }, { dayOfWeek: 5, openMinutes: 9 * 60, closeMinutes: 18 * 60 }])).toHaveLength(2);
  });

  it.each([
    [[{ dayOfWeek: 7, openMinutes: 540, closeMinutes: 600 }], "Each day must be a weekday."],
    [[{ dayOfWeek: 1, openMinutes: 600, closeMinutes: 600 }], "Closing time must be after opening time."],
    [[{ dayOfWeek: 1, openMinutes: 1200, closeMinutes: 120 }], "Closing time must be after opening time."],
    [[{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1441 }], "Closing time must be after opening time."],
    [[{ dayOfWeek: 1, openMinutes: 540.5, closeMinutes: 600 }], "Closing time must be after opening time."],
    [[{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 780 }, { dayOfWeek: 1, openMinutes: 720, closeMinutes: 1020 }], "Opening windows on the same day can't overlap."],
    [Array.from({ length: 5 }, (_, index) => ({ dayOfWeek: 1, openMinutes: index * 120, closeMinutes: index * 120 + 60 })), "Each day can have up to 4 opening windows."],
  ])("rejects %j", (windows, message) => {
    expect(() => normalizeHoursWindows(windows)).toThrow(message);
  });

  it("compares two normalized weeks", () => {
    const week = normalizeHoursWindows([{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }]);
    expect(sameHoursWindows(week, [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }])).toBe(true);
    expect(sameHoursWindows(week, [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1000 }])).toBe(false);
    expect(sameHoursWindows(week, [])).toBe(false);
  });
});
