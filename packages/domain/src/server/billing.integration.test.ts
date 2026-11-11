import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, billingCheckoutRequests, businessNotifications, createDatabaseClient, providerEvents, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { createBusiness } from "./tenancy";
import { claimBillingCheckoutRequest, createBillingCheckoutRequest, deferBillingCheckoutRequest, markBillingCheckoutFailed, reconcileBillingProviderEvent, scheduledSubscriptionEndInTransaction } from "./billing";

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

/** Runs as the worker role, as the worker does. */
async function asWorker<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local role lobbystack_worker`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset role`);
  }
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

  it("keeps a checkout processing through a short Polar outage, then fails it once the window ends", async () => {
    await rollbackTest(async tx => {
      const { businessId, checkout } = await workspace(tx);
      const requestId = await checkout("starter");
      const context = { db: tx as unknown as Database };
      await asWorker(tx, async () => {
        expect(await claimBillingCheckoutRequest(context, { businessId, requestId })).toBe(true);
        const first = await deferBillingCheckoutRequest(context, { businessId, requestId });
        expect(first).toMatchObject({ status: "deferred" });
        if (first.status !== "deferred") return;
        const [row] = await tx.select({ status: billingCheckoutRequests.status, firstFailedAt: billingCheckoutRequests.firstFailedAt, retryAt: billingCheckoutRequests.retryAt }).from(billingCheckoutRequests).where(eq(billingCheckoutRequests.id, requestId));
        expect(row).toMatchObject({ status: "processing", retryAt: first.retryAt });
        expect(row?.firstFailedAt).toBeInstanceOf(Date);
        // The scheduled retry, not the ten minute lease, is what the claim waits for.
        expect(await claimBillingCheckoutRequest(context, { businessId, requestId })).toBe(false);
        await tx.update(billingCheckoutRequests).set({ retryAt: new Date(Date.now() - 1_000) }).where(eq(billingCheckoutRequests.id, requestId));
        expect(await claimBillingCheckoutRequest(context, { businessId, requestId })).toBe(true);
        await tx.update(billingCheckoutRequests).set({ firstFailedAt: new Date(Date.now() - 21 * 60_000) }).where(eq(billingCheckoutRequests.id, requestId));
        expect(await deferBillingCheckoutRequest(context, { businessId, requestId })).toEqual({ status: "failed" });
        expect(await markBillingCheckoutFailed(context, { businessId, requestId, error: "provider_unavailable:503" })).toBe(true);
      });
      const [row] = await tx.select({ status: billingCheckoutRequests.status, error: billingCheckoutRequests.error }).from(billingCheckoutRequests).where(eq(billingCheckoutRequests.id, requestId));
      expect(row).toEqual({ status: "error", error: "provider_unavailable:503" });
    });
  });
});

describe.skipIf(!testUrl)("scheduled plan end against PostgreSQL", () => {
  it("reads the newest Polar snapshot of the plan's own subscription by modification time, not arrival", async () => {
    await rollbackTest(async tx => {
      const { businessId, scheduledEnd } = await workspace(tx);
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, subscriptionId: "sub_plan" })
        .onConflictDoUpdate({ target: billingAccounts.businessId, set: { subscriptionId: "sub_plan" } });
      const snapshot = (eventType: string, modifiedAt: string, payload: Record<string, unknown>, subscriptionId = "sub_plan") => ({ provider: "polar", providerEventId: randomUUID(), eventType, businessId, status: "processed", payload: { status: "active", subscriptionId, subscriptionModifiedAt: modifiedAt, ...payload } });
      await tx.insert(providerEvents).values([
        snapshot("subscription.canceled", "2026-10-02T00:00:00.000Z", { cancel_at_period_end: true, ends_at: "2026-11-12T00:00:00Z" }),
        // A retry of an older snapshot that arrives last.
        snapshot("subscription.active", "2026-10-01T00:00:00.000Z", { cancel_at_period_end: false }),
        // The customer's other subscription is newer, but says nothing about this plan.
        snapshot("subscription.active", "2026-10-02T12:00:00.000Z", { cancel_at_period_end: false }, "sub_other"),
        { provider: "polar", providerEventId: randomUUID(), eventType: "order.paid", businessId, status: "processed", payload: { status: "paid" } },
      ]);
      expect(await scheduledEnd()).toBe("2026-11-12T00:00:00Z");
      await tx.insert(providerEvents).values(snapshot("subscription.uncanceled", "2026-10-03T00:00:00.000Z", { cancel_at_period_end: false }));
      expect(await scheduledEnd()).toBeNull();
    });
  });
});

describe.skipIf(!testUrl)("the bell's billing notifications", () => {
  it("posts a failed payment once while it's past due and a plan canceled at the period's end, and clears each when it's resolved", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await workspace(tx);
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "active", subscriptionId: "sub_bell" })
        .onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState: "active", subscriptionId: "sub_bell" } });
      const periodEnd = "2030-03-01T00:00:00.000Z";
      let minute = 0;
      const reconcile = async (eventType: string, subscriptionState: string) => {
        minute += 1;
        const [event] = await tx.insert(providerEvents).values({ provider: "polar", providerEventId: `evt-${randomUUID()}`, eventType, businessId, payload: { billingKey: `business:${businessId}`, plan: "starter", billingInterval: "monthly", subscriptionId: "sub_bell", subscriptionState, currentPeriodEnd: periodEnd, subscriptionModifiedAt: `2026-10-01T00:${String(minute).padStart(2, "0")}:00.000Z` } }).returning({ id: providerEvents.id });
        await asWorker(tx, async () => await reconcileBillingProviderEvent({ db: tx as unknown as Database }, { businessId, providerEventId: event!.id }));
      };
      const bell = async () => await tx.select({ kind: businessNotifications.kind, key: businessNotifications.dedupeKey, params: businessNotifications.params, occurredAt: businessNotifications.occurredAt, resolvedAt: businessNotifications.resolvedAt }).from(businessNotifications).where(eq(businessNotifications.businessId, businessId)).orderBy(businessNotifications.dedupeKey);

      await reconcile("subscription.updated", "past_due");
      const [failed] = await bell();
      expect(failed).toMatchObject({ kind: "payment_failed", key: "payment_failed", resolvedAt: null });
      // Polar retries the charge and sends past_due again: the item stays as it was.
      await reconcile("subscription.updated", "past_due");
      expect(await bell()).toEqual([failed]);
      await reconcile("subscription.updated", "active");
      expect((await bell())[0]?.resolvedAt).toBeInstanceOf(Date);

      await reconcile("subscription.canceled", "active");
      const canceled = (await bell()).find((row) => row.kind === "plan_canceled");
      expect(canceled).toMatchObject({ key: "plan_canceled:2030-03-01", params: { endsAt: periodEnd }, resolvedAt: null });
      const [expires] = await tx.select({ expiresAt: businessNotifications.expiresAt }).from(businessNotifications).where(and(eq(businessNotifications.businessId, businessId), eq(businessNotifications.kind, "plan_canceled")));
      expect(expires?.expiresAt?.toISOString()).toBe(periodEnd);
      await reconcile("subscription.uncanceled", "active");
      expect((await bell()).find((row) => row.kind === "plan_canceled")?.resolvedAt).toBeInstanceOf(Date);
    });
  });
});
