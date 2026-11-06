import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, createDatabaseClient, unitEconomicsEvents, unitEconomicsRollups, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { refreshUnitEconomicsMonth } from "./unitEconomics";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Unit economics integration tests require a dedicated local test database.");
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

/** Runs `work` in a savepoint as `role`, then returns to the migrator role. */
async function asRole<T>(tx: DatabaseTransaction, role: "lobbystack_worker", work: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local role ${role}`));
  try {
    return await work(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset role`);
  }
}

describe.skipIf(!testUrl)("unit economics rollups against dedicated PostgreSQL roles", () => {
  it("writes a rollup as the worker role under row-level security", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Rollup workspace", timezone: "UTC", businessType: "test" });
      await tx.insert(unitEconomicsEvents).values([
        { businessId, monthKey: "2026-09", occurredAt: new Date("2026-09-02T10:00:00Z"), eventKey: "voice-1", eventKind: "voice_provider", channel: "voice", costUsd: 1.5, quantity: 120, quantityUnit: "second", callId: null },
        { businessId, monthKey: "2026-09", occurredAt: new Date("2026-09-02T10:01:00Z"), eventKey: "ai-1", eventKind: "voice_ai", channel: "voice", costUsd: 0.25, callId: null },
      ]);

      const rollupId = await asRole(tx, "lobbystack_worker", (db) => refreshUnitEconomicsMonth({ db }, { businessId, monthKey: "2026-09" }));

      expect(rollupId).toEqual(expect.any(String));
      const [rollup] = await tx.select().from(unitEconomicsRollups).where(eq(unitEconomicsRollups.id, rollupId!));
      expect(rollup).toMatchObject({ businessId, monthKey: "2026-09", totalCostUsd: 1.75, providerCostUsd: 1.5, aiCostUsd: 0.25, voiceMinutes: 2, voiceCallCount: 0 });
    });
  });

  it("skips a refresh whose business was deleted before the job ran", async () => {
    await rollbackTest(async (tx) => {
      await expect(asRole(tx, "lobbystack_worker", (db) => refreshUnitEconomicsMonth({ db }, { businessId: randomUUID(), monthKey: "2026-09" }))).resolves.toBeNull();
    });
  });
});
