import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { and, eq, sql } from "drizzle-orm";

import { businesses, conversations, createDatabaseClient, widgetKeys } from "@lobbystack/db";

import messagesCopy from "../public/locales/en/messages.json" with { type: "json" };
import onboarding from "../public/locales/en/onboarding.json" with { type: "json" };
import settings from "../public/locales/en/settings.json" with { type: "json" };
import widgetCopy from "../public/locales/en/widget.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";
import { startWidgetProvider } from "./fixtures/widget-provider";

const password = "Widget-Settings-Password-123!";
const prefix = "widget-settings";
const hostOrigin = "http://localhost:18090";
// A plain website that carries exactly the snippet the dashboard shows. The bubble draws without a session, so it needs no AI endpoint.
const snippetSitePort = 18091;

async function serveSnippetSite(snippet: string): Promise<Server> {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><html lang="en"><body><h1>Snippet site</h1>${snippet}</body></html>`);
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(snippetSitePort, "127.0.0.1", resolve); });
  return server;
}

function migrator() {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("The disposable E2E database is required.");
  return createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
}

// Removes only this test's user and business, so copies running in parallel keep theirs.
async function removeFixtures(database: ReturnType<typeof migrator>, email: string, businessId: string | undefined): Promise<void> {
  if (businessId) {
    await database.db.execute(sql`delete from public.outbox_messages where business_id = ${businessId}`);
    await database.db.execute(sql`delete from public.businesses where id = ${businessId}`);
  }
  await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email = ${email})`);
  await database.db.execute(sql`delete from public.verifications where identifier = ${`email-verification-otp-${email}`}`);
  await database.db.execute(sql`delete from public.users where email = ${email}`);
}

async function sessionStatus(request: APIRequestContext, widgetKey: string, origin = hostOrigin): Promise<number> {
  const response = await request.post("/api/widget/session", { headers: { origin }, data: { widgetKey, visitorId: randomUUID() } });
  return response.status();
}

// Widget copy names a key in some labels.
const named = (label: string, name: string) => label.replace("{{name}}", name);

test("the sidebar opens the website widget page, where an owner creates, edits, pauses and revokes a widget that works on their site", async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  let provider: Awaited<ReturnType<typeof startWidgetProvider>> | undefined;
  let snippetSite: Server | undefined;
  try {
    await page.addInitScript(() => localStorage.setItem("lobbystack.locale", "en"));
    await isolateAuthRateLimit(page, email, testInfo);
    await page.goto("/en/signup");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    const signedUp = page.waitForResponse((response) => response.url().endsWith("/api/auth/sign-up/email") && response.request().method() === "POST");
    await page.locator('button[type="submit"]').click();
    expect((await signedUp).ok()).toBe(true);
    await completeSignupEmailVerification(page, email, password);
    await expect(page).toHaveURL(/\/onboarding\/business$/);
    await page.getByLabel(onboarding.businessName.label).fill(`Widget Settings ${randomUUID().slice(0, 8)}`);
    const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
    await page.getByRole("button", { name: onboarding.businessName.continue }).click();
    businessId = (await (await created).json() as { businessId: string }).businessId;
    // The rest of onboarding has its own journeys; the dashboard opens once it's complete.
    await database.db.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));

    // The sidebar links the widget settings from any page, and only that item is active there.
    await page.goto("/");
    const sidebar = page.locator('[data-slot="sidebar"]');
    await sidebar.getByRole("link", { name: settings.sections.widget, exact: true }).click();
    await expect(page).toHaveURL(/\/widget$/);
    await expect(sidebar.getByRole("link", { name: settings.sections.widget, exact: true })).toHaveAttribute("data-active", "");
    await expect(page.getByText(settings.widget.keys.empty, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("widget-settings-empty.png"), fullPage: true });

    // Create a widget key for the host site. The dialog previews the widget as the owner fills it in.
    await page.getByRole("button", { name: widgetCopy.manage.newKey, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(settings.widget.fields.label, { exact: true }).fill("Main website");
    await dialog.getByLabel(settings.widget.fields.origins, { exact: true }).fill(hostOrigin);
    await dialog.getByLabel(settings.widget.fields.title, { exact: true }).fill("Ask the shop");
    await dialog.getByLabel(settings.widget.fields.greeting, { exact: true }).fill("Hello from the shop.");
    await dialog.getByLabel(settings.widget.fields.position, { exact: true }).selectOption("bottom-left");
    await expect(dialog.getByRole("figure").getByText("Hello from the shop.", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("widget-settings-new.png") });
    const createdKey = page.waitForResponse((response) => response.url().includes("/api/widget-keys?") && response.request().method() === "POST");
    await dialog.getByRole("button", { name: settings.widget.create.action, exact: true }).click();
    expect((await createdKey).ok()).toBe(true);
    await expect(dialog.getByText(settings.widget.created.title, { exact: true })).toBeVisible();
    const widgetKey = (await dialog.locator("code").filter({ hasText: /^wk_live_/ }).innerText()).trim();
    const snippet = await dialog.locator("pre").innerText();
    expect(snippet).toContain(`/embed.js?key=${widgetKey}"`);
    expect(snippet).toContain(`data-widget-key="${widgetKey}"`);
    await page.screenshot({ path: testInfo.outputPath("widget-settings-created.png") });
    await dialog.getByRole("button", { name: settings.widget.created.done, exact: true }).click();
    await expect(dialog).toBeHidden();

    const row = async () => (await database.db.select().from(widgetKeys).where(eq(widgetKeys.businessId, businessId!)))[0];
    expect(await row()).toMatchObject({ label: "Main website", status: "active", allowedOrigins: [hostOrigin], config: expect.objectContaining({ title: "Ask the shop", greeting: "Hello from the shop.", position: "bottom-left" }) });

    // Only the allowed origin gets a session.
    expect(await sessionStatus(request, widgetKey)).toBe(200);
    expect(await sessionStatus(request, widgetKey, "https://untrusted.example.invalid")).toBe(403);

    // Edit the saved key from its card.
    const card = page.locator("article").filter({ hasText: "Main website" });
    await expect(card.getByText(settings.widget.status.active, { exact: true })).toBeVisible();
    await card.getByRole("button", { name: widgetCopy.manage.edit, exact: true }).click();
    await dialog.getByLabel(settings.widget.fields.title, { exact: true }).fill("Ask us anything");
    const saved = page.waitForResponse((response) => response.url().includes("/api/widget-keys?") && response.request().method() === "PATCH");
    await dialog.getByRole("button", { name: settings.widget.keys.save, exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(dialog).toBeHidden();
    await expect(page.getByText(settings.widget.keys.saved, { exact: true })).toBeVisible();
    await expect.poll(async () => (await row())?.config).toMatchObject({ title: "Ask us anything", greeting: "Hello from the shop." });

    // The snippet can be copied again after a reload, and a site using it draws the bubble the dashboard saved.
    await page.reload();
    await card.getByRole("button", { name: widgetCopy.manage.edit, exact: true }).click();
    const savedSnippet = (await dialog.locator("pre").filter({ hasText: "embed.js" }).innerText()).trim();
    expect(savedSnippet).toBe(snippet.trim());
    await page.screenshot({ path: testInfo.outputPath("widget-settings-editor.png") });
    snippetSite = await serveSnippetSite(savedSnippet);
    const bubbleOnSite = async () => {
      // A fresh context each time, so the browser cache can't hide a change.
      const context = await page.context().browser()!.newContext();
      try {
        const site = await context.newPage();
        await site.goto(`http://127.0.0.1:${snippetSitePort}/`);
        const bubble = site.getByRole("button", { name: "Open chat", exact: true });
        await expect(bubble).toBeVisible();
        return { position: await bubble.getAttribute("data-position"), color: await bubble.evaluate((element) => getComputedStyle(element).backgroundColor) };
      } finally {
        await context.close();
      }
    };
    // The keyed loader carries the saved look and the chat's language, here the business's, and is cached only
    // briefly; the plain loader keeps its long cache.
    const keyedLoader = await request.get(`/embed.js?key=${encodeURIComponent(widgetKey)}`);
    expect(keyedLoader.headers()["cache-control"]).toBe("public, max-age=60, s-maxage=60");
    expect(await keyedLoader.text()).toContain(`[${JSON.stringify(widgetKey)}]={"color":"#18181b","position":"bottom-left","locale":"en"};`);
    expect((await request.get("/embed.js")).headers()["cache-control"]).toContain("max-age=600");
    expect(await bubbleOnSite()).toEqual({ position: "bottom-left", color: "rgb(24, 24, 27)" });
    await dialog.getByLabel(settings.widget.fields.color, { exact: true }).fill("#112233");
    await dialog.getByLabel(settings.widget.fields.position, { exact: true }).selectOption("bottom-right");
    const restyled = page.waitForResponse((response) => response.url().includes("/api/widget-keys?") && response.request().method() === "PATCH");
    await dialog.getByRole("button", { name: settings.widget.keys.save, exact: true }).click();
    expect((await restyled).ok()).toBe(true);
    await expect(dialog).toBeHidden();
    expect(await bubbleOnSite()).toEqual({ position: "bottom-right", color: "rgb(17, 34, 51)" });

    // Pausing stops new sessions and resuming brings them back.
    const moreActions = card.getByRole("button", { name: named(widgetCopy.manage.moreActions, "Main website"), exact: true });
    await moreActions.click();
    await page.getByRole("menuitem", { name: settings.widget.keys.pause, exact: true }).click();
    await expect(card.getByText(settings.widget.status.disabled, { exact: true })).toBeVisible();
    expect(await sessionStatus(request, widgetKey)).not.toBe(200);
    await moreActions.click();
    await page.getByRole("menuitem", { name: settings.widget.keys.resume, exact: true }).click();
    await expect(card.getByText(settings.widget.status.active, { exact: true })).toBeVisible();
    expect(await sessionStatus(request, widgetKey)).toBe(200);

    // With the local AI endpoint, a visitor chats on the host site and the owner reads it in Messages.
    if (process.env.WIDGET_E2E === "1") {
      provider = await startWidgetProvider();
      const host = await page.context().newPage();
      await host.goto(`${hostOrigin}/widget-host?key=${encodeURIComponent(widgetKey)}`);
      await host.getByRole("button", { name: "Open chat", exact: true }).click();
      const frame = host.frameLocator('iframe[title="Chat with us"]');
      await expect(frame.getByText("Ask us anything", { exact: true })).toBeVisible();
      const composer = frame.getByRole("textbox", { name: widgetCopy.chat.composerPlaceholder, exact: true });
      await expect(composer).toBeEnabled();
      await composer.fill("What are your opening hours?");
      await composer.press("Enter");
      await expect(frame.getByText("We are open weekdays.", { exact: true })).toBeVisible();
      await host.close();
      await expect.poll(async () => (await database.db.select().from(conversations).where(and(eq(conversations.businessId, businessId!), eq(conversations.channel, "web_chat")))).length).toBe(1);

      await sidebar.getByRole("link", { name: messagesCopy.page.title, exact: true }).click();
      await expect(page).toHaveURL(/\/messages$/);
      await page.getByRole("button", { name: messagesCopy.page.filterWeb, exact: true }).click();
      await expect(page.getByText("We are open weekdays.").first()).toBeVisible();
      await page.goto("/widget");
    }

    // Revoking is final, so the dashboard asks first.
    await moreActions.click();
    await page.getByRole("menuitem", { name: settings.widget.keys.revoke, exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText(named(widgetCopy.manage.revokeTitle, "Main website"), { exact: true })).toBeVisible();
    await confirm.getByRole("button", { name: settings.widget.keys.revoke, exact: true }).click();
    await expect(card.getByText(settings.widget.status.revoked, { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: widgetCopy.manage.edit, exact: true })).toHaveCount(0);
    expect((await row())?.status).toBe("revoked");
    expect(await sessionStatus(request, widgetKey)).not.toBe(200);
  } finally {
    if (provider) await new Promise<void>((resolve, reject) => provider!.server.close((error) => error ? reject(error) : resolve()));
    if (snippetSite) await new Promise<void>((resolve) => snippetSite!.close(() => resolve()));
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});
