import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ followLinks: vi.fn(), transaction: vi.fn(), token: vi.fn(), update: vi.fn(), updateTx: vi.fn(), mark: vi.fn(), busy: vi.fn(), backfill: vi.fn(), record: vi.fn(), registerOnce: vi.fn(), retired: vi.fn(), forget: vi.fn(), follow: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), withBusinessTransaction: mocks.transaction }));
vi.mock("@lobbystack/domain", async () => ({ ...await vi.importActual<typeof import("../../../packages/domain/src/calendarWriter")>("../../../packages/domain/src/calendarWriter"), followCalendarVideoLinks: mocks.followLinks, CALENDAR_SYNC_HORIZON_MS: 90 * 86400_000, resolveCalendarAccessToken: mocks.token, updateAppointmentSyncState: mocks.update, updateAppointmentSyncStateInTransaction: mocks.updateTx, markCalendarConnectionSync: mocks.mark, queueUnsyncedAppointmentSyncs: mocks.backfill, upsertBusyBlocks: mocks.busy, recordProductEvent: mocks.record, registerCalendarWebhookOnce: mocks.registerOnce, getRetiredCalendarConnection: mocks.retired, forgetRetiredCalendarWebhook: mocks.forget, followCalendarBookingChanges: mocks.follow }));
import { calendarConnections } from "@lobbystack/db";
import { CALENDLY_PLAN_ERROR } from "@lobbystack/shared";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { deleteReleasedCalendarEvent, reconcileBusinessCalendar, retireCalendarWebhook, syncAppointmentCalendar } from "./calendarJobs";

type Chain = Promise<unknown[]> & { from: () => Chain; innerJoin: () => Chain; leftJoin: () => Chain; where: () => Chain; orderBy: () => Chain; limit: () => Chain; for: (...args: unknown[]) => Chain };
let batches: unknown[][];
const execute = vi.fn();
const lock = vi.fn();
function query() { const chain = Promise.resolve(batches.shift() ?? []) as Chain; for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"] as const) chain[method] = () => chain; chain.for = (...args) => { lock(...args); return chain; }; return chain; }
const provider = { getBusyBlocks: vi.fn(), upsertEvent: vi.fn(), deleteEvent: vi.fn(), refreshAccessToken: vi.fn() };
const dependencies = { domain: { db: {} as never }, calendars: { google: provider } };
const appointment = { id: "appointment", status: "confirmed", startsAt: new Date("2026-09-14T10:00:00Z"), endsAt: new Date("2026-09-14T10:30:00Z"), externalEventId: "event", serviceName: "Service", contactName: null, connectionId: "connection", calendarId: "selected", connectionStatus: "connected", provider: "google" };

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ENCRYPTION_KEY", "fixture-key");
  batches = [[appointment], [appointment]];
  mocks.transaction.mockImplementation(async (_db, _scope, callback) => callback({ select: query, execute }));
  mocks.token.mockResolvedValue("access");
  provider.upsertEvent.mockResolvedValue({ externalEventId: "event" });
  provider.deleteEvent.mockResolvedValue(undefined);
  provider.getBusyBlocks.mockResolvedValue([]);
  // Stands in for the row lock: registers only while the connection has no webhook yet.
  let stored: string | null = null;
  mocks.registerOnce.mockImplementation(async (_context, input: { register: () => Promise<{ externalWebhookId: string }> }) => {
    if (stored) return "exists";
    stored = (await input.register()).externalWebhookId;
    return "registered";
  });
});
afterEach(() => vi.unstubAllEnvs());

it("saves the booking's video link with its event id, and clears it when the provider has none", async () => {
  provider.upsertEvent.mockResolvedValueOnce({ externalEventId: "event", videoUrl: "https://app.cal.com/video/abc" });
  await syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" });
  expect(mocks.updateTx).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ state: "synced", videoUrl: "https://app.cal.com/video/abc" }));
  batches = [[appointment], [appointment]];
  await syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" });
  expect(mocks.updateTx).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ state: "synced", videoUrl: null }));
});

it("saves the video links a sync reads from Cal.com, and skips the step when there are none", async () => {
  const videoLinks = [{ eventId: "booking-uid", videoUrl: "https://app.cal.com/video/abc" }];
  const connection = { id: "connection", provider: "calcom", calendarId: "42", status: "connected", webhookId: "webhook" };
  const calcom = { ...provider, getBookingChanges: vi.fn().mockResolvedValue({ cancelled: [], moved: [], videoLinks }) };
  batches = [[connection]];
  await reconcileBusinessCalendar({ domain: dependencies.domain, calendars: { calcom } }, "business");
  expect(mocks.followLinks).toHaveBeenCalledWith(dependencies.domain, { businessId: "business", links: videoLinks });
  mocks.followLinks.mockClear();
  calcom.getBookingChanges.mockResolvedValue({ cancelled: [], moved: [], videoLinks: [] });
  batches = [[connection]];
  await reconcileBusinessCalendar({ domain: dependencies.domain, calendars: { calcom } }, "business");
  expect(mocks.followLinks).not.toHaveBeenCalled();
});

it("follows bookings someone changed in Cal.com", async () => {
  const changes = { cancelled: ["booking-uid"], moved: [] };
  const calcom = { ...provider, getBookingChanges: vi.fn().mockResolvedValue(changes) };
  batches = [[{ id: "connection", provider: "calcom", calendarId: "42", status: "connected", webhookId: "webhook" }]];
  await reconcileBusinessCalendar({ domain: dependencies.domain, calendars: { calcom } }, "business");
  expect(mocks.follow).toHaveBeenCalledWith(dependencies.domain, { businessId: "business", provider: "Cal.com", changes });
});

it("asks for a reconnect only when the provider rejected the grant", async () => {
  const connection = { id: "connection", provider: "calcom", calendarId: "42", status: "connected", webhookId: "webhook" };
  const failing = (error: Error) => ({ domain: dependencies.domain, calendars: { calcom: { ...provider, getBusyBlocks: vi.fn().mockRejectedValue(error) } } });
  batches = [[connection]];
  await expect(reconcileBusinessCalendar(failing(Object.assign(new Error("Cal.com booking list failed with status 401."), { responseStatus: 401 })), "business")).rejects.toThrow("1 connection");
  expect(mocks.mark).toHaveBeenLastCalledWith(dependencies.domain, expect.objectContaining({ error: "Calendar authorization requires reconnection." }));
  batches = [[connection]];
  await expect(reconcileBusinessCalendar(failing(new Error("Cal.com webhook registration failed with status 409.")), "business")).rejects.toThrow("1 connection");
  expect(mocks.mark).toHaveBeenLastCalledWith(dependencies.domain, expect.objectContaining({ error: "Cal.com webhook registration failed with status 409." }));
});

it("rereads durable cancellation state and deletes instead of rewriting the event", async () => {
  batches = [[appointment], [{ ...appointment, status: "canceled" }]];
  await expect(syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" })).resolves.toMatchObject({ status: "completed" });
  expect(provider.deleteEvent).toHaveBeenCalledWith({ accessToken: "access", calendarId: "selected", eventId: "event", appointmentId: "appointment" });
  expect(provider.upsertEvent).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledOnce();
  expect(mocks.updateTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ state: "synced" }));
});

it("writes a business-wide appointment to Cal.com when Google is connected business-wide too", async () => {
  const calcom = { getBusyBlocks: vi.fn(), upsertEvent: vi.fn().mockResolvedValue({ externalEventId: "booking-uid" }), deleteEvent: vi.fn(), refreshAccessToken: vi.fn() };
  const both = { domain: dependencies.domain, calendars: { google: provider, calcom } };
  const rows = [{ ...appointment, connectionId: "a-google", calendarId: "team@group.calendar.google.com", provider: "google", staffId: null }, { ...appointment, connectionId: "b-calcom", calendarId: "42", provider: "calcom", staffId: null }];
  batches = [rows, rows];
  await expect(syncAppointmentCalendar(both, { businessId: "business", appointmentId: "appointment" })).resolves.toMatchObject({ status: "completed" });
  expect(calcom.upsertEvent).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "42", appointmentId: "appointment" }));
  expect(provider.upsertEvent).not.toHaveBeenCalled();
  expect(mocks.updateTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalEventId: "booking-uid" }));
});

it("fails an appointment Cal.com should get when this worker has no Cal.com setup, so the operator hears about it", async () => {
  const rows = [{ ...appointment, connectionId: "b-calcom", calendarId: "42", provider: "calcom", staffId: null }];
  batches = [rows];
  await expect(syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" })).resolves.toMatchObject({ status: "skipped" });
  expect(mocks.update).toHaveBeenCalledWith(dependencies.domain, { businessId: "business", appointmentId: "appointment", state: "failed", error: "Cal.com isn't set up on this server." });
  expect(provider.upsertEvent).not.toHaveBeenCalled();
});

it("waits out a short rate limit quietly, and tells the operator about a long one", async () => {
  const rows = [{ ...appointment, connectionId: "connection", calendarId: "ET1", provider: "calendly", staffId: null }];
  const limited = (retryAfterMs: number) => ({ ...provider, upsertEvent: vi.fn().mockRejectedValue(Object.assign(new Error("Calendly's booking limit is reached for now, so this appointment isn't in Calendly yet."), { retryAfterMs })) });
  const sync = async (retryAfterMs: number) => {
    batches = [rows, rows];
    return await syncAppointmentCalendar({ domain: dependencies.domain, calendars: { calendly: limited(retryAfterMs) } }, { businessId: "business", appointmentId: "appointment" });
  };
  await expect(sync(60_000)).resolves.toMatchObject({ status: "deferred", entityId: "appointment", retryAt: expect.any(Date) });
  expect(mocks.update).not.toHaveBeenCalled();
  await expect(sync(3_600_000)).resolves.toMatchObject({ status: "deferred" });
  expect(mocks.update).toHaveBeenCalledWith(dependencies.domain, { businessId: "business", appointmentId: "appointment", state: "failed", error: "Calendly's booking limit is reached for now, so this appointment isn't in Calendly yet." });
  expect(mocks.record).not.toHaveBeenCalled();
});

it("fails an appointment Calendly refuses, so the operator hears about it", async () => {
  const rows = [{ ...appointment, connectionId: "connection", calendarId: "ET1", provider: "calendly", staffId: null }];
  batches = [rows, rows];
  const calendly = { ...provider, upsertEvent: vi.fn().mockRejectedValue(new Error("Calendly refused the stand-in email address, so this appointment isn't in Calendly.")) };
  await expect(syncAppointmentCalendar({ domain: dependencies.domain, calendars: { calendly } }, { businessId: "business", appointmentId: "appointment" })).rejects.toThrow("stand-in email");
  expect(mocks.update).toHaveBeenCalledWith(dependencies.domain, { businessId: "business", appointmentId: "appointment", state: "failed", error: "Calendly refused the stand-in email address, so this appointment isn't in Calendly." });
});

it("registers a Calendly webhook at Calendly's own route, and passes the event type to the changes read", async () => {
  vi.stubEnv("APP_BASE_URL", "https://app.example");
  const calendly = { ...provider, registerWebhook: vi.fn().mockResolvedValue({ webhookId: "11" }), getBookingChanges: vi.fn().mockResolvedValue({ cancelled: [], moved: [] }) };
  batches = [[{ id: "connection", provider: "calendly", calendarId: "ET1", staffId: null, status: "connected", webhookId: null }]];
  await reconcileBusinessCalendar({ domain: dependencies.domain, calendars: { calendly } }, "business");
  expect(calendly.registerWebhook).toHaveBeenCalledWith(expect.objectContaining({ subscriberUrl: "https://app.example/api/webhooks/calendly/connection" }));
  expect(calendly.getBookingChanges).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "ET1" }));
});

it("tells a release which booking the appointment still holds", async () => {
  const calendly = { ...provider, deleteEvent: vi.fn().mockResolvedValue(undefined) };
  batches = [[{ status: "connected", selectedCalendarId: "ET2", provider: "calendly" }], [{ eventId: "new-booking" }], []];
  await deleteReleasedCalendarEvent({ domain: dependencies.domain, calendars: { calendly } }, { businessId: "business", appointmentId: "appointment", connectionId: "connection", calendarId: "ET1", eventId: "old-booking" });
  expect(calendly.deleteEvent).toHaveBeenCalledWith({ accessToken: "access", calendarId: "ET1", eventId: "old-booking", appointmentId: "appointment", keepEventId: "new-booking" });
});

it("leaves a rate-limited connection alone, so bookings go on, and comes back when the limit resets", async () => {
  const calendly = { ...provider, getBusyBlocks: vi.fn().mockRejectedValue(Object.assign(new Error("Calendly's booking limit is reached for now."), { retryAfterMs: 60_000 })) };
  batches = [[{ id: "connection", provider: "calendly", calendarId: "ET1", staffId: null, status: "connected", webhookId: "11" }]];
  await expect(reconcileBusinessCalendar({ domain: dependencies.domain, calendars: { calendly } }, "business")).resolves.toMatchObject({ status: "deferred", entityId: "business", retryAt: expect.any(Date) });
  expect(mocks.mark).not.toHaveBeenCalled();
});

it("still reports a real failure when another connection is rate limited", async () => {
  const calendly = { ...provider, getBusyBlocks: vi.fn().mockRejectedValueOnce(Object.assign(new Error("limited"), { retryAfterMs: 60_000 })).mockRejectedValueOnce(new Error("permission denied")) };
  batches = [[{ id: "first", provider: "calendly", calendarId: "ET1", staffId: null, status: "connected", webhookId: "11" }, { id: "second", provider: "calendly", calendarId: "ET2", staffId: "staff", status: "connected", webhookId: "12" }]];
  await expect(reconcileBusinessCalendar({ domain: dependencies.domain, calendars: { calendly } }, "business")).rejects.toThrow("1 connection");
  expect(mocks.mark).toHaveBeenCalledOnce();
  expect(mocks.mark).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ connectionId: "second" }));
});

it("keeps Calendly's plan error on the connection instead of asking for a reconnect", async () => {
  const calendly = { ...provider, getBusyBlocks: vi.fn().mockRejectedValue(new Error(CALENDLY_PLAN_ERROR)) };
  batches = [[{ id: "connection", provider: "calendly", calendarId: "ET1", staffId: null, status: "connected", webhookId: "11" }]];
  await expect(reconcileBusinessCalendar({ domain: dependencies.domain, calendars: { calendly } }, "business")).rejects.toThrow("1 connection");
  expect(mocks.mark).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ connectionId: "connection", error: CALENDLY_PLAN_ERROR }));
});

it("holds the connection row while it writes the event, so a calendar switch waits for it", async () => {
  await syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" });
  expect(lock).toHaveBeenLastCalledWith("share", { of: calendarConnections });
  expect(lock.mock.invocationCallOrder.at(-1)).toBeLessThan(provider.upsertEvent.mock.invocationCallOrder[0]!);
});

it("uses deterministic event identity for creates and reschedules", async () => {
  batches = [[{ ...appointment, externalEventId: null }], [{ ...appointment, externalEventId: null }]];
  await syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" });
  expect(provider.upsertEvent).toHaveBeenCalledWith(expect.objectContaining({ clientEventId: expect.stringMatching(/^a[a-f0-9]{31}$/), calendarId: "selected" }));
});

it("preserves busy data on one calendar failure and still reconciles other connections", async () => {
  batches = [[{ id: "first", provider: "google", calendarId: "one", staffId: null, status: "connected" }, { id: "second", provider: "google", calendarId: "two", staffId: "staff", status: "connected" }]];
  provider.getBusyBlocks.mockRejectedValueOnce(new Error("permission denied")).mockResolvedValueOnce([]);
  await expect(reconcileBusinessCalendar(dependencies, "business")).rejects.toThrow("1 connection");
  expect(mocks.busy).toHaveBeenCalledOnce();
  expect(mocks.busy).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ connectionId: "second", calendarId: "two" }));
  expect(mocks.mark).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ connectionId: "first", error: "permission denied" }));
});

it("registers a Cal.com webhook before reading busy time, and fails the connection when it can't", async () => {
  vi.stubEnv("APP_BASE_URL", "https://app.example/");
  const calcom = { ...provider, registerWebhook: vi.fn().mockResolvedValue({ webhookId: "11" }) };
  const both = { domain: dependencies.domain, calendars: { google: provider, calcom } };
  batches = [[{ id: "cal", provider: "calcom", calendarId: "42", staffId: null, status: "connected", webhookId: null }, { id: "registered", provider: "calcom", calendarId: "42", staffId: "staff", status: "connected", webhookId: "9" }, { id: "first", provider: "google", calendarId: "one", staffId: null, status: "connected", webhookId: null }]];
  await expect(reconcileBusinessCalendar(both, "business")).resolves.toMatchObject({ status: "completed" });
  expect(calcom.registerWebhook).toHaveBeenCalledOnce();
  expect(calcom.registerWebhook).toHaveBeenCalledWith({ accessToken: "access", subscriberUrl: "https://app.example/api/webhooks/calcom/cal", secret: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(mocks.registerOnce).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ businessId: "business", connectionId: "cal" }));
  const saved = await mocks.registerOnce.mock.results[0]!.value;
  expect(saved).toBe("registered");
  expect(calcom.registerWebhook.mock.invocationCallOrder[0]).toBeLessThan(calcom.getBusyBlocks.mock.invocationCallOrder[0]!);

  vi.clearAllMocks();
  mocks.registerOnce.mockImplementationOnce(async (_context, input: { register: () => Promise<unknown> }) => { await input.register(); return "registered"; });
  calcom.registerWebhook.mockRejectedValueOnce(new Error("Cal.com webhook registration failed with status 403."));
  batches = [[{ id: "cal", provider: "calcom", calendarId: "42", staffId: null, status: "connected", webhookId: null }]];
  await expect(reconcileBusinessCalendar(both, "business")).rejects.toThrow("1 connection");
  expect(mocks.busy).not.toHaveBeenCalled();
  expect(mocks.mark).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ connectionId: "cal", error: "Cal.com webhook registration failed with status 403." }));
});

it("registers one webhook when two syncs of a connection run at once", async () => {
  vi.stubEnv("APP_BASE_URL", "https://app.example");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const calcom = { ...provider, registerWebhook: vi.fn(async () => { await gate; return { webhookId: "11" }; }) };
  const deps = { domain: dependencies.domain, calendars: { calcom } };
  // Both syncs read the connection before either saved a webhook.
  const row = { id: "cal", provider: "calcom", calendarId: "42", staffId: null, status: "connected", webhookId: null };
  let queue = Promise.resolve();
  mocks.registerOnce.mockImplementation(async (_context, input: { register: () => Promise<{ externalWebhookId: string }> }) => {
    // The connection's row lock runs the two registrations one after the other.
    const turn = queue.then(async () => (calcom.registerWebhook.mock.calls.length ? "exists" : (await input.register(), "registered")));
    queue = turn.then(() => undefined);
    return await turn;
  });
  batches = [[row], [row]];
  const runs = Promise.all([reconcileBusinessCalendar(deps, "business"), reconcileBusinessCalendar(deps, "business")]);
  release();
  await runs;
  expect(calcom.registerWebhook).toHaveBeenCalledOnce();
});

it("syncs only the connection a webhook names", async () => {
  batches = [[{ id: "cal", provider: "google", calendarId: "42", staffId: null, status: "connected", webhookId: null }]];
  const where = vi.fn();
  mocks.transaction.mockImplementationOnce(async (_db, _scope, callback) => callback({ select: () => { const chain = query(); chain.where = (...args: unknown[]) => { where(...args); return chain; }; return chain; } }));
  await reconcileBusinessCalendar(dependencies, "business", "cal");
  // The filter names the connection; without one, it reads the business's live connections.
  expect(new PgDialect().sqlToQuery(where.mock.calls[0]![0] as SQL).params).toEqual(["business", "disconnected", "cal"]);
  expect(mocks.busy).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ connectionId: "cal" }));
});

it("removes a disconnected Cal.com connection's webhook with the tokens it kept, then forgets them", async () => {
  const calcom = { ...provider, deleteWebhook: vi.fn().mockResolvedValue(undefined) };
  const deps = { domain: dependencies.domain, calendars: { calcom } };
  mocks.retired.mockResolvedValue({ provider: "calcom", externalWebhookId: "11" });
  mocks.token.mockResolvedValueOnce("kept-access");
  await expect(retireCalendarWebhook(deps, { businessId: "business", connectionId: "cal" })).resolves.toMatchObject({ status: "completed" });
  // The token comes through resolveCalendarAccessToken, which saves a rotated refresh token before the delete.
  expect(mocks.token).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ businessId: "business", connectionId: "cal", retired: true }));
  expect(calcom.deleteWebhook).toHaveBeenCalledWith({ accessToken: "kept-access", webhookId: "11" });
  expect(mocks.forget).toHaveBeenCalledWith(dependencies.domain, { businessId: "business", connectionId: "cal" });

  // A failed delete keeps the tokens, and the retry gets its token the same way, with the rotated refresh token saved.
  vi.clearAllMocks();
  mocks.token.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
  calcom.deleteWebhook.mockRejectedValueOnce(Object.assign(new Error("Cal.com webhook removal failed with status 503."), { responseStatus: 503 })).mockResolvedValueOnce(undefined);
  await expect(retireCalendarWebhook(deps, { businessId: "business", connectionId: "cal" })).rejects.toThrow("503");
  expect(mocks.forget).not.toHaveBeenCalled();
  await expect(retireCalendarWebhook(deps, { businessId: "business", connectionId: "cal" })).resolves.toMatchObject({ status: "completed" });
  expect(calcom.deleteWebhook).toHaveBeenLastCalledWith({ accessToken: "second", webhookId: "11" });

  // A revoked grant can't remove anything, so the tokens go anyway.
  vi.clearAllMocks();
  mocks.token.mockRejectedValueOnce(Object.assign(new Error("Cal.com authorization requires reconnection."), { reconnectRequired: true }));
  await expect(retireCalendarWebhook(deps, { businessId: "business", connectionId: "cal" })).resolves.toMatchObject({ status: "completed" });
  expect(calcom.deleteWebhook).not.toHaveBeenCalled();
  expect(mocks.forget).toHaveBeenCalledOnce();

  // A connection reconnected before the job ran has nothing to retire.
  vi.clearAllMocks();
  mocks.retired.mockResolvedValueOnce(null);
  await expect(retireCalendarWebhook(deps, { businessId: "business", connectionId: "cal" })).resolves.toMatchObject({ status: "skipped" });
  expect(mocks.forget).not.toHaveBeenCalled();
});

it("cancels a retired Cal.com connection's bookings before removing its webhook and forgetting its tokens", async () => {
  const order: string[] = [];
  const calcom = { ...provider, deleteEvent: vi.fn(async (input: { eventId: string }) => { order.push(`cancel:${input.eventId}`); }), deleteWebhook: vi.fn(async () => { order.push("webhook"); }) };
  const deps = { domain: dependencies.domain, calendars: { calcom } };
  mocks.retired.mockResolvedValueOnce({ provider: "calcom", externalWebhookId: "11" });
  mocks.token.mockResolvedValueOnce("kept-access");
  mocks.forget.mockImplementationOnce(async () => { order.push("forget"); });
  const cancel = [{ appointmentId: "a1", calendarId: "42", eventId: "uid-1" }, { appointmentId: "a2", calendarId: "42", eventId: "uid-2" }];
  await expect(retireCalendarWebhook(deps, { businessId: "business", connectionId: "cal", cancel })).resolves.toMatchObject({ status: "completed" });
  expect(calcom.deleteEvent).toHaveBeenCalledWith({ accessToken: "kept-access", calendarId: "42", eventId: "uid-1", appointmentId: "a1" });
  expect(order).toEqual(["cancel:uid-1", "cancel:uid-2", "webhook", "forget"]);

  // A connection with bookings to cancel but no webhook still gets its bookings cancelled.
  vi.clearAllMocks();
  order.length = 0;
  mocks.retired.mockResolvedValueOnce({ provider: "calcom", externalWebhookId: null });
  mocks.token.mockResolvedValueOnce("kept-access");
  await retireCalendarWebhook(deps, { businessId: "business", connectionId: "cal", cancel: cancel.slice(0, 1) });
  expect(order).toEqual(["cancel:uid-1"]);
  expect(calcom.deleteWebhook).not.toHaveBeenCalled();
  expect(mocks.forget).toHaveBeenCalledOnce();
});

it("leaves a connection alone when its provider isn't set up here", async () => {
  batches = [[{ id: "cal", provider: "calcom", calendarId: "42", staffId: null, status: "connected", webhookId: null }]];
  await expect(reconcileBusinessCalendar(dependencies, "business")).resolves.toMatchObject({ status: "skipped" });
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.mark).not.toHaveBeenCalled();
});

it("queues missed bookings only for connections that synced", async () => {
  batches = [[{ id: "first", provider: "google", calendarId: "one", staffId: null, status: "connected" }, { id: "second", provider: "google", calendarId: "two", staffId: "staff", status: "connected" }, { id: "unselected", provider: "google", calendarId: null, staffId: null, status: "connected" }]];
  provider.getBusyBlocks.mockRejectedValueOnce(new Error("permission denied")).mockResolvedValueOnce([]);
  await expect(reconcileBusinessCalendar(dependencies, "business")).rejects.toThrow("1 connection");
  expect(mocks.backfill).toHaveBeenCalledOnce();
  expect(mocks.backfill).toHaveBeenCalledWith(dependencies.domain, { businessId: "business", connectionId: "second" });
  expect(mocks.backfill.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.busy.mock.invocationCallOrder[0]!);
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
  // One failed event write must not mark the whole connection stale and block every booking.
  expect(mocks.mark).not.toHaveBeenCalled();
});

it("marks the connection when its credentials cannot be resolved", async () => {
  mocks.token.mockRejectedValue(new Error("Google Calendar authorization requires reconnection."));

  await expect(syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" })).rejects.toThrow("requires reconnection");

  expect(provider.upsertEvent).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith(dependencies.domain, expect.objectContaining({ appointmentId: "appointment", state: "failed" }));
  expect(mocks.mark).toHaveBeenCalledWith(dependencies.domain, { businessId: "business", connectionId: "connection", error: "Google Calendar authorization requires reconnection." });
});

it("does not record a sync failure when the calendar selection changed mid-sync", async () => {
  batches = [[appointment], [{ ...appointment, connectionId: "other" }]];

  await expect(syncAppointmentCalendar(dependencies, { businessId: "business", appointmentId: "appointment" })).rejects.toThrow("Calendar selection changed during synchronization.");

  expect(mocks.mark).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
});

it("keeps a released Cal.com booking that an appointment took back after the event type changed", async () => {
  const release = { businessId: "business", appointmentId: "appointment", connectionId: "connection", calendarId: "41", eventId: "booking-uid" };
  const calcom = { ...provider };
  const withCalcom = { domain: dependencies.domain, calendars: { calcom } };
  batches = [[{ status: "connected", selectedCalendarId: "42", provider: "calcom" }], [{ eventId: "booking-uid" }], [{ id: "appointment" }]];
  await expect(deleteReleasedCalendarEvent(withCalcom, release)).resolves.toMatchObject({ status: "skipped" });
  expect(calcom.deleteEvent).not.toHaveBeenCalled();
  batches = [[{ status: "connected", selectedCalendarId: "42", provider: "calcom" }], [{ eventId: null }], []];
  await expect(deleteReleasedCalendarEvent(withCalcom, release)).resolves.toMatchObject({ status: "completed" });
  expect(calcom.deleteEvent).toHaveBeenCalledWith({ accessToken: "access", calendarId: "41", eventId: "booking-uid", appointmentId: "appointment" });
});

it("deletes a released booking's event from the calendar its connection left, unless it switched back and wrote it again", async () => {
  const release = { businessId: "business", appointmentId: "appointment", connectionId: "connection", calendarId: "old", eventId: "event" };
  batches = [[{ status: "connected", selectedCalendarId: "new", provider: "google" }], [{ eventId: "event" }]];
  await expect(deleteReleasedCalendarEvent(dependencies, release)).resolves.toMatchObject({ status: "completed" });
  expect(provider.deleteEvent).toHaveBeenCalledWith({ accessToken: "access", calendarId: "old", eventId: "event", appointmentId: "appointment" });
  provider.deleteEvent.mockClear();
  batches = [[{ status: "connected", selectedCalendarId: "old", provider: "google" }], [{ eventId: "event" }]];
  await expect(deleteReleasedCalendarEvent(dependencies, release)).resolves.toMatchObject({ status: "skipped" });
  batches = [[{ status: "disconnected", selectedCalendarId: "new", provider: "google" }], [{ eventId: null }]];
  await expect(deleteReleasedCalendarEvent(dependencies, release)).resolves.toMatchObject({ status: "skipped" });
  expect(provider.deleteEvent).not.toHaveBeenCalled();
});
