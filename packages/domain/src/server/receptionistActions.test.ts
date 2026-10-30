import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookAppointment: vi.fn(),
  findOpeningsInTransaction: vi.fn(),
  recordCallOutcomeInTransaction: vi.fn(),
  recordProductEvent: vi.fn(),
  rows: { services: [] as unknown[], appointments: [] as unknown[], sessions: [] as unknown[] },
}));

vi.mock("@lobbystack/db", async (original) => {
  const db = await original<typeof import("@lobbystack/db")>();
  const rowsFor = (table: unknown) => table === db.services ? mocks.rows.services : table === db.appointments ? mocks.rows.appointments : table === db.conversationSessions ? mocks.rows.sessions : [];
  const node = (resolve: () => unknown[]): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    self.from = (table: unknown) => node(() => rowsFor(table));
    for (const method of ["where", "limit", "innerJoin", "orderBy"]) self[method] = () => self;
    self.then = (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);
    return self;
  };
  return { ...db, withBusinessTransaction: vi.fn(async (_db, _actor, callback: (tx: unknown) => unknown) => callback({ select: () => node(() => []) })) };
});
vi.mock("./booking", () => ({ bookAppointment: mocks.bookAppointment, findOpeningsInTransaction: mocks.findOpeningsInTransaction, cancelAppointmentForCaller: vi.fn(), rescheduleAppointmentForCaller: vi.fn() }));
vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent, recordProductEventBestEffort: mocks.recordProductEvent }));
vi.mock("./callOutcome", () => ({ recordCallOutcomeInTransaction: mocks.recordCallOutcomeInTransaction }));

import { BookingUnavailableError } from "../availability";
import { bookForCaller, findOpenings } from "./receptionistActions";

const context = { db: {} as never };
const haircut = { id: "svc_1", name: "Haircut", slug: "haircut", localizedNames: { fr: "Coupe de cheveux" } };
const beardTrim = { id: "svc_2", name: "Beard trim", slug: "beard-trim", localizedNames: null };
const failedWith = (reason: string) => expect.objectContaining({ name: "appointment.booking_failed", properties: expect.objectContaining({ reason }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = { services: [haircut, beardTrim], appointments: [], sessions: [] };
  mocks.bookAppointment.mockResolvedValue({ appointmentId: "apt_1", contactId: "contact_1", staffId: "staff_1" });
});

describe("bookForCaller", () => {
  const startsAt = "2030-01-08T10:00:00.000-05:00";
  const input = { businessId: "biz_1", service: { name: "Haircut" }, startsAt, timezone: "America/Toronto", contactPhone: "+14165550100", contactName: "Milan", channel: "voice" as const };

  it("books the service the caller names by any of its names", async () => {
    await expect(bookForCaller(context, { ...input, service: { name: "coupe de cheveux" } })).resolves.toEqual({ ok: true, appointmentId: "apt_1", serviceName: "Haircut", startsAt });
    expect(mocks.bookAppointment.mock.lastCall?.[1]).toMatchObject({ serviceId: "svc_1", contactName: "Milan", sourceChannel: "voice" });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({ name: "appointment.booked", properties: expect.objectContaining({ appointmentId: "apt_1", serviceId: "svc_1" }) }));
  });

  it("books nothing for words that name no single service", async () => {
    for (const name of ["%", "h_ircut", "haircut and beard trim"]) {
      await expect(bookForCaller(context, { ...input, service: { name } })).resolves.toEqual({ ok: false, reason: "unknown_service" });
    }
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, failedWith("service_unavailable"));
  });

  it("returns the caller's earlier booking only under the call's own number", async () => {
    mocks.rows.appointments = [{ id: "apt_9" }];
    await expect(bookForCaller(context, { ...input, callerPhone: "+14165550100" })).resolves.toEqual({ ok: true, appointmentId: "apt_9", serviceName: "Haircut", startsAt, alreadyBooked: true });
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
    // A number the caller said isn't the call's own: it books instead of saying whose time it is.
    await expect(bookForCaller(context, { ...input, callerPhone: "+14165550199" })).resolves.toMatchObject({ ok: true, appointmentId: "apt_1" });
  });

  it("returns this call's own booking when the call has no number to match", async () => {
    mocks.rows.sessions = [{ summary: { kind: "booked", serviceName: "Haircut", startsAt: "2030-01-08T15:00:00.000Z" } }];
    await expect(bookForCaller(context, { ...input, callId: "call_1" })).resolves.toEqual({ ok: true, serviceName: "Haircut", startsAt, alreadyBooked: true });
    expect(mocks.recordCallOutcomeInTransaction).not.toHaveBeenCalled();
    await expect(bookForCaller(context, { ...input, callId: "call_1", startsAt: "2030-01-08T11:00:00.000-05:00" })).resolves.toMatchObject({ ok: true, appointmentId: "apt_1" });
    expect(mocks.recordCallOutcomeInTransaction.mock.lastCall?.[1]).toMatchObject({ callId: "call_1", outcome: { kind: "booking_in_progress", serviceName: "Haircut", startsAt: "2030-01-08T11:00:00.000-05:00" } });
  });

  it("returns why a booking was refused, and records it", async () => {
    mocks.bookAppointment.mockRejectedValueOnce(new BookingUnavailableError("no_hours"));
    await expect(bookForCaller(context, input)).resolves.toEqual({ ok: false, reason: "no_hours" });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, failedWith("no_hours"));
    // Telemetry keeps its earlier name for a taken time.
    mocks.bookAppointment.mockRejectedValueOnce(new BookingUnavailableError("taken"));
    await expect(bookForCaller(context, input)).resolves.toEqual({ ok: false, reason: "taken" });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, failedWith("slot_unavailable"));
  });

  it("records and throws any other error", async () => {
    mocks.bookAppointment.mockRejectedValueOnce(new Error("database is down"));
    await expect(bookForCaller(context, input)).rejects.toThrow("database is down");
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, failedWith("unknown"));
  });
});

describe("findOpenings", () => {
  const input = { businessId: "biz_1", serviceName: "coupe de cheveux", date: "2030-01-08", preferredHour24: 10, callId: "call_1" };

  it("searches the named service's day and records what the call is booking", async () => {
    mocks.findOpeningsInTransaction.mockResolvedValueOnce({ timezone: "America/Toronto", durationMinutes: 60, openings: ["2030-01-08T15:00:00.000Z"] });
    await expect(findOpenings(context, input)).resolves.toEqual({ ok: true, serviceName: "Haircut", date: "2030-01-08", timezone: "America/Toronto", openings: [{ startsAt: "2030-01-08T15:00:00.000Z", displayTime: "Tuesday Jan 8, 10:00 AM" }] });
    expect(mocks.findOpeningsInTransaction.mock.lastCall?.[1]).toEqual({ businessId: "biz_1", serviceId: "svc_1", dates: ["2030-01-08"], limit: 3, preferredMinutes: 600 });
    expect(mocks.recordCallOutcomeInTransaction.mock.lastCall?.[1]).toMatchObject({ callId: "call_1", outcome: { kind: "booking_in_progress", serviceName: "Haircut", startsAt: null } });
  });

  it("spreads the times across the day when the caller has no preferred time, and says how many more are open", async () => {
    mocks.findOpeningsInTransaction.mockResolvedValueOnce({ timezone: "America/Toronto", durationMinutes: 60, openings: ["2030-01-08T15:00:00.000Z"], moreOpenings: 5 });
    const { preferredHour24: _preferred, ...anyTime } = input;
    await expect(findOpenings(context, anyTime)).resolves.toMatchObject({ moreOpenings: 5 });
    expect(mocks.findOpeningsInTransaction.mock.lastCall?.[1]).toEqual({ businessId: "biz_1", serviceId: "svc_1", dates: ["2030-01-08"], limit: 3, spread: true });
  });

  it("passes on why a day has no openings", async () => {
    mocks.findOpeningsInTransaction.mockResolvedValueOnce({ timezone: "America/Toronto", durationMinutes: 60, openings: [], reason: "closure" });
    await expect(findOpenings(context, input)).resolves.toMatchObject({ ok: true, openings: [], reason: "closure" });
  });

  it("says when the business offers no such service", async () => {
    await expect(findOpenings(context, { ...input, serviceName: "oil change" })).resolves.toEqual({ ok: false, reason: "unknown_service" });
    expect(mocks.findOpeningsInTransaction).not.toHaveBeenCalled();
    expect(mocks.recordCallOutcomeInTransaction).not.toHaveBeenCalled();
  });
});
