import { beforeEach, describe, expect, it, vi } from "vitest";

import { appointments, businesses, businessHours, calendarBusyBlocks, calendarConnections, closures, services, staff, staffServiceAssignments } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.withBusinessTransaction, enqueueOutbox: vi.fn() }));

import { BookingUnavailableError } from "../availability";
import { bookAppointment, checkAvailability, findAvailability, findOpeningsInTransaction } from "./booking";

type Rows = Partial<{ services: unknown[]; hours: unknown[]; closures: unknown[]; staff: unknown[]; assignments: unknown[]; connections: unknown[]; appointments: unknown[]; busy: unknown[] }>;

// 2027-06-07 is a Monday. The service lasts 30 minutes.
const startsAt = "2027-06-07T15:00:00.000Z";
const open = [{ dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 17 * 60 }];

function useRows(rows: Rows) {
  const rowsFor = (table: unknown): unknown[] => {
    if (table === services) return rows.services ?? [{ id: "svc-1", name: "Haircut", durationMinutes: 30 }];
    if (table === businesses) return [{ timezone: "UTC" }];
    if (table === staff) return rows.staff ?? [{ id: "staff-1" }];
    if (table === staffServiceAssignments) return rows.assignments ?? [];
    if (table === calendarConnections) return rows.connections ?? [];
    if (table === businessHours) return rows.hours ?? open;
    if (table === closures) return rows.closures ?? [];
    if (table === appointments) return rows.appointments ?? [];
    if (table === calendarBusyBlocks) return rows.busy ?? [];
    return [];
  };
  const reads = new Map<unknown, number>();
  const node = (resolve: () => unknown[]): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    self.from = (table: unknown) => { reads.set(table, (reads.get(table) ?? 0) + 1); return node(() => rowsFor(table)); };
    for (const method of ["where", "limit", "orderBy", "for"]) self[method] = () => self;
    self.then = (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);
    return self;
  };
  const tx = { select: () => node(() => []), execute: async () => [] };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback(tx));
  return { tx: tx as never, reads };
}

const context = { db: {} as never };
const check = () => checkAvailability(context, { businessId: "biz-1", serviceId: "svc-1", startsAt });

beforeEach(() => { vi.clearAllMocks(); });

describe("checkAvailability reasons", () => {
  it("returns open slots without a reason", async () => {
    useRows({});
    const result = await check();
    expect(result.slots).toHaveLength(1);
    expect(result.reason).toBeUndefined();
    expect(await findAvailability(context, { businessId: "biz-1", serviceId: "svc-1", startsAt })).toHaveLength(1);
  });

  it.each([
    ["no_hours", { hours: [] }],
    ["closed_day", { hours: [{ dayOfWeek: 2, openMinutes: 0, closeMinutes: 1440 }] }],
    ["outside_hours", { hours: [{ dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 15 * 60 + 15 }] }],
    ["closure", { closures: [{ startsAt: new Date("2027-06-07T00:00:00Z"), endsAt: new Date("2027-06-08T00:00:00Z"), reason: "Holiday" }] }],
    ["no_staff", { staff: [] }],
    ["no_staff", { assignments: [{ staffId: "someone-else" }] }],
    ["calendar_not_synced", { connections: [{ id: "conn-1", staffId: null, selectedCalendarId: "primary", status: "connected", lastSyncedAt: new Date(Date.now() - 60 * 60_000) }] }],
    ["calendar_not_synced", { connections: [{ id: "conn-1", staffId: null, selectedCalendarId: "primary", status: "error", lastSyncedAt: new Date() }] }],
    ["taken", { appointments: [{ staffId: "staff-1", startsAt: new Date(startsAt), endsAt: new Date("2027-06-07T15:30:00.000Z") }] }],
  ] as Array<[string, Rows]>)("says %s", async (reason, rows) => {
    useRows(rows);
    await expect(check()).resolves.toEqual({ slots: [], reason });
  });

  it("fails a turned-off service with a 409, so the API doesn't answer it as a server error", async () => {
    useRows({ services: [] });
    await expect(check()).rejects.toMatchObject({ message: "Service is not available.", status: 409 });
  });

  it("checks hours and closures before reading staff schedules", async () => {
    useRows({ hours: [], appointments: [{ staffId: "staff-1", startsAt: new Date(startsAt), endsAt: new Date("2027-06-07T15:30:00.000Z") }] });
    await expect(check()).resolves.toEqual({ slots: [], reason: "no_hours" });
  });
});

describe("bookAppointment refusals", () => {
  const input = { businessId: "biz-1", serviceId: "svc-1", startsAt, timezone: "UTC", contactPhone: "+14165550100", sourceChannel: "voice" };

  it.each([["no_hours", { hours: [] }], ["calendar_not_synced", { connections: [{ id: "conn-1", staffId: null, selectedCalendarId: "primary", status: "connected", lastSyncedAt: null }] }], ["taken", { appointments: [{ staffId: "staff-1", startsAt: new Date(startsAt), endsAt: new Date("2027-06-07T15:30:00.000Z") }] }]] as Array<[string, Rows]>)("says why with %s and keeps the old message", async (reason, rows) => {
    useRows(rows);
    const error = await bookAppointment(context, input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BookingUnavailableError);
    expect(error).toMatchObject({ reason, message: "No staff member is available for this service." });
  });
});

describe("findOpeningsInTransaction", () => {
  const booked = { staffId: "staff-1", startsAt: new Date(startsAt), endsAt: new Date("2027-06-07T15:30:00.000Z") };
  const search = (tx: never, input: { dates?: string[]; staffId?: string; preferredMinutes?: number; limit?: number } = {}) =>
    findOpeningsInTransaction(tx, { businessId: "biz-1", serviceId: "svc-1", dates: ["2027-06-07"], ...input });

  it("finds a day's openings nearest the preferred time, reading the schedule and bookings once", async () => {
    const { tx, reads } = useRows({ appointments: [booked] });
    await expect(search(tx, { preferredMinutes: 15 * 60, limit: 3 })).resolves.toEqual({
      timezone: "UTC",
      durationMinutes: 30,
      openings: ["2027-06-07T14:00:00.000Z", "2027-06-07T14:30:00.000Z", "2027-06-07T15:30:00.000Z"],
    });
    for (const table of [services, businesses, staff, staffServiceAssignments, calendarConnections, businessHours, closures, appointments]) expect(reads.get(table)).toBe(1);
  });

  it("keeps to the staff member asked for", async () => {
    const { tx } = useRows({ staff: [{ id: "staff-1" }, { id: "staff-2" }], appointments: [booked] });
    expect((await search(tx, { preferredMinutes: 15 * 60, limit: 1 })).openings).toEqual([startsAt]);
    expect((await search(tx, { preferredMinutes: 15 * 60, limit: 1, staffId: "staff-1" })).openings).toEqual(["2027-06-07T14:30:00.000Z"]);
  });

  it.each([
    ["no_hours", { hours: [] }, "2027-06-07"],
    ["closed_day", {}, "2027-06-08"],
    ["no_times_left", {}, "2020-06-01"],
    ["closure", { closures: [{ startsAt: new Date("2027-06-07T00:00:00Z"), endsAt: new Date("2027-06-08T00:00:00Z"), reason: "Holiday" }] }, "2027-06-07"],
    ["calendar_not_synced", { connections: [{ id: "conn-1", staffId: null, selectedCalendarId: "primary", status: "error", lastSyncedAt: new Date() }] }, "2027-06-07"],
    ["taken", { appointments: [{ staffId: "staff-1", startsAt: new Date("2027-06-07T09:00:00Z"), endsAt: new Date("2027-06-07T17:00:00Z") }] }, "2027-06-07"],
  ] as Array<[string, Rows, string]>)("says %s when there is no opening", async (reason, rows, date) => {
    const { tx } = useRows(rows);
    await expect(search(tx, { dates: [date] })).resolves.toMatchObject({ openings: [], reason });
  });
});
