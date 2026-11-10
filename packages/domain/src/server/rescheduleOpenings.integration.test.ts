import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businessHours, businessMemberships, businesses, contacts, createDatabaseClient, services, staff, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { findRescheduleOpenings } from "./booking";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Reschedule openings integration tests require a dedicated local test database.");
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

const timezone = "America/Toronto";
const local = (days: number, hour: number, minute = 0) => DateTime.now().setZone(timezone).plus({ days }).set({ hour, minute, second: 0, millisecond: 0 });

/**
 * A business open all day with one staff member, Milan's consultation
 * tomorrow at 3 PM and Ana's the day after at 10 AM. The dashboard reads
 * openings as the operator, under RLS.
 */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userIds = { scheduler: randomUUID(), viewer: randomUUID() };
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Reschedule test", timezone, businessType: "test", telemetryEnabled: false });
  for (const [role, id] of Object.entries(userIds)) {
    await tx.insert(users).values({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid` });
    await tx.insert(businessMemberships).values({ businessId, userId: id, role });
  }
  await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
  const [milan] = await tx.insert(contacts).values({ businessId, name: "Milan", phone: "+14165550100" }).returning();
  const [ana] = await tx.insert(contacts).values({ businessId, name: "Ana", phone: "+14165550101" }).returning();
  const [employee] = await tx.insert(staff).values({ businessId, name: "Sam", timezone }).returning();
  const [consultation] = await tx.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
  const book = async (contactId: string, startsAt: DateTime) => (await tx.insert(appointments).values({ businessId, contactId, staffId: employee!.id, serviceId: consultation!.id, startsAt: startsAt.toJSDate(), endsAt: startsAt.plus({ minutes: 30 }).toJSDate(), timezone, status: "confirmed", sourceChannel: "web_voice" }).returning())[0]!.id;
  const ids = { milans: await book(milan!.id, local(1, 15)), anas: await book(ana!.id, local(2, 10)) };
  const db = tx as unknown as Database;
  return {
    ids,
    userIds,
    openings: async (appointmentId: string, day: DateTime, userId = userIds.scheduler) => {
      await tx.execute(sql.raw("set local role lobbystack_app"));
      return await findRescheduleOpenings({ db }, { userId, businessId, appointmentId, date: day.toISODate()! });
    },
  };
}

describe.skipIf(!testUrl)("reschedule openings", () => {
  it("lists the open times for a day, counting the appointment's own time as free", async () => {
    await rollbackTest(async (tx) => {
      const { ids, openings } = await seed(tx);
      const anasDay = await openings(ids.milans, local(2, 0));
      expect(anasDay.timezone).toBe(timezone);
      expect(anasDay.openings).not.toContain(local(2, 10).toUTC().toISO());
      expect(anasDay.openings).toContain(local(2, 11).toUTC().toISO());
      // Half an hour earlier overlaps Milan's own booking, which is moving anyway.
      const ownDay = await openings(ids.milans, local(1, 0));
      expect(ownDay.openings).toContain(local(1, 15).toUTC().toISO());
      expect(ownDay.openings).toContain(local(1, 14, 30).toUTC().toISO());
    });
  });

  it("refuses viewers and an appointment that doesn't exist", async () => {
    await rollbackTest(async (tx) => {
      const { ids, userIds, openings } = await seed(tx);
      await expect(openings(ids.milans, local(2, 0), userIds.viewer)).rejects.toMatchObject({ status: 403 });
    });
    await rollbackTest(async (tx) => {
      const { openings } = await seed(tx);
      await expect(openings(randomUUID(), local(2, 0))).rejects.toMatchObject({ status: 404 });
    });
  });
});
