import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { Webhook } from "standardwebhooks";

import { billingAccounts, businessNumberCharges, phoneNumbers } from "@lobbystack/db";

import nav from "../../public/locales/en/nav.json" with { type: "json" };
import settings from "../../public/locales/en/settings.json" with { type: "json" };

import { POLAR_EXTRA_NUMBERS_PRODUCT_ID, POLAR_WEBHOOK_SECRET } from "../fixtures/full-stack-environment";
import { holdNumber, migrator, removeFixtures, setPlan, signUpOwner, twilioPhoneSid, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// An owner on Starter buys a second number for a second agent. Extra numbers
// bill monthly through their own Polar subscription, so the first purchase
// goes through a checkout for it at a fake Polar, whose webhook this spec
// sends. The worker then buys the number from a fake Twilio, and it lands on
// that agent at the price the owner saw. The second test does the same
// through the public API, and ends the plan to see the subscription follow.

const prefix = "extra-numbers";
let thirdParties: ThirdParties;
let database: Migrator;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

const price = settings.phoneNumber.extra.monthly.replace("{{price}}", "$1.15");

/** Sends a signed Polar webhook to the admin, as Polar does after a payment. */
async function polarWebhook(request: APIRequestContext, type: string, data: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ type, timestamp: new Date().toISOString(), data });
  const id = `msg_${randomUUID()}`;
  const timestamp = new Date();
  const signature = new Webhook(Buffer.from(POLAR_WEBHOOK_SECRET, "utf8").toString("base64")).sign(id, timestamp, body);
  const response = await request.post("/api/webhooks/polar", { headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "webhook-signature": signature }, data: body });
  expect(response.status(), await response.text()).toBe(200);
}

/** The add-on's subscription, live, for the business's Polar customer. */
function addOnSubscription(businessId: string, subscriptionId: string, status = "active"): Record<string, unknown> {
  return { id: subscriptionId, status, product_id: POLAR_EXTRA_NUMBERS_PRODUCT_ID, cancel_at_period_end: false, current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(), modified_at: new Date().toISOString(), customer: { id: `cus_${businessId.slice(0, 8)}`, external_id: `business:${businessId}` } };
}

async function secondAgent(request: APIRequestContext, baseURL: string, businessId: string): Promise<string> {
  const created = await request.post(`/api/agents?businessId=${businessId}`, { headers: { origin: new URL(baseURL).origin }, data: { name: "After hours" } });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json() as { id: string }).id;
}

test("an owner on Starter sets up monthly billing, then buys a number for a second agent at the price shown", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");
    await holdNumber(database, owner.businessId, { carrier: "twilio", providerPhoneId: twilioPhoneSid() });
    const agentId = await secondAgent(page.request, baseURL!, owner.businessId);

    // The agent's channels send it to buy a number of its own.
    await page.goto(`/agents/${agentId}/channels`);
    await page.getByText(nav.channels.buyNumber, { exact: true }).click();
    await expect(page).toHaveURL(`/agents/${agentId}/channels/phone`);

    // The first extra number needs monthly billing, which a Polar checkout sets up.
    await expect(page.getByText(settings.phoneNumber.extra.billingDescription, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: settings.phoneNumber.extra.buy, exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("extra-number-billing.png") });
    await page.getByRole("button", { name: settings.phoneNumber.extra.subscribe, exact: true }).click();
    // The fake checkout's page is its success URL, so the owner lands back on the agent at once.
    await expect(page).toHaveURL(new RegExp(`/agents/${agentId}/channels/phone\\?extraNumbersCheckout=`), { timeout: 30_000 });
    expect(thirdParties.polar.checkouts.at(-1)).toMatchObject({ products: [POLAR_EXTRA_NUMBERS_PRODUCT_ID], external_customer_id: `business:${owner.businessId}`, customer_email: owner.email });
    await expect(page.getByText(settings.phoneNumber.extra.confirmingPayment, { exact: true })).toBeVisible();

    await polarWebhook(page.request, "subscription.active", addOnSubscription(owner.businessId, `sub_extra_${randomUUID()}`));
    await expect(page.getByText(settings.phoneNumber.extra.subscribed, { exact: true })).toBeVisible({ timeout: 30_000 });
    const [account] = await database.db.select({ plan: billingAccounts.plan, state: billingAccounts.subscriptionState, addOn: billingAccounts.extraNumbersSubscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, owner.businessId));
    expect(account).toEqual({ plan: "starter", state: "active", addOn: "active" });

    await page.getByRole("button", { name: settings.phoneNumber.extra.buy, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(price, { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("extra-number-picker.png") });
    const purchasesBefore = thirdParties.carrier.calls.filter((call) => call.path.endsWith("/IncomingPhoneNumbers.json") && call.method === "POST").length;
    await dialog.getByRole("button", { name: settings.phoneNumber.extra.select, exact: true }).first().click();

    // Nothing is bought until the owner confirms the price.
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText(settings.phoneNumber.extra.confirmDescription.replace("{{price}}", "$1.15"), { exact: true })).toBeVisible();
    // The list stays put behind the question.
    await expect(page.getByText(price, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("extra-number-confirm.png"), animations: "disabled" });
    expect(thirdParties.carrier.calls.filter((call) => call.path.endsWith("/IncomingPhoneNumbers.json") && call.method === "POST")).toHaveLength(purchasesBefore);
    await confirm.getByRole("button", { name: settings.phoneNumber.extra.confirm, exact: true }).click();

    await expect(page.getByText(settings.phoneNumber.toast.added, { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(price, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("extra-number-bought.png") });

    const numbers = await database.db.select({ id: phoneNumbers.id, agentId: phoneNumbers.agentId, status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.businessId, owner.businessId));
    const bought = numbers.find((number) => number.agentId === agentId);
    expect(bought?.status).toBe("active");
    expect(numbers).toHaveLength(2);
    expect(await database.db.select({ price: businessNumberCharges.monthlyPriceCents }).from(businessNumberCharges).where(eq(businessNumberCharges.phoneNumberId, bought!.id))).toEqual([{ price: 115 }]);
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});

test("an API key sets up monthly billing and buys an extra number only at the price it repeats", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-api`);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");
    await database.db.update(billingAccounts).set({ subscriptionId: "sub_plan_e2e" }).where(eq(billingAccounts.businessId, owner.businessId));
    const included = await holdNumber(database, owner.businessId, { carrier: "twilio", providerPhoneId: twilioPhoneSid() });
    const agentId = await secondAgent(page.request, baseURL!, owner.businessId);
    const origin = { origin: new URL(baseURL!).origin };
    const keyResponse = await page.request.post(`/api/api-keys?businessId=${owner.businessId}`, { headers: origin, data: { name: "Extra numbers e2e", scopes: ["business:read", "billing:manage", "phone_numbers:manage"] } });
    expect(keyResponse.status(), await keyResponse.text()).toBe(201);
    const key = (await keyResponse.json() as { key: string }).key;
    const api = page.context().request;
    const headers = { authorization: `Bearer ${key}` };
    const call = async (method: "GET" | "POST", path: string, data?: unknown, idempotent = false) => {
      const response = await api.fetch(`/api/v1${path}`, { method, headers: { ...headers, ...(idempotent ? { "idempotency-key": randomUUID() } : {}) }, ...(data === undefined ? {} : { data }) });
      return { status: response.status(), body: await response.json() as { data?: unknown; error?: { code: string; message: string } } };
    };

    type Offer = { phone_number: string; offer_token: string; monthly_price: { amount_cents: number } | null; billing_set_up: boolean };
    const search = await call("POST", "/phone-numbers/extra/search", { country: "CA" });
    expect(search.status, JSON.stringify(search.body)).toBe(200);
    const [offer] = search.body.data as Offer[];
    expect(offer).toMatchObject({ monthly_price: { amount_cents: 115, currency: "USD" }, billing_set_up: false });

    // The price has to be repeated, and monthly billing comes first.
    expect((await call("POST", "/phone-numbers/extra/claims", { offer_token: offer!.offer_token, agent_id: agentId }, true)).status).toBe(400);
    expect((await call("POST", "/phone-numbers/extra/claims", { offer_token: offer!.offer_token, agent_id: agentId, accept_monthly_price_cents: 100 }, true)).status).toBe(400);
    expect((await call("POST", "/phone-numbers/extra/claims", { offer_token: offer!.offer_token, agent_id: agentId, accept_monthly_price_cents: 115 }, true)).status).toBe(409);

    const started = await call("POST", "/billing/extra-numbers/checkout", { agent_id: agentId }, true);
    expect(started.status, JSON.stringify(started.body)).toBe(202);
    const checkoutId = (started.body.data as { id: string }).id;
    await expect.poll(async () => ((await call("GET", `/billing/extra-numbers/checkout/${checkoutId}`)).body.data as { status: string }).status, { timeout: 30_000 }).toBe("ready");
    const addOnId = `sub_extra_${randomUUID()}`;
    await polarWebhook(page.request, "subscription.active", addOnSubscription(owner.businessId, addOnId));
    await expect.poll(async () => ((await call("GET", `/billing/extra-numbers/checkout/${checkoutId}`)).body.data as { billing_set_up: boolean }).billing_set_up, { timeout: 30_000 }).toBe(true);

    const claimed = await call("POST", "/phone-numbers/extra/claims", { offer_token: offer!.offer_token, agent_id: agentId, accept_monthly_price_cents: 115 }, true);
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(202);
    const claimId = (claimed.body.data as { id: string }).id;
    await expect.poll(async () => ((await call("GET", `/phone-numbers/claims/${claimId}`)).body.data as { status: string }).status, { timeout: 45_000 }).toBe("claimed");
    const listed = (await call("GET", "/phone-numbers")).body.data as Array<{ id: string; phone_number: string; agent_id: string | null; monthly_price: { amount_cents: number } | null }>;
    expect(listed.find((number) => number.phone_number === offer!.phone_number)).toMatchObject({ agent_id: agentId, monthly_price: { amount_cents: 115, currency: "USD" } });
    expect(listed.find((number) => number.id === included.id)).toMatchObject({ monthly_price: null });

    // The plan ends: the worker asks Polar to cancel the add-on at the end of its period.
    await polarWebhook(page.request, "subscription.revoked", { id: "sub_plan_e2e", status: "canceled", product_id: "e2e-retired-plan", modified_at: new Date().toISOString(), customer: { id: `cus_${owner.businessId.slice(0, 8)}`, external_id: `business:${owner.businessId}` } });
    await expect.poll(() => thirdParties.polar.subscriptionChanges.find((change) => change.id === addOnId)?.body, { timeout: 30_000 }).toEqual({ cancel_at_period_end: true });
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
