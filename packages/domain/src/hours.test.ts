import { describe, expect, it } from "vitest";

import { normalizeClosures, normalizeHoursWindows, sameHoursWindows } from "./hours";

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
  ])("rejects %j as bad input", (windows, message) => {
    expect(() => normalizeHoursWindows(windows)).toThrow(expect.objectContaining({ message, status: 400 }));
  });

  it("compares two normalized weeks", () => {
    const week = normalizeHoursWindows([{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }]);
    expect(sameHoursWindows(week, [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }])).toBe(true);
    expect(sameHoursWindows(week, [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1000 }])).toBe(false);
    expect(sameHoursWindows(week, [])).toBe(false);
  });
});

describe("normalizeClosures", () => {
  const now = new Date("2026-10-09T12:00:00Z");

  it("reads local times in the business's timezone and sorts by start", () => {
    expect(normalizeClosures([
      { startsAt: "2026-12-31T13:00", endsAt: "2027-01-02T00:00" },
      { startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", reason: " Christmas Day " },
    ], "America/Toronto", now)).toEqual([
      { startsAt: new Date("2026-12-25T05:00:00Z"), endsAt: new Date("2026-12-26T05:00:00Z"), reason: "Christmas Day" },
      { startsAt: new Date("2026-12-31T18:00:00Z"), endsAt: new Date("2027-01-02T05:00:00Z"), reason: "" },
    ]);
  });

  it("keeps a closure that already started and one that starts when another ends", () => {
    expect(normalizeClosures([{ startsAt: "2026-10-09T00:00", endsAt: "2026-10-10T00:00" }, { startsAt: "2026-10-10T00:00", endsAt: "2026-10-11T00:00" }], "UTC", now)).toHaveLength(2);
  });

  it.each([
    [[{ startsAt: "2026-12-25", endsAt: "2026-12-26T00:00" }], "Each closure needs a start and an end"],
    [[{ startsAt: "2026-02-30T00:00", endsAt: "2026-03-01T00:00" }], "Each closure needs a start and an end"],
    [[{ startsAt: "2026-12-25T12:00", endsAt: "2026-12-25T12:00" }], "A closure must end after it starts."],
    [[{ startsAt: "2026-10-01T00:00", endsAt: "2026-10-09T11:00" }], "A closure can't end in the past."],
    [[{ startsAt: "2028-10-01T00:00", endsAt: "2028-10-10T00:00" }], "A closure must end within two years."],
    [[{ startsAt: "2026-12-24T00:00", endsAt: "2026-12-26T00:00" }, { startsAt: "2026-12-25T00:00", endsAt: "2026-12-27T00:00" }], "Closures can't overlap."],
    [[{ startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", reason: "x".repeat(101) }], "A closure reason can be up to 100 characters."],
    [Array.from({ length: 51 }, (_, index) => ({ startsAt: `2027-01-${String(index % 28 + 1).padStart(2, "0")}T00:00`, endsAt: `2027-01-${String(index % 28 + 1).padStart(2, "0")}T01:00` })), "A business can have up to 50 closures."],
  ])("rejects %j as bad input", (closures, message) => {
    expect(() => normalizeClosures(closures, "UTC", now)).toThrow(expect.objectContaining({ message: expect.stringContaining(message), status: 400 }));
  });
});
