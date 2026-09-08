import { expect, test } from "@playwright/test";

test("a missing French namespace still uses the English fallback", async ({ page }) => {
  await page.route("**/locales/fr/auth.json", route => route.fulfill({ status: 404, body: "Unavailable" }));
  await page.route("**/api/preferences/locale", route => route.fulfill({ status: 401, body: "{}" }));
  await page.goto("/login?lng=fr");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer le chargement" })).toHaveCount(0);
});

test("translation failure exposes a retry and preserves French startup", async ({ page }) => {
  let failed = true;
  const namespaces = new Set<string>();
  await page.route("**/locales/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    namespaces.add(pathname.split("/").at(-1)!);
    if (failed && pathname.endsWith("/auth.json")) await route.fulfill({ status: 404, body: "Unavailable" });
    else await route.continue();
  });
  // Keep this public-page check independent of authenticated preferences.
  await page.route("**/api/preferences/locale", route => route.fulfill({ status: 401, body: "{}" }));
  await page.goto("/login?lng=fr");
  await expect(page.getByRole("button", { name: "Réessayer le chargement" })).toBeVisible();
  await expect(page.getByLabel("Courriel", { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Réessayer le chargement" }).click();
  await expect(page.getByRole("heading", { name: "Bon retour" })).toBeVisible();
  await expect(page.getByLabel("Courriel", { exact: true })).toBeVisible();
  // Shared auth UI also uses onboarding copy; dashboard data namespaces stay deferred.
  expect(namespaces.has("auth.json")).toBe(true);
  for (const namespace of ["dashboard.json", "calls.json", "contacts.json", "knowledge.json"]) expect(namespaces.has(namespace)).toBe(false);
  await page.goto("/login?lng=en");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
