import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { agents, billingAccounts, billingCheckoutRequests, businesses, businessNumberCharges, createDatabaseClient, defaultAgentIdOf, onboardingNumberClaimEvents, outboxMessages, phoneNumbers, productEvents, providerEvents, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { createAgent } from "./agents";
import { reconcileBillingProviderEvent } from "./billing";
import { createExtraNumbersCheckoutRequest, reserveExtraNumberClaim, searchExtraNumbers, settleExtraNumberCharges, type ExtraNumberCharge } from "./extraNumbers";
import { extraNumbersSubscriptionChange } from "./extraNumbersSubscription";
import { claimExtraPhoneNumberForApi, createExtraNumbersCheckoutForApi, getExtraNumbersCheckoutForApi, listPhoneNumbersForApi, searchExtraPhoneNumbersForApi } from "./publicApi/operations";
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

/** The business's monthly extra numbers add-on bills, as its Polar webhook would leave it. */
async function subscribe(tx: DatabaseTransaction, businessId: string, state = "active"): Promise<void> {
  await tx.update(billingAccounts).set({ extraNumbersSubscriptionId: `sub_extra_${businessId}`, extraNumbersSubscriptionState: state }).where(eq(billingAccounts.businessId, businessId));
}

/** Stores a normalized Polar webhook for the business and reconciles it as the worker. */
let modified = 0;
async function webhook(tx: DatabaseTransaction, businessId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
  modified += 1;
  const [event] = await tx.insert(providerEvents).values({ provider: "polar", providerEventId: `evt-${randomUUID()}`, eventType, businessId, payload: { billingKey: `business:${businessId}`, subscriptionModifiedAt: new Date(Date.UTC(2026, 10, 1, 0, 0, modified)).toISOString(), ...payload } }).returning({ id: providerEvents.id });
  await worker(tx, async (db) => await reconcileBillingProviderEvent({ db }, { businessId, providerEventId: event!.id }));
}

/** Buys an extra number for the owner's second agent, with the add-on live. */
async function buyExtra(tx: DatabaseTransaction, owner: { userId: string; businessId: string; agentId: string }): Promise<string> {
  const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...owner, claimTokenSecret }, inventory));
  const claimId = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
  return await buy(tx, owner.businessId, claimId);
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
  it("sells a Starter business a number for its second agent at the country's price once its add-on bills, and charges each month past the included one", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...owner, claimTokenSecret }, inventory));
      expect(search.price).toEqual({ countryCode: "CA", kind: "local", monthlyCents: 115, currency: "USD" });
      expect(search.subscribed).toBe(false);
      // The monthly add-on bills the number, so it comes first.
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(reserveExtraNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() })))).toBe("extra_numbers_subscription_required");
      await subscribe(tx, owner.businessId);
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
      // While the add-on doesn't bill, the month waits instead of settling, and is charged once it bills again.
      await subscribe(tx, owner.businessId, "canceled");
      await settle(new Date(start + 32 * 86_400_000));
      expect(mine().map((item) => item.month)).toEqual([0]);
      await subscribe(tx, owner.businessId);
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
      await subscribe(tx, owner.businessId);
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

  it("sells Enterprise extra numbers at Starter's price, gives a self-hosted server's free, and refuses Free, a business with no number and a changed price", async () => {
    await rollbackTest(async (tx) => {
      const enterprise = await businessWithNumber(tx, { plan: "enterprise", subscriptionState: "active" });
      await subscribe(tx, enterprise.businessId);
      const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...enterprise, claimTokenSecret }, inventory));
      expect(search.price).toEqual({ countryCode: "CA", kind: "local", monthlyCents: 115, currency: "USD" });
      const claimId = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...enterprise, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
      const phoneNumberId = await buy(tx, enterprise.businessId, claimId);
      expect(await tx.select({ price: businessNumberCharges.monthlyPriceCents }).from(businessNumberCharges).where(eq(businessNumberCharges.phoneNumberId, phoneNumberId))).toEqual([{ price: 115 }]);

      // Toll-free numbers cost their own price, and a kind a country doesn't sell is refused.
      const tollFree = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...enterprise, selection: { countryCode: "US", kind: "toll_free" }, claimTokenSecret }, inventory));
      expect(tollFree.price).toEqual({ countryCode: "US", kind: "toll_free", monthlyCents: 215, currency: "USD" });
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(searchExtraNumbers({ db }, { ...enterprise, selection: { countryCode: "PR", kind: "toll_free" }, claimTokenSecret }, inventory)))).toBe("unsupported_number_kind");

      const selfHosted = await businessWithNumber(tx, null);
      await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, selfHosted.businessId));
      const free = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...selfHosted, claimTokenSecret }, inventory));
      expect(free.price).toBeNull();
      const freeClaim = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...selfHosted, claimToken: free.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
      const freeNumberId = await buy(tx, selfHosted.businessId, freeClaim);
      expect(await tx.select().from(businessNumberCharges).where(eq(businessNumberCharges.phoneNumberId, freeNumberId))).toEqual([]);

      // A free offer can't buy a number once the plan sells them.
      const stale = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...selfHosted, claimTokenSecret }, inventory));
      await tx.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, selfHosted.businessId));
      await tx.update(billingAccounts).set({ plan: "starter", subscriptionState: "active" }).where(eq(billingAccounts.businessId, selfHosted.businessId));
      await subscribe(tx, selfHosted.businessId);
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(reserveExtraNumberClaim({ db }, { ...selfHosted, claimToken: stale.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() })))).toBe("extra_number_price_changed");

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
      await subscribe(tx, owner.businessId);
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
      await subscribe(tx, owner.businessId);
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

  it("keeps an extra number's price on its replacement", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      await subscribe(tx, owner.businessId);
      const search = await as(tx, "lobbystack_app", async (db) => await searchExtraNumbers({ db }, { ...owner, claimTokenSecret }, inventory));
      const extraClaim = await as(tx, "lobbystack_app", async (db) => await reserveExtraNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID() }));
      const extraNumberId = await buy(tx, owner.businessId, extraClaim);
      const offers = await as(tx, "lobbystack_app", async (db) => await searchBusinessNumberInventory({ db }, { ...owner, purpose: "replacement", claimTokenSecret }, inventory));
      const claimId = await as(tx, "lobbystack_app", async (db) => await reserveReplacementNumberClaim({ db }, { ...owner, claimToken: offers.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID(), phoneNumberId: extraNumberId }));
      const replacementId = await buy(tx, owner.businessId, claimId);
      const [number] = await tx.select({ agentId: phoneNumbers.agentId }).from(phoneNumbers).where(eq(phoneNumbers.id, replacementId));
      expect(number?.agentId).toBe(owner.agentId);
      expect(await tx.select({ price: businessNumberCharges.monthlyPriceCents }).from(businessNumberCharges).where(eq(businessNumberCharges.phoneNumberId, replacementId))).toEqual([{ price: 115 }]);
    });
  });

  it("queues one checkout for the add-on, and refuses it once the add-on bills", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      const requestId = await as(tx, "lobbystack_app", async (db) => await createExtraNumbersCheckoutRequest({ db }, { ...owner }));
      expect(await as(tx, "lobbystack_app", async (db) => await createExtraNumbersCheckoutRequest({ db }, owner))).toBe(requestId);
      const [request] = await tx.select({ target: billingCheckoutRequests.target, interval: billingCheckoutRequests.billingInterval, agentId: billingCheckoutRequests.agentId }).from(billingCheckoutRequests).where(eq(billingCheckoutRequests.id, requestId));
      expect(request).toEqual({ target: "extra_numbers", interval: "monthly", agentId: owner.agentId });
      const queued = await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(and(eq(outboxMessages.businessId, owner.businessId), eq(outboxMessages.aggregateId, requestId)));
      expect(queued).toEqual([{ topic: "billing.createExtraNumbersCheckout" }]);
      await subscribe(tx, owner.businessId);
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(createExtraNumbersCheckoutRequest({ db }, owner)))).toBe("extra_numbers_subscribed");
      const onFree = await businessWithNumber(tx, null);
      expect(await as(tx, "lobbystack_app", async (db) => await outcome(createExtraNumbersCheckoutRequest({ db }, onFree)))).toBe("dedicated_number_requires_paid_plan");
    });
  });

  it("keeps the operator from marking the add-on live", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      const error = await as(tx, "lobbystack_app", async (db) => await withBusinessTransaction(db, { userId: owner.userId, businessId: owner.businessId, actorType: "operator" }, async (inner) => {
        await inner.update(billingAccounts).set({ extraNumbersSubscriptionId: "sub_forged", extraNumbersSubscriptionState: "active" }).where(eq(billingAccounts.businessId, owner.businessId));
      })).then(() => null, (failure: unknown) => failure);
      expect((error as { cause?: { message?: string } } | null)?.cause?.message).toBe("extra_numbers_subscription_locked");
    });
  });

  it("follows the add-on's webhooks apart from the plan, and releases extra numbers 30 days after it ends while the plan is live", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      await tx.update(billingAccounts).set({ subscriptionId: "sub_plan" }).where(eq(billingAccounts.businessId, owner.businessId));
      const addon = { extraNumbersAddon: true, subscriptionId: "sub_addon", current_period_end: "2026-12-01T00:00:00.000Z" };
      await webhook(tx, owner.businessId, "subscription.active", { ...addon, status: "active", subscriptionState: "active" });
      const account = async () => (await tx.select({ plan: billingAccounts.plan, subscriptionId: billingAccounts.subscriptionId, subscriptionState: billingAccounts.subscriptionState, addonId: billingAccounts.extraNumbersSubscriptionId, addonState: billingAccounts.extraNumbersSubscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, owner.businessId)))[0];
      expect(await account()).toEqual({ plan: "starter", subscriptionId: "sub_plan", subscriptionState: "active", addonId: "sub_addon", addonState: "active" });

      const extraNumberId = await buyExtra(tx, owner);
      // The add-on ends while the plan is live: the extra number goes in 30 days, the included one stays.
      await webhook(tx, owner.businessId, "subscription.revoked", { ...addon, status: "canceled", subscriptionState: "canceled" });
      expect((await account())?.addonState).toBe("canceled");
      const numbers = async () => await tx.select({ id: phoneNumbers.id, reason: phoneNumbers.reclaimReason, at: phoneNumbers.reclaimScheduledAt }).from(phoneNumbers).where(eq(phoneNumbers.businessId, owner.businessId));
      const afterEnd = await numbers();
      expect(afterEnd.find((row) => row.id === extraNumberId)?.reason).toBe("extra_numbers_ended");
      expect(afterEnd.find((row) => row.id === extraNumberId)!.at!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
      expect(afterEnd.find((row) => row.id === owner.includedNumberId)?.reason).toBeNull();

      // A new add-on keeps the number.
      await webhook(tx, owner.businessId, "subscription.active", { ...addon, subscriptionId: "sub_addon_2", status: "active", subscriptionState: "active" });
      expect((await numbers()).find((row) => row.id === extraNumberId)).toEqual(expect.objectContaining({ reason: null, at: null }));
      // A late event about the old add-on doesn't end the new one.
      await webhook(tx, owner.businessId, "subscription.revoked", { ...addon, status: "canceled", subscriptionState: "canceled" });
      expect(await account()).toEqual(expect.objectContaining({ addonId: "sub_addon_2", addonState: "active" }));

      // The plan ends: the add-on is asked to cancel at the end of its period.
      await webhook(tx, owner.businessId, "subscription.revoked", { subscriptionId: "sub_plan", plan: "starter", billingInterval: "annual", status: "canceled", subscriptionState: "canceled" });
      expect(await account()).toEqual(expect.objectContaining({ subscriptionState: "canceled", addonId: "sub_addon_2", addonState: "active" }));
      const sync = await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(and(eq(outboxMessages.businessId, owner.businessId), eq(outboxMessages.topic, "billing.syncExtraNumbersSubscription")));
      expect(sync.length).toBeGreaterThan(0);
      expect(await worker(tx, async (db) => await extraNumbersSubscriptionChange({ db }, { businessId: owner.businessId }))).toEqual({ subscriptionId: "sub_addon_2", cancelAtPeriodEnd: true });
      // Once Polar says it's canceling, there's nothing left to ask.
      await webhook(tx, owner.businessId, "subscription.canceled", { ...addon, subscriptionId: "sub_addon_2", status: "active", subscriptionState: "active", cancel_at_period_end: true });
      expect(await worker(tx, async (db) => await extraNumbersSubscriptionChange({ db }, { businessId: owner.businessId }))).toBeNull();
    });
  });

  it("records the add-on's orders without a commission", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "starter", subscriptionState: "active" });
      await webhook(tx, owner.businessId, "order.paid", { extraNumbersAddon: true, subscriptionId: "sub_addon", id: `order_${randomUUID()}`, status: "paid", totalAmount: 230, currency: "usd" });
      const rows = await tx.execute<{ amount_cents: number; commissions: number }>(sql`select t.amount_cents, (select count(*)::int from public.affiliate_commissions c where c.billing_transaction_id = t.id) as commissions from public.billing_transactions t where t.business_id = ${owner.businessId}::uuid`);
      expect(rows.rows).toEqual([{ amount_cents: 230, commissions: 0 }]);
      const [account] = await tx.select({ plan: billingAccounts.plan, state: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, owner.businessId));
      expect(account).toEqual({ plan: "starter", state: "active" });
    });
  });

  it("sells an extra number through the public API only at the price the caller repeats, once billing is set up", async () => {
    await rollbackTest(async (tx) => {
      const owner = await businessWithNumber(tx, { plan: "pro", subscriptionState: "active" });
      const caller = { businessId: owner.businessId, grantId: randomUUID(), userId: owner.userId, actor: "mcp" as const };
      const api = async <T>(run: (context: { db: Database }) => Promise<T>) => await worker(tx, async (db) => await run({ db }));
      const failure = async (run: Promise<unknown>) => await run.then(() => "ok", (error: unknown) => `${(error as { status?: number }).status} ${(error as { code?: string }).code}`);

      const [offer] = await api(async (context) => await searchExtraPhoneNumbersForApi(context, caller, { country: "CA" }, { provider: inventory, claimTokenSecret }));
      expect(offer).toMatchObject({ country: "CA", kind: "local", monthly_price: { amount_cents: 115, currency: "USD" }, billing_set_up: false });
      const claim = (accept: number | null, agentId = owner.agentId) => api(async (context) => await claimExtraPhoneNumberForApi(context, caller, { offer_token: offer!.offer_token, agent_id: agentId, accept_monthly_price_cents: accept }, { claimTokenSecret }));
      // The caller repeats the price, so a script can't buy at one it didn't read.
      expect(await failure(claim(null))).toBe("400 invalid_request");
      expect(await failure(claim(100))).toBe("400 invalid_request");
      // Billing for extra numbers comes first.
      expect(await failure(claim(115))).toBe("409 conflict");
      const checkout = await api(async (context) => await createExtraNumbersCheckoutForApi(context, caller, { agent_id: owner.agentId }, { available: true }));
      expect(checkout).toMatchObject({ status: "pending", billing_set_up: false });
      expect(await api(async (context) => await getExtraNumbersCheckoutForApi(context, caller, checkout.id))).toMatchObject({ id: checkout.id });
      await subscribe(tx, owner.businessId);
      expect(await failure(api(async (context) => await createExtraNumbersCheckoutForApi(context, caller, {}, { available: true })))).toBe("409 conflict");
      expect(await failure(claim(115, randomUUID()))).toBe("404 not_found");

      const claimed = await claim(115);
      expect(claimed).toMatchObject({ status: "pending", phone_number: offer!.phone_number });
      const phoneNumberId = await buy(tx, owner.businessId, claimed.id);
      const listed = await api(async (context) => await listPhoneNumbersForApi(context, caller));
      expect(listed.find((number) => number.id === phoneNumberId)).toMatchObject({ agent_id: owner.agentId, monthly_price: { amount_cents: 115, currency: "USD" } });
      expect(listed.find((number) => number.id === owner.includedNumberId)).toMatchObject({ monthly_price: null });
    });
  });
});
