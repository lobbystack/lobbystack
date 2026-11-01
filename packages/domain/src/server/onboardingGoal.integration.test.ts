import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, createDatabaseClient, partners, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { HOST_BRAND_SCOPE } from "./businessAccess";
import { submitOnboardingGoal } from "./onboarding";
import { skipOnboardingNumber } from "./phoneNumbers";
import { createBusiness, listUserBusinesses } from "./tenancy";

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

async function row(tx: DatabaseTransaction, businessId: string) {
  return (await tx.select({ stage: businesses.onboardingStage, goal: businesses.onboardingGoal }).from(businesses).where(eq(businesses.id, businessId)))[0];
}

describe.skipIf(!testUrl)("onboarding goal against dedicated PostgreSQL roles", () => {
  it("saves the goal, moves on to attribution, and shows it in the workspace list", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await workspace(tx, "goal");
      await asApp(tx, (db) => submitOnboardingGoal({ db }, { userId, businessId, goal: "answer_instagram_messages" }));
      expect(await row(tx, businessId)).toEqual({ stage: "attribution", goal: "answer_instagram_messages" });
      const listed = await asApp(tx, (db) => listUserBusinesses(db, userId, HOST_BRAND_SCOPE));
      expect(listed.find((business) => business.businessId === businessId)?.onboardingGoal).toBe("answer_instagram_messages");
    });
  });

  it("keeps a saved goal when the owner skips, and leaves a later stage alone", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await workspace(tx, "complete");
      await asApp(tx, (db) => submitOnboardingGoal({ db }, { userId, businessId, goal: "answer_calls" }));
      await asApp(tx, (db) => submitOnboardingGoal({ db }, { userId, businessId, goal: null }));
      expect(await row(tx, businessId)).toEqual({ stage: "complete", goal: "answer_calls" });
    });
  });

  it("refuses the goal before its step", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await workspace(tx, "test_call");
      await expect(asApp(tx, (db) => submitOnboardingGoal({ db }, { userId, businessId, goal: "answer_calls" }))).rejects.toMatchObject({ status: 409 });
    });
  });

  it("refuses a partner's business, which has no goal step", async () => {
    await rollbackTest(async tx => {
      const partnerId = randomUUID();
      await tx.insert(partners).values({ id: partnerId, name: "Partner", slug: `p-${partnerId.slice(0, 8)}` });
      const { userId, businessId } = await workspace(tx, "complete");
      // A direct business can't join a partner, so step around that guard to make one with an owner.
      await tx.execute(sql`alter table public.businesses disable trigger businesses_keep_direct_before_update`);
      await tx.update(businesses).set({ partnerId }).where(eq(businesses.id, businessId));
      await expect(asApp(tx, (db) => submitOnboardingGoal({ db }, { userId, businessId, goal: "answer_calls" }))).rejects.toMatchObject({ status: 409 });
    });
  });

  it("rejects a goal outside the fixed set in the database", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await workspace(tx, "goal");
      await expect(tx.transaction((nested) => nested.update(businesses).set({ onboardingGoal: "make_coffee" }).where(eq(businesses.id, businessId)))).rejects.toThrow();
    });
  });

  it("sends an owner who skips the number to the goal", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await workspace(tx, "phone_number");
      await asApp(tx, (db) => skipOnboardingNumber({ db }, { userId, businessId }));
      expect((await row(tx, businessId))?.stage).toBe("goal");
    });
  });

  it("lets an owner on the goal step go back and claim a number without moving the stage", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await workspace(tx, "goal");
      await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, businessId));
      await tx.execute(sql`set local session authorization lobbystack_app`);
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true), set_config('app.business_id', ${businessId}, true)`);
      await tx.execute(sql`select app.reserve_onboarding_number_claim(${businessId}::uuid, ${userId}::uuid, '+15550100000', '{}'::jsonb, ${randomUUID()}, ${randomUUID()})`);
      await tx.execute(sql`reset session authorization`);
      expect((await row(tx, businessId))?.stage).toBe("goal");
    });
  });
});
