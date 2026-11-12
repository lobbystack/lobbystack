import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { users } from "@lobbystack/db";
import { marketingUnsubscribeToken } from "@lobbystack/domain";

import authCopy from "../public/locales/en/auth.json" with { type: "json" };
import frAuthCopy from "../public/locales/fr/auth.json" with { type: "json" };

import { migrator, removeFixtures } from "./fixtures/full-stack";

// The Unsubscribe link in a marketing email's footer, opened signed out. The
// spec signs the link as the worker does, with the server's ENCRYPTION_KEY,
// which playwright.config.ts shares with this process.

const copy = authCopy.unsubscribe;

test("a person unsubscribes from marketing emails from the email's link, then resubscribes", async ({ page }) => {
  const database = migrator();
  const email = `unsubscribe-${randomUUID()}@example.invalid`;
  const userId = randomUUID();
  try {
    await database.db.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner", emailVerified: true });
    const unsubscribedAt = async () => (await database.db.select({ at: users.marketingEmailsUnsubscribedAt }).from(users).where(eq(users.id, userId)))[0]?.at ?? null;
    const token = marketingUnsubscribeToken(userId);

    await page.goto(`/en/unsubscribe/${token}`);
    await expect(page.getByRole("heading", { name: copy.confirm.title })).toBeVisible();
    await expect(page.getByText(copy.confirm.description)).toBeVisible();
    // Opening the page changes nothing: a mail scanner opens links too.
    expect(await unsubscribedAt()).toBeNull();

    await page.getByRole("button", { name: copy.unsubscribe, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.done.title })).toBeVisible();
    expect(await unsubscribedAt()).not.toBeNull();

    // Coming back shows where they stand, and offers to resubscribe.
    await page.reload();
    await expect(page.getByRole("heading", { name: copy.done.title })).toBeVisible();
    await page.getByRole("button", { name: copy.resubscribe }).click();
    await expect(page.getByRole("heading", { name: copy.resubscribed.title })).toBeVisible();
    expect(await unsubscribedAt()).toBeNull();

    // A mail app's one-click unsubscribe: a form POST with no cookies and no Origin.
    const oneClick = await page.request.post(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`, { form: { "List-Unsubscribe": "One-Click" }, headers: { origin: "" } });
    expect(oneClick.status()).toBe(200);
    expect(await unsubscribedAt()).not.toBeNull();

    // In French, from the French link, in the browser that just saw the English page.
    await page.goto(`/fr/unsubscribe/${token}`);
    await expect(page.getByRole("heading", { name: frAuthCopy.unsubscribe.done.title })).toBeVisible();
    await expect(page.getByRole("button", { name: frAuthCopy.unsubscribe.resubscribe })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    // A link that was changed unsubscribes nobody.
    await page.goto(`/en/unsubscribe/${token.slice(0, -2)}xx`);
    await expect(page.getByRole("heading", { name: copy.invalid.title })).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
  } finally {
    await removeFixtures(database, { emails: [email], businessIds: [] });
    await database.pool.end();
  }
});
