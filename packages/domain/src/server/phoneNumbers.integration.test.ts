import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, createDatabaseClient, numberTrials, onboardingNumberClaimEvents, onboardingPhoneVerifications, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { reserveOnboardingNumberClaim, searchBusinessNumberInventory } from "./phoneNumbers";
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

const claimTokenSecret = "number-claim-test-secret";
const inventory = { listAvailablePhoneNumbers: async () => [{ phoneE164: "+14165550123", countryCode: "CA", capabilities: { sms: true, voice: true } }] };

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

/** A self-hosted workspace on the number step with one earlier claim left in provisioning. */
async function workspaceWithProvisioningClaim(tx: DatabaseTransaction, idleMinutes: number) {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Claim workspace", timezone: "America/Toronto", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "phone_number", deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, businessId));
  const updatedAt = new Date(Date.now() - idleMinutes * 60_000);
  const [stalled] = await tx.insert(onboardingNumberClaimEvents).values({ businessId, userId, requestedE164: "+14165550100", selectionContext: {}, claimTokenHash: "earlier", idempotencyKey: "earlier", status: "provisioning", reservedAt: updatedAt, updatedAt }).returning({ id: onboardingNumberClaimEvents.id });
  return { userId, businessId, stalledId: stalled!.id };
}

/** A cloud workspace on the number step whose owner verified a Canadian mobile, so its number is a free trial. */
async function trialWorkspace(tx: DatabaseTransaction, input: { phone: string; userId?: string }) {
  const userId = input.userId ?? randomUUID();
  if (!input.userId) await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam" });
  await tx.update(users).set({ phone: input.phone, phoneVerifiedAt: new Date() }).where(eq(users.id, userId));
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Trial workspace", timezone: "America/Toronto", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "phone_number", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
  await tx.insert(onboardingPhoneVerifications).values({ businessId, userId, phoneE164: input.phone, countryCode: "CA", status: "approved", approvedAt: new Date(), expiresAt: new Date(Date.now() + 600_000), requestFingerprint: "test" });
  return { userId, businessId };
}

// The reservation function trusts only the app's login identity, so switch session_user rather than the current role.
async function reserveAsApp(tx: DatabaseTransaction, input: { userId: string; businessId: string; ipHash?: string }) {
  await tx.execute(sql`set local session authorization lobbystack_app`);
  try {
    const db = tx as unknown as Database;
    const { numbers } = await searchBusinessNumberInventory({ db }, { ...input, claimTokenSecret }, inventory);
    return await reserveOnboardingNumberClaim({ db }, { ...input, claimToken: numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() });
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

describe.skipIf(!testUrl)("onboarding number claims against dedicated PostgreSQL roles", () => {
  it("refuses a second claim while a worker still holds the first", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId } = await workspaceWithProvisioningClaim(tx, 1);
      await expect(reserveAsApp(tx, { userId, businessId })).rejects.toMatchObject({ status: 409, code: "number_claim_in_progress" });
    });
  });

  it("fails a claim no worker has touched for 30 minutes so the business can pick again", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, stalledId } = await workspaceWithProvisioningClaim(tx, 31);
      expect(await reserveAsApp(tx, { userId, businessId })).toMatch(/^[0-9a-f-]{36}$/);
      const [stalled] = await tx.select({ status: onboardingNumberClaimEvents.status }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.id, stalledId));
      expect(stalled?.status).toBe("failed");
    });
  });

  it("gives one free trial number per account, verified phone and network", async () => {
    await rollbackTest(async (tx) => {
      const first = await trialWorkspace(tx, { phone: "+14165550111" });
      expect(await reserveAsApp(tx, { ...first, ipHash: "network-1" })).toMatch(/^[0-9a-f-]{36}$/);
      const trials = await tx.select({ status: numberTrials.status, verifiedPhone: numberTrials.verifiedPhone, ipHash: numberTrials.ipHash }).from(numberTrials).where(eq(numberTrials.businessId, first.businessId));
      expect(trials).toEqual([{ status: "reserved", verifiedPhone: "+14165550111", ipHash: "network-1" }]);

      const sameAccount = await trialWorkspace(tx, { phone: "+14165550111", userId: first.userId });
      await expect(reserveAsApp(tx, { ...sameAccount, ipHash: "network-2" })).rejects.toMatchObject({ status: 409, code: "trial_already_used" });
      const samePhone = await trialWorkspace(tx, { phone: "+14165550111" });
      await expect(reserveAsApp(tx, { ...samePhone, ipHash: "network-2" })).rejects.toMatchObject({ status: 409, code: "trial_already_used" });
      const sameNetwork = await trialWorkspace(tx, { phone: "+14165550122" });
      await expect(reserveAsApp(tx, { ...sameNetwork, ipHash: "network-1" })).rejects.toMatchObject({ status: 429, code: "trial_ip_limited" });
    });
  });
});
