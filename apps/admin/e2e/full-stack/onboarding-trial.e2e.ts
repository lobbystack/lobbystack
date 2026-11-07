import { expect, test, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { numberTrials, phoneNumbers } from "@lobbystack/db";
import onboarding from "../../public/locales/en/onboarding.json" with { type: "json" };

import { isolateAuthRateLimit } from "../fixtures/email-verification";
import { migrator, removeFixtures, signUp, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// A verified email and a known network are enough for a free trial number, so
// onboarding reaches the picker without a text. The worker buys from the fake
// carrier, and the trial records the network instead of a mobile.

const prefix = "onboarding-trial";
let database: Migrator;
let thirdParties: ThirdParties;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

test("an owner picks a trial number without verifying a mobile", async ({ page }, testInfo: TestInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const { email } = await signUp(page, testInfo, prefix);
    emails.push(email);
    // Cloudflare's country is only read when the deployment trusts its client address header.
    const ip = await isolateAuthRateLimit(page, email, testInfo);
    await page.setExtraHTTPHeaders({ "x-real-ip": ip, "cf-ipcountry": "CA" });

    await page.getByLabel(onboarding.businessName.label).fill(`Trial without text ${randomUUID().slice(0, 6)}`);
    const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
    await page.getByRole("button", { name: onboarding.businessName.continue }).click();
    const { businessId } = await (await created).json() as { businessId: string };
    businessIds.push(businessId);

    await page.getByRole("button", { name: onboarding.website.skip }).click();
    await expect(page).toHaveURL("/onboarding/language");
    await page.getByRole("button", { name: onboarding.language.continue }).click();

    // The phone step has nothing to ask for and passes on to the picker.
    await expect(page).toHaveURL("/onboarding/number");
    const firstNumber = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: onboarding.number.select }) }).first();
    await expect(firstNumber).toBeVisible();
    await firstNumber.getByRole("button", { name: onboarding.number.select }).click();
    // Once the number is live, the picker moves on to the next step.
    await expect(page).toHaveURL("/onboarding/goal", { timeout: 120_000 });

    const [trial] = await database.db.select({ verifiedPhone: numberTrials.verifiedPhone, ipHash: numberTrials.ipHash, status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, businessId));
    expect(trial).toMatchObject({ verifiedPhone: null, status: "active" });
    expect(trial?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await database.db.select({ status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId)))[0]?.status).toBe("active");
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
