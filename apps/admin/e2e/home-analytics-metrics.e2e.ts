import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { appointments, calls, contacts, conversations, services, staff } from "@lobbystack/db";

import agentCopy from "../public/locales/en/agent.json" with { type: "json" };
import commonCopy from "../public/locales/en/common.json" with { type: "json" };
import dashboardCopy from "../public/locales/en/dashboard.json" with { type: "json" };

import { holdNumber, migrator, removeFixtures, signUpOwner } from "./fixtures/full-stack";

// Home shows what the agent booked and saved over the last 30 days, and
// Analytics opens on calls, today and call length for the dates picked.

const prefix = "home-analytics-metrics";

test("Home shows booked value and an Upcoming row with a chevron, and Analytics opens on calls, today and average duration", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const fixtures = { emails: [] as string[], businessIds: [] as string[] };
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    fixtures.emails.push(owner.email);
    fixtures.businessIds.push(owner.businessId);
    const { businessId } = owner;

    // The agent booked a $50 cut by phone for tomorrow, and answered one two-minute call an hour ago.
    const [employee] = await database.db.insert(staff).values({ businessId, name: "Sam", timezone: "UTC" }).returning();
    const [service] = await database.db.insert(services).values({ businessId, name: "Cut", slug: "cut", durationMinutes: 30, priceType: "fixed", priceMinor: 5_000 }).returning();
    const [contact] = await database.db.insert(contacts).values({ businessId, name: "Ana Silva", phone: "+14165550100" }).returning();
    const startsAt = new Date(Date.now() + 86_400_000);
    await database.db.insert(appointments).values({ businessId, contactId: contact!.id, staffId: employee!.id, serviceId: service!.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", status: "confirmed", sourceChannel: "voice" });
    const [conversation] = await database.db.insert(conversations).values({ businessId, contactId: contact!.id, channel: "voice" }).returning();
    // An hour ago falls inside the business's last 30 days at any hour, even when it is already tomorrow in UTC.
    const startedAt = new Date(Date.now() - 60 * 60_000);
    await database.db.insert(calls).values({ businessId, contactId: contact!.id, conversationId: conversation!.id, providerCallId: randomUUID(), transport: "voice", status: "completed", startedAt, endedAt: new Date(startedAt.getTime() + 120_000), providerDurationSeconds: 120 });

    await page.goto("/");
    const bookedValue = page.getByRole("heading", { name: dashboardCopy.home.results.bookedValue, exact: true }).locator("..");
    await expect(bookedValue).toContainText("$50");
    await expect(page.getByRole("heading", { name: dashboardCopy.home.results.timeSaved, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: dashboardCopy.home.results.withoutTransfer, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: dashboardCopy.home.analytics.overview.averageDuration.title, exact: true })).toHaveCount(0);
    // The Upcoming row shows a chevron after the name, and the chevron adds nothing to the row's name.
    const row = page.getByRole("button", { name: /^Ana Silva/ });
    await expect(row.locator("svg.lucide-chevron-right[aria-hidden='true']")).toHaveCount(1);
    await row.click();
    await expect(page.getByRole("dialog")).toContainText("Cut");
    await page.keyboard.press("Escape");

    await page.goto("/analytics");
    const callsCard = page.getByRole("heading", { name: dashboardCopy.home.analytics.overview.calls.title, exact: true }).locator("../..");
    await expect(callsCard).toContainText("1");
    await expect(page.getByRole("heading", { name: dashboardCopy.home.analytics.overview.today.title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: dashboardCopy.home.analytics.overview.averageDuration.title, exact: true }).locator("../..")).toContainText("2m");
    await expect(page.getByRole("heading", { name: dashboardCopy.home.results.bookedValue, exact: true })).toHaveCount(0);
  } finally {
    await removeFixtures(database, fixtures);
    await database.pool.end();
  }
});

test("Home's phone card shows the number, waits for the first call, says who answers first and holds the Test call", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const fixtures = { emails: [] as string[], businessIds: [] as string[] };
  try {
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-phone`);
    fixtures.emails.push(owner.email);
    fixtures.businessIds.push(owner.businessId);
    const { businessId } = owner;

    // Without a number the card holds only the results.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: dashboardCopy.home.title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: dashboardCopy.home.results.bookedValue, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: dashboardCopy.home.phone.status.ready, exact: true })).toHaveCount(0);

    // A 555 exchange, so the number always formats; a random exchange can start with 0 and stay unformatted.
    const { e164 } = await holdNumber(database, businessId, { carrier: "twilio", e164: `+1416555${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}` });
    await page.goto("/");
    const phone = page.getByRole("region", { name: dashboardCopy.home.phone.status.ready, exact: true });
    await expect(phone).toContainText(`(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`);
    // The status heads the card from outside it; the number and the results share the card, above Action required.
    const section = page.locator("section", { has: page.locator("#home-phone-title") });
    const card = section.locator("[data-slot='surface']");
    await expect(card.locator("#home-phone-title")).toHaveCount(0);
    await expect(card.getByRole("heading", { name: dashboardCopy.home.results.bookedValue, exact: true })).toBeVisible();
    await expect(card).not.toContainText("from last month");
    const [cardBox, actionBox] = [await card.boundingBox(), await page.getByRole("heading", { name: dashboardCopy.home.actionRequired.title, exact: true }).boundingBox()];
    expect(cardBox!.y).toBeLessThan(actionBox!.y);
    // Home has one Test call, in the card.
    await expect(page.getByRole("button", { name: commonCopy.testCall.trigger, exact: true })).toHaveCount(1);
    await card.getByRole("button", { name: commonCopy.testCall.trigger, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // A first call to the number turns the status live.
    await database.db.insert(calls).values({ businessId, providerCallId: randomUUID(), transport: "voice", status: "completed", startedAt: new Date(Date.now() - 60_000), endedAt: new Date() });
    await page.reload();
    await expect(section.getByRole("heading", { name: dashboardCopy.home.phone.status.live, exact: true })).toBeVisible();

    // The chip opens the agent's Staff answers first setting.
    await card.getByRole("link", { name: dashboardCopy.home.phone.answersFirst.agent, exact: true }).click();
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]+#staff-first$/);
    await expect(page.getByRole("heading", { name: agentCopy.staffFirst.title, exact: true })).toBeInViewport();
  } finally {
    await removeFixtures(database, fixtures);
    await database.pool.end();
  }
});
