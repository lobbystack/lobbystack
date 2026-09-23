import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { createDatabaseClient } from "@lobbystack/db";

import frOnboarding from "../public/locales/fr/onboarding.json" with { type: "json" };
import enOnboarding from "../public/locales/en/onboarding.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const password = "Supported-Journey-Password-123!";
const prefix = "supported-journey";

async function cleanupFixtures(): Promise<void> {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) return;
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  try {
    await database.db.execute(sql`delete from public.businesses where slug like ${`${prefix}-%`}`);
    await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email like ${`${prefix}-%@example.invalid`})`);
    await database.db.execute(sql`delete from public.verifications where identifier like ${`email-verification-otp-${prefix}-%@example.invalid`}`);
    await database.db.execute(sql`delete from public.users where email like ${`${prefix}-%@example.invalid`}`);
  } finally {
    await database.pool.end();
  }
}

async function signUpAndVerify(page: Page, locale: "en" | "fr", testInfo: TestInfo): Promise<string> {
  const email = `${prefix}-${locale}-${randomUUID()}@example.invalid`;
  await isolateAuthRateLimit(page, email, testInfo);
  await page.goto(`/${locale}/signup`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/auth/sign-up/email") && response.request().method() === "POST");
  await page.locator('button[type="submit"]').click();
  expect((await submitted).ok()).toBe(true);
  await completeSignupEmailVerification(page, email, password);
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  return email;
}

test.beforeAll(cleanupFixtures);
test.afterAll(cleanupFixtures);

test("English signup proves the verification email and reaches onboarding", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("lobbystack.locale", "en"));
  await signUpAndVerify(page, "en", testInfo);
  await expect(page.getByLabel(enOnboarding.businessName.label)).toBeVisible();
  await expect(page.getByRole("button", { name: enOnboarding.businessName.continue })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("lobbystack.locale"))).toBe("en");
});

test("French signup keeps its locale through verification and onboarding", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("lobbystack.locale", "fr"));
  await signUpAndVerify(page, "fr", testInfo);
  await expect(page.getByLabel(frOnboarding.businessName.label)).toBeVisible();
  await expect(page.getByRole("button", { name: frOnboarding.businessName.continue })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("fr");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("lobbystack.locale"))).toBe("fr");
});
