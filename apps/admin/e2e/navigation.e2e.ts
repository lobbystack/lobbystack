import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { agents } from "@lobbystack/db";

import navCopy from "../public/locales/en/nav.json" with { type: "json" };

import { migrator, removeFixtures, signUpOwner } from "./fixtures/full-stack";

// The sidebar's menus: Agents and Settings each swap the sidebar for their own
// menu, with a row back to where the person came from. Old addresses still
// land on the page that replaced them, since emails link to them.

const prefix = "navigation";
const back = (place: string) => navCopy.back.replace("{{place}}", place);
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
  ["/agent/knowledge", "/workspace/knowledge"],
  ["/agent/services", "/workspace/services"],
  ["/agent/employees", "/workspace/employees"],
  ["/integrations", "/workspace/connections"],
  ["/integrations/webhooks", "/workspace/webhooks"],
  ["/widget", "/agents/primary/channels/widget"],
  ["/settings/widget", "/agents/primary/channels/widget"],
  ["/settings/phone-number", "/agents/primary/channels/phone"],
  ["/settings/account", "/account"],
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

test("Settings and an agent open their own menus, and the back row returns to where the owner came from", async ({ page }, testInfo) => {
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

    // Settings swaps in its own menu, opening on the first workspace page.
    await page.goto("/");
    await expect(level).toHaveAttribute("data-menu-level", "root");
    await link(navCopy.items.settings).click();
    await expect(page).toHaveURL(/\/workspace\/business$/);
    await expect(level).toHaveAttribute("data-menu-level", "settings");
    await expect(link(back(navCopy.items.home))).toBeVisible();
    await link(navCopy.settingsPages.team).click();
    await expect(page).toHaveURL(/\/workspace\/team$/);
    await link(navCopy.settingsPages.profile).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(level).toHaveAttribute("data-menu-level", "settings");
    await link(back(navCopy.items.home)).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(level).toHaveAttribute("data-menu-level", "root");

    // From the Inbox, the one agent's menu opens straight from Agents, and the back row says where it returns.
    await link(navCopy.items.inbox).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await link(navCopy.items.agents).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${UUID}$`));
    await expect(level).toHaveAttribute("data-menu-level", `agent:${agent!.id}`);
    await link(navCopy.agentPages.rules).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/rules$`));
    await link(new RegExp(`^${navCopy.agentPages.channels}`)).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/channels$`));

    // Shared pages live in Settings. Opening one from the agent puts the agent behind the back row.
    await link(new RegExp(`^${navCopy.agentPages.shared}`)).click();
    await page.locator("#dashboard-main-content").getByRole("link", { name: navCopy.settingsPages.knowledge }).click();
    await expect(page).toHaveURL(/\/workspace\/knowledge$/);
    await expect(level).toHaveAttribute("data-menu-level", "settings");
    await link(back(agent!.name)).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/shared$`));
    await expect(level).toHaveAttribute("data-menu-level", `agent:${agent!.id}`);
    await link(back(navCopy.items.inbox)).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(level).toHaveAttribute("data-menu-level", "root");

    // A fresh load has no trail, so the back row goes Home.
    await page.goto(`/agents/${agent!.id}/instructions`);
    await link(back(navCopy.items.home)).click();
    await expect(page).toHaveURL(/\/$/);

    // An agent that isn't the business's is a missing page.
    const missing = await page.goto(`/agents/${randomUUID()}`);
    expect(missing?.status()).toBe(404);
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
