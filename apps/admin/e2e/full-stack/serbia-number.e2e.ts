import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { defaultAgentIdOf, numberTrials, onboardingNumberClaimEvents, phoneNumbers } from "@lobbystack/db";
import onboarding from "../../public/locales/en/onboarding.json" with { type: "json" };
import settings from "../../public/locales/en/settings.json" with { type: "json" };

import { isolateAuthRateLimit } from "../fixtures/email-verification";
import { ZADARMA_DOCUMENTS_GROUP_ID, ZADARMA_SIP_HOST } from "../fixtures/full-stack-environment";
import { holdNumber, migrator, removeFixtures, setPlan, signUp, signUpOwner, twilioPhoneSid, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// A Serbian owner reaches the number step on Serbia, where Twilio has no numbers. Zadarma lists no landline numbers to
// pick from and names the number when it takes the order, so the owner picks a city. A number there is paid only:
// Zadarma charges for the order up front, so a business on Free is sent to the plans and nothing is ordered. The real
// adapter runs against the fake in third-parties.ts, which checks every request's signature and answers as the real
// account does.

const prefix = "serbia-number";
let database: Migrator;
let thirdParties: ThirdParties;

test.use({ timezoneId: "Europe/Belgrade" });
test.beforeAll(() => { database = migrator(); });
test.afterAll(async () => { await database.pool.end(); });
// Each test gets its own fake, so the calls, numbers and status of one never reach the next.
test.beforeEach(async () => { thirdParties = await startThirdParties(); });
test.afterEach(async () => { await thirdParties.close(); });

/** Signs up, creates a business, and goes on to the number step, on the plan given. */
async function toNumberStep(page: Page, testInfo: TestInfo, plan: "free_cloud" | "starter", emails: string[], businessIds: string[]): Promise<string> {
  const { email } = await signUp(page, testInfo, prefix);
  emails.push(email);
  const ip = await isolateAuthRateLimit(page, email, testInfo);
  await page.setExtraHTTPHeaders({ "x-real-ip": ip, "cf-ipcountry": "RS" });

  await page.getByLabel(onboarding.businessName.label).fill(`Novi Sad clinic ${randomUUID().slice(0, 6)}`);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await page.getByRole("button", { name: onboarding.businessName.continue }).click();
  const { businessId } = await (await created).json() as { businessId: string };
  businessIds.push(businessId);
  await setPlan(database, businessId, plan);

  await page.getByRole("button", { name: onboarding.website.skip }).click();
  await expect(page).toHaveURL("/onboarding/language");
  await page.getByRole("button", { name: onboarding.language.continue }).click();
  await expect(page).toHaveURL("/onboarding/number");
  return businessId;
}

const orders = () => thirdParties.zadarma.calls.filter((call) => call.route === "/v1/direct_numbers/order/");

test("a paid Serbian owner orders a number in their city, routed to the SIP server, and releasing it ends its auto-renewal", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const businessId = await toNumberStep(page, testInfo, "starter", emails, businessIds);

    // The time zone points at Serbia, so the step starts there, and lists cities, not numbers. Toll-free isn't one.
    await expect(page.locator("#number-country")).toContainText("RS");
    const novi = page.getByRole("listitem").filter({ hasText: "Novi Sad" });
    await expect(novi).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Belgrade" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Toll-free" })).toHaveCount(0);
    // Twilio has no numbers in Serbia, so nothing asks it.
    expect(thirdParties.carrier.calls.filter((call) => call.host === "api.twilio.com" && call.path.includes("/AvailablePhoneNumbers/RS"))).toEqual([]);
    expect(orders()).toEqual([]);

    await novi.getByRole("button", { name: onboarding.number.select }).click();
    await expect(page).toHaveURL("/onboarding/attribution", { timeout: 120_000 });

    const [number] = await database.db.select({ id: phoneNumbers.id, e164: phoneNumbers.e164, carrier: phoneNumbers.carrier, providerPhoneId: phoneNumbers.providerPhoneId, status: phoneNumbers.status, smsEnabled: phoneNumbers.smsEnabled, voiceEnabled: phoneNumbers.voiceEnabled, target: phoneNumbers.voiceWebhookTargetUrl }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
    const digits = number!.e164.slice(1);
    // The number is the one Zadarma named in its reply, and the order chose none from a list.
    expect(thirdParties.zadarma.assigned).toEqual([digits]);
    expect(number).toMatchObject({ carrier: "zadarma", providerPhoneId: digits, status: "active", smsEnabled: false, voiceEnabled: true, target: `sip:${digits}@${ZADARMA_SIP_HOST}` });
    expect(orders()).toHaveLength(1);
    expect(orders()[0]!.params).toMatchObject({ documents_group_id: ZADARMA_DOCUMENTS_GROUP_ID, direction_id: "18389" });
    expect(orders()[0]!.params).not.toHaveProperty("number_id");
    const routed = thirdParties.zadarma.calls.find((call) => call.route === "/v1/direct_numbers/set_sip_id/");
    expect(routed?.params).toMatchObject({ number: digits, sip_id: `${digits}@${ZADARMA_SIP_HOST}` });
    // The fake refuses a request whose signature it can't reproduce, so every call here was signed correctly.
    expect(thirdParties.zadarma.calls.filter((call) => !call.signed)).toEqual([]);
    expect(thirdParties.zadarma.numbers().find((item) => item.number === digits)).toMatchObject({ status: "on", sip: `${digits}@${ZADARMA_SIP_HOST}`, autoprolongation: "on" });
    // A paid number is no trial.
    expect(await database.db.select({ id: numberTrials.id }).from(numberTrials).where(eq(numberTrials.businessId, businessId))).toEqual([]);

    // Removing the number releases it. Zadarma has no cancel, so that ends its auto-renewal.
    const removed = await page.request.delete(`/api/phone-numbers?businessId=${businessId}`, { headers: { origin: new URL(baseURL!).origin }, data: { phoneNumberId: number!.id } });
    expect(removed.ok()).toBe(true);
    await expect.poll(() => thirdParties.zadarma.numbers().find((item) => item.number === digits)?.autoprolongation, { timeout: 90_000 }).toBe("off");
    await expect.poll(async () => (await database.db.select({ status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.id, number!.id)))[0]?.status, { timeout: 60_000 }).toBe("reclaimed");
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});

test("a paid owner is given a number the account already holds in their city, with renewal back on, and nothing is bought", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    // A number an earlier business let go: live on the account, its renewal off, and no business holds it.
    const idle = "381213860081";
    thirdParties.zadarma.hold(idle, "off");
    const businessId = await toNumberStep(page, testInfo, "starter", emails, businessIds);
    await page.getByRole("listitem").filter({ hasText: "Novi Sad" }).getByRole("button", { name: onboarding.number.select }).click();
    await expect(page).toHaveURL("/onboarding/attribution", { timeout: 120_000 });

    const [number] = await database.db.select({ e164: phoneNumbers.e164, carrier: phoneNumbers.carrier, status: phoneNumbers.status, target: phoneNumbers.voiceWebhookTargetUrl }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
    expect(number).toMatchObject({ e164: `+${idle}`, carrier: "zadarma", status: "active", target: `sip:${idle}@${ZADARMA_SIP_HOST}` });
    // Nothing was ordered, so nothing was charged, and the number renews again.
    expect(orders()).toEqual([]);
    expect(thirdParties.zadarma.assigned).toEqual([]);
    expect(thirdParties.zadarma.numbers().find((item) => item.number === idle)).toMatchObject({ sip: `${idle}@${ZADARMA_SIP_HOST}`, autoprolongation: "on" });
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});

test("a paid owner whose order Zadarma is still checking moves on, and the claim waits for the number", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    thirdParties.zadarma.status = "checking";
    const businessId = await toNumberStep(page, testInfo, "starter", emails, businessIds);
    await page.getByRole("listitem").filter({ hasText: "Belgrade" }).getByRole("button", { name: onboarding.number.select }).click();
    // Zadarma checks documents for days, so the owner goes on while the order waits.
    await expect(page).toHaveURL("/onboarding/attribution", { timeout: 120_000 });
    expect(orders()).toHaveLength(1);
    expect(orders()[0]!.params).toMatchObject({ direction_id: "2393" });

    const [claim] = await database.db.select({ status: onboardingNumberClaimEvents.status, providerOrderId: onboardingNumberClaimEvents.providerOrderId }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.businessId, businessId));
    expect(claim).toMatchObject({ status: "provisioning", providerOrderId: thirdParties.zadarma.assigned[0] });
    // No number answers calls yet, and nothing was routed to the SIP server, because the number isn't live.
    expect(await database.db.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId))).toEqual([]);
    expect(thirdParties.zadarma.calls.some((call) => call.route === "/v1/direct_numbers/set_sip_id/")).toBe(false);
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});

test("an owner on Free gets the plans for a Serbian number and orders nothing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    await toNumberStep(page, testInfo, "free_cloud", emails, businessIds);
    // Serbia has no free trial, so the step says a paid plan is needed instead of listing cities.
    await expect(page.getByText(onboarding.number.refusals.paidPlan)).toBeVisible();
    expect(orders()).toEqual([]);
    expect(thirdParties.zadarma.calls.filter((call) => call.method === "POST")).toEqual([]);
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});

/** An owner on Starter with a US number, on their agent's phone page, who asks to change it and lands on Serbia's city list. */
async function toReplacementDialog(page: Page, testInfo: TestInfo, emails: string[], businessIds: string[]) {
  const owner = await signUpOwner(database, page, testInfo, `${prefix}-change`);
  emails.push(owner.email);
  businessIds.push(owner.businessId);
  await setPlan(database, owner.businessId, "starter");
  const current = await holdNumber(database, owner.businessId, { carrier: "twilio", providerPhoneId: twilioPhoneSid() });
  const agentId = defaultAgentIdOf(owner.businessId);
  await page.goto(`/agents/${agentId}/channels/phone`);
  await page.getByRole("button", { name: settings.phoneNumber.actions.requestChange, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#number-country")).toContainText("RS");
  return { owner, current, dialog };
}

test("an owner changing their number to a Serbian one is given an idle number the account holds, and nothing is bought", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const idle = "381213860081";
    thirdParties.zadarma.hold(idle, "off");
    const { owner, current, dialog } = await toReplacementDialog(page, testInfo, emails, businessIds);
    await dialog.getByRole("listitem").filter({ hasText: "Novi Sad" }).getByRole("button").click();
    await expect(page.getByText(settings.phoneNumber.toast.changed, { exact: true })).toBeVisible({ timeout: 90_000 });

    const numbers = await database.db.select({ id: phoneNumbers.id, e164: phoneNumbers.e164, carrier: phoneNumbers.carrier, status: phoneNumbers.status, reclaimReason: phoneNumbers.reclaimReason }).from(phoneNumbers).where(eq(phoneNumbers.businessId, owner.businessId));
    expect(numbers.find((number) => number.e164 === `+${idle}`)).toMatchObject({ carrier: "zadarma", status: "active" });
    // The old number stays for 30 days, then goes.
    expect(numbers.find((number) => number.id === current.id)).toMatchObject({ status: "active", reclaimReason: "replacement" });
    expect(orders()).toEqual([]);
    expect(thirdParties.zadarma.numbers().find((item) => item.number === idle)).toMatchObject({ sip: `${idle}@${ZADARMA_SIP_HOST}`, autoprolongation: "on" });
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});

test("an owner changing their number to a Serbian one has a new number ordered when the account holds none idle", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const { owner, dialog } = await toReplacementDialog(page, testInfo, emails, businessIds);
    await dialog.getByRole("listitem").filter({ hasText: "Belgrade" }).getByRole("button").click();
    await expect(page.getByText(settings.phoneNumber.toast.changed, { exact: true })).toBeVisible({ timeout: 90_000 });

    expect(orders()).toHaveLength(1);
    expect(orders()[0]!.params).toMatchObject({ direction_id: "2393", documents_group_id: ZADARMA_DOCUMENTS_GROUP_ID });
    const [bought] = thirdParties.zadarma.assigned;
    const [number] = await database.db.select({ e164: phoneNumbers.e164, status: phoneNumbers.status }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, owner.businessId), eq(phoneNumbers.carrier, "zadarma")));
    expect(number).toMatchObject({ e164: `+${bought}`, status: "active" });
    expect(await database.db.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, owner.businessId))).toHaveLength(2);
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
