import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

import intros from "../public/locales/en/intros.json" with { type: "json" };

import { migrator, removeFixtures, signUpOwner } from "./fixtures/full-stack";
import { showPageIntros } from "./fixtures/page-intros";

// A page's intro card opens the first time a new owner visits it, once.
// Home's first visit opens none, and closing a card keeps it closed after a
// reload because the server holds the list.

const prefix = "page-intros";
const recorded = (intro: string) => (response: { url(): string; request(): { method(): string; postData(): string | null } }) =>
  response.url().endsWith("/api/page-intros") && response.request().method() === "POST" && JSON.parse(response.request().postData() ?? "{}").intro === intro;

test("a new owner sees each page's intro card once, saved across reloads", async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    await showPageIntros(context, baseURL!);
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);

    // Home on the first visit: no card, and the visit is recorded.
    const firstVisit = page.waitForResponse(recorded("dashboard"));
    await page.goto("/");
    expect((await firstVisit).ok()).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/inbox");
    const inboxCard = page.getByRole("dialog", { name: intros.pages.inbox.title });
    await expect(inboxCard).toBeVisible();
    await expect(inboxCard.getByText(intros.pages.inbox.what)).toBeVisible();
    await expect(inboxCard.getByRole("link", { name: intros.actions.readGuide })).toHaveAttribute("href", "https://docs.lobbystack.com/dashboard/inbox");
    const closed = page.waitForResponse(recorded("inbox"));
    await inboxCard.getByRole("button", { name: intros.actions.getStarted }).click();
    expect((await closed).ok()).toBe(true);
    await expect(inboxCard).toBeHidden();

    // The server keeps it closed after a reload.
    await page.reload();
    await expect(page.locator("#dashboard-main-content")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const rows = await database.db.execute<{ intro: string }>(sql`select intro from public.user_page_intros where user_id = ${owner.userId} order by intro`);
    expect(rows.rows.map(({ intro }) => intro)).toEqual(["dashboard", "inbox"]);

    // Another page opens its own card.
    await page.goto("/business/knowledge");
    await expect(page.getByRole("dialog", { name: intros.pages.knowledge.title })).toBeVisible();
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
