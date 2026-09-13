import { expect, test } from "@playwright/test";
import en from "../public/locales/en/contacts.json" with { type: "json" };
import fr from "../public/locales/fr/contacts.json" with { type: "json" };

test("server-provided French auth copy survives unavailable client translation files", async ({ page }) => {
  const requested = new Set<string>();
  await page.route("**/locales/**", route => { requested.add(new URL(route.request().url()).pathname.split("/").at(-1)!); return route.fulfill({ status: 404, body: "Unavailable" }); });
  await page.route("**/api/preferences/locale", route => route.fulfill({ status: 401, body: "{}" }));
  await page.goto("/login?lng=fr");
  await expect(page.getByRole("heading", { name: "Bon retour" })).toBeVisible();
  await expect(page.getByLabel("Courriel", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer le chargement" })).toHaveCount(0);
  for (const namespace of ["dashboard.json", "calls.json", "contacts.json", "knowledge.json"]) expect(requested.has(namespace)).toBe(false);
});

test("a missing lazily loaded French namespace uses its English fallback", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR;
  test.skip(!state, "Requires a disposable French operator with completed onboarding.");
  const context = await browser.newContext({ storageState: state!, locale: "fr" });
  try {
    const page = await context.newPage();
    let intercepted = 0;
    await page.route("**/locales/fr/contacts.json", route => { intercepted++; return route.fulfill({ status: 404, body: "Unavailable" }); });
    await page.goto(`${baseURL}/?lng=fr`);
    // Client navigation keeps the root provider mounted. Unlike /login's
    // server-supplied auth bundle, contacts must really hit the mocked loader.
    await page.locator('a[href="/contacts"]').first().click();
    await expect.poll(() => intercepted).toBeGreaterThan(0);
    await expect(page.getByPlaceholder(en.page.searchPlaceholder)).toBeVisible();
    await expect(page.getByRole("button", { name: "Réessayer le chargement" })).toHaveCount(0);
  } finally { await context.close(); }
});

test("lazy translation failure exposes retry without changing the French locale", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR;
  test.skip(!state, "Requires a disposable French operator with completed onboarding.");
  const context = await browser.newContext({ storageState: state!, locale: "fr" });
  try {
    const page = await context.newPage();
    let failed = true;
    let intercepted = 0;
    await page.route("**/locales/*/contacts.json", route => {
      intercepted++;
      return failed ? route.fulfill({ status: 404, body: "Unavailable" }) : route.continue();
    });
    await page.goto(`${baseURL}/?lng=fr`);
    await page.locator('a[href="/contacts"]').first().click();
    await expect.poll(() => intercepted).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Réessayer le chargement" })).toBeVisible();
    await expect(page.getByPlaceholder(fr.page.searchPlaceholder)).toHaveCount(0);
    failed = false;
    await page.getByRole("button", { name: "Réessayer le chargement" }).click();
    await expect(page.getByPlaceholder(fr.page.searchPlaceholder)).toBeVisible();
    await expect(page.getByRole("button", { name: "Réessayer le chargement" })).toHaveCount(0);
  } finally { await context.close(); }
});
