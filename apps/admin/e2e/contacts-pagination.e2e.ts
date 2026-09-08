import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, contacts, createDatabaseClient, users, withBusinessTransaction } from "@lobbystack/db";
import translations from "../public/locales/fr/contacts.json" with { type: "json" };

test("contacts paginate, search and delete standalone tenant records", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR; const userId = process.env.PARITY_OPERATOR_USER_ID;
  test.skip(!state || !userId, "Requires a disposable authenticated operator fixture.");
  const worker = createDatabaseClient("lobbystack_worker"); const auth = createDatabaseClient("lobbystack_auth"); const businessId = randomUUID();
  const original = (await auth.db.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId!)))[0];
  const context = await browser.newContext({ storageState: state!, locale: "fr" });
  try {
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `contacts-browser-${businessId}`, name: "Contacts certification", timezone: "UTC", businessType: "clinic", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId: userId!, role: "business_owner", status: "active" });
      await tx.insert(contacts).values(Array.from({ length: 101 }, (_, index) => ({ businessId, name: index === 100 ? "Unique oldest contact" : `Contact ${index}`, phone: `+1416555${String(index).padStart(4,"0")}`, createdAt: new Date(Date.UTC(2026,0,1,12,0,101-index)) })));
    });
    await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id,userId!));
    const page = await context.newPage(); await page.goto(`${baseURL}/contacts`);
    await expect(page.getByRole("button", { name: translations.table.actions.moreOptions })).toHaveCount(10);
    await page.getByRole("button", { name: translations.pagination.lastPage, exact: true }).click();
    await expect(page.getByText("Unique oldest contact", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: translations.table.actions.moreOptions })).toHaveCount(1);
    await expect(page.getByRole("button", { name: translations.pagination.nextPage, exact: true })).toBeDisabled();
    await page.getByRole("button", { name: translations.pagination.firstPage, exact: true }).click();
    await expect(page.getByText("Unique oldest contact", { exact: true })).toHaveCount(0);
    await page.getByPlaceholder(translations.page.searchPlaceholder).fill("Unique oldest");
    await expect(page.getByText("Unique oldest contact", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: translations.table.actions.moreOptions })).toHaveCount(1);
    await expect(page.getByRole("button", { name: translations.pagination.nextPage, exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: translations.table.actions.moreOptions }).click();
    await page.getByRole("menuitem", { name: translations.table.actions.deleteContact }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: translations.table.actions.deleteConfirm }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByText("Unique oldest contact", { exact: true })).toHaveCount(0);
    const result = await context.request.get(`${baseURL}/api/contacts?businessId=${businessId}&limit=100`);
    expect(result.ok()).toBeTruthy();
    expect((await result.json()).pagination.total).toBe(100);
  } finally {
    await context.close();
    await auth.db.update(users).set({ activeBusinessId: original?.activeBusinessId ?? null }).where(eq(users.id,userId!));
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.delete(businesses).where(eq(businesses.id,businessId)));
    await Promise.all([auth.pool.end(),worker.pool.end()]);
  }
});
