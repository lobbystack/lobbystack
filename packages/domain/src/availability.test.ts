import { describe, expect, it } from "vitest";

import { candidateStartTimes, computeAvailability } from "./availability";

describe("computeAvailability", () => {
  it("returns an available slot inside business hours", () => {
    const result = computeAvailability({
      request: {
        serviceId: "svc-1",
        startsAt: "2026-03-09T14:00:00.000Z",
        timezone: "UTC",
      },
      serviceDurationMinutes: 30,
      staffIds: ["staff-1"],
      hours: [{ dayOfWeek: 1, openMinutes: 13 * 60, closeMinutes: 18 * 60 }],
      closures: [],
      existingAppointments: [],
    });

    expect(result).toEqual([
      {
        staffId: "staff-1",
        serviceId: "svc-1",
        startsAt: "2026-03-09T14:00:00.000Z",
        endsAt: "2026-03-09T14:30:00.000Z",
      },
    ]);
  });

  it("filters out overlapping appointments", () => {
    const result = computeAvailability({
      request: {
        serviceId: "svc-1",
        startsAt: "2026-03-09T14:00:00.000Z",
        timezone: "UTC",
      },
      serviceDurationMinutes: 30,
      staffIds: ["staff-1", "staff-2"],
      hours: [{ dayOfWeek: 1, openMinutes: 13 * 60, closeMinutes: 18 * 60 }],
      closures: [],
      existingAppointments: [
        {
          staffId: "staff-1",
          startsAt: "2026-03-09T14:00:00.000Z",
          endsAt: "2026-03-09T14:30:00.000Z",
        },
      ],
    });

    expect(result).toEqual([
      {
        staffId: "staff-2",
        serviceId: "svc-1",
        startsAt: "2026-03-09T14:00:00.000Z",
        endsAt: "2026-03-09T14:30:00.000Z",
      },
    ]);
  });

  it("rejects requests outside hours or during closures", () => {
    const outsideHours = computeAvailability({
      request: {
        serviceId: "svc-1",
        startsAt: "2026-03-09T08:00:00.000Z",
        timezone: "UTC",
      },
      serviceDurationMinutes: 30,
      staffIds: ["staff-1"],
      hours: [{ dayOfWeek: 1, openMinutes: 13 * 60, closeMinutes: 18 * 60 }],
      closures: [],
      existingAppointments: [],
    });

    const closed = computeAvailability({
      request: {
        serviceId: "svc-1",
        startsAt: "2026-03-09T14:00:00.000Z",
        timezone: "UTC",
      },
      serviceDurationMinutes: 30,
      staffIds: ["staff-1"],
      hours: [{ dayOfWeek: 1, openMinutes: 13 * 60, closeMinutes: 18 * 60 }],
      closures: [
        {
          startsAt: "2026-03-09T13:30:00.000Z",
          endsAt: "2026-03-09T14:30:00.000Z",
          reason: "Team meeting",
        },
      ],
      existingAppointments: [],
    });

    expect(outsideHours).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("interprets business hours in the provided timezone instead of UTC", () => {
    const result = computeAvailability({
      request: {
        serviceId: "svc-1",
        startsAt: "2026-03-09T20:00:00.000Z",
        timezone: "America/Toronto",
      },
      serviceDurationMinutes: 30,
      staffIds: ["staff-1"],
      hours: [{ dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 17 * 60 }],
      closures: [],
      existingAppointments: [],
    });

    expect(result).toEqual([
      {
        staffId: "staff-1",
        serviceId: "svc-1",
        startsAt: "2026-03-09T20:00:00.000Z",
        endsAt: "2026-03-09T20:30:00.000Z",
      },
    ]);
  });

  it("rejects slots that roll past midnight in the business timezone", () => {
    const result = computeAvailability({
      request: {
        serviceId: "svc-1",
        startsAt: "2026-03-10T03:30:00.000Z",
        timezone: "America/Toronto",
      },
      serviceDurationMinutes: 60,
      staffIds: ["staff-1"],
      hours: [{ dayOfWeek: 1, openMinutes: 23 * 60, closeMinutes: 23 * 60 + 59 }],
      closures: [],
      existingAppointments: [],
    });

    expect(result).toEqual([]);
  });
});

describe("candidateStartTimes", () => {
  const weekdayHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 8 * 60, closeMinutes: 17 * 60 }));

  it("offers times inside business hours, nearest to the preferred time first", () => {
    const times = candidateStartTimes({ date: "2030-01-08", timezone: "America/Toronto", hours: weekdayHours, durationMinutes: 60, preferredMinutes: 10 * 60, now: new Date("2030-01-01T00:00:00Z") });
    expect(times.slice(0, 3)).toEqual(["2030-01-08T15:00:00.000Z", "2030-01-08T14:30:00.000Z", "2030-01-08T15:30:00.000Z"]);
    expect(times.every((time) => time >= "2030-01-08T13:00:00.000Z" && time <= "2030-01-08T21:00:00.000Z")).toBe(true);
  });

  it("returns nothing on a closed day or for times already past", () => {
    expect(candidateStartTimes({ date: "2030-01-06", timezone: "America/Toronto", hours: weekdayHours, durationMinutes: 60 })).toEqual([]);
    expect(candidateStartTimes({ date: "2030-01-08", timezone: "America/Toronto", hours: weekdayHours, durationMinutes: 60, now: new Date("2030-01-09T00:00:00Z") })).toEqual([]);
  });

  it("keeps opening times on the wall clock when daylight saving starts", () => {
    // 2030-03-10 is the Sunday Toronto moves to EDT (UTC-4).
    const sundayHours = [{ dayOfWeek: 0, openMinutes: 9 * 60, closeMinutes: 11 * 60 }];
    const times = candidateStartTimes({ date: "2030-03-10", timezone: "America/Toronto", hours: sundayHours, durationMinutes: 60, now: new Date("2030-03-01T00:00:00Z") });
    expect(times).toEqual(["2030-03-10T13:00:00.000Z", "2030-03-10T13:30:00.000Z", "2030-03-10T14:00:00.000Z"]);
  });
});
