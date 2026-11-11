import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import { agents } from "@lobbystack/db";

import commonCopy from "../public/locales/en/common.json" with { type: "json" };
import navCopy from "../public/locales/en/nav.json" with { type: "json" };

import { migrator, removeFixtures, signUpOwner } from "./fixtures/full-stack";

// On a phone the dashboard has a bottom tab bar in place of the sidebar, and
// its Menu tab opens a full-screen sheet with the sidebar's other menus and
// the account menu.

test.use({ viewport: { width: 375, height: 812 } });

test("a phone opens the Inbox from the tab bar, an agent's Rules from the menu sheet, and signs out from it", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, "mobile-navigation");
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    const [agent] = await database.db.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.businessId, owner.businessId), eq(agents.isDefault, true)));

    await page.goto("/");
    const tabBar = page.getByRole("navigation", { name: navCopy.mobileNav.label, exact: true });
    const tab = (name: string) => tabBar.getByRole("link", { name, exact: true });
    const menuTab = tabBar.getByRole("button", { name: navCopy.mobileNav.menu, exact: true });
    await expect(tabBar).toBeVisible();
    await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: commonCopy.accessibility.toggleSidebar })).toHaveCount(0);
    await expect(tab(navCopy.mobileNav.tabs.home)).toHaveAttribute("aria-current", "page");
    // The page ends above the tab bar, not under it.
    const content = await page.locator('[data-slot="sidebar-inset"]').boundingBox();
    const bar = await tabBar.boundingBox();
    expect((content?.y ?? 0) + (content?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) + 1);

    await tab(navCopy.mobileNav.tabs.inbox).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(tab(navCopy.mobileNav.tabs.inbox)).toHaveAttribute("aria-current", "page");

    // Menu → Agents opens the one agent's menu, and Rules opens its page and closes the sheet.
    await menuTab.click();
    const sheet = page.getByRole("dialog", { name: navCopy.mobileNav.menu, exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: owner.businessName })).toBeVisible();
    await sheet.getByRole("button", { name: navCopy.items.agents, exact: true }).click();
    await expect(sheet.locator("[data-menu-level]")).toHaveAttribute("data-menu-level", `agent:${agent!.id}`);
    await expect(sheet.getByText(agent!.name, { exact: true })).toBeVisible();
    await sheet.getByRole("link", { name: navCopy.agentPages.rules, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/rules$`));
    await expect(sheet).toBeHidden();
    await expect(menuTab).toBeFocused();

    // The back button closes the sheet and leaves the page as it was.
    await menuTab.click();
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/rules$`));
    // Back again goes to the page before, so the sheet left no entry behind.
    await page.goBack();
    await expect(page).toHaveURL(/\/inbox$/);

    // Escape closes it too.
    await menuTab.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(menuTab).toBeFocused();

    await menuTab.click();
    await expect(sheet.getByText(owner.email, { exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: navCopy.sidebar.signOut, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
