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
    // No top bar: the page header keeps the title and its actions.
    await expect(page.locator('[data-slot="site-header"]')).toBeEmpty();
    // The Inbox scrolls with the page, not inside a box of its own.
    await expect(page.locator('[data-slot="inbox"]')).toBeVisible();
    expect(await page.locator('[data-slot="inbox-list"] > div:last-child').evaluate((list) => getComputedStyle(list).overflowY)).toBe("visible");
    expect(await page.locator('[data-slot="sidebar-inset"]').evaluate((content) => getComputedStyle(content).overflowY)).toBe("auto");

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

    // A dialog with date fields fits the phone's width and only scrolls up and down.
    await page.goto("/appointments");
    await page.getByRole("button", { name: commonCopy.appointments.timeOff.action, exact: true }).click();
    const timeOff = page.getByRole("dialog", { name: commonCopy.appointments.timeOff.title });
    await expect(timeOff.getByLabel(commonCopy.appointments.timeOff.startDate, { exact: true })).toBeVisible();
    // Whatever scrolls in it, form fields aside, scrolls only up and down, and nothing in it can be dragged sideways.
    const scrolling = await timeOff.evaluate((dialog) => [dialog, ...dialog.querySelectorAll<HTMLElement>(":not(input, textarea, select)")].flatMap((element) => {
      const style = getComputedStyle(element);
      const sideways = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
      return /(auto|scroll)/.test(style.overflowY) || sideways ? [{ overflowX: style.overflowX, sideways }] : [];
    }));
    expect(scrolling.length).toBeGreaterThan(0);
    expect(scrolling).toEqual(scrolling.map(() => ({ overflowX: "hidden", sideways: false })));
    const box = await timeOff.boundingBox();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 375).toBe(true);
    await page.keyboard.press("Escape");
    await expect(timeOff).toBeHidden();
    await page.goBack();

    // Escape closes it too.
    await menuTab.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(menuTab).toBeFocused();

    await menuTab.click();
    await expect(sheet.getByText(owner.email, { exact: true })).toBeVisible();
    // Every row, the email's included, has the same height and the same gap to the next, and their labels share one left edge.
    const rows = await sheet.locator("[data-sidebar=menu-button], [data-account-email]").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      const label = [...element.querySelectorAll("span:not([data-slot^=avatar])")].find((span) => span.textContent?.trim())!.getBoundingClientRect();
      return { top: box.top, height: box.height, labelLeft: label.left };
    }));
    expect(new Set(rows.map((row) => row.height))).toEqual(new Set([44]));
    const gaps = rows.slice(1).map((row, index) => Math.round(row.top - rows[index]!.top - rows[index]!.height));
    // One line, between Settings and the email, takes the only wider gap.
    expect(gaps.filter((gap) => gap !== 4)).toHaveLength(1);
    expect(await sheet.locator('[data-slot="separator"]').count()).toBe(1);
    expect(new Set(rows.map((row) => Math.round(row.labelLeft))).size).toBe(1);
    await sheet.getByRole("button", { name: navCopy.sidebar.signOut, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
