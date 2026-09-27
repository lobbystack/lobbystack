import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, auditLogs, businessMemberships, businesses, calendarConnections, contacts, createDatabaseClient, outboxMessages, services, staff, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { disconnectCalendar, queueUnsyncedAppointmentSyncs } from "./calendar";

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
  return { businessId, userId, firstStaffId: first!.id, secondStaffId: second!.id, book };
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
