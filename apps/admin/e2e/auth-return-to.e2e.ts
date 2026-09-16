import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createDatabaseClient, users } from "@lobbystack/db";

test("signup and login preserve a demo claim return destination", async ({ browser, baseURL }) => {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("Disposable E2E database required.");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  const email = `return-to-${randomUUID()}@example.invalid`;
  const password = "Return-To-Certification-123!";
  const context = await browser.newContext({ locale: "en" });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/signup?returnTo=%2Fclaim-demo`);
    await expect(page.locator('a[href="/login?returnTo=%2Fclaim-demo"]')).toBeVisible();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) await expect.poll(() => page.evaluate(() => {
      const challenge = (window as unknown as { turnstile?: { getResponse?: () => string } }).turnstile;
      try { return Boolean(challenge?.getResponse?.()); } catch { return false; }
    }), { timeout: 20000 }).toBe(true);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(`${baseURL}/claim-demo`);
    const signedOut = await context.request.post(`${baseURL}/api/auth/sign-out`, { headers: { Origin: baseURL!, "Sec-Fetch-Site": "same-origin" }, data: {} });
    expect(signedOut.status()).toBe(200);
    await context.clearCookies();
    await page.goto(`${baseURL}/login?returnTo=%2Fclaim-demo`);
    await expect(page.locator('a[href="/signup?returnTo=%2Fclaim-demo"]')).toBeVisible();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(`${baseURL}/claim-demo`);
  } finally {
    await context.close();
    await database.db.delete(users).where(eq(users.normalizedEmail, email));
    await database.pool.end();
  }
});
