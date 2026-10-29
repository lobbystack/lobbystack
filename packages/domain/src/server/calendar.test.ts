import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), enqueue: vi.fn(), alert: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), withBusinessTransaction: mocks.transaction, enqueueOutbox: mocks.enqueue }));
vi.mock("./notifications", () => ({ queueOperatorAlertInTransaction: mocks.alert }));
vi.mock("../authz", () => ({ requireBusinessAdmin: vi.fn(), requireBusinessMembership: vi.fn() }));
import { appointments, calendarBusyBlocks, calendarConnections } from "@lobbystack/db";
import { assignCalendarStaff, connectCalendar, queueUnsyncedAppointmentSyncs, resolveCalendarAccessToken, selectCalendar, updateAppointmentSyncStateInTransaction, upsertBusyBlocks } from "./calendar";

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
  const insert = (table: unknown) => ({ values: (values: unknown) => { writes.push({ table, values }); return Object.assign(chain([]), { onConflictDoUpdate: (conflict: { set: unknown }) => { writes.push({ table, values: { onConflictSet: conflict.set } }); return chain(reads.shift() ?? []); } }); } });
  const tx = { select: () => chain(reads.shift() ?? []), delete: () => chain([]), insert, update: (table: unknown) => ({ set: write(table) }) };
  mocks.transaction.mockImplementation(async (_db, _scope, callback) => callback(tx));
  return (table: unknown) => writes.filter((entry) => entry.table === table).map((entry) => entry.values);
}

const googleWide = { id: "a-google", provider: "google", staffId: null, selectedCalendarId: "team@group.calendar.google.com", status: "connected" };
const calcomWide = { id: "b-calcom", provider: "calcom", staffId: null, selectedCalendarId: "42", status: "connected" };
const upcoming = (id: string, staffId: string, eventId: string | null) => ({ id, staffId, eventId, revision: 1 });
const deletes = () => mocks.enqueue.mock.calls.filter(([, message]) => message.topic === "calendar.deleteEvent").map(([, message]) => message.payload);

it("clears upcoming bookings' event ids only when the selected calendar changes, and deletes their old events", async () => {
  const select = () => selectCalendar(context, { userId: "user", businessId: "business", connectionId: "connection", calendarId: "new@group.calendar.google.com" });
  const own = (selectedCalendarId: string) => [{ id: "connection", provider: "google", staffId: "staff", selectedCalendarId, status: "connected" }];
  let written = recordWrites([[{ staffId: "staff", selectedCalendarId: "old@group.calendar.google.com" }], own("old@group.calendar.google.com"), own("new@group.calendar.google.com"), [upcoming("appointment", "staff", "event-1")]]);
  await select();
  expect(written(appointments)).toEqual([expect.objectContaining({ calendarExternalId: null, calendarSyncState: "not_required", revision: expect.anything() })]);
  expect(deletes()).toEqual([{ appointmentId: "appointment", connectionId: "connection", calendarId: "old@group.calendar.google.com", eventId: "event-1" }]);
  mocks.enqueue.mockClear();
  written = recordWrites([[{ staffId: "staff", selectedCalendarId: "new@group.calendar.google.com" }], own("new@group.calendar.google.com"), own("new@group.calendar.google.com"), [upcoming("appointment", "staff", "event-1")]]);
  await select();
  expect(written(appointments)).toEqual([]);
  expect(deletes()).toEqual([]);
});

it("moves business-wide bookings from Google to Cal.com once a Cal.com event type is picked", async () => {
  const unpicked = { ...calcomWide, selectedCalendarId: null };
  let written = recordWrites([[{ staffId: null, selectedCalendarId: null }], [googleWide, unpicked], [googleWide, calcomWide], [upcoming("appointment", "staff", "google-event")]]);
  await selectCalendar(context, { userId: "user", businessId: "business", connectionId: "b-calcom", calendarId: "42" });
  // Google held them, so their events leave Google's calendar, and the backfill books them in Cal.com.
  expect(written(appointments)).toEqual([expect.objectContaining({ calendarExternalId: null, calendarSyncState: "not_required" })]);
  expect(deletes()).toEqual([{ appointmentId: "appointment", connectionId: "a-google", calendarId: "team@group.calendar.google.com", eventId: "google-event" }]);

  // Picking Google's calendar while Cal.com writes leaves the bookings where they are.
  mocks.enqueue.mockClear();
  written = recordWrites([[{ staffId: null, selectedCalendarId: "team@group.calendar.google.com" }], [googleWide, calcomWide], [{ ...googleWide, selectedCalendarId: "other@group.calendar.google.com" }, calcomWide], [upcoming("appointment", "staff", "booking-uid")]]);
  await selectCalendar(context, { userId: "user", businessId: "business", connectionId: "a-google", calendarId: "other@group.calendar.google.com" });
  expect(written(appointments)).toEqual([]);
  expect(deletes()).toEqual([]);
});

it("moves only a staff member's bookings when Google is assigned to them while Cal.com writes for the business", async () => {
  const written = recordWrites([[{ id: "staff-x" }], [{ staffId: null, selectedCalendarId: googleWide.selectedCalendarId }], [googleWide, calcomWide], [{ ...googleWide, staffId: "staff-x" }, calcomWide], [upcoming("theirs", "staff-x", "booking-uid-x"), upcoming("others", "staff-y", "booking-uid-y")]]);
  await assignCalendarStaff(context, { userId: "user", businessId: "business", connectionId: "a-google", staffId: "staff-x" });
  // Staff X's booking leaves Cal.com, where it was, and the backfill writes it to Google. Everyone else's stays in Cal.com.
  expect(written(appointments)).toEqual([expect.objectContaining({ calendarExternalId: null, calendarSyncState: "not_required" })]);
  expect(deletes()).toEqual([{ appointmentId: "theirs", connectionId: "b-calcom", calendarId: "42", eventId: "booking-uid-x" }]);
  expect(written(calendarConnections)).toEqual([expect.objectContaining({ staffId: "staff-x" })]);
});

it("moves the business's bookings out of Google when a staff Cal.com connection becomes business-wide", async () => {
  const staffCalcom = { ...calcomWide, staffId: "staff-x" };
  const written = recordWrites([[{ staffId: "staff-x", selectedCalendarId: "42" }], [googleWide, staffCalcom], [googleWide, calcomWide], [upcoming("theirs", "staff-x", "booking-uid-x"), upcoming("others", "staff-y", "google-event-y")]]);
  await assignCalendarStaff(context, { userId: "user", businessId: "business", connectionId: "b-calcom", staffId: null });
  // Staff X's booking stays in Cal.com. Staff Y's leaves Google, and the backfill books it in Cal.com.
  expect(written(appointments)).toEqual([expect.objectContaining({ calendarExternalId: null })]);
  expect(deletes()).toEqual([{ appointmentId: "others", connectionId: "a-google", calendarId: "team@group.calendar.google.com", eventId: "google-event-y" }]);
});

it("leaves Cal.com's bookings alone when another Google account replaces the business-wide Google connection", async () => {
  const replacement = { id: "c-google", provider: "google", staffId: null, selectedCalendarId: null, status: "connected" };
  const written = recordWrites([[googleWide, calcomWide], [{ id: "c-google", staffId: null }], [{ ...googleWide, status: "disconnected" }, calcomWide, replacement], [upcoming("appointment", "staff", "booking-uid")]]);
  await connectCalendar(context, { userId: "user", businessId: "business", provider: "google", externalAccountId: "other-account", encryptedAccessToken: "enc:access" });
  expect(written(appointments)).toEqual([]);
  expect(deletes()).toEqual([]);
});

it("revives a reconnected connection without the webhook its disconnect left without a secret", async () => {
  const written = recordWrites([[calcomWide], [{ id: "b-calcom", staffId: null }], [calcomWide], []]);
  await connectCalendar(context, { userId: "user", businessId: "business", provider: "calcom", externalAccountId: "1234", encryptedAccessToken: "enc:access" });
  const set = (written(calendarConnections).find((values) => (values as { onConflictSet?: unknown }).onConflictSet) as { onConflictSet: Record<string, SQL> }).onConflictSet;
  const dialect = new PgDialect();
  for (const column of ["externalWebhookId", "encryptedWebhookSecret"]) expect(dialect.sqlToQuery(set[column]!).sql).toMatch(/^case when "calendar_connections"\."status" = 'disconnected' then null else /);
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
