import { expect, test } from "@playwright/test";

import { interfaceLocaleTags } from "@lobbystack/shared";

import enAuthCopy from "../public/locales/en/auth.json" with { type: "json" };
import frAuthCopy from "../public/locales/fr/auth.json" with { type: "json" };
import srAuthCopy from "../public/locales/sr/auth.json" with { type: "json" };

// A signed-out page shows the language in its URL, even in a browser that has
// already been on a page in another language and remembers it.

test("a signed-out page follows its URL's language after the browser saw another one", async ({ page }) => {
  await page.goto("/en/login");
  await expect(page.getByRole("heading", { name: enAuthCopy.login.title })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", interfaceLocaleTags.en);

  await page.goto("/fr/check-in/not-a-token");
  await expect(page.getByRole("heading", { name: frAuthCopy.checkIn.invalid.title })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", interfaceLocaleTags.fr);

  await page.goto("/en/unsubscribe/not-a-token");
  await expect(page.getByRole("heading", { name: enAuthCopy.unsubscribe.invalid.title })).toBeVisible();

  await page.goto("/fr/unsubscribe/not-a-token");
  await expect(page.getByRole("heading", { name: frAuthCopy.unsubscribe.invalid.title })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", interfaceLocaleTags.fr);

  // Serbian is written in Latin script, so the page says so.
  await page.goto("/sr/unsubscribe/not-a-token");
  await expect(page.getByRole("heading", { name: srAuthCopy.unsubscribe.invalid.title })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "sr-Latn");

  await page.goto("/fr/login");
  await expect(page.getByRole("heading", { name: frAuthCopy.login.title })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", interfaceLocaleTags.fr);
});
