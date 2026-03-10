import { describe, expect, it } from "vitest";

import { computeAvailability } from "./availability";

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
