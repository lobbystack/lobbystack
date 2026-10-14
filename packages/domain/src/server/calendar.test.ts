import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), enqueue: vi.fn(), alert: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), withBusinessTransaction: mocks.transaction, enqueueOutbox: mocks.enqueue }));
vi.mock("./notifications", () => ({ queueOperatorAlertInTransaction: mocks.alert }));
vi.mock("../authz", () => ({ requireBusinessAdmin: vi.fn(), requireBusinessMembership: vi.fn() }));
import { appointments, calendarBusyBlocks, calendarConnections } from "@lobbystack/db";
import { assignCalendarStaff, queueUnsyncedAppointmentSyncs, resolveCalendarAccessToken, selectCalendar, updateAppointmentSyncStateInTransaction, upsertBusyBlocks } from "./calendar";

const now = new Date("2026-09-13T12:00:00Z");
const row = { id: "connection", businessId: "business", status: "connected", encryptedAccessToken: "enc:old", encryptedRefreshToken: "enc:refresh", tokenExpiresAt: new Date(now.getTime() - 1000) };
const update = vi.fn();
const refresh = vi.fn();
const context = { db: {} as never };
const input = { businessId: "business", connectionId: "connection", now, decryptToken: (value: string) => value.slice(4), encryptToken: (value: string) => `enc:${value}`, refreshAccessToken: refresh };

function useConnection(value: unknown) {
  const tx = { select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => value ? [value] : [] }) }) }) }), update: () => ({ set: update }) };
  mocks.transaction.mockImplementation(async (_db, _scope, callback) => callback(tx));
}

beforeEach(() => { vi.clearAllMocks(); update.mockReturnValue({ where: async () => undefined }); refresh.mockResolvedValue({ accessToken: "fresh", expiresIn: 3600 }); useConnection(row); });

it("refreshes under the tenant transaction and persists only encrypted tokens", async () => {
  await expect(resolveCalendarAccessToken(context, input)).resolves.toBe("fresh");
  expect(mocks.transaction).toHaveBeenCalledWith(context.db, { businessId: "business", actorType: "worker" }, expect.any(Function));
  expect(refresh).toHaveBeenCalledWith({ refreshToken: "refresh" });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ encryptedAccessToken: "enc:fresh", tokenExpiresAt: new Date(now.getTime() + 3600_000) }));
  expect(update.mock.calls[0]?.[0]).not.toHaveProperty("encryptedRefreshToken");
});

it("uses a still-valid access token without refreshing", async () => {
  useConnection({ ...row, tokenExpiresAt: new Date(now.getTime() + 120_000) });
  await expect(resolveCalendarAccessToken(context, input)).resolves.toBe("old");
  expect(refresh).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});

it("does not persist failed refreshes or use another tenant's connection", async () => {
  refresh.mockRejectedValue(new Error("refresh unavailable"));
  await expect(resolveCalendarAccessToken(context, input)).rejects.toThrow("refresh unavailable");
  expect(update).not.toHaveBeenCalled();
  refresh.mockClear(); useConnection({ ...row, businessId: "foreign" });
  await expect(resolveCalendarAccessToken(context, input)).rejects.toThrow("unavailable");
  expect(refresh).not.toHaveBeenCalled();
});

it("requires reconnection when credentials are missing or disconnected", async () => {
  useConnection({ ...row, encryptedRefreshToken: null });
  await expect(resolveCalendarAccessToken(context, input)).rejects.toThrow("reconnection");
  useConnection({ ...row, status: "disconnected" });
  await expect(resolveCalendarAccessToken(context, input)).rejects.toThrow("unavailable");
  expect(refresh).not.toHaveBeenCalled();
});

it("alerts operators once per appointment time, not once per sync retry", async () => {
  // Each failed attempt bumps the appointment revision.
  let revision = 1;
  let startsAt = new Date("2026-09-20T14:00:00Z");
  const tx = { update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "appointment", revision: ++revision, startsAt, status: "confirmed" }] }) }) }) };
  const fail = () => updateAppointmentSyncStateInTransaction(tx as never, { businessId: "business", appointmentId: "appointment", state: "failed", error: "status 503" });
  await fail();
  await fail();
  // A week later the operator moves it, and that sync fails too.
  startsAt = new Date("2026-09-21T15:00:00Z");
  await fail();
  expect(mocks.alert.mock.calls.map(([, alert]) => alert.eventKey)).toEqual([
    "calendarSync:appointment:appointment:2026-09-20T14:00:00.000Z:confirmed",
    "calendarSync:appointment:appointment:2026-09-20T14:00:00.000Z:confirmed",
    "calendarSync:appointment:appointment:2026-09-21T15:00:00.000Z:confirmed",
  ]);
});

// Answers selects in order and records each insert and update.
function recordWrites(reads: unknown[][]) {
  const writes: Array<{ table: unknown; values: unknown }> = [];
  const chain = (result: unknown): Promise<unknown> => Object.assign(Promise.resolve(result), { from: () => chain(result), where: () => chain(result), limit: () => chain(result), for: () => chain(result), returning: () => chain(result) });
  const write = (table: unknown) => (values: unknown) => { writes.push({ table, values }); return chain([]); };
  const tx = { select: () => chain(reads.shift() ?? []), delete: () => chain([]), insert: (table: unknown) => ({ values: write(table) }), update: (table: unknown) => ({ set: write(table) }) };
  mocks.transaction.mockImplementation(async (_db, _scope, callback) => callback(tx));
  return (table: unknown) => writes.filter((entry) => entry.table === table).map((entry) => entry.values);
}

it("clears upcoming bookings' event ids only when the selected calendar changes, and deletes their old events", async () => {
  const select = () => selectCalendar(context, { userId: "user", businessId: "business", connectionId: "connection", calendarId: "new@group.calendar.google.com" });
  let written = recordWrites([[{ staffId: "staff", selectedCalendarId: "old@group.calendar.google.com" }], [{ id: "appointment", eventId: "event-1", revision: 4 }]]);
  await select();
  expect(written(appointments)).toEqual([expect.objectContaining({ calendarExternalId: null, calendarSyncState: "not_required", revision: expect.anything() })]);
  expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "calendar.deleteEvent", payload: { appointmentId: "appointment", connectionId: "connection", calendarId: "old@group.calendar.google.com", eventId: "event-1" } }));
  mocks.enqueue.mockClear();
  written = recordWrites([[{ staffId: "staff", selectedCalendarId: "new@group.calendar.google.com" }]]);
  await select();
  expect(written(appointments)).toEqual([]);
  expect(mocks.enqueue).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "calendar.deleteEvent" }));
});

it("moves other staff's bookings out of a business-wide calendar assigned to one staff member", async () => {
  const written = recordWrites([[{ id: "staff-1" }], [{ staffId: null, selectedCalendarId: "shared@group.calendar.google.com" }], [{ id: "appointment", eventId: "event-2", revision: 1 }]]);
  await assignCalendarStaff(context, { userId: "user", businessId: "business", connectionId: "connection", staffId: "staff-1" });
  expect(written(appointments)).toEqual([expect.objectContaining({ calendarExternalId: null, calendarSyncState: "not_required" })]);
  expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "calendar.deleteEvent", payload: { appointmentId: "appointment", connectionId: "connection", calendarId: "shared@group.calendar.google.com", eventId: "event-2" } }));
  expect(written(calendarConnections)).toEqual([expect.objectContaining({ staffId: "staff-1" })]);
});

it("backfills a booking again once its connection switches calendars", async () => {
  const backfillKey = async (calendarId: string) => {
    recordWrites([[{ staffId: null, selectedCalendarId: calendarId, status: "connected" }], [{ id: "appointment" }]]);
    await queueUnsyncedAppointmentSyncs(context, { businessId: "business", connectionId: "connection" });
    return mocks.enqueue.mock.calls.at(-1)?.[1].dedupeKey;
  };
  const first = await backfillKey("old@group.calendar.google.com");
  expect(await backfillKey("old@group.calendar.google.com")).toBe(first);
  expect(await backfillKey("new@group.calendar.google.com")).not.toBe(first);
});

it("backfills a released booking again when its connection returns to an earlier calendar", async () => {
  const backfillKey = async (revision: number) => {
    recordWrites([[{ staffId: null, selectedCalendarId: "first@group.calendar.google.com", status: "connected" }], [{ id: "appointment", revision }]]);
    await queueUnsyncedAppointmentSyncs(context, { businessId: "business", connectionId: "connection" });
    return mocks.enqueue.mock.calls.at(-1)?.[1].dedupeKey;
  };
  // Switching away and back released the booking twice, from revision 3 to 5.
  expect(await backfillKey(5)).not.toBe(await backfillKey(3));
});

it("leaves bookings a staff connection owns out of a business-wide backfill", async () => {
  const conditions: SQL[] = [];
  const reads: unknown[][] = [[{ staffId: null, selectedCalendarId: "shared@group.calendar.google.com", status: "connected" }], []];
  // Real query builders, so the subquery renders; awaiting one answers the next read.
  const tx = { select: (fields: never) => ({ from: (table: never) => ({ where: (condition: SQL) => {
    conditions.push(condition);
    return Object.assign(new QueryBuilder().select(fields).from(table).where(condition), { limit: async () => reads.shift(), then: (resolve: (rows: unknown) => void) => resolve(reads.shift()) });
  } }) }) };
  mocks.transaction.mockImplementation(async (_db, _scope, callback) => callback(tx));
  await queueUnsyncedAppointmentSyncs(context, { businessId: "business", connectionId: "connection" });
  expect(new PgDialect().sqlToQuery(conditions.at(-1)!).sql).toContain('not exists (select "id" from "calendar_connections" where ("calendar_connections"."business_id" = $5 and "calendar_connections"."staff_id" = "appointments"."staff_id" and "calendar_connections"."status" <> $6))');
});

it("writes a busy calendar in bounded inserts inside one transaction and marks it synced", async () => {
  const written = recordWrites([[{ status: "connected", selectedCalendarId: "calendar" }]]);
  const blocks = Array.from({ length: 12_001 }, (_, index) => ({ startsAt: new Date(now.getTime() + index * 60_000).toISOString(), endsAt: new Date(now.getTime() + (index + 1) * 60_000).toISOString(), externalEventId: `event-${index}` }));
  await upsertBusyBlocks(context, { businessId: "business", connectionId: "connection", calendarId: "calendar", syncStartedAt: now, blocks });
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(written(calendarBusyBlocks).map((rows) => (rows as unknown[]).length)).toEqual([5_000, 5_000, 2_001]);
  expect(written(calendarConnections)).toEqual([expect.objectContaining({ status: "connected", lastSyncError: null, lastSyncedAt: now })]);
});
