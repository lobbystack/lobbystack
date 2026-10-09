import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, auditLogs, businessHours, businessMemberships, businesses, calendarBusyBlocks, calendarConnections, contacts, createDatabaseClient, outboxMessages, services, staff, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { checkAvailability, rescheduleAppointmentInTransaction } from "./booking";
import { connectCalendar, disconnectCalendar, queueUnsyncedAppointmentSyncs } from "./calendar";

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
        const { slots } = await checkAvailability({ db }, { businessId, serviceId, startsAt: startsAt.toISOString(), timezone: "UTC" });
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

      const { slots } = await asWorker(tx, (db) => checkAvailability({ db }, { businessId, serviceId, startsAt: movedTo.toISOString(), timezone: "UTC" }));
      expect(slots).toEqual([]);
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
