import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { businesses, businessMemberships, users } from "@lobbystack/db";

import navCopy from "../../public/locales/en/nav.json" with { type: "json" };

import { migrator, password, removeFixtures, signUp, type Migrator } from "../fixtures/full-stack";
import { createKey, setTier, signUpPartner } from "../fixtures/partner";

// A partner's business at the activity level gives its own team calls, chats,
// appointments and contacts, and the partner sets the agent up. Its owner
// finds no agents, analytics or workspace setup pages, in the menu or in search.

const prefix = "search";
let database: Migrator;

test.beforeAll(() => { database = migrator(); });
test.afterAll(async () => { await database.pool.end(); });

test("an activity-only partner business finds no agents, analytics or setup pages in the menu or search", async ({ browser, page, request, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const partner = await signUpPartner(page, testInfo, prefix);
    emails.push(partner.email);
    await setTier(database, partner.partnerId, "active");
    const key = await createKey(page, partner.partnerId, "Product backend", ["businesses:create", "business:read"]);
    const businessName = `Harbour Dental ${randomUUID().slice(0, 8)}`;
    const created = await request.post("/api/v1/businesses", { headers: { authorization: `Bearer ${key}`, "idempotency-key": randomUUID() }, data: { name: businessName, timezone: "America/Toronto", access_level: "activity" } });
    expect(created.status(), await created.text()).toBe(201);
    const businessId = (await created.json() as { data: { id: string } }).data.id;
    businessIds.push(businessId);
    await database.db.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));

    // The business's owner, on its team as an accepted invitation leaves them.
    const context = await browser.newContext();
    const operator = await context.newPage();
    const { email } = await signUp(operator, testInfo, `${prefix}-owner`);
    emails.push(email);
    const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    await database.db.insert(businessMemberships).values({ businessId, userId: user!.id, role: "business_owner", status: "active" });
    await database.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, user!.id));

    // The business shows only on its partner's domain, where the owner signs in.
    const partnerOrigin = `http://${partner.host}:${new URL(baseURL!).port}`;
    await operator.goto(`${partnerOrigin}/en/login`);
    await operator.locator('input[type="email"]').fill(email);
    await operator.locator('input[type="password"]').fill(password);
    await operator.locator('button[type="submit"]').click();
    await operator.waitForURL((url) => !url.pathname.endsWith("/login"));
    await operator.goto(`${partnerOrigin}/`);

    // The menu keeps what they may open.
    const sidebar = operator.locator('[data-slot="sidebar"]');
    await expect(sidebar.getByRole("link", { name: navCopy.items.inbox, exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: navCopy.items.contacts, exact: true })).toBeVisible();
    for (const hidden of [navCopy.items.agents, navCopy.items.business, navCopy.items.analytics]) await expect(sidebar.getByRole("link", { name: hidden })).toHaveCount(0);

    // Search finds pages they may open and nothing behind setup.
    await sidebar.getByRole("button", { name: new RegExp(`^${navCopy.search.button}`) }).click();
    const box = operator.getByRole("combobox", { name: navCopy.search.title });
    const results = operator.getByRole("listbox", { name: navCopy.search.title });
    const search = async (text: string) => {
      await box.fill(text);
      // The list settles after a short pause for typing.
      await operator.waitForTimeout(400);
    };
    await search(navCopy.settingsPages.usage);
    await expect(results.getByRole("option", { name: new RegExp(`^${navCopy.settingsPages.usage}`) })).toBeVisible();
    await search(navCopy.items.inbox);
    await expect(results.getByRole("option", { name: new RegExp(`^${navCopy.items.inbox}`) }).first()).toBeVisible();
    for (const text of [navCopy.items.agents, navCopy.items.analytics, navCopy.settingsPages.knowledge, navCopy.settingsPages.business, navCopy.settingsPages.connections, navCopy.agentPages.rules, navCopy.agentPages.instructions]) {
      await search(text);
      await expect(results.getByRole("option"), text).toHaveCount(0);
    }
    // Team needs the team capability. The word still finds Partner access, which they may open.
    await search(navCopy.settingsPages.team);
    await expect(results.getByRole("option", { name: new RegExp(`^${navCopy.settingsPages.team}`) })).toHaveCount(0);
    await operator.keyboard.press("Escape");

    // Typing a setup address sends them home, and primary never opens an agent for them.
    await operator.goto(`${partnerOrigin}/agents/primary`);
    await expect(operator).toHaveURL(`${partnerOrigin}/`);
    for (const path of ["/agents", "/analytics", "/business/knowledge"]) {
      await operator.goto(`${partnerOrigin}${path}`);
      await expect(operator, path).toHaveURL(`${partnerOrigin}/`);
    }
    await context.close();
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
