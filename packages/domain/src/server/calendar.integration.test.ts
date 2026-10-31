import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { appointments, auditLogs, businessHours, businessMemberships, businesses, calendarBusyBlocks, calendarConnections, contacts, createDatabaseClient, outboxMessages, services, staff, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { cancelAppointmentsCancelledInCalendar, checkAvailability, rescheduleAppointmentInTransaction } from "./booking";
import { WEBHOOK_REGISTRATION_LEASE_MS, assignCalendarStaff, connectCalendar, disconnectCalendar, disconnectCalendarInTransaction, forgetStaleRetiredCalendarTokens, getCalendarWebhook, getRetiredCalendarConnection, queueUnsyncedAppointmentSyncs, registerCalendarWebhookOnce, resolveBusinessByCalendarWebhook, selectCalendar } from "./calendar";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Reliability integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function workspace(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Calendar backfill test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
  const [contact] = await tx.insert(contacts).values({ businessId }).returning();
  const [first] = await tx.insert(staff).values({ businessId, name: "First", timezone: "UTC" }).returning();
  const [second] = await tx.insert(staff).values({ businessId, name: "Second", timezone: "UTC" }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Initial consultation", slug: "initial", durationMinutes: 30 }).returning();
  let slot = 0;
  const book = async (values: Partial<typeof appointments.$inferInsert> = {}) => {
    const startsAt = new Date(Date.UTC(2030, 0, 1, 9 + slot++));
    return (await tx.insert(appointments).values({ businessId, contactId: contact!.id, staffId: first!.id, serviceId: service!.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", sourceChannel: "voice", calendarSyncState: "not_required", ...values }).returning())[0]!;
  };
  return { businessId, userId, serviceId: service!.id, firstStaffId: first!.id, secondStaffId: second!.id, book };
}

async function asWorker<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

async function queuedSyncs(tx: DatabaseTransaction, businessId: string) {
  return (await tx.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "calendar.syncAppointment")))).map((message) => message.aggregateId);
}

describe.skipIf(!testUrl)("calendar backfill against dedicated PostgreSQL roles", () => {
  it("cancels upcoming appointments whose booking someone cancelled in the calendar, and alerts once", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, book } = await workspace(tx);
      const gone = await book({ calendarSyncState: "synced", calendarExternalId: "gone" });
      const kept = await book({ calendarSyncState: "synced", calendarExternalId: "kept" });
      const writing = await book({ calendarSyncState: "pending", calendarExternalId: "writing" });
      const past = await book({ calendarSyncState: "synced", calendarExternalId: "past", startsAt: new Date("2020-01-01T12:00:00Z"), endsAt: new Date("2020-01-01T12:30:00Z") });
      const follow = () => asWorker(tx, (db) => cancelAppointmentsCancelledInCalendar({ db }, { businessId, provider: "Cal.com", eventIds: ["gone", "writing", "past"] }));
      await expect(follow()).resolves.toEqual([gone.id]);
      await expect(follow()).resolves.toEqual([]);
      const rows = await tx.select({ id: appointments.id, status: appointments.status }).from(appointments).where(inArray(appointments.id, [gone.id, kept.id, writing.id, past.id]));
      expect(rows.filter((row) => row.status === "canceled").map((row) => row.id)).toEqual([gone.id]);
      const audit = await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.entityId, gone.id), eq(auditLogs.eventType, "appointment_change.canceled")));
      expect(audit).toEqual([{ payload: { source: "calendar", provider: "Cal.com" } }]);
    });
  });

  it("queues upcoming bookings that no calendar covered, once per connection", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, firstStaffId, secondStaffId, book } = await workspace(tx);
      const missed = await book();
      await book({ staffId: secondStaffId });
      await book({ status: "canceled" });
      await book({ startsAt: new Date("2020-01-01T12:00:00Z"), endsAt: new Date("2020-01-01T12:30:00Z") });
      await book({ calendarSyncState: "synced", calendarExternalId: "event" });
      await book({ calendarSyncState: "failed" });
      const [connection] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid", staffId: firstStaffId, selectedCalendarId: "calendar@group.calendar.google.com" }).returning();

      expect(await asWorker(tx, (db) => queueUnsyncedAppointmentSyncs({ db }, { businessId, connectionId: connection!.id }))).toBe(1);
      expect(await asWorker(tx, (db) => queueUnsyncedAppointmentSyncs({ db }, { businessId, connectionId: connection!.id }))).toBe(1);
      expect(await queuedSyncs(tx, businessId)).toEqual([missed.id]);
    });
  });

  it("does not queue anything until a calendar is selected", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, book } = await workspace(tx);
      await book();
      const [connection] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid" }).returning();

      expect(await asWorker(tx, (db) => queueUnsyncedAppointmentSyncs({ db }, { businessId, connectionId: connection!.id }))).toBe(0);
      expect(await queuedSyncs(tx, businessId)).toEqual([]);
    });
  });

  it("does not let LobbyStack's own event on a shared calendar block other staff or its reschedule", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, serviceId, secondStaffId, book } = await workspace(tx);
      await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1440 })));
      // Inside the freshness horizon of a calendar synced now.
      const startsAt = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      const booked = await book({ startsAt, endsAt, calendarSyncState: "synced", calendarExternalId: "lobbystack-event" });
      const [connection] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid", selectedCalendarId: "shared@group.calendar.google.com", status: "connected", lastSyncedAt: new Date() }).returning();
      await tx.insert(calendarBusyBlocks).values({ businessId, connectionId: connection!.id, startsAt, endsAt, externalEventId: "lobbystack-event" });

      await asWorker(tx, async (db) => {
        const { slots } = await checkAvailability({ db }, { businessId, serviceId, startsAt: startsAt.toISOString() });
        expect(slots.map((slot) => slot.staffId)).toEqual([secondStaffId]);
        const moved = await withBusinessTransaction(db, { businessId, actorType: "worker" }, (workerTx) => rescheduleAppointmentInTransaction(workerTx, { businessId, appointmentId: booked.id, startsAt: new Date(startsAt.getTime() + 15 * 60_000).toISOString(), change: { source: "caller" } }));
        expect(moved?.appointmentId).toBe(booked.id);
      });
    });
  });

  it("keeps blocking a LobbyStack event someone moved in the calendar", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, serviceId, book } = await workspace(tx);
      await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1440 })));
      const startsAt = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000);
      await book({ startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), calendarSyncState: "synced", calendarExternalId: "lobbystack-event" });
      const [connection] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid", selectedCalendarId: "shared@group.calendar.google.com", status: "connected", lastSyncedAt: new Date() }).returning();
      // The owner dragged the event to 4 PM in Google; the appointment row still says noon.
      const movedTo = new Date(startsAt.getTime() + 4 * 3_600_000);
      await tx.insert(calendarBusyBlocks).values({ businessId, connectionId: connection!.id, startsAt: movedTo, endsAt: new Date(movedTo.getTime() + 30 * 60_000), externalEventId: "lobbystack-event" });

      const { slots } = await asWorker(tx, (db) => checkAvailability({ db }, { businessId, serviceId, startsAt: movedTo.toISOString() }));
      expect(slots).toEqual([]);
    });
  });

  it("recognizes LobbyStack's own Cal.com booking by its uid and keeps the time it holds past the appointment busy", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, serviceId, firstStaffId, secondStaffId, book } = await workspace(tx);
      await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1440 })));
      const startsAt = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000);
      await book({ startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), calendarSyncState: "synced", calendarExternalId: "calcom-uid" });
      const [connection] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "calcom", externalAccountId: "1234", selectedCalendarId: "42", status: "connected", lastSyncedAt: new Date() }).returning();
      // The event type books an hour, so the booking runs past the 30-minute appointment.
      await tx.insert(calendarBusyBlocks).values({ businessId, connectionId: connection!.id, startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60_000), externalEventId: "calcom-uid" });

      await asWorker(tx, async (db) => {
        // The appointment's own half hour is the appointment row's; the half hour Cal.com holds past it stays busy.
        const halfPast = await checkAvailability({ db }, { businessId, serviceId, startsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString() });
        expect(halfPast.slots).toEqual([]);
        const after = await checkAvailability({ db }, { businessId, serviceId, startsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString() });
        expect(after.slots.map((slot) => slot.staffId).sort()).toEqual([firstStaffId, secondStaffId].sort());
      });
    });
  });

  it("lets an appointment move when Cal.com's copy of its booking sits in a connected Google calendar", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, firstStaffId, book } = await workspace(tx);
      await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1440 })));
      const startsAt = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      const booked = await book({ startsAt, endsAt, calendarSyncState: "synced", calendarExternalId: "calcom-uid" });
      const [calcom] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "calcom", externalAccountId: "1234", selectedCalendarId: "42", status: "connected", lastSyncedAt: new Date() }).returning();
      const [google] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid", selectedCalendarId: "team@group.calendar.google.com", status: "connected", lastSyncedAt: new Date() }).returning();
      await tx.insert(calendarBusyBlocks).values([
        { businessId, connectionId: calcom!.id, startsAt, endsAt, externalEventId: "calcom-uid" },
        // Cal.com wrote the booking into Google too, under Google's own event id.
        { businessId, connectionId: google!.id, startsAt, endsAt, externalEventId: "google-copy" },
      ]);
      const moved = await asWorker(tx, (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (workerTx) => rescheduleAppointmentInTransaction(workerTx, { businessId, appointmentId: booked.id, startsAt: new Date(startsAt.getTime() + 15 * 60_000).toISOString(), change: { source: "caller" } })));
      expect(moved?.appointmentId).toBe(booked.id);
      // For anyone else the copy is busy time, as any outside event is.
      const { slots } = await asWorker(tx, (db) => checkAvailability({ db }, { businessId, serviceId: booked.serviceId, startsAt: startsAt.toISOString() }));
      expect(slots.map((slot) => slot.staffId)).not.toContain(firstStaffId);
    });
  });

  it("keeps another staff member's event busy when it shares the moving appointment's span", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, firstStaffId, secondStaffId, book } = await workspace(tx);
      await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1440 })));
      const startsAt = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      // First's appointment is moving. Second has an outside meeting at the same time on their own calendar.
      const booked = await book({ startsAt: new Date(startsAt.getTime() + 2 * 3_600_000), endsAt: new Date(endsAt.getTime() + 2 * 3_600_000), staffId: firstStaffId });
      const [own] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "second@example.invalid", staffId: secondStaffId, selectedCalendarId: "second@group.calendar.google.com", status: "connected", lastSyncedAt: new Date() }).returning();
      await tx.insert(calendarBusyBlocks).values({ businessId, connectionId: own!.id, staffId: secondStaffId, startsAt: booked.startsAt, endsAt: booked.endsAt, externalEventId: "second-meeting" });
      await asWorker(tx, async (db) => {
        // Moving the appointment to Second at that time would double-book them.
        await expect(withBusinessTransaction(db, { businessId, actorType: "worker" }, (workerTx) => rescheduleAppointmentInTransaction(workerTx, { businessId, appointmentId: booked.id, startsAt: booked.startsAt.toISOString(), staffId: secondStaffId, change: { source: "caller" } }))).rejects.toThrow("no longer available");
      });
    });
  });

  it("keeps a canceled appointment's Cal.com booking busy until Cal.com drops it", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, serviceId, book } = await workspace(tx);
      await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1440 })));
      const startsAt = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      // The cancel in Cal.com hasn't gone through, so the booking still holds the time there.
      await book({ startsAt, endsAt, status: "canceled", calendarSyncState: "failed", calendarExternalId: "calcom-uid" });
      const [calcom] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "calcom", externalAccountId: "1234", selectedCalendarId: "42", status: "connected", lastSyncedAt: new Date() }).returning();
      await tx.insert(calendarBusyBlocks).values({ businessId, connectionId: calcom!.id, startsAt, endsAt, externalEventId: "calcom-uid" });
      const { slots } = await asWorker(tx, (db) => checkAvailability({ db }, { businessId, serviceId, startsAt: startsAt.toISOString() }));
      expect(slots).toEqual([]);
    });
  });

  it("finds a Cal.com connection's business from its webhook URL until the connection is disconnected", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId } = await workspace(tx);
      const [calcom] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "calcom", externalAccountId: "1234", selectedCalendarId: "42", status: "connected", encryptedAccessToken: "enc:access" }).returning();
      const [google] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid", status: "connected" }).returning();
      await asWorker(tx, async (db) => {
        expect(await resolveBusinessByCalendarWebhook({ db }, calcom!.id)).toBe(businessId);
        expect(await resolveBusinessByCalendarWebhook({ db }, google!.id)).toBeNull();
        const register = async () => ({ externalWebhookId: "11", encryptedWebhookSecret: "enc:secret" });
        expect(await registerCalendarWebhookOnce({ db }, { businessId, connectionId: calcom!.id, register, discard: async () => undefined })).toBe("registered");
        // A second sync finds the webhook and registers nothing.
        expect(await registerCalendarWebhookOnce({ db }, { businessId, connectionId: calcom!.id, register: async () => { throw new Error("registered twice"); }, discard: async () => undefined })).toBe("exists");
        expect(await getCalendarWebhook({ db }, { businessId, connectionId: calcom!.id })).toEqual({ provider: "calcom", externalWebhookId: "11", encryptedWebhookSecret: "enc:secret" });
        await withBusinessTransaction(db, { businessId, actorType: "worker" }, (workerTx) => disconnectCalendarInTransaction(workerTx, { businessId, connectionId: calcom!.id }));
        expect(await resolveBusinessByCalendarWebhook({ db }, calcom!.id)).toBeNull();
        expect(await getCalendarWebhook({ db }, { businessId, connectionId: calcom!.id })).toBeNull();
        // The disconnect keeps the tokens for the job that removes the webhook from Cal.com.
        expect(await getRetiredCalendarConnection({ db }, { businessId, connectionId: calcom!.id })).toEqual({ provider: "calcom", externalWebhookId: "11" });
      });
      const [row] = await tx.select().from(calendarConnections).where(eq(calendarConnections.id, calcom!.id));
      expect(row).toMatchObject({ status: "disconnected", externalWebhookId: "11", encryptedWebhookSecret: null });
      expect((await tx.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "calendar.retireWebhook")))).map((message) => message.aggregateId)).toEqual([calcom!.id]);
    });
  });

  it("revives a disconnected Cal.com row without its webhook or event type, and leaves a connected row's alone", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId } = await workspace(tx);
      const [revived] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "calcom", externalAccountId: "1234", selectedCalendarId: "42", status: "disconnected", disconnectedAt: new Date(), externalWebhookId: "11", encryptedAccessToken: "enc:kept" }).returning();
      const [connected] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "calcom", externalAccountId: "5678", staffId: null, selectedCalendarId: "43", status: "connected", externalWebhookId: "12", encryptedWebhookSecret: "enc:secret" }).returning();
      await tx.execute(sql`set local role lobbystack_app`);
      const db = tx as unknown as Database;
      await connectCalendar({ db }, { userId, businessId, provider: "calcom", externalAccountId: "1234", encryptedAccessToken: "enc:new" });
      await tx.execute(sql`reset role`);
      const [row] = await tx.select().from(calendarConnections).where(eq(calendarConnections.id, revived!.id));
      // Without its old event type, the revived row doesn't outrank Google before an admin picks one again.
      expect(row).toMatchObject({ status: "connected", externalWebhookId: null, encryptedWebhookSecret: null, selectedCalendarId: null, disconnectedAt: null, encryptedAccessToken: "enc:new" });
      // Connecting 1234 business-wide replaced 5678, which kept its tokens for its retirement job.
      const [replaced] = await tx.select().from(calendarConnections).where(eq(calendarConnections.id, connected!.id));
      expect(replaced).toMatchObject({ status: "disconnected", externalWebhookId: "12", encryptedWebhookSecret: null });
      expect(replaced!.disconnectedAt).toBeInstanceOf(Date);

      // Re-authorizing a connected row keeps its webhook and event type.
      await tx.update(calendarConnections).set({ selectedCalendarId: "42", externalWebhookId: "13", encryptedWebhookSecret: "enc:live" }).where(eq(calendarConnections.id, revived!.id));
      await tx.execute(sql`set local role lobbystack_app`);
      await connectCalendar({ db }, { userId, businessId, provider: "calcom", externalAccountId: "1234", encryptedAccessToken: "enc:again" });
      await tx.execute(sql`reset role`);
      const [again] = await tx.select().from(calendarConnections).where(eq(calendarConnections.id, revived!.id));
      expect(again).toMatchObject({ status: "connected", selectedCalendarId: "42", externalWebhookId: "13", encryptedWebhookSecret: "enc:live" });
    });
  });

  it("moves a booking from Google to Cal.com when an event type is picked, and back when Cal.com disconnects", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, book } = await workspace(tx);
      const [google] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid", selectedCalendarId: "team@group.calendar.google.com", status: "connected", encryptedRefreshToken: "enc:google" }).returning();
      const [calcom] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "calcom", externalAccountId: "1234", status: "connected", encryptedAccessToken: "enc:access", encryptedRefreshToken: "enc:refresh" }).returning();
      const booked = await book({ calendarSyncState: "synced", calendarExternalId: "google-event" });
      const db = tx as unknown as Database;
      const asApp = async (run: () => Promise<void>) => { await tx.execute(sql`set local role lobbystack_app`); await run(); await tx.execute(sql`reset role`); };
      const topics = async (topic: string) => (await tx.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, topic)))).map((message) => message.payload);

      // Cal.com, once it has an event type, outranks Google: the booking leaves Google's calendar.
      await asApp(() => selectCalendar({ db }, { userId, businessId, connectionId: calcom!.id, calendarId: "42" }));
      expect((await tx.select().from(appointments).where(eq(appointments.id, booked.id)))[0]).toMatchObject({ calendarExternalId: null, calendarSyncState: "not_required" });
      expect(await topics("calendar.deleteEvent")).toEqual([{ appointmentId: booked.id, connectionId: google!.id, calendarId: "team@group.calendar.google.com", eventId: "google-event" }]);

      // The sync booked it in Cal.com. Disconnecting Cal.com hands it back to Google and cancels the Cal.com booking.
      await tx.update(appointments).set({ calendarExternalId: "booking-uid", calendarSyncState: "synced" }).where(eq(appointments.id, booked.id));
      await asApp(() => disconnectCalendar({ db }, { userId, businessId, connectionId: calcom!.id }));
      expect((await tx.select().from(appointments).where(eq(appointments.id, booked.id)))[0]).toMatchObject({ calendarExternalId: null, calendarSyncState: "not_required" });
      expect(await topics("calendar.retireWebhook")).toEqual([{ connectionId: calcom!.id, cancel: [{ appointmentId: booked.id, calendarId: "42", eventId: "booking-uid" }] }]);
      // No delete went to the disconnected connection, and it kept the tokens its retirement job needs.
      expect((await topics("calendar.deleteEvent")).filter((payload) => (payload as { connectionId?: string }).connectionId === calcom!.id)).toEqual([]);
      expect((await tx.select().from(calendarConnections).where(eq(calendarConnections.id, calcom!.id)))[0]).toMatchObject({ status: "disconnected", encryptedRefreshToken: "enc:refresh" });
      await asWorker(tx, async (workerDb) => expect(await getRetiredCalendarConnection({ db: workerDb }, { businessId, connectionId: calcom!.id })).toEqual({ provider: "calcom", externalWebhookId: null }));
    });
  });

  it("lets one sync hold the webhook lease, and another take it once it lapses", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId } = await workspace(tx);
      const [calcom] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "calcom", externalAccountId: "1234", selectedCalendarId: "42", status: "connected" }).returning();
      const start = new Date("2030-01-01T12:00:00Z");
      const at = (offsetMs: number) => () => new Date(start.getTime() + offsetMs);
      await asWorker(tx, async (db) => {
        const input = { businessId, connectionId: calcom!.id };
        let finishSlow!: () => void;
        const slowDiscard = vi.fn(async () => undefined);
        const slow = registerCalendarWebhookOnce({ db }, { ...input, now: at(0), discard: slowDiscard, register: () => new Promise((resolve) => { finishSlow = () => resolve({ externalWebhookId: "slow", encryptedWebhookSecret: "enc:slow" }); }) });
        await vi.waitFor(() => expect(finishSlow).toBeTypeOf("function"));
        // While the lease holds, another sync registers nothing.
        const unused = vi.fn(async () => ({ externalWebhookId: "never", encryptedWebhookSecret: "enc" }));
        expect(await registerCalendarWebhookOnce({ db }, { ...input, now: at(60_000), discard: vi.fn(), register: unused })).toBe("busy");
        expect(unused).not.toHaveBeenCalled();
        // Once it lapses, the next sync takes it and saves its webhook.
        expect(await registerCalendarWebhookOnce({ db }, { ...input, now: at(WEBHOOK_REGISTRATION_LEASE_MS + 1_000), discard: vi.fn(), register: async () => ({ externalWebhookId: "fresh", encryptedWebhookSecret: "enc:fresh" }) })).toBe("registered");
        // The slow sync no longer holds the lease, so its webhook goes back to Cal.com instead of replacing the saved one.
        finishSlow();
        expect(await slow).toBe("disconnected");
        expect(slowDiscard).toHaveBeenCalledWith("slow");
        expect(await getCalendarWebhook({ db }, input)).toEqual({ provider: "calcom", externalWebhookId: "fresh", encryptedWebhookSecret: "enc:fresh" });
      });
    });
  });

  it("sweeps the tokens of connections disconnected over a week ago in every business, measured from the disconnect", async () => {
    await rollbackTest(async (tx) => {
      const first = await workspace(tx);
      const second = await workspace(tx);
      const now = new Date();
      const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
      const kept = { encryptedAccessToken: "enc:access", encryptedRefreshToken: "enc:refresh", externalWebhookId: "11" };
      const rows = await tx.insert(calendarConnections).values([
        // A token refresh touched this one yesterday; it was disconnected eight days ago.
        { businessId: first.businessId, ownerUserId: first.userId, provider: "calcom", externalAccountId: "stale-1", status: "disconnected", disconnectedAt: daysAgo(8), updatedAt: daysAgo(1), ...kept },
        { businessId: second.businessId, ownerUserId: second.userId, provider: "calcom", externalAccountId: "stale-2", status: "disconnected", disconnectedAt: daysAgo(30), ...kept },
        { businessId: first.businessId, ownerUserId: first.userId, provider: "calcom", externalAccountId: "recent", status: "disconnected", disconnectedAt: daysAgo(2), ...kept },
        { businessId: first.businessId, ownerUserId: first.userId, provider: "calcom", externalAccountId: "live", status: "connected", ...kept },
      ]).returning();
      // The worker runs the sweep with no business context.
      expect(await asWorker(tx, (db) => forgetStaleRetiredCalendarTokens({ db }, { now }))).toBeGreaterThanOrEqual(2);
      const after = new Map((await tx.select().from(calendarConnections).where(inArray(calendarConnections.id, rows.map((row) => row.id)))).map((row) => [row.externalAccountId, row]));
      for (const account of ["stale-1", "stale-2"]) expect(after.get(account)).toMatchObject({ encryptedAccessToken: null, encryptedRefreshToken: null, externalWebhookId: null });
      for (const account of ["recent", "live"]) expect(after.get(account)).toMatchObject(kept);
      // Another role can't run it.
      await tx.execute(sql`set local role lobbystack_app`);
      await expect(tx.execute(sql`select app.forget_stale_retired_calendar_tokens(now())`)).rejects.toThrow();
    });
  });

  it("retires the old business-wide connection when the owner reconnects with another Google account", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId } = await workspace(tx);
      await tx.execute(sql`set local role lobbystack_app`);
      const db = tx as unknown as Database;
      const oldId = await connectCalendar({ db }, { userId, businessId, provider: "google", externalAccountId: "acct_1", encryptedAccessToken: "enc:old", encryptedRefreshToken: "enc:old-refresh" });
      await tx.execute(sql`reset role`);
      await tx.insert(calendarBusyBlocks).values({ businessId, connectionId: oldId, startsAt: new Date("2030-01-01T09:00:00Z"), endsAt: new Date("2030-01-01T10:00:00Z") });
      await tx.execute(sql`set local role lobbystack_app`);
      const newId = await connectCalendar({ db }, { userId, businessId, provider: "google", externalAccountId: "acct_2", encryptedAccessToken: "enc:new" });
      await tx.execute(sql`reset role`);

      const rows = await tx.select().from(calendarConnections).where(eq(calendarConnections.businessId, businessId));
      expect(rows.find((row) => row.id === oldId)).toMatchObject({ status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null });
      expect(rows.find((row) => row.id === newId)).toMatchObject({ status: "connected", encryptedAccessToken: "enc:new" });
      expect(await tx.select().from(calendarBusyBlocks).where(eq(calendarBusyBlocks.connectionId, oldId))).toEqual([]);
      const entries = await tx.select().from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "calendar_connection.disconnected")));
      expect(entries).toEqual([expect.objectContaining({ actorUserId: userId, entityId: oldId, payload: { provider: "google", replacedBy: newId } })]);
    });
  });

  it("clears the old calendar's event ids from upcoming bookings it covered when the owner reconnects", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, secondStaffId, book } = await workspace(tx);
      const covered = await book({ calendarSyncState: "synced", calendarExternalId: "business-event" });
      const past = await book({ startsAt: new Date("2020-01-01T12:00:00Z"), endsAt: new Date("2020-01-01T12:30:00Z"), calendarSyncState: "synced", calendarExternalId: "past-event" });
      const ownCalendar = await book({ staffId: secondStaffId, calendarSyncState: "synced", calendarExternalId: "staff-event" });
      await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "staff@example.invalid", staffId: secondStaffId, selectedCalendarId: "staff@group.calendar.google.com" });
      await tx.execute(sql`set local role lobbystack_app`);
      const db = tx as unknown as Database;
      await connectCalendar({ db }, { userId, businessId, provider: "google", externalAccountId: "acct_1" });
      await connectCalendar({ db }, { userId, businessId, provider: "google", externalAccountId: "acct_2" });
      await tx.execute(sql`reset role`);

      const rows = await tx.select().from(appointments).where(eq(appointments.businessId, businessId));
      expect(rows.find((row) => row.id === covered.id)).toMatchObject({ calendarSyncState: "not_required", calendarExternalId: null });
      expect(rows.find((row) => row.id === past.id)).toMatchObject({ calendarSyncState: "synced", calendarExternalId: "past-event" });
      expect(rows.find((row) => row.id === ownCalendar.id)).toMatchObject({ calendarSyncState: "synced", calendarExternalId: "staff-event" });
    });
  });

  it("keeps a disconnected connection disconnected when the dashboard picks its calendar or staff member", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, firstStaffId } = await workspace(tx);
      const [connection] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid", selectedCalendarId: "primary" }).returning();
      await tx.execute(sql`set local role lobbystack_app`);
      const db = tx as unknown as Database;
      await disconnectCalendar({ db }, { userId, businessId, connectionId: connection!.id });
      await expect(selectCalendar({ db }, { userId, businessId, connectionId: connection!.id, calendarId: "team@example.invalid" })).rejects.toThrow("Calendar connection not found.");
      await expect(assignCalendarStaff({ db }, { userId, businessId, connectionId: connection!.id, staffId: firstStaffId })).rejects.toThrow("Calendar connection not found.");
      await tx.execute(sql`reset role`);

      const [row] = await tx.select().from(calendarConnections).where(eq(calendarConnections.id, connection!.id));
      expect(row).toMatchObject({ status: "disconnected", selectedCalendarId: "primary", staffId: null });
    });
  });

  it("records who disconnected a calendar, once", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId } = await workspace(tx);
      const [connection] = await tx.insert(calendarConnections).values({ businessId, ownerUserId: userId, provider: "google", externalAccountId: "owner@example.invalid", selectedCalendarId: "primary" }).returning();
      await tx.execute(sql`set local role lobbystack_app`);
      const db = tx as unknown as Database;
      await disconnectCalendar({ db }, { userId, businessId, connectionId: connection!.id });
      await disconnectCalendar({ db }, { userId, businessId, connectionId: connection!.id });
      await tx.execute(sql`reset role`);

      const entries = await tx.select().from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "calendar_connection.disconnected")));
      expect(entries).toEqual([expect.objectContaining({ actorUserId: userId, entityId: connection!.id, payload: { provider: "google" } })]);
    });
  });
});
