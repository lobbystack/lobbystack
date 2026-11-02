import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { businessInvitations, businesses, partnerBillingAccounts, phoneNumbers } from "@lobbystack/db";
import { recordPartnerPolarEvent } from "@lobbystack/domain";

import partnerCopy from "../../public/locales/en/partner.json" with { type: "json" };
import settings from "../../public/locales/en/settings.json" with { type: "json" };

import { holdNumber, migrator, password, removeFixtures, signUp, twilioPhoneSid, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// A partner running its own product on the v1 API: its keys come from the
// console, the API calls are the partner's backend, the worker buys from a fake
// Twilio, and the console shows the result. No payment happens: each tier is a
// stored Polar event for the worker to reconcile.

const prefix = "partner-numbers";
const BUSINESS_HEADER = "LobbyStack-Business";
let thirdParties: ThirdParties;
let database: Migrator;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

async function signUpPartner(page: Page, testInfo: TestInfo): Promise<{ email: string; partnerId: string; host: string }> {
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
async function setTier(database: Migrator, partnerId: string, status: "active" | "revoked"): Promise<void> {
  const billingKey = `partner:${partnerId}`;
  const payload = { id: "sub_e2e", status, customer: { id: "cus_e2e", external_id: billingKey }, current_period_start: new Date(Date.now() - 86_400_000).toISOString(), current_period_end: new Date(Date.now() + 29 * 86_400_000).toISOString(), cancel_at_period_end: false, billingKey, customerId: "cus_e2e", subscriptionId: "sub_e2e", partnerTier: "starter", billingInterval: "monthly", subscriptionState: status, subscriptionModifiedAt: new Date().toISOString() };
  expect(await recordPartnerPolarEvent({ db: database.db }, { partnerId, providerEventId: `evt_${randomUUID()}`, eventType: `subscription.${status === "active" ? "active" : "updated"}`, payload })).toBe("stored");
  await expect.poll(async () => (await database.db.select({ state: partnerBillingAccounts.subscriptionState }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, partnerId)))[0]?.state, { timeout: 30_000 }).toBe(status);
}

async function createKey(page: Page, partnerId: string, name: string, scopes: string[]): Promise<string> {
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

const bearer = (key: string, businessId?: string) => ({ authorization: `Bearer ${key}`, ...(businessId ? { [BUSINESS_HEADER]: businessId } : {}) });

async function search(request: APIRequestContext, key: string, businessId: string) {
  return await request.post("/api/v1/phone-numbers/search", { headers: bearer(key, businessId), data: { country: "CA" } });
}

test("a platform key with phone_numbers:purchase buys a number for an ownerless business, and a key without it is refused", async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const partner = await signUpPartner(page, testInfo);
    emails.push(partner.email);
    await setTier(database, partner.partnerId, "active");
    const shared = ["businesses:create", "business:read", "phone_numbers:manage"];
    const buyer = await createKey(page, partner.partnerId, "Product backend", [...shared, "phone_numbers:purchase"]);
    const reader = await createKey(page, partner.partnerId, "Read only backend", shared);

    // No owner_email: nobody is invited, and the partner runs the business.
    const businessName = `Pier Dental ${randomUUID().slice(0, 8)}`;
    const created = await request.post("/api/v1/businesses", { headers: { ...bearer(buyer), "idempotency-key": randomUUID() }, data: { name: businessName, timezone: "America/Toronto" } });
    expect(created.status(), await created.text()).toBe(201);
    const businessId = (await created.json() as { data: { id: string } }).data.id;
    businessIds.push(businessId);
    expect(await database.db.select({ id: businessInvitations.id }).from(businessInvitations).where(eq(businessInvitations.businessId, businessId))).toEqual([]);

    // A key without the scope can't search, and buys nothing.
    const purchasesBefore = () => thirdParties.carrier.calls.filter((call) => call.path.endsWith("/IncomingPhoneNumbers.json") && call.method === "POST");
    const refused = await search(request, reader, businessId);
    expect(refused.status()).toBe(403);
    expect((await refused.json() as { error: { code: string } }).error.code).toBe("insufficient_scope");
    expect(thirdParties.carrier.offered).toEqual([]);

    const offers = await search(request, buyer, businessId);
    expect(offers.status(), await offers.text()).toBe(200);
    const offer = (await offers.json() as { data: Array<{ offer_token: string; phone_number: string }> }).data[0]!;

    const refusedClaim = await request.post("/api/v1/phone-numbers/claims", { headers: { ...bearer(reader, businessId), "idempotency-key": randomUUID() }, data: { offer_token: offer.offer_token } });
    expect(refusedClaim.status()).toBe(403);
    expect(purchasesBefore()).toEqual([]);

    const claim = await request.post("/api/v1/phone-numbers/claims", { headers: { ...bearer(buyer, businessId), "idempotency-key": randomUUID() }, data: { offer_token: offer.offer_token } });
    expect(claim.status(), await claim.text()).toBe(202);
    const claimId = (await claim.json() as { data: { id: string } }).data.id;
    await expect.poll(async () => (await (await request.get(`/api/v1/phone-numbers/claims/${claimId}`, { headers: bearer(buyer, businessId) })).json() as { data: { status: string } }).data.status, { timeout: 45_000 }).toBe("claimed");

    expect(purchasesBefore().map((call) => call.form.PhoneNumber)).toEqual([offer.phone_number]);
    expect(thirdParties.carrier.calls.some((call) => call.host === "trunking.twilio.com" && call.method === "POST")).toBe(true);
    const held = await database.db.select({ e164: phoneNumbers.e164, status: phoneNumbers.status, carrier: phoneNumbers.carrier }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
    expect(held).toEqual([{ e164: offer.phone_number, status: "active", carrier: "twilio" }]);

    // The console shows the business with no owner, and counts its number against the tier.
    await page.goto(`/partner/${partner.partnerId}/businesses`);
    const row = page.getByRole("row").filter({ hasText: businessName });
    await expect(row).toBeVisible();
    await expect(row.getByText(partnerCopy.businesses.owner.none, { exact: true })).toBeVisible();
    await page.goto(`/partner/${partner.partnerId}/billing`);
    const [tier] = await database.db.select({ included: partnerBillingAccounts.includedNumbers }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, partner.partnerId));
    await expect(page.getByText(partnerCopy.billing.numbers.used.replace("{{held}}", "1").replace("{{included}}", String(tier!.included)), { exact: true })).toBeVisible();
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});

test("a business whose partner's tier ended is refused a replacement number in the dashboard", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const partner = await signUpPartner(page, testInfo);
    emails.push(partner.email);
    await setTier(database, partner.partnerId, "active");
    const key = await createKey(page, partner.partnerId, "Product backend", ["businesses:create", "business:read"]);
    const businessName = `Cedar Dental ${randomUUID().slice(0, 8)}`;
    const created = await request.post("/api/v1/businesses", { headers: { ...bearer(key), "idempotency-key": randomUUID() }, data: { name: businessName, timezone: "America/Toronto" } });
    expect(created.status(), await created.text()).toBe(201);
    const businessId = (await created.json() as { data: { id: string } }).data.id;
    businessIds.push(businessId);
    await database.db.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
    const number = await holdNumber(database, businessId, { carrier: "twilio", providerPhoneId: twilioPhoneSid() });

    const opened = page.waitForResponse((response) => response.url().endsWith("/api/partner/businesses/open") && response.request().method() === "POST");
    await page.goto(`/partner/${partner.partnerId}/businesses`);
    await page.getByRole("row").filter({ hasText: businessName }).getByRole("button", { name: partnerCopy.businesses.open.label.replace("{{name}}", businessName), exact: true }).click();
    expect((await opened).ok()).toBe(true);

    // A partner's business shows only on the partner's host, where the person signs in again.
    const partnerOrigin = `http://${partner.host}:${new URL(baseURL!).port}`;
    await page.goto(`${partnerOrigin}/en/login`);
    await page.locator('input[type="email"]').fill(partner.email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"));

    const openPicker = async () => {
      await page.goto(`${partnerOrigin}/settings/phone-number`);
      const change = page.getByRole("button", { name: settings.phoneNumber.actions.requestChange, exact: true });
      await expect(change).toBeEnabled();
      await change.click();
      return page.getByRole("dialog");
    };

    // While the tier is paid, the same business gets replacement offers.
    const paid = await openPicker();
    await expect(paid.getByRole("button", { name: settings.phoneNumber.picker.select, exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // The tier ends. The business stays live for now, and the dashboard refuses a replacement.
    await setTier(database, partner.partnerId, "revoked");
    const offeredBefore = thirdParties.carrier.offered.length;
    const lapsed = await openPicker();
    await expect(lapsed.getByText(settings.phoneNumber.partnerTierRequired.description, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(lapsed.getByRole("button", { name: settings.phoneNumber.picker.select, exact: true })).toHaveCount(0);
    expect(thirdParties.carrier.offered).toHaveLength(offeredBefore);

    // The number it holds keeps working.
    expect(await database.db.select({ status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.id, number.id))).toEqual([{ status: "active" }]);
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
