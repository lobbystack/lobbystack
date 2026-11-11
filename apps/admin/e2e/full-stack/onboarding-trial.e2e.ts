import { expect, test, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { numberTrials, phoneNumbers } from "@lobbystack/db";
import common from "../../public/locales/en/common.json" with { type: "json" };
import dashboard from "../../public/locales/en/dashboard.json" with { type: "json" };
import onboarding from "../../public/locales/en/onboarding.json" with { type: "json" };

import { isolateAuthRateLimit } from "../fixtures/email-verification";
import { migrator, removeFixtures, signUp, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// Signup to Home for a direct owner: a verified email and a known network are
// enough for a free trial number, with no phone step. The worker buys from the
// fake carrier, the trial records the network, the plans follow, and Home
// shows the Getting started list for a business with a number.

const prefix = "onboarding-trial";
let database: Migrator;
let thirdParties: ThirdParties;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

test("an owner picks the required number, goes on with the trial, and finds the number's Getting started on Home", async ({ page }, testInfo: TestInfo) => {
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

    // No phone step: the number comes right after the language, and it can't be skipped.
    await expect(page).toHaveURL("/onboarding/number");
    await expect(page.getByRole("heading", { name: onboarding.number.title })).toBeVisible();
    await expect(page.getByRole("button", { name: onboarding.number.skipLater })).toHaveCount(0);
    const firstNumber = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: onboarding.number.select }) }).first();
    await expect(firstNumber).toBeVisible();
    await firstNumber.getByRole("button", { name: onboarding.number.select }).click();
    // Once the number is live, the attribution question follows. The trial already runs.
    await expect(page).toHaveURL("/onboarding/attribution", { timeout: 120_000 });

    const [trial] = await database.db.select({ verifiedPhone: numberTrials.verifiedPhone, ipHash: numberTrials.ipHash, status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, businessId));
    expect(trial).toMatchObject({ verifiedPhone: null, status: "active" });
    expect(trial?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    const [number] = await database.db.select({ status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
    expect(number?.status).toBe("active");

    await page.getByRole("button", { name: onboarding.attribution.options.other }).click();
    await page.getByRole("button", { name: onboarding.attribution.continue }).click();
    await expect(page).toHaveURL("/onboarding/meet");
    // After Meet your agent, the plans are the last step, with nothing to close them.
    await page.getByRole("button", { name: onboarding.meet.finish }).click();
    await expect(page).toHaveURL("/onboarding/plan");
    await expect(page.getByRole("button", { name: onboarding.plan.subscribe })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Close" })).toHaveCount(0);
    await page.getByRole("button", { name: onboarding.plan.trial.start }).click();
    await expect(page).toHaveURL("/");

    // Home's Getting started is the list for a business with a number, and the sidebar counts the trial down.
    await expect(page.getByRole("heading", { name: dashboard.setupGuide.title })).toBeVisible();
    for (const step of [dashboard.setupGuide.steps.fullScan, dashboard.setupGuide.steps.callNumber, dashboard.setupGuide.steps.forwardFromCurrent, dashboard.setupGuide.steps.sources]) {
      await expect(page.getByRole("button", { name: new RegExp(step) })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: new RegExp(dashboard.setupGuide.steps.testCall) })).toHaveCount(0);
    await expect(page.getByText(/^Free trial · \d+d left$/)).toBeVisible();
    await expect(page.getByRole("button", { name: common.numberTrial.viewPlans })).toBeVisible();

    // The carrier here sends no forwarding header, so the owner says it works after the test call.
    await page.getByRole("button", { name: new RegExp(dashboard.setupGuide.steps.forwardFromCurrent) }).click();
    await page.getByRole("button", { name: dashboard.setupGuide.stepActions.forwardCalls }).click();
    await page.getByRole("dialog").getByRole("button", { name: dashboard.forwarding.itWorks }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => Boolean((await database.db.select({ confirmedAt: phoneNumbers.forwardingConfirmedAt }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId)))[0]?.confirmedAt)).toBe(true);
    await page.getByRole("button", { name: new RegExp(dashboard.setupGuide.steps.forwardFromCurrent) }).click();
    await expect(page.getByText(dashboard.setupGuide.forwardingWorks)).toBeVisible();
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
