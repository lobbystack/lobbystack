import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, createDatabaseClient, users, withBusinessTransaction } from "@lobbystack/db";
import enCommon from "../public/locales/en/common.json" with { type: "json" };
import enSettings from "../public/locales/en/settings.json" with { type: "json" };
import fr from "../public/locales/fr/contacts.json" with { type: "json" };
import frDashboard from "../public/locales/fr/dashboard.json" with { type: "json" };
import frSettings from "../public/locales/fr/settings.json" with { type: "json" };

import { migrator, removeFixtures, signUp } from "./fixtures/full-stack";

test("server-provided French auth copy survives unavailable client translation files", async ({ page }) => {
  const requested = new Set<string>();
  await page.route("**/locales/**", route => { requested.add(new URL(route.request().url()).pathname.split("/").at(-1)!); return route.fulfill({ status: 404, body: "Unavailable" }); });
  await page.route("**/api/preferences/locale", route => route.fulfill({ status: 401, body: "{}" }));
  await page.goto("/fr/login");
  await expect(page.getByRole("heading", { name: "Bon retour" })).toBeVisible();
  await expect(page.getByLabel("Courriel", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer le chargement" })).toHaveCount(0);
  for (const namespace of ["dashboard.json", "calls.json", "contacts.json", "knowledge.json"]) expect(requested.has(namespace)).toBe(false);
});

test("the first dashboard page ships every translation, so startup and section changes request no locale files", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const fixtures = migrator();
  const worker = createDatabaseClient("lobbystack_worker");
  const auth = createDatabaseClient("lobbystack_auth");
  const businessId = randomUUID();
  const context = await browser.newContext({ locale: "fr" });
  const page = await context.newPage();
  let email: string | undefined;
  try {
    // The signup page also saves French as the operator's own language.
    const operator = await signUp(page, testInfo, "performance-startup", { locale: "fr" });
    email = operator.email;
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `performance-startup-${businessId}`, name: "Performance startup", timezone: "UTC", businessType: "clinic", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId: operator.userId, role: "business_owner", status: "active" });
    });
    await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, operator.userId));

    // The dashboard layout ships all of its namespaces with the first page, so
    // neither the first paint nor a later section asks for a locale file.
    const requested: string[] = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/locales/")) requested.push(path);
    });
    await page.goto(`${baseURL}/?lng=fr`);
    await expect(page.getByRole("heading", { name: frDashboard.home.title, exact: true })).toBeVisible();
    await page.locator('a[href="/contacts"]').first().click();
    await expect(page.getByRole("heading", { name: fr.page.title, exact: true })).toBeVisible();
    expect(requested).toEqual([]);
  } finally {
    await context.close();
    await removeFixtures(fixtures, { emails: email ? [email] : [], businessIds: [businessId] });
    await Promise.all([auth.pool.end(), worker.pool.end(), fixtures.pool.end()]);
  }
});

test("switching the dashboard language loads the new language late", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const fixtures = migrator();
  const worker = createDatabaseClient("lobbystack_worker");
  const auth = createDatabaseClient("lobbystack_auth");
  const businessId = randomUUID();
  const context = await browser.newContext({ locale: "en" });
  const page = await context.newPage();
  let email: string | undefined;
  try {
    const operator = await signUp(page, testInfo, "performance-language", { locale: "en" });
    email = operator.email;
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `performance-language-${businessId}`, name: "Performance language", timezone: "UTC", businessType: "clinic", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId: operator.userId, role: "business_owner", status: "active" });
    });
    await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, operator.userId));

    await page.goto(`${baseURL}/settings/appearance`);
    await expect(page.getByText(enSettings.appearance.language.label, { exact: true })).toBeVisible();
    // The bundles for another language were never part of the first page.
    let requested = 0;
    page.on("request", request => { if (/\/locales\/fr\/[^/]+\.json$/.test(new URL(request.url()).pathname)) requested++; });
    await page.getByRole("combobox", { name: enCommon.language.ariaLabel }).click();
    await page.getByRole("option", { name: enCommon.language.french, exact: true }).click();
    await expect(page.getByText(frSettings.appearance.language.label, { exact: true })).toBeVisible();
    expect(requested).toBeGreaterThan(0);
  } finally {
    await context.close();
    await removeFixtures(fixtures, { emails: email ? [email] : [], businessIds: [businessId] });
    await Promise.all([auth.pool.end(), worker.pool.end(), fixtures.pool.end()]);
  }
});
