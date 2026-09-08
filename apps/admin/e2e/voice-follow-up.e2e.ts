import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, calls, contacts, conversations, createDatabaseClient, inboxItems, users, withBusinessTransaction } from "@lobbystack/db";
import callCopy from "../public/locales/fr/calls.json" with { type: "json" };
import navCopy from "../public/locales/fr/nav.json" with { type: "json" };
import dashboardCopy from "../public/locales/fr/dashboard.json" with { type: "json" };

test("voice follow-up opens its call and completing it removes every duplicate from the dashboard", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR; const userId = process.env.PARITY_OPERATOR_USER_ID;
  test.skip(!state || !userId, "Requires a disposable authenticated operator fixture.");
  const worker = createDatabaseClient("lobbystack_worker"), auth = createDatabaseClient("lobbystack_auth");
  const businessId = randomUUID(), contactId = randomUUID(), conversationId = randomUUID(), callId = randomUUID();
  const original = (await auth.db.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId!)))[0];
  const context = await browser.newContext({ storageState: state!, locale: "fr" });
  try {
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `follow-up-browser-${businessId}`, name: "Follow-up certification", timezone: "UTC", businessType: "clinic", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId: userId!, role: "business_owner", status: "active" });
      await tx.insert(contacts).values({ id: contactId, businessId, name: "Alex", phone: "+14165550199" });
      await tx.insert(conversations).values({ id: conversationId, businessId, contactId, channel: "voice" });
      await tx.insert(calls).values({ id: callId, businessId, contactId, conversationId, providerCallId: callId, transport: "voice", status: "completed", startedAt: new Date() });
      await tx.insert(inboxItems).values([0, 1, 2].map(index => ({ businessId, relatedCallId: callId, kind: "voice_message", title: "Voice message from Alex", body: "Please call back.\nCallback: +14165550199\nUrgency: high", createdAt: new Date(Date.now() - index * 1000) })));
    });
    await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, userId!));
    const page = await context.newPage(); await page.goto(`${baseURL}/`);
    const followUp = page.getByRole("link", { name: /Please call back.*Alex/ });
    await expect(followUp).toHaveCount(1);
    await expect(followUp).toHaveAttribute("href", `/calls/${callId}`);
    await followUp.click();
    await expect(page).toHaveURL(new RegExp(`/calls/${callId}$`));
    await page.getByRole("tab", { name: callCopy.detail.tabs.details, exact: true }).click();
    await page.getByRole("button", { name: callCopy.detail.details.markDone, exact: true }).click();
    await expect(page.getByText(callCopy.detail.details.noFollowUp, { exact: true })).toBeVisible();
    const rows = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.select({ status: inboxItems.status }).from(inboxItems).where(eq(inboxItems.relatedCallId, callId)));
    expect(rows).toHaveLength(3); expect(rows.every(row => row.status === "done")).toBe(true);
    await page.getByRole("link", { name: navCopy.items.home, exact: true }).click();
    await expect(page.getByText(dashboardCopy.home.actionRequired.emptyTitle, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Please call back.*Alex/ })).toHaveCount(0);
  } finally {
    await context.close();
    await auth.db.update(users).set({ activeBusinessId: original?.activeBusinessId ?? null }).where(eq(users.id, userId!));
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.delete(businesses).where(eq(businesses.id, businessId)));
    await Promise.all([auth.pool.end(), worker.pool.end()]);
  }
});
