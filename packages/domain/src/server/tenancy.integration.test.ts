import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessHours, createDatabaseClient, services, staff, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { findAvailability } from "./booking";
import { createBusiness } from "./tenancy";

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

describe.skipIf(!client)("createBusiness", () => {
  it("gives a new business a default staff member so it can take bookings", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      const email = `${userId}@example.invalid`;
      await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Northside Plumbing", timezone: "America/Toronto", businessType: "service_company" });
      await tx.execute(sql`reset role`);

      const members = await tx.select({ name: staff.name, active: staff.active }).from(staff).where(eq(staff.businessId, businessId));
      expect(members).toEqual([{ name: "Northside Plumbing", active: true }]);

      await tx.insert(businessHours).values({ businessId, dayOfWeek: 2, openMinutes: 8 * 60, closeMinutes: 17 * 60 });
      const [service] = await tx.insert(services).values({ businessId, name: "Drain cleaning", slug: "drain-cleaning", durationMinutes: 60 }).returning({ id: services.id });
      // Tuesday 2030-01-08 at 09:00 in Toronto.
      const slots = await findAvailability({ db: tx as unknown as Database }, { businessId, serviceId: service!.id, startsAt: "2030-01-08T14:00:00.000Z", timezone: "America/Toronto" });
      expect(slots.length).toBeGreaterThan(0);
    });
  });
});
