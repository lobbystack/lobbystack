import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, billingCheckoutRequests, createDatabaseClient, providerEvents, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { createBusiness } from "./tenancy";
import { createBillingCheckoutRequest, scheduledSubscriptionEndInTransaction } from "./billing";

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

/** An owner's new workspace, and a way to ask for a checkout as that owner through the app role. */
async function workspace(tx: DatabaseTransaction) {
  const userId = randomUUID();
  const email = `${randomUUID()}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: `Acme ${randomUUID()}`, timezone: "UTC", businessType: "test" });
  await tx.execute(sql`reset role`);
  const checkout = async (target: "starter" | "pro", billingInterval: "monthly" | "annual" = "monthly") => {
    await tx.execute(sql`set local role lobbystack_app`);
    try {
      return await createBillingCheckoutRequest({ db: tx as unknown as Database }, { userId, businessId, target, billingInterval });
    } finally {
      await tx.execute(sql`reset role`);
    }
  };
  // The billing page reads the end date as the operator, through RLS.
  const scheduledEnd = async () => {
    await tx.execute(sql`set local role lobbystack_app`);
    try {
      return await withBusinessTransaction(tx as unknown as Database, { userId, businessId, actorType: "operator" }, async (inner) => await scheduledSubscriptionEndInTransaction(inner, businessId));
    } finally {
      await tx.execute(sql`reset role`);
    }
  };
  return { businessId, checkout, scheduledEnd };
}

describe.skipIf(!testUrl)("checkout guard against dedicated PostgreSQL roles", () => {
  it("hands back the open checkout for the same plan, and replaces it for another plan", async () => {
    await rollbackTest(async tx => {
      const { businessId, checkout } = await workspace(tx);
      const first = await checkout("starter");
      await expect(checkout("starter")).resolves.toBe(first);
      const second = await checkout("pro");
      expect(second).not.toBe(first);
      expect((await tx.select({ status: billingCheckoutRequests.status }).from(billingCheckoutRequests).where(eq(billingCheckoutRequests.id, first)))[0]?.status).toBe("superseded");
      await expect(checkout("starter", "annual")).resolves.not.toBe(second);
      expect(await tx.select().from(billingCheckoutRequests).where(eq(billingCheckoutRequests.businessId, businessId))).toHaveLength(3);
    });
  });

  it("refuses a checkout while another member's checkout is open", async () => {
    await rollbackTest(async tx => {
      const { businessId, checkout } = await workspace(tx);
      const otherUserId = randomUUID();
      const email = `${randomUUID()}@example.invalid`;
      await tx.insert(users).values({ id: otherUserId, email, normalizedEmail: email, name: "Alex Admin" });
      await tx.insert(billingCheckoutRequests).values({ businessId, requestedByUserId: otherUserId, target: "starter", billingInterval: "monthly", status: "ready" });
      await expect(checkout("pro")).rejects.toMatchObject({ status: 409, code: "checkout_in_progress" });
    });
  });

  it("lets a new checkout start once the open one failed or is 30 minutes old", async () => {
    await rollbackTest(async tx => {
      const { businessId, checkout } = await workspace(tx);
      const failed = await checkout("starter");
      await tx.update(billingCheckoutRequests).set({ status: "error" }).where(eq(billingCheckoutRequests.id, failed));
      const abandoned = await checkout("pro");
      expect(abandoned).not.toBe(failed);
      await tx.update(billingCheckoutRequests).set({ createdAt: new Date(Date.now() - 31 * 60_000) }).where(eq(billingCheckoutRequests.id, abandoned));
      await expect(checkout("starter")).resolves.not.toBe(abandoned);
      expect(await tx.select().from(billingCheckoutRequests).where(eq(billingCheckoutRequests.businessId, businessId))).toHaveLength(3);
    });
  });

  it.each(["active", "trialing", "past_due"])("refuses a checkout while a paid plan is %s", async subscriptionState => {
    await rollbackTest(async tx => {
      const { businessId, checkout } = await workspace(tx);
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState } });
      await expect(checkout("pro")).rejects.toMatchObject({ status: 409, code: "subscription_active" });
      expect(await tx.select().from(billingCheckoutRequests).where(eq(billingCheckoutRequests.businessId, businessId))).toHaveLength(0);
    });
  });

  it("lets a plan that ended start again", async () => {
    await rollbackTest(async tx => {
      const { businessId, checkout } = await workspace(tx);
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "canceled" }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState: "canceled" } });
      await expect(checkout("starter")).resolves.toEqual(expect.any(String));
    });
  });
});

describe.skipIf(!testUrl)("scheduled plan end against PostgreSQL", () => {
  it("reads the newest Polar snapshot by modification time, not arrival", async () => {
    await rollbackTest(async tx => {
      const { businessId, scheduledEnd } = await workspace(tx);
      const snapshot =(eventType: string, modifiedAt: string, payload: Record<string, unknown>) => ({ provider: "polar", providerEventId: randomUUID(), eventType, businessId, status: "processed", payload: { status: "active", subscriptionModifiedAt: modifiedAt, ...payload } });
      await tx.insert(providerEvents).values([
        snapshot("subscription.canceled", "2026-10-02T00:00:00.000Z", { cancel_at_period_end: true, ends_at: "2026-11-12T00:00:00Z" }),
        // A retry of an older snapshot that arrives last.
        snapshot("subscription.active", "2026-10-01T00:00:00.000Z", { cancel_at_period_end: false }),
        { provider: "polar", providerEventId: randomUUID(), eventType: "order.paid", businessId, status: "processed", payload: { status: "paid" } },
      ]);
      expect(await scheduledEnd()).toBe("2026-11-12T00:00:00Z");
      await tx.insert(providerEvents).values(snapshot("subscription.uncanceled", "2026-10-03T00:00:00.000Z", { cancel_at_period_end: false }));
      expect(await scheduledEnd()).toBeNull();
    });
  });
});
