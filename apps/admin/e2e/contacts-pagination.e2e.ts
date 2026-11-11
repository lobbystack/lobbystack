import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, contacts, createDatabaseClient, users, withBusinessTransaction } from "@lobbystack/db";
import translations from "../public/locales/fr/contacts.json" with { type: "json" };

import { migrator, removeFixtures, signUp } from "./fixtures/full-stack";

test("contacts paginate, edit and delete standalone tenant records", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const fixtures = migrator(); const worker = createDatabaseClient("lobbystack_worker"); const auth = createDatabaseClient("lobbystack_auth"); const businessId = randomUUID();
  const context = await browser.newContext({ locale: "fr" });
  const page = await context.newPage();
  let email: string | undefined;
  try {
    // The signup page also saves French as the operator's own language.
    const operator = await signUp(page, testInfo, "contacts-pagination", { locale: "fr" });
    email = operator.email;
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `contacts-browser-${businessId}`, name: "Contacts certification", timezone: "UTC", businessType: "clinic", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId: operator.userId, role: "business_owner", status: "active" });
      await tx.insert(contacts).values(Array.from({ length: 101 }, (_, index) => ({ businessId, name: index === 100 ? "Unique oldest contact" : `Contact ${index}`, phone: `+1416555${String(index).padStart(4,"0")}`, createdAt: new Date(Date.UTC(2026,0,1,12,0,101-index)) })));
    });
    await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, operator.userId));
    await page.goto(`${baseURL}/contacts`);
    await expect(page.getByRole("button", { name: translations.table.actions.moreOptions })).toHaveCount(10);
    await page.getByRole("button", { name: translations.pagination.lastPage, exact: true }).click();
    await expect(page.getByText("Unique oldest contact", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: translations.table.actions.moreOptions })).toHaveCount(1);
    await expect(page.getByRole("button", { name: translations.pagination.nextPage, exact: true })).toBeDisabled();
    await page.getByRole("button", { name: translations.pagination.firstPage, exact: true }).click();
    await expect(page.getByText("Unique oldest contact", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: translations.pagination.lastPage, exact: true }).click();
    await expect(page.getByText("Unique oldest contact", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: translations.table.actions.moreOptions })).toHaveCount(1);
    await page.getByRole("button", { name: translations.table.actions.moreOptions }).click();
    await page.getByRole("menuitem", { name: translations.table.actions.editContact }).click();
    const editor = page.getByRole("dialog");
    await expect(editor.getByLabel(translations.edit.name)).toHaveValue("Unique oldest contact");
    await editor.getByLabel(translations.edit.name).fill("Corrected contact name");
    await editor.getByLabel(translations.edit.email).fill("corrected@example.com");
    await editor.getByRole("button", { name: translations.edit.save, exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByText("Corrected contact name", { exact: true })).toBeVisible();
    await expect(page.getByText("corrected@example.com")).toBeVisible();
    await page.getByRole("button", { name: translations.table.actions.moreOptions }).click();
    await page.getByRole("menuitem", { name: translations.table.actions.deleteContact }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: translations.table.actions.deleteConfirm }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByText("Corrected contact name", { exact: true })).toHaveCount(0);
    const result = await context.request.get(`${baseURL}/api/contacts?businessId=${businessId}&limit=100`);
    expect(result.ok()).toBeTruthy();
    expect((await result.json()).pagination.total).toBe(100);
  } finally {
    await context.close();
    await removeFixtures(fixtures, { emails: email ? [email] : [], businessIds: [businessId] });
    await Promise.all([auth.pool.end(), worker.pool.end(), fixtures.pool.end()]);
  }
});
