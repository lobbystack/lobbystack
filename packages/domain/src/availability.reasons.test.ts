import { describe, expect, it } from "vitest";

import { computeAvailability, scheduleUnavailableReason } from "./availability";

// 2026-03-09 is a Monday.
const monday = (time: string) => `2026-03-09T${time}:00.000Z`;
const splitMonday = [{ dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 12 * 60 }, { dayOfWeek: 1, openMinutes: 13 * 60, closeMinutes: 17 * 60 }];
const check = (startsAt: string, overrides: Partial<Parameters<typeof scheduleUnavailableReason>[0]> = {}) =>
  scheduleUnavailableReason({ startsAt, timezone: "UTC", serviceDurationMinutes: 60, hours: splitMonday, closures: [], ...overrides });

describe("scheduleUnavailableReason", () => {
  it("allows a time inside either window of a split day", () => {
    expect(check(monday("09:00"))).toBeUndefined();
    expect(check(monday("13:30"))).toBeUndefined();
  });

  it("says when the business has no opening hours at all", () => {
    expect(check(monday("10:00"), { hours: [] })).toBe("no_hours");
  });

  it("says when the business is closed that weekday", () => {
    expect(check("2026-03-08T10:00:00.000Z")).toBe("closed_day");
  });

  it("says when the service runs into the lunch break or past closing", () => {
    expect(check(monday("11:30"))).toBe("outside_hours");
    expect(check(monday("16:30"))).toBe("outside_hours");
    expect(check(monday("07:00"))).toBe("outside_hours");
  });

  it("allows a service that ends exactly when the business closes at midnight", () => {
    const evening = [{ dayOfWeek: 1, openMinutes: 18 * 60, closeMinutes: 1440 }];
    expect(check(monday("23:00"), { hours: evening })).toBeUndefined();
    expect(check(monday("23:30"), { hours: evening })).toBe("outside_hours");
    expect(computeAvailability({ request: { serviceId: "service", startsAt: monday("23:00"), timezone: "UTC" }, serviceDurationMinutes: 60, staffIds: ["staff"], hours: evening, closures: [], existingAppointments: [] })).toHaveLength(1);
  });

  it("reads the hours in the business's timezone", () => {
    // 13:00 UTC is 9:00 in Toronto (EDT starts March 8, 2026).
    expect(check(monday("13:00"), { timezone: "America/Toronto" })).toBeUndefined();
    expect(check(monday("09:00"), { timezone: "America/Toronto" })).toBe("outside_hours");
  });

  it("says when a planned closure covers the time", () => {
    expect(check(monday("10:00"), { closures: [{ startsAt: monday("10:30"), endsAt: monday("12:00"), reason: "Staff training" }] })).toBe("closure");
  });
});
