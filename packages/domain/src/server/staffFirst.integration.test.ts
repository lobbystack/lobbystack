import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, businesses, createDatabaseClient, numberTrials, outboxMessages, phoneNumbers, receptionistProfiles, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { desiredNumberRouting } from "./numberTrials";
import { saveReceptionistProfileInTransaction } from "./receptionistProfile";
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

const staffPhone = "+14165550142";
const lobbyNumber = "+14165550123";

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

async function business(tx: DatabaseTransaction, input: { plan?: "free_cloud" | "starter"; carrier?: string } = {}): Promise<string> {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Harbor dental", timezone: "America/Toronto", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
  const plan = input.plan ?? "starter";
  await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan, subscriptionState: plan === "starter" ? "active" : null }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan, subscriptionState: plan === "starter" ? "active" : null } });
  if (input.carrier) await tx.insert(phoneNumbers).values({ businessId, e164: lobbyNumber, status: "active", carrier: input.carrier, providerPhoneId: `PN${randomUUID()}` });
  return businessId;
}

const save = (tx: DatabaseTransaction, businessId: string, patch: Parameters<typeof saveReceptionistProfileInTransaction>[1]["patch"]) => saveReceptionistProfileInTransaction(tx, { businessId, businessName: "Harbor dental", patch });

describe.skipIf(!testUrl)("staff answers first against PostgreSQL", () => {
  it("saves the settings on a paid plan and queues a routing job for each Twilio number", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      const profile = await save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone, staffFirstRingSeconds: 20, staffFirstMessage: "One moment.", staffFirstHandoverMessage: "Connecting you now." });
      expect(profile).toMatchObject({ staffFirstMode: "always", staffFirstNumber: staffPhone, staffFirstRingSeconds: 20, staffFirstMessage: "One moment.", staffFirstHandoverMessage: "Connecting you now." });
      const jobs = await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      expect(jobs.map((job) => job.topic)).toContain("phoneNumber.route");
    });
  });

  it("refuses a Free business", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "free_cloud", carrier: "twilio" });
      await expect(save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone })).rejects.toMatchObject({ status: 402, code: "staff_first_plan_required" });
    });
  });

  it("refuses a business with only Telnyx numbers", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "telnyx" });
      await expect(save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone })).rejects.toMatchObject({ status: 409, code: "staff_first_carrier_unsupported" });
    });
  });

  it("needs a staff phone, and refuses the business's own number", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      await expect(save(tx, businessId, { staffFirstMode: "business_hours" })).rejects.toMatchObject({ code: "staff_first_number_required" });
      await expect(save(tx, businessId, { staffFirstNumber: lobbyNumber })).rejects.toMatchObject({ code: "staff_first_number_own_line" });
    });
  });

  it("keeps a removed staff phone from leaving the setting on", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      await save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone });
      await expect(save(tx, businessId, { staffFirstNumber: null })).rejects.toMatchObject({ code: "staff_first_number_required" });
      expect((await tx.select({ number: receptionistProfiles.staffFirstNumber }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)))[0]?.number).toBe(staffPhone);
    });
  });

  it("routes a number to staff_first while the setting is on, and a trial's fallback wins", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      const [number] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
      const desired = () => desiredNumberRouting({ db: tx as unknown as Database }, { businessId, phoneNumberId: number!.id });
      expect((await desired())?.mode).toBe("receptionist");
      await save(tx, businessId, { staffFirstMode: "business_hours", staffFirstNumber: staffPhone });
      expect((await desired())?.mode).toBe("staff_first");
      await tx.insert(numberTrials).values({ businessId, userId: (await tx.select({ id: users.id }).from(users).limit(1))[0]!.id, status: "ended", phoneNumberId: number!.id, verifiedPhone: staffPhone });
      expect((await desired())?.mode).toBe("fallback");
    });
  });

  it("leaves a Telnyx number on the receptionist", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "telnyx" });
      const [number] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
      await tx.update(receptionistProfiles).set({ staffFirstMode: "always", staffFirstNumber: staffPhone }).where(eq(receptionistProfiles.businessId, businessId));
      expect((await desiredNumberRouting({ db: tx as unknown as Database }, { businessId, phoneNumberId: number!.id }))?.mode).toBe("receptionist");
    });
  });

  it("rejects an unknown mode at the database", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx);
      await save(tx, businessId, { greeting: "Hello." });
      await expect(tx.transaction(async (nested) => { await nested.execute(sql`update receptionist_profiles set staff_first_mode = 'weekends' where business_id = ${businessId}::uuid`); })).rejects.toThrow();
    });
  });
});
