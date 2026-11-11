import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { businesses, createDatabaseClient } from "@lobbystack/db";

import nav from "../public/locales/en/nav.json" with { type: "json" };
import onboarding from "../public/locales/en/onboarding.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const password = "Onboarding-Path-Password-123!";
const prefix = "onboarding-path";

function migrator() {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("The disposable E2E database is required.");
  return createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
}

async function removeFixtures(database: ReturnType<typeof migrator>, email: string, businessId: string | undefined): Promise<void> {
  if (businessId) await database.db.execute(sql`delete from public.businesses where id = ${businessId}`);
  await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email = ${email})`);
  await database.db.execute(sql`delete from public.verifications where identifier = ${`email-verification-otp-${email}`}`);
  await database.db.execute(sql`delete from public.users where email = ${email}`);
}

async function newOwner(page: Page, testInfo: TestInfo, email: string): Promise<string> {
  await page.addInitScript(() => localStorage.setItem("lobbystack.locale", "en"));
  await isolateAuthRateLimit(page, email, testInfo);
  await page.goto("/en/signup");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const signedUp = page.waitForResponse((response) => response.url().endsWith("/api/auth/sign-up/email") && response.request().method() === "POST");
  await page.locator('button[type="submit"]').click();
  expect((await signedUp).ok()).toBe(true);
  await completeSignupEmailVerification(page, email, password);
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  await page.getByLabel(onboarding.businessName.label).fill(`Onboarding Path ${randomUUID().slice(0, 8)}`);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await page.getByRole("button", { name: onboarding.businessName.continue }).click();
  const { businessId } = await (await created).json() as { businessId: string };
  await expect(page).toHaveURL("/onboarding/website");
  return businessId;
}

/** This run sells no numbers, so leave the number step the way an owner in a country without numbers does. */
async function leaveNumberStep(page: Page): Promise<void> {
  await expect(page).toHaveURL("/onboarding/number");
  await page.getByRole("button", { name: onboarding.number.country.notListed }).click();
  await page.getByRole("button", { name: onboarding.number.country.continue }).click();
}

test("the website path waits for the import and ends on Meet your agent", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, email);

    // This run has no worker, so the import stays running and the wait stays up.
    await page.getByLabel(onboarding.website.label).fill("example.com");
    await page.getByRole("button", { name: onboarding.website.continue }).click();
    await expect(page).toHaveURL(/\/onboarding\/reading\?documentId=/);
    await expect(page.getByText(onboarding.reading.slides.answers)).toBeVisible();
    await page.getByRole("button", { name: onboarding.reading.next }).click();
    await expect(page.getByText(onboarding.reading.slides.booking)).toBeVisible();
    await page.getByRole("button", { name: onboarding.reading.skip }).click();

    // No phone step: the number comes right after the website.
    await expect(page).toHaveURL("/onboarding/number");

    // Onboarding goes forward only: an earlier page lands on the current step.
    await page.goto("/onboarding/website");
    await expect(page).toHaveURL("/onboarding/number");
    await page.goto("/onboarding/business");
    await expect(page).toHaveURL("/onboarding/number");
    await page.goto("/onboarding/verify-phone");
    await expect(page).toHaveURL("/onboarding/number");

    // No goal question: the attribution question comes next.
    await leaveNumberStep(page);
    await expect(page).toHaveURL("/onboarding/attribution");
    await page.goto("/onboarding/goal");
    await expect(page).toHaveURL("/onboarding/attribution");

    await page.getByRole("button", { name: onboarding.attribution.options.google }).click();
    await page.getByRole("button", { name: onboarding.attribution.continue }).click();
    await expect(page).toHaveURL("/onboarding/meet");
    await expect(page.getByRole("heading", { name: onboarding.meet.title })).toBeVisible();

    // Browser back from Meet your agent doesn't reopen the attribution form.
    await page.goBack();
    await expect(page).toHaveURL("/onboarding/meet");

    // Skipping the number leaves the browser test in place.
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    const name = page.getByLabel(onboarding.meet.name);
    await name.fill("Maya");
    await name.blur();
    await expect.poll(async () => (await database.db.execute<{ name: string }>(sql`select name from public.agents where business_id = ${businessId}`)).rows[0]?.name).toBe("Maya");
    await page.reload();
    await expect(page.getByLabel(onboarding.meet.name)).toHaveValue("Maya");

    await page.getByRole("button", { name: onboarding.meet.finish }).click();
    await expect(page).toHaveURL("/");
    const [row] = await database.db.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId));
    expect(row?.stage).toBe("complete");

    // A finished workspace still opens the first step to create another one.
    await page.getByRole("button", { name: /^Onboarding Path / }).click();
    await page.getByRole("menuitem", { name: nav.sidebar.createBusiness }).click();
    await expect(page).toHaveURL("/onboarding/business?create=true");
    await expect(page.getByLabel(onboarding.businessName.label)).toHaveValue("");
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});

test("the no-website path asks the language, and the X closes the plans", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, email);
    await page.getByRole("button", { name: onboarding.website.skip }).click();
    await expect(page).toHaveURL("/onboarding/language");
    await page.goto("/onboarding/website");
    await expect(page).toHaveURL("/onboarding/language");
    await page.getByRole("button", { name: onboarding.language.continue }).click();
    await leaveNumberStep(page);
    await expect(page).toHaveURL("/onboarding/attribution");
    // The question has no skip: Continue waits for an answer.
    await expect(page.getByRole("button", { name: onboarding.attribution.continue })).toBeDisabled();
    await page.getByRole("button", { name: onboarding.attribution.options.other }).click();
    await page.getByRole("button", { name: onboarding.attribution.continue }).click();
    await expect(page).toHaveURL("/onboarding/meet");

    // This run has no billing provider, so the server's answer and the plans come from here.
    await page.route("**/api/plan-offer**", (route) => route.request().method() === "GET" ? route.fulfill({ json: { due: true } }) : route.fulfill({ json: { ok: true } }));
    await page.route("**/api/billing?**", (route) => route.fulfill({ json: { account: { plan: "free_cloud", billingInterval: null, subscriptionState: null }, availableCheckoutPlans: ["starter", "pro"], availableCheckoutIntervals: { starter: ["monthly"], pro: ["monthly"] } } }));
    await page.reload();
    const plans = page.getByRole("dialog");
    // The plans wait for the door to the dashboard, and closing them goes through it.
    await expect(page.getByLabel(onboarding.meet.name)).toBeVisible();
    await expect(plans).toHaveCount(0);
    await page.getByRole("button", { name: onboarding.meet.finish }).click();
    await expect(plans).toBeVisible();
    await expect(page).toHaveURL("/onboarding/meet");
    // Shown once, the offer is no longer due, as the server would answer.
    await page.unroute("**/api/plan-offer**");
    await page.route("**/api/plan-offer**", (route) => route.request().method() === "GET" ? route.fulfill({ json: { due: false } }) : route.fulfill({ json: { ok: true } }));
    await plans.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL("/");
    await expect(plans).toHaveCount(0);
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});

test("a used trial skips the phone step and offers the plans, with a way on", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, email);
    const owner = (await database.db.execute<{ id: string }>(sql`select id from public.users where email = ${email}`)).rows[0];
    expect(owner?.id).toBeTruthy();
    await database.db.execute(sql`insert into public.number_trials (business_id, user_id, verified_phone, status) values (${businessId}, ${owner!.id}, '+14165550199', 'reserved')`);

    await page.getByRole("button", { name: onboarding.website.skip }).click();
    await expect(page).toHaveURL("/onboarding/language");
    await page.getByRole("button", { name: onboarding.language.continue }).click();

    // The phone step never shows: its only purpose was the trial.
    await expect(page).toHaveURL("/onboarding/number");
    await expect(page.getByText(onboarding.number.refusals.trialUsed)).toBeVisible();
    await expect(page.getByText(onboarding.number.planRequired)).toHaveCount(0);
    await page.getByRole("button", { name: onboarding.number.skipLater }).click();
    await expect(page).toHaveURL("/onboarding/attribution");
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});
