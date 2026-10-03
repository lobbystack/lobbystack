import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookAppointment: vi.fn(),
  findAvailability: vi.fn(),
  checkAvailability: vi.fn(),
  rescheduleAppointmentForCaller: vi.fn(),
  recordProductEvent: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: vi.fn(async (_db, _actor, callback) => callback({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "svc_1", name: "Haircut", durationMinutes: 60 }] }) }) }),
  })),
}));
vi.mock("./booking", () => ({ ...mocks, cancelAppointmentForCaller: vi.fn() }));
vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent }));
vi.mock("./callOutcome", () => ({ recordCallSchedulingProgress: vi.fn() }));

import { BookingUnavailableError } from "../availability";
import { bookForCaller, bookingFailureReason, checkOpening, findOpenings, rescheduleForCaller } from "./receptionistActions";

const context = { db: {} as never };
const weekdayHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 9 * 60, closeMinutes: 17 * 60 }));
// 2030-01-08 is a Tuesday; 2030-01-06 is a Sunday.
const openings = (input: Partial<Parameters<typeof findOpenings>[1]>) => findOpenings(context, { businessId: "biz_1", serviceName: "haircut", date: "2030-01-08", timezone: "America/Toronto", hours: weekdayHours, ...input });

beforeEach(() => { vi.clearAllMocks(); });

describe("findOpenings reasons", () => {
  it("says the business has no opening hours without checking any time", async () => {
    await expect(openings({ hours: [] })).resolves.toMatchObject({ ok: true, openings: [], reason: "no_hours" });
    expect(mocks.findAvailability).not.toHaveBeenCalled();
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });

  it("says the business is closed that day", async () => {
    await expect(openings({ date: "2030-01-06" })).resolves.toMatchObject({ openings: [], reason: "closed_day" });
  });

  it("says when no start time is left that day", async () => {
    await expect(openings({ date: "2020-01-07" })).resolves.toMatchObject({ openings: [], reason: "no_times_left" });
  });

  it("explains an empty open day with the reason for the nearest time", async () => {
    mocks.findAvailability.mockResolvedValue([]);
    mocks.checkAvailability.mockResolvedValue({ slots: [], reason: "calendar_not_synced" });
    await expect(openings({ preferredHour24: 10 })).resolves.toMatchObject({ openings: [], reason: "calendar_not_synced" });
    expect(mocks.checkAvailability).toHaveBeenCalledTimes(1);
    expect(mocks.checkAvailability.mock.lastCall?.[1]).toMatchObject({ startsAt: "2030-01-08T15:00:00.000Z" });
  });

  it("adds no reason when it finds openings", async () => {
    mocks.findAvailability.mockImplementation(async (_context, input: { startsAt: string }) => [{ startsAt: input.startsAt }]);
    const result = await openings({});
    expect(result).not.toHaveProperty("reason");
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });
});

describe("checkOpening", () => {
  it("returns why a time isn't available", async () => {
    mocks.checkAvailability.mockResolvedValue({ slots: [], reason: "outside_hours" });
    await expect(checkOpening(context, { businessId: "biz_1", serviceName: "haircut", startsAt: "2030-01-08T23:00:00.000Z", timezone: "America/Toronto" })).resolves.toEqual({ ok: true, serviceName: "Haircut", available: false, reason: "outside_hours" });
  });

  it("returns an available time without a reason", async () => {
    mocks.checkAvailability.mockResolvedValue({ slots: [{ staffId: "staff_1" }] });
    await expect(checkOpening(context, { businessId: "biz_1", serviceName: "haircut", startsAt: "2030-01-08T15:00:00.000Z", timezone: "America/Toronto" })).resolves.toEqual({ ok: true, serviceName: "Haircut", available: true });
  });
});

describe("refused bookings and reschedules", () => {
  const input = { businessId: "biz_1", serviceName: "Haircut", startsAt: "2030-01-08T15:00:00.000Z", timezone: "America/Toronto", contactPhone: "+14165550100", channel: "voice" as const };

  it("returns the reason a booking was refused, and records it", async () => {
    mocks.bookAppointment.mockRejectedValue(new BookingUnavailableError("no_hours"));
    await expect(bookForCaller(context, input)).resolves.toEqual({ ok: false, reason: "The business hasn't set its opening hours, so no time can be booked.", unavailableReason: "no_hours" });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({ name: "appointment.booking_failed", properties: expect.objectContaining({ reason: "no_hours" }) }));
  });

  it("keeps the earlier telemetry names for taken and no-staff refusals", () => {
    expect(bookingFailureReason(new BookingUnavailableError("taken"))).toBe("slot_unavailable");
    expect(bookingFailureReason(new BookingUnavailableError("no_staff"))).toBe("no_staff_available");
    expect(bookingFailureReason(new BookingUnavailableError("calendar_not_synced"))).toBe("calendar_not_synced");
  });

  it("says why a reschedule time isn't bookable", async () => {
    mocks.rescheduleAppointmentForCaller.mockRejectedValue(new BookingUnavailableError("closure", "That appointment time is no longer available."));
    await expect(rescheduleForCaller(context, { businessId: "biz_1", callerPhone: "+14165550100", appointmentId: "apt_1", startsAt: "2030-01-08T15:00:00.000Z", verificationId: "ver_1", finalConfirmation: true }))
      .resolves.toEqual({ ok: false, reason: "The business is closed then for a planned closure.", unavailableReason: "closure" });
  });

  it("lets other reschedule errors through", async () => {
    mocks.rescheduleAppointmentForCaller.mockRejectedValue(new Error("database is down"));
    await expect(rescheduleForCaller(context, { businessId: "biz_1", callerPhone: "+14165550100", appointmentId: "apt_1", startsAt: "2030-01-08T15:00:00.000Z", verificationId: "ver_1", finalConfirmation: true })).rejects.toThrow("database is down");
  });
});
