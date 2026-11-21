import { expect, test, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { numberTrials, phoneNumbers } from "@lobbystack/db";
import onboarding from "../../public/locales/en/onboarding.json" with { type: "json" };

import { isolateAuthRateLimit } from "../fixtures/email-verification";
import { ZADARMA_DOCUMENTS_GROUP_ID, ZADARMA_SIP_HOST } from "../fixtures/full-stack-environment";
import { migrator, removeFixtures, signUp, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// A Serbian owner reaches the number step on Serbia, where Twilio has no numbers, and gets a free trial number from
// Zadarma. The real adapter runs against the fake in third-parties.ts, which checks every request's signature. The
// worker orders the number, routes it to the SIP server, and releases it when the owner removes it.

const prefix = "serbia-number";
let database: Migrator;
let thirdParties: ThirdParties;

test.use({ timezoneId: "Europe/Belgrade" });
test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

test("a Serbian owner gets a free trial number from Zadarma, routed to the SIP server, and releasing it ends its auto-renewal", async ({ page }, testInfo: TestInfo) => {
  test.setTimeout(240_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const { email } = await signUp(page, testInfo, prefix);
    emails.push(email);
    const ip = await isolateAuthRateLimit(page, email, testInfo);
    await page.setExtraHTTPHeaders({ "x-real-ip": ip, "cf-ipcountry": "RS" });

    await page.getByLabel(onboarding.businessName.label).fill(`Novi Sad clinic ${randomUUID().slice(0, 6)}`);
    const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
    await page.getByRole("button", { name: onboarding.businessName.continue }).click();
    const { businessId } = await (await created).json() as { businessId: string };
    businessIds.push(businessId);

    await page.getByRole("button", { name: onboarding.website.skip }).click();
    await expect(page).toHaveURL("/onboarding/language");
    await page.getByRole("button", { name: onboarding.language.continue }).click();

    // The time zone points at Serbia, so the number step starts there and offers Zadarma's landline numbers.
    await expect(page).toHaveURL("/onboarding/number");
    await expect(page.locator("#number-country")).toContainText("RS");
    const firstNumber = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: onboarding.number.select }) }).first();
    await expect(firstNumber).toBeVisible();
    await expect(firstNumber).toContainText("Belgrade");
    const offered = thirdParties.zadarma.offered;
    expect(offered.length).toBeGreaterThan(0);
    // Twilio has no numbers in Serbia, so the search never asks it.
    expect(thirdParties.carrier.calls.filter((call) => call.host === "api.twilio.com" && call.path.includes("/AvailablePhoneNumbers/RS"))).toEqual([]);

    await firstNumber.getByRole("button", { name: onboarding.number.select }).click();
    await expect(page).toHaveURL("/onboarding/attribution", { timeout: 120_000 });

    const [number] = await database.db.select({ id: phoneNumbers.id, e164: phoneNumbers.e164, carrier: phoneNumbers.carrier, providerPhoneId: phoneNumbers.providerPhoneId, status: phoneNumbers.status, smsEnabled: phoneNumbers.smsEnabled, voiceEnabled: phoneNumbers.voiceEnabled, target: phoneNumbers.voiceWebhookTargetUrl }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
    const digits = number!.e164.slice(1);
    expect(offered).toContain(digits);
    expect(number).toMatchObject({ carrier: "zadarma", providerPhoneId: digits, status: "active", smsEnabled: false, voiceEnabled: true, target: `sip:${digits}@${ZADARMA_SIP_HOST}` });

    // It is a free trial, and the order went under the documents group.
    const [trial] = await database.db.select({ status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, businessId));
    expect(trial?.status).toBe("active");
    const order = thirdParties.zadarma.calls.find((call) => call.route === "/v1/direct_numbers/order/");
    expect(order?.params).toMatchObject({ documents_group_id: ZADARMA_DOCUMENTS_GROUP_ID, direction_id: "100" });
    const routed = thirdParties.zadarma.calls.find((call) => call.route === "/v1/direct_numbers/set_sip_id/");
    expect(routed?.params).toMatchObject({ number: digits, sip_id: `${digits}@${ZADARMA_SIP_HOST}` });
    // The fake refuses a request whose signature it can't reproduce, so every call here was signed correctly.
    expect(thirdParties.zadarma.calls.length).toBeGreaterThan(0);
    expect(thirdParties.zadarma.calls.filter((call) => !call.signed)).toEqual([]);
    expect(thirdParties.zadarma.numbers().find((item) => item.number === digits)).toMatchObject({ status: "on", sip: `${digits}@${ZADARMA_SIP_HOST}`, autoprolongation: "on" });

    // Removing the number releases it. Zadarma has no cancel, so that ends its auto-renewal.
    const removed = await page.request.delete(`/api/phone-numbers?businessId=${businessId}`, { data: { phoneNumberId: number!.id } });
    expect(removed.ok()).toBe(true);
    await expect.poll(() => thirdParties.zadarma.numbers().find((item) => item.number === digits)?.autoprolongation, { timeout: 90_000 }).toBe("off");
    await expect.poll(async () => (await database.db.select({ status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.id, number!.id)))[0]?.status, { timeout: 60_000 }).toBe("reclaimed");
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
