import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { agents, billingAccounts, businesses, businessNumberCharges, createDatabaseClient, defaultAgentIdOf, onboardingNumberClaimEvents, phoneNumbers, productEvents, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { createAgent } from "./agents";
import { reserveExtraNumberClaim, searchExtraNumbers, settleExtraNumberCharges, type ExtraNumberCharge } from "./extraNumbers";
import { claimNumberProvisioning, completeNumberProvisioning, reserveReplacementNumberClaim, searchBusinessNumberInventory, type NumberInventoryProvider } from "./phoneNumbers";
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

const claimTokenSecret = "extra-number-test-secret";

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

// Security-definer functions trust session_user, so switch it rather than the current role.
async function as<T>(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker", run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local session authorization ${role}`));
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

/** A random Toronto number, so tests running at once never share one. */
function testNumber(): string {
  return `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
}

/** Hands out a fresh number for each search, so claims never collide. */
const inventory: NumberInventoryProvider = {
  async listAvailablePhoneNumbers(input) {
    return Array.from({ length: Math.min(input.limit, 3) }, () => ({ phoneE164: testNumber(), countryCode: input.countryCode, locality: "Toronto", capabilities: { sms: true, voice: true } }));
  },
};

/** An owner's business that finished onboarding with its included number, on the plan given, and a second agent. */
async function businessWithNumber(tx: DatabaseTransaction, account: { plan: string; subscriptionState: string } | null) {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Owner", emailVerified: true });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: `Extra ${randomUUID()}`, timezone: "America/Toronto", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ onboardingStage: "complete", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
  const [included] = await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: testNumber(), status: "active", createdAt: new Date(Date.now() - 86_400_000) }).returning({ id: phoneNumbers.id });
  // Free includes one agent, so the second comes while the business is on Pro.
  await tx.delete(billingAccounts).where(eq(billingAccounts.businessId, businessId));
  await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "pro", subscriptionState: "active" });
  const agent = await as(tx, "lobbystack_app", async (db) => await createAgent({ db }, { userId, businessId, name: "After hours" }));
  await tx.update(billingAccounts).set(account ?? { plan: "free_cloud", subscriptionState: "active" }).where(eq(billingAccounts.businessId, businessId));
  return { userId, businessId, agentId: agent.id, includedNumberId: included!.id };
}

async function worker<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
  return await as(tx, "lobbystack_worker", run);
}

/** Buys the claim's number the way the worker does. */
async function buy(tx: DatabaseTransaction, businessId: string, claimId: string): Promise<string> {
  return await worker(tx, async (db) => {
    const claim = await claimNumberProvisioning({ db }, { businessId, claimId });
    return await completeNumberProvisioning({ db }, { businessId, claimId, e164: claim!.e164, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "sip-trunk:TK-test" });
  });
}

async function outcome(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describe.skipIf(!testUrl)("extra numbers against dedicated PostgreSQL roles", () => {
  it("sells a Starter business a number for its second agent at the country's price, and charges each month past the included one", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...owner, claimTokenSecret }, inventory));
      expect(search.price).toEqual({ countryCode: "CA", monthlyCents: 115, currency: "USD" });
      const claimId = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
      const [claim] = await tx.select({ purpose: onboardingNumberClaimEvents.purpose, agentId: onboardingNumberClaimEvents.agentId, monthlyPriceCents: onboardingNumberClaimEvents.monthlyPriceCents }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.id, claimId));
      expect(claim).toEqual({ purpose: "extra", agentId: owner.agentId, monthlyPriceCents: 115 });

      const phoneNumberId = await buy(tx, owner.businessId, claimId);
      const [number] = await tx.select({ agentId: phoneNumbers.agentId }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId));
      expect(number?.agentId).toBe(owner.agentId);
      const [business] = await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, owner.businessId));
      expect(business?.stage).toBe("complete");
      const events = await tx.select({ properties: productEvents.properties }).from(productEvents).where(and(eq(productEvents.businessId, owner.businessId), eq(productEvents.name, "billing.extra_number_bought")));
      expect(events).toEqual([{ properties: expect.objectContaining({ countryCode: "CA", charged: true }) }]);

      const reported: ExtraNumberCharge[] = [];
      const report = async (charge: ExtraNumberCharge) => { reported.push(charge); };
      const settle = async (now: Date) => await worker(tx, async (db) => await settleExtraNumberCharges({ db }, { report, now }));
      const [charge] = await tx.select({ id: businessNumberCharges.id, startedAt: businessNumberCharges.startedAt }).from(businessNumberCharges).where(eq(businessNumberCharges.phoneNumberId, phoneNumberId));
      const start = charge!.startedAt.getTime();
      // Only this business's months, since other tests' rows may share the database.
      const mine = () => reported.filter((item) => item.businessId === owner.businessId);
      await settle(new Date(start + 60_000));
      expect(mine()).toEqual([expect.objectContaining({ chargeId: charge!.id, billingKey: `business:${owner.businessId}`, countryCode: "CA", month: 0, amountCents: 115, idempotencyKey: `extra-number:${charge!.id}:0` })]);
      await settle(new Date(start + 60_000));
      expect(mine()).toHaveLength(1);
      await settle(new Date(start + 32 * 86_400_000));
      expect(mine().map((item) => item.month)).toEqual([0, 1]);

      // The plan ends: the next month settles uncharged.
      await tx.update(billingAccounts).set({ subscriptionState: "canceled" }).where(eq(billingAccounts.businessId, owner.businessId));
      await settle(new Date(start + 62 * 86_400_000));
      expect(mine()).toHaveLength(2);
      const [after] = await tx.select({ settled: businessNumberCharges.monthsSettled, charged: businessNumberCharges.monthsCharged }).from(businessNumberCharges).where(eq(businessNumberCharges.id, charge!.id));
      expect(after).toEqual({ settled: 3, charged: 2 });
    });
  });

  it("stops charging when the extra number becomes the business's only one", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "pro", subscriptionState: "active" });
      const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...owner, claimTokenSecret }, inventory));
      const claimId = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
      const phoneNumberId = await buy(tx, owner.businessId, claimId);
      await tx.update(phoneNumbers).set({ status: "released" }).where(eq(phoneNumbers.id, owner.includedNumberId));
      const reported: ExtraNumberCharge[] = [];
      await worker(tx, async (db) => await settleExtraNumberCharges({ db }, { report: async (charge) => { reported.push(charge); }, now: new Date(Date.now() + 60_000) }));
      expect(reported.filter((item) => item.businessId === owner.businessId)).toEqual([]);
      const [charge] = await tx.select({ settled: businessNumberCharges.monthsSettled, charged: businessNumberCharges.monthsCharged }).from(businessNumberCharges).where(eq(businessNumberCharges.phoneNumberId, phoneNumberId));
      expect(charge).toEqual({ settled: 1, charged: 0 });
    });
  });

  it("gives Enterprise extra numbers free, and refuses Free, a business with no number and a changed price", async () => {
    await rollbackTest(async (tx) => {
      const enterprise = await businessWithNumber(tx, { plan: "enterprise", subscriptionState: "active" });
      const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...enterprise, claimTokenSecret }, inventory));
      expect(search.price).toBeNull();
      const claimId = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...enterprise, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
      const phoneNumberId = await buy(tx, enterprise.businessId, claimId);
      expect(await tx.select().from(businessNumberCharges).where(eq(businessNumberCharges.phoneNumberId, phoneNumberId))).toEqual([]);

      // Enterprise's free offer can't buy a number once the plan sells them.
      const free = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...enterprise, claimTokenSecret }, inventory));
      await tx.update(billingAccounts).set({ plan: "starter" }).where(eq(billingAccounts.businessId, enterprise.businessId));
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(reserveExtraNumberClaim({ db }, { ...enterprise, claimToken: free.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() })))).toBe("extra_number_price_changed");

      const onFree = await businessWithNumber(tx, null);
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(searchExtraNumbers({ db }, { ...onFree, claimTokenSecret }, inventory)))).toBe("dedicated_number_requires_paid_plan");

      const withoutNumber = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      await tx.update(phoneNumbers).set({ status: "released" }).where(eq(phoneNumbers.id, withoutNumber.includedNumberId));
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(searchExtraNumbers({ db }, { ...withoutNumber, claimTokenSecret }, inventory)))).toBe("business_number_required");
    });
  });

  it("puts a number the previous worker buys on the claim's agent and starts its months", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...owner, claimTokenSecret }, inventory));
      const claimId = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
      // The previous release inserts the number on the default agent and marks the claim bought.
      const [claim] = await tx.select({ e164: onboardingNumberClaimEvents.requestedE164 }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.id, claimId));
      const phoneNumberId = await worker(tx, async (db) => await withBusinessTransaction(db, { businessId: owner.businessId, actorType: "worker" }, async (inner) => {
        const [number] = await inner.insert(phoneNumbers).values({ businessId: owner.businessId, agentId: defaultAgentIdOf(owner.businessId), e164: claim!.e164, providerPhoneId: `PN${randomUUID()}`, status: "active" }).returning({ id: phoneNumbers.id });
        await inner.update(onboardingNumberClaimEvents).set({ status: "provisioning" }).where(eq(onboardingNumberClaimEvents.id, claimId));
        await inner.update(onboardingNumberClaimEvents).set({ status: "claimed", phoneNumberId: number!.id, purchasedAt: new Date() }).where(eq(onboardingNumberClaimEvents.id, claimId));
        return number!.id;
      }));
      const [number] = await tx.select({ agentId: phoneNumbers.agentId }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId));
      expect(number?.agentId).toBe(owner.agentId);
      expect(await tx.select({ price: businessNumberCharges.monthlyPriceCents, country: businessNumberCharges.countryCode }).from(businessNumberCharges).where(eq(businessNumberCharges.phoneNumberId, phoneNumberId))).toEqual([{ price: 115, country: "CA" }]);
    });
  });

  it("replaces the number the operator picked and keeps its agent", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...owner, claimTokenSecret }, inventory));
      const extraClaim = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
      const extraNumberId = await buy(tx, owner.businessId, extraClaim);
      // The included number is older, so without a named number the newest, the extra one, would be replaced.
      const offers = await as(tx, "lobbystack_app", async (db) => await searchBusinessNumberInventory({ db }, { ...owner, purpose: "replacement", claimTokenSecret }, inventory));
      const claimId = await as(tx, "lobbystack_app", async (db) => await reserveReplacementNumberClaim({ db }, { ...owner, claimToken: offers.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID(), phoneNumberId: owner.includedNumberId }));
      const [claim] = await tx.select({ replacing: onboardingNumberClaimEvents.replacingPhoneNumberId }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.id, claimId));
      expect(claim?.replacing).toBe(owner.includedNumberId);
      // Move the included number to the second agent first: its replacement follows it.
      await tx.update(phoneNumbers).set({ agentId: owner.agentId }).where(eq(phoneNumbers.id, owner.includedNumberId));
      const replacementId = await buy(tx, owner.businessId, claimId);
      const rows = await tx.select({ id: phoneNumbers.id, agentId: phoneNumbers.agentId, reclaimReason: phoneNumbers.reclaimReason }).from(phoneNumbers).where(eq(phoneNumbers.businessId, owner.businessId));
      expect(rows.find((row) => row.id === replacementId)?.agentId).toBe(owner.agentId);
      expect(rows.find((row) => row.id === owner.includedNumberId)?.reclaimReason).toBe("replacement");
      expect(rows.find((row) => row.id === extraNumberId)?.reclaimReason).toBeNull();
      const [agent] = await tx.select({ isDefault: agents.isDefault }).from(agents).where(eq(agents.id, owner.agentId));
      expect(agent?.isDefault).toBe(false);
    });
  });
});
