import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { agents, widgetKeys, defaultAgentIdOf } from "@lobbystack/db";

import agentCopy from "../public/locales/en/agent.json" with { type: "json" };
import navCopy from "../public/locales/en/nav.json" with { type: "json" };
import settingsCopy from "../public/locales/en/settings.json" with { type: "json" };

import { migrator, removeFixtures, setPlan, signUpOwner } from "./fixtures/full-stack";

// Managing agents: Free has room for one, so adding another offers the plans;
// a paid workspace adds one, sets it up, gives it a channel and removes it.

const prefix = "agents";
const fill = (text: string, values: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/gu, (_match, key: string) => values[key] ?? "");
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

test("on Free, adding a second agent opens the plans instead", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-free`);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "free_cloud");

    await page.goto("/agents");
    const main = page.locator("#dashboard-main-content");
    await expect(main.getByText(navCopy.agents.default, { exact: true })).toBeVisible();
    await main.getByRole("button", { name: navCopy.agents.add, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(navCopy.agents.nameLabel, { exact: true }).fill("Weekend line");
    const refused = page.waitForResponse((response) => response.url().includes("/api/agents") && response.request().method() === "POST");
    await dialog.getByRole("button", { name: navCopy.agents.add, exact: true }).click();
    expect((await refused).status()).toBe(402);
    await expect(page.getByRole("dialog").getByText(settingsCopy.billing.upgradeDialog.title, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/agents$/);
    expect(await database.db.select({ id: agents.id }).from(agents).where(eq(agents.businessId, owner.businessId))).toHaveLength(1);
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});

test("a paid workspace adds an agent, changes its greeting, moves the widget to it and removes it", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-paid`);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");
    const [primary] = await database.db.select({ id: agents.id, name: agents.name, greeting: agents.greeting }).from(agents).where(and(eq(agents.businessId, owner.businessId), eq(agents.isDefault, true)));
    // A widget the default agent answers, as a finished install leaves it.
    const [widget] = await database.db.insert(widgetKeys).values({ businessId: owner.businessId, agentId: defaultAgentIdOf(owner.businessId), keyHash: randomBytes(32).toString("hex"), label: "Main website", allowedOrigins: ["https://example.invalid"] }).returning({ id: widgetKeys.id });
    const widgetAgent = async () => (await database.db.select({ agentId: widgetKeys.agentId }).from(widgetKeys).where(eq(widgetKeys.id, widget!.id)))[0]?.agentId;
    expect(await widgetAgent()).toBe(primary!.id);

    const main = page.locator("#dashboard-main-content");
    const sidebar = page.locator('[data-slot="sidebar"]');

    // Add an agent from the Agents page. It opens on its own page, as a copy of the default agent.
    await page.goto("/agents");
    await main.getByRole("button", { name: navCopy.agents.add, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(fill(navCopy.agents.addDescription, { name: primary!.name }), { exact: true })).toBeVisible();
    await dialog.getByLabel(navCopy.agents.nameLabel, { exact: true }).fill("Weekend line");
    await dialog.getByRole("button", { name: navCopy.agents.add, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${UUID}$`));
    const weekendId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(weekendId).not.toBe(primary!.id);
    const [weekend] = await database.db.select({ name: agents.name, greeting: agents.greeting, isDefault: agents.isDefault }).from(agents).where(eq(agents.id, weekendId));
    expect(weekend).toEqual({ name: "Weekend line", greeting: primary!.greeting, isDefault: false });

    // Its greeting changes without touching the default agent's.
    await main.getByRole("button", { name: fill(agentCopy.actions.editField, { field: agentCopy.fields.greeting.label }), exact: true }).click();
    const greeting = page.getByRole("dialog");
    await greeting.getByLabel(agentCopy.fields.greeting.label, { exact: true }).fill("Thanks for calling on the weekend. How can I help?");
    const saved = page.waitForResponse((response) => response.url().includes(`/api/agents/${weekendId}`) && response.request().method() === "PATCH");
    await greeting.getByRole("button", { name: agentCopy.actions.save, exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(main.getByText("Thanks for calling on the weekend. How can I help?", { exact: true })).toBeVisible();
    const greetings = async () => Object.fromEntries((await database.db.select({ id: agents.id, greeting: agents.greeting }).from(agents).where(eq(agents.businessId, owner.businessId))).map((row) => [row.id, row.greeting]));
    expect(await greetings()).toEqual({ [primary!.id]: primary!.greeting, [weekendId]: "Thanks for calling on the weekend. How can I help?" });

    // With two agents, Agents lists both, in the main menu and on its page.
    await page.goto("/agents");
    await expect(main.getByRole("link", { name: "Weekend line", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Weekend line", exact: true })).toBeVisible();

    // The widget moves from the default agent to the new one, behind a confirm.
    await page.goto(`/agents/${primary!.id}/channels`);
    const row = main.locator('[data-slot="item"]').filter({ hasText: "Main website" });
    await row.getByRole("button", { name: navCopy.channels.moveTo }).click();
    await page.getByRole("menuitem", { name: "Weekend line", exact: true }).click();
    const confirmMove = page.getByRole("alertdialog");
    await expect(confirmMove.getByText(fill(navCopy.channels.moveTitle, { channel: "Main website", name: "Weekend line" }), { exact: true })).toBeVisible();
    const moved = page.waitForResponse((response) => response.url().includes("/api/agents/channels") && response.request().method() === "PUT");
    await confirmMove.getByRole("button", { name: navCopy.channels.move, exact: true }).click();
    expect((await moved).ok()).toBe(true);
    await expect(main.getByText(navCopy.channels.noWidget, { exact: true })).toBeVisible();
    expect(await widgetAgent()).toBe(weekendId);
    await page.goto(`/agents/${weekendId}/channels`);
    await expect(main.locator('[data-slot="item"]').filter({ hasText: "Main website" })).toBeVisible();

    // The default agent can't be removed; the new one can, after a confirm, and its widget goes back to the default.
    await page.goto(`/agents/${primary!.id}`);
    await main.getByRole("button", { name: fill(navCopy.agents.moreActions, { name: primary!.name }), exact: true }).click();
    await expect(page.getByRole("menuitem", { name: new RegExp(`^${navCopy.agents.remove}`) })).toBeDisabled();
    await page.keyboard.press("Escape");

    await page.goto(`/agents/${weekendId}`);
    await main.getByRole("button", { name: fill(navCopy.agents.moreActions, { name: "Weekend line" }), exact: true }).click();
    await page.getByRole("menuitem", { name: navCopy.agents.remove, exact: true }).click();
    const confirmRemove = page.getByRole("alertdialog");
    await expect(confirmRemove.getByText(fill(navCopy.agents.removeTitle, { name: "Weekend line" }), { exact: true })).toBeVisible();
    await expect(confirmRemove.getByText(fill(navCopy.agents.removeDescription, { name: primary!.name }), { exact: true })).toBeVisible();
    // Nothing changes until the person confirms.
    expect((await database.db.select({ archivedAt: agents.archivedAt }).from(agents).where(eq(agents.id, weekendId)))[0]?.archivedAt).toBeNull();
    const removed = page.waitForResponse((response) => response.url().includes(`/api/agents/${weekendId}`) && response.request().method() === "DELETE");
    await confirmRemove.getByRole("button", { name: navCopy.agents.remove, exact: true }).click();
    expect((await removed).ok()).toBe(true);
    // Soft, so the checks after it still run and report.
    await expect.soft(page).toHaveURL(/\/agents$/);
    await page.goto("/agents");
    await expect(main.getByRole("link", { name: primary!.name, exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "Weekend line" })).toHaveCount(0);
    expect((await database.db.select({ archivedAt: agents.archivedAt }).from(agents).where(eq(agents.id, weekendId)))[0]?.archivedAt).not.toBeNull();
    expect(await widgetAgent()).toBe(primary!.id);
    expect(await database.db.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, owner.businessId), isNull(agents.archivedAt)))).toEqual([{ id: primary!.id }]);
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
