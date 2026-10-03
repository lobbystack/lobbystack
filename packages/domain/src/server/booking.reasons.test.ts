import { beforeEach, describe, expect, it, vi } from "vitest";

import { appointments, businesses, businessHours, calendarBusyBlocks, calendarConnections, closures, services, staff, staffServiceAssignments } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.withBusinessTransaction, enqueueOutbox: vi.fn() }));

import { BookingUnavailableError } from "../availability";
import { bookAppointment, checkAvailability, findAvailability } from "./booking";

type Rows = Partial<{ hours: unknown[]; closures: unknown[]; staff: unknown[]; assignments: unknown[]; connections: unknown[]; appointments: unknown[]; busy: unknown[] }>;

// 2027-06-07 is a Monday. The service lasts 30 minutes.
const startsAt = "2027-06-07T15:00:00.000Z";
const open = [{ dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 17 * 60 }];

function useRows(rows: Rows) {
  const rowsFor = (table: unknown): unknown[] => {
    if (table === services) return [{ id: "svc-1", name: "Haircut", durationMinutes: 30 }];
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
  const node = (resolve: () => unknown[]): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    self.from = (table: unknown) => node(() => rowsFor(table));
    for (const method of ["where", "limit", "orderBy", "for"]) self[method] = () => self;
    self.then = (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);
    return self;
  };
  const tx = { select: () => node(() => []), execute: async () => [] };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback(tx));
}

const context = { db: {} as never };
const check = () => checkAvailability(context, { businessId: "biz-1", serviceId: "svc-1", startsAt, timezone: "UTC" });

beforeEach(() => { vi.clearAllMocks(); });

describe("checkAvailability reasons", () => {
  it("returns open slots without a reason", async () => {
    useRows({});
    const result = await check();
    expect(result.slots).toHaveLength(1);
    expect(result.reason).toBeUndefined();
    expect(await findAvailability(context, { businessId: "biz-1", serviceId: "svc-1", startsAt, timezone: "UTC" })).toHaveLength(1);
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
