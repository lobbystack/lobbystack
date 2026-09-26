import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { sql } from "drizzle-orm";

import { createDatabaseClient } from "@lobbystack/db";

import { respectingAuthRateLimit } from "./fixtures/auth-rate-limit";
import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const password = "Replacement-E2E-Password-123!";
const prefix = "pending-state-e2e";

/**
 * Best effort only. The isolated runner builds a fresh database per run, so
 * leftovers are not a correctness concern, and a tidy-up that cannot reach the
 * schema must not fail the assertion it exists to support.
 */
async function cleanup(): Promise<void> {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) return;
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  try {
    await database.db.execute(sql`delete from public.businesses where slug like ${`${prefix}-%`}`);
    await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email like ${`${prefix}-%@example.invalid`})`);
    await database.db.execute(sql`delete from public.verifications where identifier like ${`email-verification-otp-${prefix}-%@example.invalid`}`);
    await database.db.execute(sql`delete from public.users where email like ${`${prefix}-%@example.invalid`}`);
  } catch {
    // A database this spec cannot reach holds nothing it created.
  } finally {
    await database.pool.end().catch(() => undefined);
  }
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

async function signUp(page: Page, identity: string, testInfo: TestInfo): Promise<void> {
  const email = `${prefix}-${identity}@example.invalid`;
  await isolateAuthRateLimit(page, email, testInfo);
  await page.goto("/en/signup");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const response = await respectingAuthRateLimit(async () => {
    const submitted = page.waitForResponse(response => response.url().endsWith("/api/auth/sign-up/email") && response.request().method() === "POST");
    await page.locator('button[type="submit"]').click();
    return await submitted;
  });
  expect(response.ok()).toBe(true);
  await completeSignupEmailVerification(page, email, password);
  await expect(page).toHaveURL(/\/onboarding\/business$/);
}

test("the continue button stays pending until the next onboarding step is on screen", async ({ page }, testInfo) => {
  await signUp(page, "continue", testInfo);

  // The save resolves long before the next step finishes loading. Holding the
  // step's payload back widens that window so a regression is unmissable: the
  // button used to drop back to Continue and sit there until the page changed.
  await page.route(url => url.pathname.endsWith("/onboarding/website"), async route => {
    await new Promise(resolve => setTimeout(resolve, 3_000));
    await route.continue();
  });

  await page.getByLabel("Business name").fill(`${prefix} continue`);
  const saved = page.waitForResponse(response => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect((await saved).ok()).toBe(true);

  // Still on the first step, with the save already done: the whole gap this
  // test exists for.
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeHidden();

  await expect(page).toHaveURL(/\/onboarding\/website$/, { timeout: 30_000 });
});
