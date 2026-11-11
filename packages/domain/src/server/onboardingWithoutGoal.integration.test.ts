import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, createDatabaseClient, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { HOST_BRAND_SCOPE } from "./businessAccess";
import { advanceOnboardingStage, getActiveOnboardingState } from "./onboarding";
import { skipOnboardingNumber } from "./phoneNumbers";
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

async function asApp<T>(tx: DatabaseTransaction, work: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local role lobbystack_app`);
  try {
    return await work(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset role`);
  }
}

async function workspace(tx: DatabaseTransaction, stage: string) {
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
  const { businessId } = await asApp(tx, (db) => createBusiness({ db }, { userId, name: `Acme ${userId}`, timezone: "UTC", businessType: "test" }));
  await tx.update(businesses).set({ onboardingStage: stage }).where(eq(businesses.id, businessId));
  return { userId, businessId };
}

async function stage(tx: DatabaseTransaction, businessId: string) {
  return (await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)))[0]?.stage;
}

// The goal question left onboarding. Its column stays for the answers owners
// already gave, which the welcome email still reads.
describe.skipIf(!testUrl)("onboarding without the goal question, against dedicated PostgreSQL roles", () => {
  it("reads a workspace parked on the goal as attribution, and repairs the stored stage when it moves on", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await workspace(tx, "goal");
      expect((await asApp(tx, (db) => getActiveOnboardingState(db, userId, HOST_BRAND_SCOPE))).stage).toBe("attribution");
      await asApp(tx, (db) => advanceOnboardingStage({ db }, { userId, businessId, to: "attribution" }));
      expect(await stage(tx, businessId)).toBe("attribution");
    });
  });

  it("still rejects a goal outside the fixed set in the database", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await workspace(tx, "attribution");
      await expect(tx.transaction((nested) => nested.update(businesses).set({ onboardingGoal: "make_coffee" }).where(eq(businesses.id, businessId)))).rejects.toThrow();
    });
  });

  it("sends a self-hosted owner who skips the number to attribution", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await workspace(tx, "phone_number");
      await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, businessId));
      await asApp(tx, (db) => skipOnboardingNumber({ db }, { userId, businessId }));
      expect(await stage(tx, businessId)).toBe("attribution");
    });
  });
});
