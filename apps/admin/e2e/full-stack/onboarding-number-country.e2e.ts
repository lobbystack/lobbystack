import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { numberTrials, onboardingNumberClaimEvents } from "@lobbystack/db";
import onboarding from "../../public/locales/en/onboarding.json" with { type: "json" };

import { isolateAuthRateLimit } from "../fixtures/email-verification";
import { migrator, removeFixtures, signUp, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// The number step reads Cloudflare's country, which playwright.config.ts has
// the server trust. Someone in a country without trial numbers sees the plans
// before any search. Someone in a sanctioned country sees that numbers aren't
// available there, with no plans and no way on, and the server refuses the
// skip the page doesn't offer.

const prefix = "onboarding-number-country";
let database: Migrator;
let thirdParties: ThirdParties;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

/** Signs up an owner browsing from `country` and walks them to the number step. Resolves to the business's id. */
async function reachNumberStep(page: Page, testInfo: TestInfo, country: string, cleanup: { emails: string[]; businessIds: string[] }): Promise<string> {
  const { email } = await signUp(page, testInfo, prefix);
  cleanup.emails.push(email);
  const ip = await isolateAuthRateLimit(page, email, testInfo);
  await page.setExtraHTTPHeaders({ "x-real-ip": ip, "cf-ipcountry": country });

  await page.getByLabel(onboarding.businessName.label).fill(`Country ${country} ${randomUUID().slice(0, 6)}`);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await page.getByRole("button", { name: onboarding.businessName.continue }).click();
  const { businessId } = await (await created).json() as { businessId: string };
  cleanup.businessIds.push(businessId);

  await page.getByRole("button", { name: onboarding.website.skip }).click();
  await expect(page).toHaveURL("/onboarding/language");
  await page.getByRole("button", { name: onboarding.language.continue }).click();
  await expect(page).toHaveURL("/onboarding/number");
  return businessId;
}

test("an owner in a country without trial numbers sees the plans on the number step", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const cleanup = { emails: [] as string[], businessIds: [] as string[] };
  try {
    const businessId = await reachNumberStep(page, testInfo, "BD", cleanup);
    await expect(page.getByText(onboarding.number.refusals.countryMismatch)).toBeVisible();
    await expect(page.getByRole("button", { name: onboarding.plan.subscribe }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: onboarding.number.select })).toHaveCount(0);
    expect(await database.db.select({ id: numberTrials.id }).from(numberTrials).where(eq(numberTrials.businessId, businessId))).toEqual([]);
  } finally {
    await removeFixtures(database, cleanup);
  }
});

test("an owner in a sanctioned country sees that numbers aren't available, with no plans and no way on", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const cleanup = { emails: [] as string[], businessIds: [] as string[] };
  try {
    const businessId = await reachNumberStep(page, testInfo, "IR", cleanup);
    await expect(page.getByText(onboarding.number.refusals.countryRestricted)).toBeVisible();
    await expect(page.getByRole("button", { name: onboarding.plan.subscribe })).toHaveCount(0);
    await expect(page.getByRole("button", { name: onboarding.number.select })).toHaveCount(0);
    await expect(page.getByRole("button", { name: onboarding.number.skipLater })).toHaveCount(0);
    await expect(page.getByRole("button", { name: onboarding.number.country.continue })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: onboarding.number.country.label })).toHaveCount(0);

    // The page offers no skip, and the server refuses one sent anyway.
    const skipped = await page.evaluate(async (id) => {
      const response = await fetch(`/api/onboarding/phone-numbers/skip?businessId=${encodeURIComponent(id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ countryCode: "IR" }) });
      return { status: response.status, body: await response.json() as { code?: string } };
    }, businessId);
    expect(skipped).toMatchObject({ status: 403, body: { code: "number_country_restricted" } });
    await page.reload();
    await expect(page).toHaveURL("/onboarding/number");
    await expect(page.getByText(onboarding.number.refusals.countryRestricted)).toBeVisible();
    expect(await database.db.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.businessId, businessId))).toEqual([]);
  } finally {
    await removeFixtures(database, cleanup);
  }
});
