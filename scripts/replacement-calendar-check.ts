import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { appointmentChangeVerifications, businessHours, businesses, businessMemberships, calendarBusyBlocks, calendarConnections, createDatabaseClient, outboxMessages, services, staff, staffServiceAssignments, users } from "@lobbystack/db";
import { bookAppointment, cancelAppointment, connectCalendar, disconnectCalendar, findAvailability, listCalendarConnections, MAX_CALENDAR_SYNC_AGE_MS, rescheduleAppointmentForCaller, resolveCalendarAccessToken, selectCalendar, upsertBusyBlocks } from "@lobbystack/domain";
import { SecretBox } from "@lobbystack/providers";
import { reconcileBusinessCalendar, syncAppointmentCalendar, type CalendarOperations } from "../apps/worker/src/calendarJobs";
let phase = "configuration";

function target(name: string, role: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.startsWith("/parity_cert_") || url.username !== role || url.search || url.hash) throw new Error("Calendar certification requires explicit disposable localhost role URLs.");
  return value;
}

async function main(): Promise<void> {
  const migratorUrl = target("REPLACEMENT_E2E_DATABASE_URL", "lobbystack_migrator");
  const appUrl = target("LOBBYSTACK_APP_DATABASE_URL", "lobbystack_app");
  const workerUrl = target("LOBBYSTACK_WORKER_DATABASE_URL", "lobbystack_worker");
  const identity = (value: string) => { const url = new URL(value); return `${url.host}${url.pathname}`; };
  if (new Set([migratorUrl, appUrl, workerUrl].map(identity)).size !== 1 || process.env.RELEASE_E2E_WORKER_PAUSED !== "1") throw new Error("One isolated database and a paused worker are required.");
  const admin = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: migratorUrl });
  const app = createDatabaseClient("lobbystack_app", { DATABASE_URL: appUrl });
  const worker = createDatabaseClient("lobbystack_worker", { DATABASE_URL: workerUrl });
  const operator = { db: app.db };
  const context = { db: worker.db };
  const businessId = randomUUID(), userId = randomUUID(), staffId = randomUUID(), otherStaffId = randomUUID(), serviceId = randomUUID();
  const phone = "+14165550123";
  const day = new Date(); day.setUTCDate(day.getUTCDate() + 2); day.setUTCHours(10, 0, 0, 0);
  const at = (hour: number) => { const date = new Date(day); date.setUTCHours(hour); return date.toISOString(); };
  const find = (hour: number) => findAvailability(context, { businessId, serviceId, startsAt: at(hour), timezone: "America/Los_Angeles" });
  const book = (hour: number, preferredStaffId = staffId) => bookAppointment(context, { businessId, serviceId, startsAt: at(hour), timezone: "UTC", contactPhone: phone, sourceChannel: "voice", preferredStaffId });
  const events = new Map<string, { startsAt: string; endsAt: string }>();
  let refreshes = 0;
  let deletes = 0;
  let availabilityFails = false;
  const calendar: CalendarOperations = {
    refreshAccessToken: async () => { refreshes++; await new Promise((resolve) => setTimeout(resolve, 20)); return { accessToken: "refreshed-fixture", expiresIn: 3600 }; },
    getBusyBlocks: async () => { if (availabilityFails) throw new Error("Fixture calendar unavailable"); return [{ startsAt: at(11), endsAt: new Date(Date.parse(at(11)) + 30 * 60_000).toISOString() }]; },
    upsertEvent: async (input) => { const id = input.eventId ?? input.clientEventId; assert.ok(id); events.set(id, { startsAt: input.startsAt, endsAt: input.endsAt }); return { externalEventId: id }; },
    deleteEvent: async (input) => { deletes++; events.delete(input.eventId); },
  };
  const dependencies = { domain: context, calendar };
  const oldKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "calendar-certification-fixture-key";
  const box = new SecretBox(process.env.ENCRYPTION_KEY);
  try {
    phase = "fixture-creation";
    await admin.db.insert(users).values({ id: userId, email: `calendar-${userId}@example.invalid`, normalizedEmail: `calendar-${userId}@example.invalid` });
    await admin.db.insert(businesses).values({ id: businessId, slug: `calendar-cert-${businessId}`, name: "Calendar certification", timezone: "UTC", businessType: "clinic", onboardingStage: "complete" });
    await admin.db.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
    await admin.db.insert(staff).values([{ id: staffId, businessId, name: "Assigned", timezone: "UTC" }, { id: otherStaffId, businessId, name: "Unassigned", timezone: "UTC" }]);
    await admin.db.insert(services).values({ id: serviceId, businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 });
    await admin.db.insert(staffServiceAssignments).values({ businessId, staffId, serviceId });
    await admin.db.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 540, closeMinutes: 1020 })));
    phase = "booking-policy";
    assert.deepEqual((await find(10)).map((slot) => slot.staffId), [staffId]);
    assert.equal((await find(18)).length, 0, "Caller timezone must not bypass business hours");
    await assert.rejects(book(8));
    await assert.rejects(book(10, otherStaffId));
    const race = await Promise.allSettled([book(10), book(10)]);
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
    const winner = race.find((result) => result.status === "fulfilled");
    assert.ok(winner?.status === "fulfilled");
    const first = winner.value;

    const connectionId = await connectCalendar(operator, { userId, businessId, provider: "google", externalAccountId: `fixture-${businessId}`, encryptedAccessToken: box.encrypt("old-fixture"), encryptedRefreshToken: box.encrypt("refresh-fixture"), tokenExpiresAt: new Date(Date.now() - 1000).toISOString() });
    phase = "calendar-sync-and-refresh";
    await selectCalendar(operator, { userId, businessId, connectionId, calendarId: "fixture-calendar" });
    assert.equal((await find(12)).length, 0, "Unsynchronized calendars must fail closed");
    const tokenInput = { businessId, connectionId, decryptToken: (value: string) => box.decrypt(value), encryptToken: (value: string) => box.encrypt(value), refreshAccessToken: calendar.refreshAccessToken };
    await Promise.all([resolveCalendarAccessToken(context, tokenInput), resolveCalendarAccessToken(context, tokenInput)]);
    assert.equal(refreshes, 1, "Concurrent token refresh must be serialized");
    await reconcileBusinessCalendar(dependencies, businessId);
    assert.equal((await find(11)).length, 0, "External busy blocks must constrain availability");
    await assert.rejects(book(11));
    assert.equal((await find(12)).length, 1);
    const second = await book(12);

    phase = "event-lifecycle";
    await syncAppointmentCalendar(dependencies, { businessId, appointmentId: first.appointmentId });
    assert.equal(events.size, 1);
    await cancelAppointment(operator, { userId, businessId, appointmentId: first.appointmentId });
    await syncAppointmentCalendar(dependencies, { businessId, appointmentId: first.appointmentId });
    assert.equal(events.size, 0); assert.equal(deletes, 1);
    await syncAppointmentCalendar(dependencies, { businessId, appointmentId: second.appointmentId });
    const verificationId = randomUUID();
    await admin.db.insert(appointmentChangeVerifications).values({ id: verificationId, businessId, appointmentId: second.appointmentId, contactId: second.contactId, callerPhone: phone, action: "reschedule", status: "facts_verified", expiresAt: new Date(Date.now() + 300_000) });
    await rescheduleAppointmentForCaller(context, { businessId, appointmentId: second.appointmentId, callerPhone: phone, startsAt: at(14), verificationId });
    await syncAppointmentCalendar(dependencies, { businessId, appointmentId: second.appointmentId });
    assert.equal([...events.values()][0]?.startsAt, at(14));

    phase = "failure-and-freshness";
    await assert.rejects(upsertBusyBlocks(context, { businessId, connectionId, calendarId: "stale-selection", markSynced: true, blocks: [] }));
    assert.equal((await admin.db.select().from(calendarBusyBlocks).where(eq(calendarBusyBlocks.businessId, businessId))).length, 1);
    await admin.db.update(calendarConnections).set({ lastSyncedAt: new Date(Date.now() - MAX_CALENDAR_SYNC_AGE_MS - 1000) }).where(eq(calendarConnections.id, connectionId));
    assert.equal((await find(12)).length, 0, "Stale calendar mirrors must fail closed");
    await reconcileBusinessCalendar(dependencies, businessId);
    availabilityFails = true;
    await assert.rejects(reconcileBusinessCalendar(dependencies, businessId));
    assert.equal((await find(12)).length, 0);
    assert.equal((await listCalendarConnections(operator, { userId, businessId }))[0]?.status, "error");
    assert.equal((await admin.db.select().from(calendarBusyBlocks).where(eq(calendarBusyBlocks.businessId, businessId))).length, 1, "Failed sync must preserve previous busy data");
    await disconnectCalendar(operator, { userId, businessId, connectionId });
    assert.equal((await find(12)).length, 1);
    assert.equal((await admin.db.select().from(calendarBusyBlocks).where(eq(calendarBusyBlocks.businessId, businessId))).length, 0);
    console.log(JSON.stringify({ status: "passed", checks: ["business-hours", "staff-assignments", "concurrent-booking", "refresh-serialization", "external-busy", "cancel-delete", "reschedule-update", "stale-selection", "sync-failure", "freshness", "error-visibility", "disconnect"], realProviderCalls: 0 }));
  } finally {
    if (oldKey === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = oldKey;
    await admin.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
    await admin.db.delete(businesses).where(eq(businesses.id, businessId));
    await admin.db.delete(users).where(eq(users.id, userId));
    await Promise.all([admin.pool.end(), app.pool.end(), worker.pool.end()]);
  }
}

void main().catch((error) => { console.error(JSON.stringify({ status: "failed", phase, errorType: error instanceof Error ? error.name : "unknown", message: error instanceof Error && /^[A-Za-z .-]+$/.test(error.message) ? error.message : "redacted", realProviderCalls: 0 })); process.exitCode = 1; });
