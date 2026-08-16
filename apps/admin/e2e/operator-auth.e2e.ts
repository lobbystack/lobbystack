import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createDatabaseClient, onboardingPhoneVerifications, users } from "@lobbystack/db";

const password = "Replacement-E2E-Password-123!";
const prefix = "replacement-e2e";

async function cleanupFixtures(): Promise<void> {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (databaseUrl) {
    const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
    try {
      await database.db.execute(sql`delete from public.businesses where slug like ${`${prefix}-%`}`);
      await database.db.execute(sql`delete from public.users where email like ${`${prefix}-%@example.invalid`}`);
    } finally {
      await database.pool.end();
    }
    return;
  }
  if (!process.env.CI) {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const cleanup = spawnSync("docker", [
      "compose",
      "--env-file",
      `${root}/.env.replacement.example`,
      "-f",
      `${root}/docker-compose.replacement.yml`,
      "exec",
      "-T",
      "postgres",
      "psql",
      "--username",
      "postgres",
      "--dbname",
      "lobbystack",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      "DELETE FROM public.businesses WHERE slug LIKE 'replacement-e2e-%'; DELETE FROM public.users WHERE email LIKE 'replacement-e2e-%@example.invalid';",
    ], { cwd: root, encoding: "utf8" });
    if (cleanup.status !== 0) throw new Error(cleanup.stderr || cleanup.stdout || "Compose fixture cleanup failed.");
    return;
  }
  throw new Error("REPLACEMENT_E2E_DATABASE_URL is required for fixture cleanup.");
}

async function signUp(page: Page, identity: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${prefix}-${identity}@example.invalid`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding\/business$/);
}

async function markPhoneVerified(identity: string, businessId: string): Promise<void> {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("REPLACEMENT_E2E_DATABASE_URL is required.");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  try {
    const now = new Date();
    const user = (await database.db.update(users).set({ phone: "+14165550100", phoneVerifiedAt: now }).where(eq(users.email, `${prefix}-${identity}@example.invalid`)).returning({ id: users.id }))[0];
    if (!user) throw new Error("The signup fixture user was not created.");
    await database.db.insert(onboardingPhoneVerifications).values({ businessId, userId: user.id, phoneE164: "+14165550100", countryCode: "CA", lineType: "mobile", status: "approved", startedAt: now, expiresAt: now, approvedAt: now, requestFingerprint: `e2e:${identity}` });
  } finally {
    await database.pool.end();
  }
}

async function createWorkspace(page: Page, identity: string): Promise<string> {
  const slug = `${prefix}-${identity}`;
  await page.goto("/onboarding/business");
  await page.getByLabel("Business name").fill(`Replacement ${identity} Workspace`);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Timezone").fill("America/Toronto");
  await page.getByRole("button", { name: "Create and continue" }).click();
  const continueSetup = page.getByRole("button", { name: "Continue setup" });
  await page.waitForTimeout(500);
  if (await continueSetup.isVisible()) await continueSetup.click();
  if (!page.url().endsWith("/onboarding/website")) await page.goto("/onboarding/website");
  await expect(page).toHaveURL("/onboarding/website");
  await page.goto("/onboarding/attribution");
  await expect(page).toHaveURL("/onboarding/website");
  await page.reload();
  await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/businesses", { credentials: "include" });
    return await response.json() as { businesses: Array<{ businessId: string; active: boolean }> };
  });
  const workspace = result.businesses.find((business) => business.active) ?? result.businesses[0];
  if (!workspace) throw new Error("Created workspace was not returned by the API.");
  return workspace.businessId;
}

async function completeOnboardingBySkippingOptionalInputs(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL("/onboarding/knowledge");
  await page.goBack();
  await expect(page).toHaveURL("/onboarding/website");
  await page.goForward();
  await expect(page).toHaveURL("/onboarding/knowledge");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL("/onboarding/greeting");
  await page.getByLabel("Greeting").fill("Thanks for calling. How can we help?");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL("/onboarding/verify-phone");
  await page.getByRole("button", { name: "Reuse verified phone" }).click();
  await expect(page).toHaveURL("/onboarding/plan");
  await page.goto("/onboarding/plan?checkout=success");
  await expect(page.getByRole("status")).toContainText("Checkout completed");
  await page.getByRole("button", { name: "Skip number selection" }).click();
  await expect(page).toHaveURL("/onboarding/attribution");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL("/");
}

async function close(context: BrowserContext): Promise<void> {
  await context.close().catch(() => undefined);
}

test.beforeAll(cleanupFixtures);
test.afterAll(cleanupFixtures);

test("operator authentication, workspace access, isolation, and revocation", async ({ browser, page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await signUp(page, "owner-a");
  const ownBusinessId = await createWorkspace(page, "owner-a");
  await markPhoneVerified("owner-a", ownBusinessId);
  await completeOnboardingBySkippingOptionalInputs(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Replacement owner-a Workspace/ })).toBeVisible();

  await page.getByRole("button", { name: `${prefix}-owner-a@example.invalid` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(`${prefix}-owner-a@example.invalid`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  const foreignContext = await browser.newContext();
  try {
    const foreignPage = await foreignContext.newPage();
    await signUp(foreignPage, "owner-b");
    const foreignBusinessId = await createWorkspace(foreignPage, "owner-b");

    const isolation = await page.evaluate(async ({ own, foreign }) => {
      const [ownResponse, foreignResponse] = await Promise.all([
        fetch(`/api/dashboard?businessId=${encodeURIComponent(own)}`, { credentials: "include" }),
        fetch(`/api/dashboard?businessId=${encodeURIComponent(foreign)}`, { credentials: "include" }),
      ]);
      return { own: ownResponse.status, foreign: foreignResponse.status };
    }, { own: ownBusinessId, foreign: foreignBusinessId });
    expect(isolation).toEqual({ own: 200, foreign: 403 });
  } finally {
    await close(foreignContext);
  }

  await page.getByRole("button", { name: `${prefix}-owner-a@example.invalid` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const revokedStatus = await page.evaluate(async () => (await fetch("/api/businesses", { credentials: "include" })).status);
  expect(revokedStatus).toBe(401);
});
