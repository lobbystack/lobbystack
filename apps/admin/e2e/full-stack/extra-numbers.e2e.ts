import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { businessNumberCharges, phoneNumbers } from "@lobbystack/db";

import nav from "../../public/locales/en/nav.json" with { type: "json" };
import settings from "../../public/locales/en/settings.json" with { type: "json" };

import { holdNumber, migrator, removeFixtures, setPlan, signUpOwner, twilioPhoneSid, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// An owner on Starter buys a second number for a second agent from the
// agent's phone page. The worker buys it from a fake Twilio, and the number
// lands on that agent with the price the owner saw. No payment happens: the
// monthly charge goes to Polar from the worker, which its own tests cover.

const prefix = "extra-numbers";
let thirdParties: ThirdParties;
let database: Migrator;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

const price = settings.phoneNumber.extra.monthly.replace("{{price}}", "$1.15");

test("an owner on Starter buys a number for a second agent at the price shown", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");
    await holdNumber(database, owner.businessId, { carrier: "twilio", providerPhoneId: twilioPhoneSid() });

    const created = await page.request.post(`/api/agents?businessId=${owner.businessId}`, { headers: { origin: new URL(baseURL!).origin }, data: { name: "After hours" } });
    expect(created.status(), await created.text()).toBe(201);
    const agentId = (await created.json() as { id: string }).id;

    // The agent's channels send it to buy a number of its own.
    await page.goto(`/agents/${agentId}/channels`);
    await page.getByText(nav.channels.buyNumber, { exact: true }).click();
    await expect(page).toHaveURL(`/agents/${agentId}/channels/phone`);

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
