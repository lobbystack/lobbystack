import { respectingAuthRateLimit } from "./fixtures/auth-rate-limit";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { accounts, createDatabaseClient, outboxMessages, users, verifications } from "@lobbystack/db";
import { hashReplacementPassword } from "../src/lib/password";

// Run only with the local worker paused: this reads the disposable reset email outbox.
test("password recovery completes through the original form and revokes the old session", async ({ page, request }) => {
  test.setTimeout(180_000);
  test.skip(process.env.PASSWORD_RECOVERY_E2E === undefined, "Enable with a disposable database and paused worker.");
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("The disposable E2E database is required.");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  const id = randomUUID();
  const email = `recovery-e2e-${id}@example.invalid`;
  const oldPassword = "Recovery-Old-Password-123!";
  const newPassword = "Recovery-New-Password-456!";
  try {
    const password = await hashReplacementPassword(oldPassword);
    await database.db.insert(users).values({ id, email, normalizedEmail: email, emailVerified: true, passwordHash: password });
    await database.db.insert(accounts).values({ userId: id, providerId: "credential", accountId: id, password });
    expect((await respectingAuthRateLimit(() => request.post("/api/auth/sign-in/email", { data: { email, password: oldPassword } }))).ok()).toBe(true);
    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send reset code", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Enter your reset code" })).toBeVisible();
    const row = (await database.db.select().from(outboxMessages).where(eq(outboxMessages.aggregateId, id)).orderBy(desc(outboxMessages.createdAt)).limit(1))[0];
    const code = (row?.payload.variables as { code?: string })?.code;
    if (!code) throw new Error("Reset email was not queued.");
    await page.locator("#reset-code").fill("wrong-code");
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("That reset code is invalid or expired. Try requesting a new one.")).toBeVisible();
    await page.locator("#reset-code").fill(code);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/onboarding\/business$/);
    expect(await (await request.get("/api/auth/get-session")).json()).toBeNull();
    expect((await respectingAuthRateLimit(() => request.post("/api/auth/sign-in/email", { data: { email, password: oldPassword } }))).status()).toBe(401);
    expect((await respectingAuthRateLimit(() => request.post("/api/auth/sign-in/email", { data: { email, password: newPassword } }))).ok()).toBe(true);
  } finally {
    await database.db.delete(outboxMessages).where(eq(outboxMessages.aggregateId, id));
    await database.db.delete(verifications).where(eq(verifications.identifier, `forget-password-otp-${email}`));
    await database.db.delete(users).where(eq(users.id, id));
    await database.pool.end();
  }
});
