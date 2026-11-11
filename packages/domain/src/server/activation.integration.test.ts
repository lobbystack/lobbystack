import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, calls, createDatabaseClient, partners, phoneNumbers, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { loadSetupGuideInTransaction } from "./activation";
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
  const email = `${userId}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: `Acme ${userId}`, timezone: "UTC", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
  return businessId;
}

const line = () => `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;

describe.skipIf(!testUrl)("Getting started against PostgreSQL", () => {
  it("gives a direct business with a number the number list, and counts a call it answered long before as calling the number", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await workspace(tx);
      await tx.insert(phoneNumbers).values({ businessId, e164: line(), providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, status: "active" });
      expect((await loadSetupGuideInTransaction(tx, businessId)).numberSteps.callNumber).toBe("needs setup");
      // A real call answered a year ago, before this list existed.
      const longAgo = new Date(Date.now() - 365 * 86_400_000);
      await tx.insert(calls).values({ businessId, provider: "twilio", providerCallId: `CA${randomUUID()}`, transport: "twilio", status: "completed", startedAt: longAgo, mediaStartedAt: longAgo, endedAt: longAgo });
      const guide = await loadSetupGuideInTransaction(tx, businessId);
      expect(guide.variant).toBe("number");
      expect(guide.numberSteps.callNumber).toBe("complete");
      expect(guide.numberSteps.forwardCalls).toBe("needs setup");
    });
  });

  it("keeps the classic list for a business that never had a number, and for a partner's business", async () => {
    await rollbackTest(async (tx) => {
      const direct = await workspace(tx);
      expect((await loadSetupGuideInTransaction(tx, direct)).variant).toBe("classic");
      const partnerId = randomUUID();
      await tx.insert(partners).values({ id: partnerId, name: "Acme Reception", slug: `acme-${partnerId.slice(0, 8)}` });
      const partnered = randomUUID();
      await tx.insert(businesses).values({ id: partnered, slug: `harbor-${partnered.slice(0, 8)}`, name: "Harbor Dental", timezone: "UTC", businessType: "dental", partnerId });
      await tx.insert(phoneNumbers).values({ businessId: partnered, e164: line(), providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, status: "active" });
      expect((await loadSetupGuideInTransaction(tx, partnered)).variant).toBe("classic");
    });
  });
});
