import { randomUUID } from "node:crypto";

import { checkInTokenVariable } from "@lobbystack/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { checkInAnswers, createDatabaseClient, productEvents, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { checkInTokenVariables, recordCheckInAnswer } from "./checkIn";
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

async function workspace(tx: DatabaseTransaction) {
  const userId = randomUUID();
  const email = `${randomUUID()}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: `Acme ${randomUUID()}`, timezone: "UTC", businessType: "test" });
  await tx.execute(sql`reset role`);
  return { userId, businessId };
}

// The page's route runs as the app role, with no signed-in operator.
async function confirmAsApp(tx: DatabaseTransaction, token: string) {
  await tx.execute(sql`set local role lobbystack_app`);
  const result = await recordCheckInAnswer({ db: tx as unknown as Database }, { token });
  await tx.execute(sql`reset role`);
  return result;
}

describe.skipIf(!testUrl)("check-in answers against dedicated PostgreSQL roles", () => {
  it("saves an answer and fires the event once, attributed to the owner", async () => {
    await rollbackTest(async tx => {
      const { userId, businessId } = await workspace(tx);
      const token = checkInTokenVariables(businessId)[checkInTokenVariable("test_call_mistakes")]!;
      expect(await confirmAsApp(tx, token)).toEqual({ answer: "test_call_mistakes" });
      expect(await confirmAsApp(tx, token)).toEqual({ answer: "test_call_mistakes" });
      expect(await tx.select().from(checkInAnswers).where(eq(checkInAnswers.businessId, businessId))).toHaveLength(1);
      const events = await tx.select().from(productEvents).where(and(eq(productEvents.businessId, businessId), eq(productEvents.name, "onboarding.check_in_answered")));
      expect(events).toHaveLength(1);
      expect(events[0]!.distinctId).toContain(userId);
      expect(events[0]!.properties).toMatchObject({ answer: "test_call_mistakes", businessId });
    });
  });

  it("hears a different answer later", async () => {
    await rollbackTest(async tx => {
      const { businessId } = await workspace(tx);
      const tokens = checkInTokenVariables(businessId);
      await confirmAsApp(tx, tokens[checkInTokenVariable("still_testing")]!);
      await confirmAsApp(tx, tokens[checkInTokenVariable("connect_number")]!);
      expect(await tx.select().from(checkInAnswers).where(eq(checkInAnswers.businessId, businessId))).toHaveLength(2);
    });
  });

  it("refuses a link whose business is gone", async () => {
    await rollbackTest(async tx => {
      const token = checkInTokenVariables(randomUUID())[checkInTokenVariable("not_a_fit")]!;
      expect(await confirmAsApp(tx, token)).toBeNull();
    });
  });
});
