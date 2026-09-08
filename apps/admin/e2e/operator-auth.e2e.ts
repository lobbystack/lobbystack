import { respectingAuthRateLimit } from "./fixtures/auth-rate-limit";
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
      `${root}/.env.example`,
      "-f",
      `${root}/docker-compose.yml`,
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
  await page.locator('input[type="email"]').fill(`${prefix}-${identity}@example.invalid`);
  await page.locator('input[type="password"]').fill(password);
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    await expect.poll(() => page.evaluate(() => {
      const challenge = (window as unknown as { turnstile?: { getResponse?: () => string } }).turnstile;
      try { return Boolean(challenge?.getResponse?.()); } catch { return false; }
    }), { timeout: 20_000, message: "Wait for the configured Turnstile test challenge before signup." }).toBe(true);
  }
  const response = await respectingAuthRateLimit(async () => {
    const submitted = page.waitForResponse(response => response.url().endsWith("/api/auth/sign-up/email") && response.request().method() === "POST");
    await page.locator('button[type="submit"]').click();
    return await submitted;
  });
  expect(response.ok()).toBe(true);
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

async function readOnboardingState(identity: string): Promise<{ businessId: string | null; stage: string | null }> {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("REPLACEMENT_E2E_DATABASE_URL is required.");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  try {
    const result = await database.db.execute<{ business_id: string | null; onboarding_stage: string | null }>(sql`
      select u.active_business_id as business_id, b.onboarding_stage
      from public.users u
      left join public.businesses b on b.id = u.active_business_id
      where u.email = ${`${prefix}-${identity}@example.invalid`}
      limit 1
    `);
    const row = result.rows[0];
    return { businessId: row?.business_id ?? null, stage: row?.onboarding_stage ?? null };
  } finally {
    await database.pool.end();
  }
}

async function createWorkspace(page: Page, identity: string): Promise<string> {
  await page.goto("/onboarding/business");
  await page.getByLabel("Business name").fill(`Replacement E2E ${identity}`);
  const createResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  await expect.poll(async () => await readOnboardingState(identity)).toEqual({ businessId: expect.any(String), stage: "website" });
  const continueSetup = page.getByRole("button", { name: "Continue setup" });
  await page.waitForTimeout(500);
  if (await continueSetup.isVisible()) await continueSetup.click();
  if (!page.url().endsWith("/onboarding/website")) await page.goto("/onboarding/website");
  await expect(page).toHaveURL("/onboarding/website");
  await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
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

async function completeOnboardingBySkippingOptionalInputs(page: Page, businessId: string): Promise<void> {
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
  const verificationAdvance = await page.evaluate(async (id) => {
    for (const stage of ["verify_phone_code", "plan"]) {
      const response = await fetch(`/api/onboarding/stage?businessId=${encodeURIComponent(id)}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: stage }),
      });
      if (!response.ok) return { ok: false, body: await response.text() };
    }
    return { ok: true, body: "" };
  }, businessId);
  expect(verificationAdvance.ok, verificationAdvance.body).toBe(true);
  await page.goto("/onboarding/plan");
  await expect(page).toHaveURL("/onboarding/plan");
  await page.goto("/onboarding/plan?checkout=success");
  await expect(page.getByRole("heading", { name: "Choose your plan", exact: true })).toBeVisible();
  await expect(page.getByText("Checkout completed", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL("/onboarding/plan?checkout=success");
  await page.getByRole("button", { name: "Start free" }).click();
  await expect(page).toHaveURL("/onboarding/attribution");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page).toHaveURL("/");
}

async function close(context: BrowserContext): Promise<void> {
  await context.close().catch(() => undefined);
}

test.beforeAll(cleanupFixtures);
test.afterAll(cleanupFixtures);

test("operator authentication, workspace access, isolation, and revocation", async ({ browser, page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await signUp(page, "owner-a");
  const ownBusinessId = await createWorkspace(page, "owner-a");
  await markPhoneVerified("owner-a", ownBusinessId);
  await completeOnboardingBySkippingOptionalInputs(page, ownBusinessId);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Replacement E2E owner-a/ })).toBeVisible();

  await page.goto("/agent/integrations");
  await expect(page).toHaveURL("/agent");
  await page.goto("/appointments");
  await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
  await expect(page.getByText("No upcoming appointments.")).toBeVisible();
  await page.goto("/demos");
  await expect(page.getByRole("heading", { name: "Prospect demos", exact: true })).toBeVisible();
  await expect(page.getByText("Prepare a demo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create isolated demo", exact: true })).toBeVisible();

  await page.getByRole("button", { name: `${prefix}-owner-a@example.invalid` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(`${prefix}-owner-a@example.invalid`);
  await page.locator('input[type="password"]').fill(password);
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


test("French signup retains the chosen locale through onboarding and reload", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem("lobbystack.locale", "fr"));
  await signUp(page, "french-owner");
  expect(await page.evaluate(async () => (await (await fetch("/api/preferences/locale")).json()).locale)).toBe("fr");
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("lobbystack.locale"))).toBe("fr");
  await expect(page.locator('button[type="submit"]')).toHaveText("Continuer");
});
