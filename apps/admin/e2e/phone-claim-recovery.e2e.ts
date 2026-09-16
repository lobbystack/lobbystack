import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { billingAccounts, businesses, businessMemberships, createDatabaseClient, onboardingNumberClaimEvents, phoneNumbers, users, withBusinessTransaction } from "@lobbystack/db";
import settings from "../public/locales/fr/settings.json" with { type: "json" };

test("a reloaded phone claim finishes without another purchase and remains tenant scoped", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR;
  const userId = process.env.PARITY_OPERATOR_USER_ID;
  test.skip(!state || !userId, "Requires an authenticated disposable operator fixture.");
  const database = createDatabaseClient("lobbystack_worker");
  const auth = createDatabaseClient("lobbystack_auth");
  const businessId = randomUUID();
  const claimId = randomUUID();
  const context = await browser.newContext({ storageState: state!, locale: "fr" });
  const original = (await auth.db.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId!)))[0];
  try {
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `claim-recovery-${businessId}`, name: "Claim recovery", deploymentMode: "self_hosted_standard", timezone: "UTC", businessType: "clinic", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId: userId!, role: "business_owner", status: "active" });
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "self_hosted_standard", subscriptionState: "active" });
      await tx.insert(onboardingNumberClaimEvents).values({ id: claimId, businessId, userId: userId!, purpose: "onboarding", requestedE164: "+14165550991", selectionContext: {}, claimTokenHash: "disposable-no-provider", idempotencyKey: claimId, status: "provisioning" });
    });
    await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, userId!));
    const url = `${baseURL}/api/phone-numbers?businessId=${businessId}`;
    const initial = await context.request.get(url);
    expect(initial.status()).toBe(200);
    expect((await initial.json()).activeClaim.id).toBe(claimId);
    expect((await context.request.get(`${baseURL}/api/phone-numbers?businessId=${randomUUID()}`)).status()).toBe(403);
    const page = await context.newPage();
    await page.goto(`${baseURL}/settings/phone-number`);
    await expect(page.getByRole("button", { name: settings.phoneNumber.actions.getNumber, exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("button", { name: settings.phoneNumber.actions.getNumber, exact: true })).toBeDisabled();
    // Simulate only the provider completion; no provisioning job or paid number is created.
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async tx => {
      const [phone] = await tx.insert(phoneNumbers).values({ businessId, e164: "+14165550991", status: "active", voiceEnabled: true, smsEnabled: true }).returning();
      await tx.update(onboardingNumberClaimEvents).set({ status: "claimed", phoneNumberId: phone!.id, completedAt: new Date() }).where(eq(onboardingNumberClaimEvents.id, claimId));
    });
    await expect(page.getByRole("main").getByText("+1 416 555 0991", { exact: true })).toBeVisible();
    expect((await (await context.request.get(url)).json()).activeClaim).toBeNull();
  } finally {
    await context.close();
    await auth.db.update(users).set({ activeBusinessId: original?.activeBusinessId ?? null }).where(eq(users.id, userId!));
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async tx => tx.delete(businesses).where(eq(businesses.id, businessId)));
    await Promise.all([database.pool.end(), auth.pool.end()]);
  }
});
