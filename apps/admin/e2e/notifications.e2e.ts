import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { businesses, createDatabaseClient, knowledgeDocuments, withBusinessTransaction } from "@lobbystack/db";
import { markKnowledgeDocumentFailed, PRODUCT_UPDATE_ENTRIES, postProductUpdates } from "@lobbystack/domain";

import navCopy from "../public/locales/en/nav.json" with { type: "json" };

import { migrator, removeFixtures, signUpOwner, type Migrator } from "./fixtures/full-stack";

// The notification bell beside the business switcher. A website import that
// failed reaches it through the worker's own code path, and a changelog entry
// marked notify: true reaches it through the worker's hourly job. The spec
// runs both against the worker role, since no worker runs here.

const prefix = "notifications";

/** A dashboard website import the crawl gave up on, failed the way the worker fails it. */
async function failWebsiteImport(businessId: string): Promise<void> {
  const worker = createDatabaseClient("lobbystack_worker");
  try {
    const [document] = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      return await tx.insert(knowledgeDocuments).values({ businessId, sourceType: "website", title: "www.example.invalid", sourceUrl: "https://www.example.invalid/", status: "processing" }).returning({ id: knowledgeDocuments.id });
    });
    await markKnowledgeDocumentFailed({ db: worker.db }, { businessId, documentId: document!.id, error: "Website crawling failed.", websiteImport: { url: "https://www.example.invalid/" } });
  } finally {
    await worker.pool.end();
  }
}

/** Runs the worker's product update job for the business as of the day after the slice 7 entries' release. */
async function postChangelogUpdates(database: Migrator, businessId: string): Promise<string[]> {
  // Product updates reach hosted businesses only.
  await database.db.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
  const latest = PRODUCT_UPDATE_ENTRIES.at(-1)!;
  const worker = createDatabaseClient("lobbystack_worker");
  try {
    return await postProductUpdates({ db: worker.db }, { businessId, entries: [latest], now: new Date(Date.parse(latest.pubDate) + 60 * 60_000) });
  } finally {
    await worker.pool.end();
  }
}

const bellButton = (page: Page) => page.locator("[data-notification-bell]:visible");

test("an owner sees a failed website import in the bell, opens Knowledge from it, and marks everything read", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    // The business is created now, before the entries' release, so the job posts them.
    await database.db.update(businesses).set({ createdAt: new Date(Date.parse(PRODUCT_UPDATE_ENTRIES.at(-1)!.pubDate) - 86_400_000) }).where(eq(businesses.id, owner.businessId));
    await failWebsiteImport(owner.businessId);
    const posted = await postChangelogUpdates(database, owner.businessId);
    expect(posted).toEqual([PRODUCT_UPDATE_ENTRIES.at(-1)!.slug]);

    await page.goto("/");
    const bell = bellButton(page);
    await expect(bell).toHaveAccessibleName(navCopy.notifications.bellUnread_other.replace("{{count}}", "2"));
    await expect(bell.locator("[data-unread-dot]")).toBeVisible();

    await bell.click();
    const panel = page.locator("[data-notification-panel]");
    await expect(panel.getByText(navCopy.notifications.title, { exact: true })).toBeVisible();
    const rows = panel.locator("[data-kind]");
    // Action required comes first, then the update.
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute("data-kind", "website_import_failed");
    await expect(rows.nth(0)).toContainText(navCopy.notifications.kinds.website_import_failed.title.replace("{{site}}", "example.invalid"));
    await expect(rows.nth(0)).toContainText(navCopy.notifications.kinds.website_import_failed.line);
    await expect(rows.nth(1)).toHaveAttribute("data-kind", "product_update");
    await expect(rows.nth(1)).toContainText(PRODUCT_UPDATE_ENTRIES.at(-1)!.copy.en.title);

    // Clicking the item marks it read and opens Knowledge.
    const read = page.waitForResponse((response) => response.url().includes("/api/notifications/read") && response.request().method() === "POST");
    await rows.nth(0).click();
    expect((await read).ok()).toBe(true);
    await expect(page).toHaveURL(/\/business\/knowledge$/);
    await expect(bell).toHaveAccessibleName(navCopy.notifications.bellUnread_one.replace("{{count}}", "1"));

    // The failed import stays listed, read, until an import works. Mark all as read clears the dot.
    await bell.click();
    await expect(rows.nth(0)).toHaveAttribute("data-read", "");
    await panel.getByRole("button", { name: navCopy.notifications.markAllRead }).click();
    await expect(bell).toHaveAccessibleName(navCopy.notifications.bell);
    await expect(bell.locator("[data-unread-dot]")).toHaveCount(0);
    await expect(rows).toHaveCount(2);

    // It stays read after a reload: the server keeps each person's reads.
    await page.reload();
    await expect(bellButton(page)).toHaveAccessibleName(navCopy.notifications.bell);
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});

// Screenshots for review: NOTIFICATIONS_SCREENSHOTS_DIR=<dir> runs this, light and dark, desktop and phone, with items and empty.
test("the bell's panel, for screenshots", async ({ browser }, testInfo) => {
  const directory = process.env.NOTIFICATIONS_SCREENSHOTS_DIR;
  test.skip(!directory, "Set NOTIFICATIONS_SCREENSHOTS_DIR to save screenshots.");
  test.setTimeout(240_000);
  mkdirSync(directory!, { recursive: true });
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    for (const filled of [false, true]) {
      for (const colorScheme of ["light", "dark"] as const) {
        for (const device of ["desktop", "phone"] as const) {
          const context = await browser.newContext({ colorScheme, viewport: device === "phone" ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
          const page = await context.newPage();
          const owner = await signUpOwner(database, page, testInfo, `${prefix}-${device}`);
          emails.push(owner.email);
          businessIds.push(owner.businessId);
          if (filled) {
            await database.db.update(businesses).set({ createdAt: new Date(Date.parse(PRODUCT_UPDATE_ENTRIES[0]!.pubDate) - 86_400_000), deploymentMode: "cloud" }).where(eq(businesses.id, owner.businessId));
            await failWebsiteImport(owner.businessId);
            const worker = createDatabaseClient("lobbystack_worker");
            await postProductUpdates({ db: worker.db }, { businessId: owner.businessId, entries: PRODUCT_UPDATE_ENTRIES, now: new Date(Date.parse(PRODUCT_UPDATE_ENTRIES[0]!.pubDate) + 3 * 60 * 60_000) });
            await worker.pool.end();
          }
          await page.goto("/");
          if (device === "phone") {
            await page.getByRole("navigation", { name: navCopy.mobileNav.label, exact: true }).getByRole("button", { name: navCopy.mobileNav.menu, exact: true }).click();
          }
          await bellButton(page).click();
          await expect(page.locator("[data-notification-panel]")).toBeVisible();
          await expect(page.locator(filled ? "[data-notification-panel] [data-kind]" : "[data-notifications-empty]").first()).toBeVisible();
          await page.waitForTimeout(400);
          await page.screenshot({ path: path.join(directory!, `bell-${filled ? "items" : "empty"}-${device}-${colorScheme}.png`) });
          await context.close();
        }
      }
    }
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
