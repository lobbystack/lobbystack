import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lobbystack/db";

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
  await page.getByLabel("Name").fill(`Replacement ${identity}`);
  await page.getByLabel("Email").fill(`${prefix}-${identity}@example.invalid`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
}

async function createWorkspace(page: Page, identity: string): Promise<string> {
  const slug = `${prefix}-${identity}`;
  await page.goto("/onboarding/business");
  await page.getByLabel("Business name").fill(`Replacement ${identity} Workspace`);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Timezone").fill("America/Toronto");
  await page.getByRole("button", { name: "Create and continue" }).click();
  await expect(page).toHaveURL("/onboarding/website");
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/businesses", { credentials: "include" });
    return await response.json() as { businesses: Array<{ businessId: string; active: boolean }> };
  });
  const workspace = result.businesses.find((business) => business.active) ?? result.businesses[0];
  if (!workspace) throw new Error("Created workspace was not returned by the API.");
  return workspace.businessId;
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
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Workspace" })).toContainText("Replacement owner-a Workspace");
  await expect(page.getByText("Authenticated SSE")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
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

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const revokedStatus = await page.evaluate(async () => (await fetch("/api/businesses", { credentials: "include" })).status);
  expect(revokedStatus).toBe(401);
});
