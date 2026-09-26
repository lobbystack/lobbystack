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
  // Playwright retries in CI, and a retry that reuses the address finds the
  // account already made and waits forever for a signup email nobody sent.
  const email = `${prefix}-${identity}-${testInfo.retry}@example.invalid`;
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
  // Signup runs a full email round trip, and the gate runs these files in
  // parallel, so the default per-test budget is not enough.
  test.setTimeout(120_000);
  await signUp(page, "continue", testInfo);

  // Hold the next step open instead of delaying it by a fixed amount. The save
  // resolves while this is still parked, so the gap the regression lived in
  // lasts exactly as long as the assertions below need it to.
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(url => url.pathname.endsWith("/onboarding/website"), async route => {
    await held;
    await route.continue();
  });

  // The step disables its button while it looks up the workspace, so wait for
  // the form to be ready rather than racing that query.
  const submit = page.getByRole("button", { name: "Continue", exact: true });
  await page.getByLabel("Business name").fill(`${prefix} continue`);
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  const saved = page.waitForResponse(response => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await submit.click();
  expect((await saved).ok()).toBe(true);

  // Sampling once here proves nothing: the button still holds its submitting
  // label for a render or two after the save resolves even when the bug is
  // present. Give React time to settle first, with the step still held back.
  await page.waitForTimeout(1_000);
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();

  release();
  await expect(page).toHaveURL(/\/onboarding\/website$/, { timeout: 30_000 });
});
