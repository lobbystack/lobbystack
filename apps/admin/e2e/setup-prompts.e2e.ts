import { expect, test, type Page } from "@playwright/test";

import { setupPromptCopy, setupPrompts, type InterfaceLocale, type SetupPromptId } from "@lobbystack/shared";

import { getCopy } from "../src/marketing/i18n";
import { COOKIE_CONSENT_STORAGE_KEY, COOKIE_CONSENT_VERSION } from "../src/marketing/lib/cookie-consent";

// The marketing site's copy-prompt buttons in a real browser: each button puts
// its own English prompt on the clipboard, in every language the page has.
// Mintlify hosts the Help Center's buttons, so this suite can't reach them.
// scripts/write-setup-prompts.test.ts keeps their text equal to the same source.

const site = `http://lobbystack.localhost:${new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:13000").port || "13000"}`;

const surfaces: { path: string; locale: InterfaceLocale; prompts: SetupPromptId[] }[] = [
  { path: "/features/mcp/", locale: "en", prompts: ["no-code", "saas", "white-label"] },
  { path: "/fr/features/mcp/", locale: "fr", prompts: ["no-code", "saas", "white-label"] },
  { path: "/white-label/", locale: "en", prompts: ["white-label", "partner"] },
  { path: "/es/white-label/", locale: "es", prompts: ["white-label", "partner"] },
  { path: "/sr/white-label/", locale: "sr", prompts: ["white-label", "partner"] },
  { path: "/solutions/self-hosted-ai-receptionist/", locale: "en", prompts: ["self-host"] },
];

async function open(page: Page, path: string): Promise<void> {
  // Decided already, so the cookie banner doesn't sit over the buttons.
  await page.addInitScript(([key, value]) => localStorage.setItem(key as string, value as string), [
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify({ analytics: false, decidedAt: "2026-11-01T00:00:00.000Z", version: COOKIE_CONSENT_VERSION }),
  ]);
  await page.goto(`${site}${path}`, { waitUntil: "networkidle" });
}

const card = (page: Page, title: string) => page.locator("#setup-prompts li").filter({ hasText: title });

for (const { path, locale, prompts } of surfaces) {
  test(`${path} copies each prompt`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: site });
    await open(page, path);
    await expect(page.locator("#setup-prompts li")).toHaveCount(prompts.length);

    for (const id of prompts) {
      const { copy, copied } = getCopy(locale).setupPrompts;
      const button = card(page, setupPromptCopy[locale][id].title).getByRole("button");
      await expect(button).toHaveText(copy);
      await button.click();
      await expect(button).toHaveText(copied);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(setupPrompts[id]);
      await expect(button).toHaveText(copy, { timeout: 5_000 });
    }
  });
}

test("keeps the prompt out of the page until the clipboard refuses it", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("blocked"));
  });
  await open(page, "/features/mcp/");

  const labels = getCopy("en").setupPrompts;
  const saas = card(page, setupPromptCopy.en.saas.title);
  await expect(page.locator("#setup-prompts textarea")).toHaveCount(0);
  await expect(page.locator("#setup-prompts")).not.toContainText(setupPrompts.saas.split("\n")[0] ?? "");

  await saas.getByRole("button").click();
  await expect(saas.getByLabel(labels.blocked)).toHaveValue(setupPrompts.saas);
  await expect(saas.getByRole("button")).toHaveText(labels.copy);
});

test("stacks the button under its text at phone width, without side scrolling", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: site });
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "/features/mcp/");

  const noCode = card(page, setupPromptCopy.en["no-code"].title);
  const description = await noCode.getByText(setupPromptCopy.en["no-code"].description).boundingBox();
  const button = await noCode.getByRole("button").boundingBox();
  expect(button?.y).toBeGreaterThan((description?.y ?? 0) + (description?.height ?? 0) - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await noCode.getByRole("button").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(setupPrompts["no-code"]);
});
