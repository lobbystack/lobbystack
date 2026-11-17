import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, businessMemberships, closures, createDatabaseClient, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { saveTimeOff } from "./timeOff";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Time off integration tests require a dedicated local test database.");
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
const local = (moment: DateTime) => moment.toFormat("yyyy-LL-dd'T'HH:mm");
const today = () => DateTime.now().setZone(timezone).startOf("day");

/** A Toronto business whose admin saves time off under RLS as the app role. */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone, businessType: "test", telemetryEnabled: false });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_admin" });
  const db = tx as unknown as Database;
  return {
    businessId,
    // Time off already under way, as an earlier save would have left it.
    underWay: async (startsAt: DateTime, endsAt: DateTime) => (await tx.insert(closures).values({ businessId, startsAt: startsAt.toJSDate(), endsAt: endsAt.toJSDate(), reason: "Renovation" }).returning({ id: closures.id }))[0]!.id,
    save: async (input: { id?: string; startsAt: DateTime; endsAt: DateTime; name?: string }) => {
      await tx.execute(sql`set local role lobbystack_app`);
      try {
        return await saveTimeOff({ db }, { userId, businessId, staffId: null, name: input.name ?? "Staff training", startsAt: local(input.startsAt), endsAt: local(input.endsAt), ...(input.id ? { id: input.id } : {}) });
      } finally {
        await tx.execute(sql`reset role`);
      }
    },
  };
}

describe.skipIf(!client)("time off that starts in the past", () => {
  it("refuses new time off that started before today in the business's timezone", async () => {
    await rollbackTest(async (tx) => {
      const { save } = await seed(tx);
      await expect(save({ startsAt: today().minus({ days: 1 }), endsAt: today().plus({ days: 2 }) })).rejects.toMatchObject({ status: 400, code: "time_off_start_past" });
      await expect(save({ startsAt: today().minus({ minutes: 1 }), endsAt: today().plus({ days: 1 }) })).rejects.toMatchObject({ code: "time_off_start_past" });
    });
  });

  it("accepts time off that starts today, even earlier in the day than now", async () => {
    await rollbackTest(async (tx) => {
      const { save } = await seed(tx);
      expect(await save({ startsAt: today(), endsAt: today().plus({ hours: 23, minutes: 59 }) })).toMatchObject({ name: "Staff training" });
    });
  });

  it("lets time already under way keep its own start while it is edited, but not move that start further back", async () => {
    await rollbackTest(async (tx) => {
      const { underWay, save } = await seed(tx);
      const started = today().minus({ days: 1 });
      const id = await underWay(started, today().plus({ days: 3 }));

      expect(await save({ id, startsAt: started, endsAt: today().plus({ days: 5 }), name: "Longer renovation" })).toMatchObject({ name: "Longer renovation" });
      await expect(save({ id, startsAt: started.minus({ days: 1 }), endsAt: today().plus({ days: 5 }) })).rejects.toMatchObject({ code: "time_off_start_past" });
      expect(await save({ id, startsAt: today(), endsAt: today().plus({ days: 5 }) })).toMatchObject({ name: "Staff training" });
    });
  });
});
