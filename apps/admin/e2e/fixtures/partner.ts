import { expect, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { partnerBillingAccounts } from "@lobbystack/db";
import { recordPartnerPolarEvent } from "@lobbystack/domain";

import partnerCopy from "../../public/locales/en/partner.json" with { type: "json" };

import { signUp, type Migrator } from "./full-stack";

// A partner made through the real console pages, for the full-stack specs.
// Partner domains need the full-stack environment's PARTNER_BASE_DOMAIN.

/** Signs a person up and makes them the owner of a new partner. `host` is the partner's own domain. */
export async function signUpPartner(page: Page, testInfo: TestInfo, prefix: string): Promise<{ email: string; partnerId: string; host: string }> {
  const { email } = await signUp(page, testInfo, prefix);
  await page.goto("/partner/signup");
  await page.getByLabel(partnerCopy.signup.nameLabel, { exact: true }).fill(`${prefix} ${randomUUID().slice(0, 8)}`);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/partner/signup") && response.request().method() === "POST");
  await page.getByRole("button", { name: partnerCopy.signup.submit, exact: true }).click();
  const response = await created;
  expect(response.ok()).toBe(true);
  const { partnerId, subdomain: host } = await response.json() as { partnerId: string; subdomain: string };
  return { email, partnerId, host };
}

/** Polar reports the partner's Starter subscription, and the worker reconciles it as it does in production. */
export async function setTier(database: Migrator, partnerId: string, status: "active" | "revoked"): Promise<void> {
  const billingKey = `partner:${partnerId}`;
  const payload = { id: "sub_e2e", status, customer: { id: "cus_e2e", external_id: billingKey }, current_period_start: new Date(Date.now() - 86_400_000).toISOString(), current_period_end: new Date(Date.now() + 29 * 86_400_000).toISOString(), cancel_at_period_end: false, billingKey, customerId: "cus_e2e", subscriptionId: "sub_e2e", partnerTier: "starter", billingInterval: "monthly", subscriptionState: status, subscriptionModifiedAt: new Date().toISOString() };
  expect(await recordPartnerPolarEvent({ db: database.db }, { partnerId, providerEventId: `evt_${randomUUID()}`, eventType: `subscription.${status === "active" ? "active" : "updated"}`, payload })).toBe("stored");
  await expect.poll(async () => (await database.db.select({ state: partnerBillingAccounts.subscriptionState }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, partnerId)))[0]?.state, { timeout: 30_000 }).toBe(status);
}

/** Makes a platform key on the console's API keys page with exactly these scopes, and returns it. */
export async function createKey(page: Page, partnerId: string, name: string, scopes: string[]): Promise<string> {
  await page.goto(`/partner/${partnerId}/api-keys`);
  await page.getByRole("button", { name: partnerCopy.apiKeys.create.action, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#api-key-name").fill(name);
  for (const box of await dialog.getByRole("checkbox").all()) if (await box.isChecked()) await box.click();
  for (const scope of scopes) await dialog.locator(`#api-key-scope-${scope.replace(/[.:]/g, "_")}-label`).click();
  const created = page.waitForResponse((response) => response.url().endsWith("/api/partner/platform-keys") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: partnerCopy.apiKeys.create.submit, exact: true }).click();
  const response = await created;
  expect(response.ok()).toBe(true);
  const { key, platformKey } = await response.json() as { key: string; platformKey: { scopes: string[] } };
  expect([...platformKey.scopes].sort()).toEqual([...scopes].sort());
  await dialog.getByRole("button", { name: partnerCopy.apiKeys.created.done, exact: true }).click();
  return key;
}
