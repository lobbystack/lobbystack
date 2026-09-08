import { createHash, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { billingAccounts, businesses, conversations, createDatabaseClient, messages, outboxMessages, widgetKeys } from "@lobbystack/db";
import { startWidgetProvider } from "./fixtures/widget-provider";
import english from "../public/locales/en/widget.json" with { type: "json" };
import french from "../public/locales/fr/widget.json" with { type: "json" };

let provider: Awaited<ReturnType<typeof startWidgetProvider>> | undefined;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { if (process.env.WIDGET_E2E === "1") provider = await startWidgetProvider(); });
test.afterAll(async () => { if (provider) await new Promise<void>((resolve, reject) => provider!.server.close(error => error ? reject(error) : resolve())); });
for (const locale of ["en", "fr"] as const) for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`embedded chat streams and restores history ${locale} ${viewport.width}`, async ({ browser, request }) => {
    test.skip(process.env.WIDGET_E2E !== "1", "Requires the isolated local AI endpoint; never run against live provider keys.");
    const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
    if (!databaseUrl) throw new Error("Disposable E2E database required.");
    const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
    const businessId = randomUUID(); const key = `widget-e2e-${randomUUID()}`;
    const context = await browser.newContext({ viewport, locale });
    const t = locale === "fr" ? french : english;
    const reply = locale === "fr" ? "Nous sommes ouverts en semaine." : "We are open weekdays.";
    try {
      await database.db.insert(businesses).values({ id: businessId, name: "Widget certification", slug: key, timezone: "UTC", businessType: "clinic", defaultLocale: locale, onboardingStage: "complete", deploymentMode: "self_hosted_standard" });
      await database.db.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "self_hosted_standard", subscriptionState: "active" });
      await database.db.insert(widgetKeys).values({ businessId, keyHash: createHash("sha256").update(key).digest("hex"), allowedOrigins: ["http://localhost:18090"], config: { title: "Widget certification", localeOverride: locale } });
      const denied = await request.post("/api/widget/session", { headers: { origin: "https://untrusted.example.invalid" }, data: { widgetKey: key, visitorId: randomUUID() } });
      expect(denied.status()).toBe(403);
      const page = await context.newPage();
      const sessionResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/widget/session");
      await page.goto(`http://localhost:18090/widget-host?key=${key}`);
      expect((await sessionResponse).status()).toBe(200);
      await page.getByRole("button", { name: "Open chat", exact: true }).click();
      const frame = page.frameLocator('iframe[title="Chat with us"]');
      const composer = frame.getByRole("textbox", { name: t.chat.composerPlaceholder, exact: true });
      await expect(composer).toBeEnabled();
      await composer.fill("What are your opening hours?");
      await composer.press("Enter");
      await expect(frame.getByText(reply, { exact: true })).toBeVisible();
      await expect.poll(async () => (await database.db.select().from(messages).where(and(eq(messages.businessId, businessId), eq(messages.aiGenerated, true)))).length).toBe(1);
      const restoredConfig = page.waitForResponse(response => new URL(response.url()).pathname === "/api/widget/config");
      const restoredHistory = page.waitForResponse(response => new URL(response.url()).pathname === "/api/widget/history");
      await page.reload();
      await page.getByRole("button", { name: "Open chat", exact: true }).click();
      expect((await restoredConfig).status()).toBe(200);
      expect((await restoredHistory).status()).toBe(200);
      await expect(frame.getByText(reply, { exact: true })).toBeVisible();
      const conversation = (await database.db.select().from(conversations).where(eq(conversations.businessId, businessId)))[0];
      expect(conversation?.channel).toBe("web_chat");
      const before = provider!.requests.length;
      await database.db.update(conversations).set({ automationState: "human_handoff" }).where(eq(conversations.id, conversation!.id));
      await composer.fill("Please ask a person to reply.");
      await frame.getByRole("button", { name: t.chat.send, exact: true }).click();
      await expect(frame.getByText(t.chat.handoffBanner, { exact: true })).toBeVisible();
      expect(provider!.requests.length).toBe(before);
      await page.screenshot({ path: test.info().outputPath(`widget-${locale}-${viewport.width}.png`) });
    } finally {
      await context.close();
      await database.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await database.db.delete(businesses).where(eq(businesses.id, businessId));
      await database.pool.end();
    }
  });
}
