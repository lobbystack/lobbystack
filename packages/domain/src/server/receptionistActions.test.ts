import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookAppointment: vi.fn(),
  findAvailability: vi.fn(),
  recordProductEvent: vi.fn(),
  serviceRows: [] as Array<{ id: string; name: string; durationMinutes: number }>,
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: vi.fn(async (_db, _actor, callback) => callback({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.serviceRows }) }) }),
  })),
}));
vi.mock("./booking", () => ({ bookAppointment: mocks.bookAppointment, findAvailability: mocks.findAvailability, cancelAppointmentForCaller: vi.fn(), rescheduleAppointmentForCaller: vi.fn() }));
vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent }));
vi.mock("./callOutcome", () => ({ recordCallSchedulingProgress: vi.fn() }));

import { bookForCaller, candidateStartTimes, findOpenings } from "./receptionistActions";

const context = { db: {} as never };
const weekdayHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 8 * 60, closeMinutes: 17 * 60 }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serviceRows = [{ id: "svc_1", name: "Drain cleaning", durationMinutes: 60 }];
});

describe("candidateStartTimes", () => {
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

describe("findOpenings", () => {
  it("returns the first open times it finds on the requested day", async () => {
    mocks.findAvailability.mockImplementation(async (_context, input: { startsAt: string }) => (input.startsAt.endsWith("14:00:00.000Z") ? [] : [{ startsAt: input.startsAt }]));
    const result = await findOpenings(context, { businessId: "biz_1", serviceName: "drain cleaning", date: "2030-01-08", timezone: "America/Toronto", hours: weekdayHours, preferredHour24: 9, limit: 2 });
    expect(result).toMatchObject({ ok: true, serviceName: "Drain cleaning" });
    expect(result.ok && result.openings.map((opening) => opening.startsAt)).toEqual(["2030-01-08T13:30:00.000Z", "2030-01-08T14:30:00.000Z"]);
  });

  it("scans the whole day when only the last start time is free", async () => {
    // 7 a.m. to 7 p.m. gives 23 start times for a one-hour service.
    const longDay = [{ dayOfWeek: 2, openMinutes: 7 * 60, closeMinutes: 19 * 60 }];
    const lastStart = "2030-01-08T23:00:00.000Z";
    mocks.findAvailability.mockImplementation(async (_context, input: { startsAt: string }) => (input.startsAt === lastStart ? [{ startsAt: input.startsAt }] : []));
    const result = await findOpenings(context, { businessId: "biz_1", serviceName: "drain cleaning", date: "2030-01-08", timezone: "America/Toronto", hours: longDay });
    expect(result.ok && result.openings.map((opening) => opening.startsAt)).toEqual([lastStart]);
    expect(mocks.findAvailability).toHaveBeenCalledTimes(23);
  });
});

describe("bookForCaller telemetry", () => {
  const input = { businessId: "biz_1", serviceName: "Drain cleaning", startsAt: "2030-01-08T14:00:00.000Z", timezone: "America/Toronto", contactPhone: "+14165550100", channel: "voice" as const };

  it("records appointment.booked after a successful booking", async () => {
    mocks.bookAppointment.mockResolvedValue({ appointmentId: "apt_1", contactId: "contact_1", staffId: "staff_1" });
    await expect(bookForCaller(context, input)).resolves.toMatchObject({ ok: true, appointmentId: "apt_1" });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({ name: "appointment.booked", businessId: "biz_1", properties: expect.objectContaining({ appointmentId: "apt_1", channel: "voice" }) }));
  });

  it("records appointment.booking_failed with the reason when booking fails", async () => {
    mocks.bookAppointment.mockRejectedValue(new Error("That time is no longer available."));
    await expect(bookForCaller(context, input)).resolves.toMatchObject({ ok: false });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({ name: "appointment.booking_failed", properties: expect.objectContaining({ reason: "slot_unavailable" }) }));
  });

  it("records appointment.booking_failed when the service doesn't exist", async () => {
    mocks.serviceRows = [];
    await expect(bookForCaller(context, input)).resolves.toMatchObject({ ok: false, reason: "Service is not available." });
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({ name: "appointment.booking_failed", properties: expect.objectContaining({ reason: "service_unavailable" }) }));
  });
});
