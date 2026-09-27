import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Browser } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { agents, appointments, billingAccounts, businessHours, businesses, createDatabaseClient, inboxItems, outboxMessages, services, staff, users, widgetKeys, type Database } from "@lobbystack/db";
import { createBusiness, refreshBusinessSnapshot } from "@lobbystack/domain";
import { startWidgetProvider } from "./fixtures/widget-provider";
import english from "../public/locales/en/widget.json" with { type: "json" };

// The agent core behind website chat, end to end: a business made by the
// normal signup path can book (it gets a default staff member), the agent
// finds openings and books through its tools, and "request" mode turns a
// booking into an appointment request for the team.

let provider: Awaited<ReturnType<typeof startWidgetProvider>> | undefined;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { if (process.env.WIDGET_E2E === "1") provider = await startWidgetProvider(); });
test.afterAll(async () => { if (provider) await new Promise<void>((resolve, reject) => provider!.server.close(error => error ? reject(error) : resolve())); });

// A Tuesday at least a week out, so every opening is in the future.
function nextTuesday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7 + ((2 - date.getUTCDay() + 7) % 7));
  return date.toISOString().slice(0, 10);
}

async function seedBusiness(database: Database, bookingMode: "instant" | "request") {
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await database.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
  const { businessId } = await createBusiness({ db: database }, { userId, name: "Northside Plumbing", timezone: "UTC", businessType: "service_company", deploymentMode: "self_hosted_standard" });
  await database.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
  await database.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "self_hosted_standard", subscriptionState: "active" });
  await database.insert(businessHours).values({ businessId, dayOfWeek: 2, openMinutes: 8 * 60, closeMinutes: 17 * 60 });
  await database.insert(services).values({ businessId, name: "Drain cleaning", slug: "drain-cleaning", durationMinutes: 60 });
  await database.update(agents).set({ bookingMode }).where(and(eq(agents.businessId, businessId), eq(agents.isDefault, true)));
  const key = `agent-e2e-${randomUUID()}`;
  await database.insert(widgetKeys).values({ businessId, keyHash: createHash("sha256").update(key).digest("hex"), allowedOrigins: ["http://localhost:18090"], config: { title: "Northside Plumbing", localeOverride: "en" } });
  await refreshBusinessSnapshot({ db: database }, { businessId });
  return { userId, businessId, key };
}

async function openChat(browser: Browser, key: string) {
  const context = await browser.newContext({ locale: "en" });
  const page = await context.newPage();
  await page.goto(`http://localhost:18090/widget-host?key=${key}`);
  await page.getByRole("button", { name: "Open chat", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Chat with us"]');
  const composer = frame.getByRole("textbox", { name: english.chat.composerPlaceholder, exact: true });
  await expect(composer).toBeEnabled();
  const send = async (text: string) => { await composer.fill(text); await composer.press("Enter"); };
  return { context, page, frame, send };
}

test("a new business books through the website chat agent", async ({ browser }) => {
  test.skip(process.env.WIDGET_E2E !== "1", "Requires the isolated local AI endpoint; never run against live provider keys.");
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("Disposable E2E database required.");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  const { userId, businessId, key } = await seedBusiness(database.db, "instant");
  const chat = await openChat(browser, key);
  try {
    const members = await database.db.select({ name: staff.name }).from(staff).where(and(eq(staff.businessId, businessId), eq(staff.active, true)));
    expect(members).toEqual([{ name: "Northside Plumbing" }]);

    // The fake model asks for 09:00; the search returns the nearest openings
    // in time order, so the first one offered is 08:30.
    const date = nextTuesday();
    await chat.send(`Is drain cleaning available on ${date}?`);
    await expect(chat.frame.getByText(/I have Tuesday .* 8:30 AM open\./)).toBeVisible({ timeout: 20_000 });

    await chat.send(`Please book it on ${date}.`);
    await expect(chat.frame.getByText("You're booked. See you then.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await database.db.select({ status: appointments.status, startsAt: appointments.startsAt }).from(appointments).where(eq(appointments.businessId, businessId)))
      .map(row => ({ status: row.status, startsAt: row.startsAt.toISOString() }))).toEqual([{ status: "confirmed", startsAt: `${date}T08:30:00.000Z` }]);
    await chat.page.screenshot({ path: test.info().outputPath("agent-booking.png") });
  } finally {
    await chat.context.close();
    await database.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
    await database.db.delete(businesses).where(eq(businesses.id, businessId));
    await database.db.delete(users).where(eq(users.id, userId));
    await database.pool.end();
  }
});

test("request mode passes the appointment to the team instead of booking", async ({ browser }) => {
  test.skip(process.env.WIDGET_E2E !== "1", "Requires the isolated local AI endpoint; never run against live provider keys.");
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("Disposable E2E database required.");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  const { userId, businessId, key } = await seedBusiness(database.db, "request");
  const chat = await openChat(browser, key);
  try {
    await chat.send(`Can I get a drain cleaning appointment on ${nextTuesday()}?`);
    await expect(chat.frame.getByText("I've passed your request to the team.", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(await database.db.select().from(appointments).where(eq(appointments.businessId, businessId))).toEqual([]);
    const requests = await database.db.select({ body: inboxItems.body }).from(inboxItems).where(eq(inboxItems.businessId, businessId));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toContain("Appointment request: Drain cleaning");
  } finally {
    await chat.context.close();
    await database.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
    await database.db.delete(businesses).where(eq(businesses.id, businessId));
    await database.db.delete(users).where(eq(users.id, userId));
    await database.pool.end();
  }
});
