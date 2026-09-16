import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { billingAccounts, billingCheckoutRequests, businesses, businessMemberships, createDatabaseClient, onboardingPhoneVerifications, users, withBusinessTransaction } from "@lobbystack/db";
import settings from "../public/locales/fr/settings.json" with { type: "json" };

test("checkout return waits for billing confirmation and localized spending caps persist with permissions", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR;
  const userId = process.env.PARITY_OPERATOR_USER_ID;
  test.skip(!state || !userId, "Requires an authenticated disposable operator fixture.");
  const database = createDatabaseClient("lobbystack_worker");
  const auth = createDatabaseClient("lobbystack_auth");
  const businessId = randomUUID(); const requestId = randomUUID();
  const context = await browser.newContext({ storageState: state!, locale: "fr" });
  const headers = { Origin: baseURL!, "Sec-Fetch-Site": "same-origin" };
  const original = (await auth.db.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId!)))[0];
  const transaction = <T,>(fn: Parameters<typeof withBusinessTransaction<T>>[2]) => withBusinessTransaction(database.db, { businessId, actorType: "worker" }, fn);
  try {
    await transaction(async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `checkout-return-${businessId}`, name: "Checkout certification", timezone: "UTC", businessType: "clinic", onboardingStage: "plan" });
      await tx.insert(businessMemberships).values({ businessId, userId: userId!, role: "business_owner", status: "active" });
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "free_cloud" });
      await tx.insert(billingCheckoutRequests).values({ id: requestId, businessId, requestedByUserId: userId!, target: "pro", billingInterval: "monthly", status: "ready", checkoutId: `fixture-${requestId}`, checkoutUrl: "https://example.invalid/checkout" });
      await tx.insert(onboardingPhoneVerifications).values({ businessId, userId: userId!, phoneE164: "+14165550188", countryCode: "CA", status: "approved", approvedAt: new Date(), expiresAt: new Date(Date.now() + 60000), requestFingerprint: requestId });
    });
    await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, userId!));
    const statusUrl = `${baseURL}/api/billing/checkout?businessId=${businessId}&requestId=${requestId}`;
    expect((await (await context.request.get(statusUrl)).json()).synced).toBe(false);
    expect((await context.request.get(`${baseURL}/api/billing/checkout?businessId=${randomUUID()}&requestId=${requestId}`)).status()).toBe(403);
    await context.route("**/api/onboarding/phone-numbers/suggestion?*", route => route.fulfill({ json: { numbers: [], market: { countryCode: "CA", areaCode: "416" } } }));
    const page = await context.newPage();
    const firstPoll = page.waitForResponse(response => response.url().includes("/api/billing/checkout?"));
    await page.goto(`${baseURL}/onboarding/plan?checkout=success&requestId=${requestId}`);
    expect((await (await firstPoll).json()).synced).toBe(false);
    expect(new URL(page.url()).pathname).toBe("/onboarding/plan");
    // Simulate a validated webhook's durable billing result; never open a paid checkout.
    await transaction(tx => tx.update(billingAccounts).set({ plan: "pro", billingInterval: "monthly", subscriptionState: "active" }).where(eq(billingAccounts.businessId, businessId)));
    await expect(page).toHaveURL(`${baseURL}/onboarding/number`);
    await transaction(async tx => {
      expect((await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0]?.onboardingStage).toBe("phone_number");
      await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
    });
    await page.goto(`${baseURL}/settings/plan`);
    const cap = page.getByLabel(settings.billing.spendingCap.amountLabel, { exact: true });
    await cap.fill("12,50");
    await page.getByRole("button", { name: settings.billing.spendingCap.save, exact: true }).click();
    await expect.poll(() => transaction(async tx => (await tx.select().from(billingAccounts).where(eq(billingAccounts.businessId, businessId)))[0]?.overageSpendingCapCents)).toBe(1250);
    await page.reload();
    await expect(cap).toHaveValue("12,50");
    await page.getByRole("button", { name: settings.billing.spendingCap.remove, exact: true }).click();
    await expect.poll(() => transaction(async tx => (await tx.select().from(billingAccounts).where(eq(billingAccounts.businessId, businessId)))[0]?.overageSpendingCapCents)).toBeNull();
    await transaction(tx => tx.update(businessMemberships).set({ role: "viewer" }).where(eq(businessMemberships.businessId, businessId)));
    expect((await context.request.get(statusUrl)).status()).toBe(403);
    await page.reload();
    await expect(page.getByText(settings.billing.spendingCap.adminOnly, { exact: true })).toBeVisible();
    await expect(cap).toHaveCount(0);
    expect((await context.request.post(`${baseURL}/api/billing?businessId=${businessId}`, { headers, data: { capCents: 100 } })).status()).toBe(403);
  } finally {
    await context.close();
    await auth.db.update(users).set({ activeBusinessId: original?.activeBusinessId ?? null }).where(eq(users.id, userId!));
    await transaction(tx => tx.delete(businesses).where(eq(businesses.id, businessId)));
    await Promise.all([database.pool.end(), auth.pool.end()]);
  }
});
