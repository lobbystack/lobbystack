import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { agents } from "@lobbystack/db";

import agentCopy from "../public/locales/en/agent.json" with { type: "json" };
import navCopy from "../public/locales/en/nav.json" with { type: "json" };

import { migrator, removeFixtures, signUpOwner } from "./fixtures/full-stack";

// The sidebar's menus: Agents and Settings each swap the sidebar for their own
// menu, with a row back to where the person came from. Old addresses still
// land on the page that replaced them, since emails link to them.

const prefix = "navigation";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// Each old address and where it goes now. `primary` resolves on the server, so the redirect keeps it.
const MOVED: ReadonlyArray<[from: string, to: string]> = [
  ["/calls", "/inbox?channel=phone_call"],
  [`/calls/${"1".repeat(8)}-1111-4111-8111-${"1".repeat(12)}`, `/inbox?call=${"1".repeat(8)}-1111-4111-8111-${"1".repeat(12)}`],
  ["/messages", "/inbox"],
  ["/agent", "/agents/primary"],
  ["/agent/basic-settings", "/agents/primary"],
  ["/agent/rules", "/agents/primary/rules"],
  ["/agent/integrations", "/agents/primary/channels"],
  ["/agents/primary/handling", "/agents/primary"],
  ["/agents/primary/instructions", "/agents/primary/rules"],
  [`/agents/${"1".repeat(8)}-1111-4111-8111-${"1".repeat(12)}/handling`, `/agents/${"1".repeat(8)}-1111-4111-8111-${"1".repeat(12)}`],
  ["/agent/knowledge", "/business/knowledge"],
  ["/agent/services", "/business/services"],
  ["/agent/employees", "/business/employees"],
  ["/integrations", "/business/integrations"],
  ["/integrations/webhooks", "/workspace/webhooks"],
  ["/widget", "/agents/primary/channels/widget"],
  ["/settings/widget", "/agents/primary/channels/widget"],
  ["/settings/phone-number", "/agents/primary/channels/phone"],
  ["/settings/account", "/account"],
  ["/workspace/business", "/business"],
  ["/workspace/knowledge", "/business/knowledge"],
  ["/workspace/services", "/business/services"],
  ["/workspace/employees", "/business/employees"],
  ["/workspace/connections", "/business/integrations"],
  ["/business/connections", "/business/integrations"],
  ["/settings/plan", "/workspace/billing"],
  ["/settings/connected-apps", "/workspace/api-keys"],
  ["/settings/appearance", "/account/appearance"],
  ["/settings/notifications", "/account/notifications"],
  ["/settings/team", "/workspace/team"],
  ["/settings/usage", "/workspace/usage"],
  ["/settings/subscription", "/workspace/subscription"],
  ["/settings/partner-access", "/workspace/partner-access"],
  ["/settings/api-keys", "/workspace/api-keys"],
  // The query string comes along, as a billing return link needs.
  ["/settings/plan?checkout=success", "/workspace/billing?checkout=success"],
];

test("every moved dashboard address redirects, for a while, to the page that replaced it", async ({ request, baseURL }) => {
  for (const [from, to] of MOVED) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(307);
    const location = new URL(response.headers().location!, baseURL);
    expect(`${location.pathname}${location.search}`, from).toBe(to);
  }
});

test("Settings, Business and an agent open their own menus, and the back row shows the workspace menu without leaving the page", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    const [agent] = await database.db.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.businessId, owner.businessId), eq(agents.isDefault, true)));

    const sidebar = page.locator('[data-slot="sidebar"]');
    const level = sidebar.locator("[data-menu-level]");
    const link = (name: string | RegExp) => sidebar.getByRole("link", { name, exact: typeof name === "string" });

    // /agents/primary opens the default agent on the server, and keeps the rest of the path and the query.
    await page.goto("/agents/primary");
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}$`));
    await page.goto("/agents/primary/rules?from=email");
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/rules\\?from=email$`));
    // An old link that went through primary lands on the same agent.
    await page.goto("/settings/phone-number");
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/channels/phone$`));

    const backRow = (name: string) => level.getByRole("button", { name, exact: true });

    // Settings swaps in its own menu, opening on its first workspace page.
    await page.goto("/");
    await expect(level).toHaveAttribute("data-menu-level", "root");
    await link(navCopy.items.settings).click();
    await expect(page).toHaveURL(/\/workspace\/team$/);
    await expect(level).toHaveAttribute("data-menu-level", "settings");
    await link(navCopy.settingsPages.profile).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(level).toHaveAttribute("data-menu-level", "settings");

    // The back row only shows the workspace menu; the page stays. Settings stays lit, names the page, and drills back in.
    await backRow(navCopy.items.settings).click();
    await expect(level).toHaveAttribute("data-menu-level", "root");
    await expect(page).toHaveURL(/\/account$/);
    const settingsRow = link(new RegExp(`^${navCopy.items.settings}`));
    await expect(settingsRow).toContainText(navCopy.settingsPages.profile);
    await settingsRow.click();
    await expect(level).toHaveAttribute("data-menu-level", "settings");
    await expect(page).toHaveURL(/\/account$/);

    // Business sits under Agents and opens on Details.
    await backRow(navCopy.items.settings).click();
    await link(new RegExp(`^${navCopy.items.business}`)).click();
    await expect(page).toHaveURL(/\/business$/);
    await expect(level).toHaveAttribute("data-menu-level", "business");
    await link(navCopy.settingsPages.services).click();
    await expect(page).toHaveURL(/\/business\/services$/);

    // The one agent's menu opens straight from Agents, headed by its name.
    await backRow(navCopy.items.business).click();
    await link(navCopy.items.inbox).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await link(new RegExp(`^${navCopy.items.agents}`)).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${UUID}$`));
    await expect(level).toHaveAttribute("data-menu-level", `agent:${agent!.id}`);
    // The back row names the section; the switcher under it names the agent.
    await expect(backRow(navCopy.items.agents)).toBeVisible();
    await expect(level.getByText(agent!.name, { exact: true })).toBeVisible();
    await link(navCopy.agentPages.rules).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/rules$`));
    await link(new RegExp(`^${navCopy.agentPages.channels}`)).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/channels$`));

    // Specific knowledge sits between Rules and Channels. Its link to the shared
    // knowledge opens Business, which swaps in Business's menu.
    await link(navCopy.agentPages.knowledge).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/knowledge$`));
    await page.locator("#dashboard-main-content").getByRole("link", { name: agentCopy.sections.knowledge.agent.manageShared }).click();
    await expect(page).toHaveURL(/\/business\/knowledge$/);
    await expect(level).toHaveAttribute("data-menu-level", "business");

    // A page opened from the address bar opens its section's menu too. Instructions joined Rules, so its old address lands there.
    await page.goto(`/agents/${agent!.id}/instructions`);
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/rules$`));
    await expect(level).toHaveAttribute("data-menu-level", `agent:${agent!.id}`);
    await backRow(navCopy.items.agents).click();
    await expect(level).toHaveAttribute("data-menu-level", "root");
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/rules$`));

    // An agent that isn't the business's is a missing page.
    const missing = await page.goto(`/agents/${randomUUID()}`);
    expect(missing?.status()).toBe(404);
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
