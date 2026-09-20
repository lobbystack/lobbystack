import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), token: vi.fn(), update: vi.fn(), updateTx: vi.fn(), mark: vi.fn(), busy: vi.fn(), record: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), withBusinessTransaction: mocks.transaction }));
vi.mock("@lobbystack/domain", () => ({ CALENDAR_SYNC_HORIZON_MS: 90 * 86400_000, resolveCalendarAccessToken: mocks.token, updateAppointmentSyncState: mocks.update, updateAppointmentSyncStateInTransaction: mocks.updateTx, markCalendarConnectionSync: mocks.mark, upsertBusyBlocks: mocks.busy, recordProductEvent: mocks.record }));
import { reconcileBusinessCalendar, syncAppointmentCalendar } from "./calendarJobs";

type Chain = Promise<unknown[]> & { from: () => Chain; innerJoin: () => Chain; leftJoin: () => Chain; where: () => Chain; orderBy: () => Chain; limit: () => Chain };
let batches: unknown[][];
const execute = vi.fn();
function query() { const chain = Promise.resolve(batches.shift() ?? []) as Chain; for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"] as const) chain[method] = () => chain; return chain; }
const provider = { getBusyBlocks: vi.fn(), upsertEvent: vi.fn(), deleteEvent: vi.fn(), refreshAccessToken: vi.fn() };
const dependencies = { domain: { db: {} as never }, calendar: provider };
const appointment = { id: "appointment", status: "confirmed", startsAt: new Date("2026-09-14T10:00:00Z"), endsAt: new Date("2026-09-14T10:30:00Z"), externalEventId: "event", serviceName: "Service", contactName: null, connectionId: "connection", calendarId: "selected", connectionStatus: "connected", provider: "google" };

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ENCRYPTION_KEY", "fixture-key");
  batches = [[appointment], [appointment]];
  mocks.transaction.mockImplementation(async (_db, _scope, callback) => callback({ select: query, execute }));
  mocks.token.mockResolvedValue("access");
  provider.upsertEvent.mockResolvedValue({ externalEventId: "event" });
  provider.deleteEvent.mockResolvedValue(undefined);
  provider.getBusyBlocks.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

it("rereads durable cancellation state and deletes instead of rewriting the event", async () => {
  batches = [[appointment], [{ ...appointment, status: "canceled" }]];
  await expect(syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" })).resolves.toMatchObject({ status: "completed" });
  expect(provider.deleteEvent).toHaveBeenCalledWith({ accessToken: "access", calendarId: "selected", eventId: "event" });
  expect(provider.upsertEvent).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledOnce();
  expect(mocks.updateTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ state: "synced" }));
});

it("uses deterministic event identity for creates and reschedules", async () => {
  batches = [[{ ...appointment, externalEventId: null }], [{ ...appointment, externalEventId: null }]];
  await syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" });
  expect(provider.upsertEvent).toHaveBeenCalledWith(expect.objectContaining({ clientEventId: expect.stringMatching(/^a[a-f0-9]{31}$/), calendarId: "selected" }));
});

it("preserves busy data on one calendar failure and still reconciles other connections", async () => {
  batches = [[{ id: "first", calendarId: "one", staffId: null, status: "connected" }, { id: "second", calendarId: "two", staffId: "staff", status: "connected" }]];
  provider.getBusyBlocks.mockRejectedValueOnce(new Error("permission denied")).mockResolvedValueOnce([]);
  await expect(reconcileBusinessCalendar(dependencies, "business")).rejects.toThrow("1 connection");
  expect(mocks.busy).toHaveBeenCalledOnce();
  expect(mocks.busy).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ connectionId: "second", calendarId: "two", markSynced: true }));
  expect(mocks.mark).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ connectionId: "first", error: "permission denied" }));
});

it("records integration.calendar_sync_failed with the appointment and provider", async () => {
  provider.upsertEvent.mockRejectedValue(new Error("permission denied"));

  await expect(syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" })).rejects.toThrow("permission denied");

  expect(mocks.update).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ appointmentId: "appointment", state: "failed" }));
  expect(mocks.record).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({
    name: "integration.calendar_sync_failed",
    businessId: "business",
    properties: { appointmentId: "appointment", provider: "google" },
  }));
});

it("does not record a sync failure when the calendar selection changed mid-sync", async () => {
  batches = [[appointment], [{ ...appointment, connectionId: "other" }]];

  await expect(syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" })).rejects.toThrow("Calendar selection changed during synchronization.");

  expect(mocks.mark).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
});
