import { expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";

import { createDatabaseClient, outboxMessages, users } from "@lobbystack/db";

export async function isolateAuthRateLimit(page: Page, email: string): Promise<void> {
  const digest = createHash("sha256").update(email).digest();
  await page.setExtraHTTPHeaders({ "x-real-ip": `198.18.${digest.readUInt8(0)}.${digest.readUInt8(1)}` });
}

export async function completeSignupEmailVerification(page: Page, email: string): Promise<void> {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("The disposable E2E database is required for email verification.");

  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  let code: string | undefined;
  try {
    await expect.poll(async () => {
      const user = (await database.db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, email)).limit(1))[0];
      if (!user) return null;
      const message = (await database.db.select({ payload: outboxMessages.payload })
        .from(outboxMessages)
        .where(eq(outboxMessages.aggregateId, user.id))
        .orderBy(desc(outboxMessages.createdAt))
        .limit(1))[0];
      code = (message?.payload.variables as { code?: string } | undefined)?.code;
      return code ?? null;
    }, { timeout: 10_000, message: "Wait for the signup verification email to reach the disposable outbox." }).toMatch(/^\d{6}$/);
  } finally {
    await database.pool.end();
  }
  if (!code) throw new Error("The signup verification email did not contain a code.");

  await expect(page.locator("#verification-code")).toBeVisible();
  await page.locator("#verification-code").fill(code);
  const verificationResponsePromise = page.waitForResponse(response => response.url().endsWith("/api/auth/email-otp/verify-email") && response.request().method() === "POST");
  const signInResponsePromise = page.waitForResponse(response => response.url().endsWith("/api/auth/sign-in/email") && response.request().method() === "POST");
  await page.locator('button[type="submit"]').click();
  const verificationResponse = await verificationResponsePromise;
  expect(verificationResponse.ok()).toBe(true);
  const signInResponse = await signInResponsePromise;
  expect(signInResponse.ok()).toBe(true);
}
