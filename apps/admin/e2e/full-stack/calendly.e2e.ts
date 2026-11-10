import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { appointments, businessHours, calendarConnections, services } from "@lobbystack/db";
import { bookAppointment } from "@lobbystack/domain";

import common from "../../public/locales/en/common.json" with { type: "json" };
import settings from "../../public/locales/en/settings.json" with { type: "json" };

import { migrator, randomE164, removeFixtures, setPlan, signUpOwner, type Migrator } from "../fixtures/full-stack";
import { CALENDLY_EVENT_TYPE, startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// Calendly through the real OAuth redirect, against a fake Calendly the admin
// server and the worker both call. Only the booking starts in the test: a
// caller's booking comes from the agent, which has its own journey.

const prefix = "calendly";
const copy = settings.integrations.calendly;
const mailpit = process.env.MAILPIT_API_URL;
let thirdParties: ThirdParties;
let database: Migrator;

test.use({ timezoneId: "UTC" });
test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

const card = (page: Page): Locator => page.locator("li").filter({ has: page.getByRole("heading", { name: settings.integrations.cards.calendly.title, exact: true }) });

async function connect(page: Page): Promise<void> {
  await page.goto("/business/connections");
  await card(page).getByRole("button", { name: settings.integrations.actions.connect, exact: true }).click();
  await expect(page).toHaveURL(/\/business\/connections\?calendar=calendly&status=success/, { timeout: 30_000 });
}

/** A Tuesday at least a week out, so the opening is in the future. */
function nextTuesdayAt(hour: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7 + ((2 - date.getUTCDay() + 7) % 7));
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function emailsTo(address: string): Promise<string[]> {
  const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  const { messages } = await response.json() as { messages: Array<{ Subject: string }> };
  return messages.map((message) => message.Subject);
}

test("an owner connects a paid Calendly account, books into it, and hears about a booking Calendly refused", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  expect(mailpit, "scripts/e2e-local.sh sets MAILPIT_API_URL").toBeTruthy();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    thirdParties.calendly.plan = "paid";
    thirdParties.calendly.bookingRefusal = null;
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");

    await connect(page);
    expect(thirdParties.calendly.authorizations.at(-1)).toMatchObject({ clientId: "full-stack-e2e-calendly-client", scope: expect.stringContaining("scheduled_events:write") });
    expect(thirdParties.calendly.tokenExchanges.at(-1)).toEqual({ pkceMatched: true });

    // The dialog opens on return, and picking an event type saves it.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: copy.sheetTitle, exact: true })).toBeVisible();
    await dialog.locator("#calendly-event-type").click();
    await page.getByRole("option", { name: CALENDLY_EVENT_TYPE.name, exact: true }).click();
    await expect(page.getByText(copy.eventTypeSaved, { exact: true })).toBeVisible();

    const connection = async () => (await database.db.select().from(calendarConnections).where(eq(calendarConnections.businessId, owner.businessId)))[0];
    await expect.poll(async () => (await connection())?.selectedCalendarId).toBe(CALENDLY_EVENT_TYPE.id);
    await expect.poll(async () => (await connection())?.status, { timeout: 30_000 }).toBe("connected");
    const connectionId = (await connection())!.id;
    await expect.poll(() => thirdParties.calendly.webhooks.map((webhook) => webhook.url), { timeout: 30_000 }).toContain(`${new URL(page.url()).origin}/api/webhooks/calendly/${connectionId}`);

    // A booking reaches Calendly with the stand-in address, so Calendly never emails the caller.
    const [service] = await database.db.insert(services).values({ businessId: owner.businessId, name: "Consultation", slug: `consultation-${randomUUID().slice(0, 8)}`, durationMinutes: 60 }).returning({ id: services.id });
    await database.db.insert(businessHours).values({ businessId: owner.businessId, dayOfWeek: 2, openMinutes: 8 * 60, closeMinutes: 17 * 60 }).onConflictDoNothing();
    const book = async (hour: number) => (await bookAppointment({ db: database.db }, { businessId: owner.businessId, serviceId: service!.id, startsAt: nextTuesdayAt(hour), timezone: "UTC", contactPhone: randomE164(), contactName: "Sam Lee", sourceChannel: "web_chat" })).appointmentId;
    const syncState = async (appointmentId: string) => (await database.db.select({ state: appointments.calendarSyncState }).from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, owner.businessId))))[0]?.state;

    const booked = await book(9);
    await expect.poll(() => syncState(booked), { timeout: 30_000 }).toBe("synced");
    expect(thirdParties.calendly.bookings.at(-1)).toMatchObject({ email: `booking+${booked}@example.invalid`, start_time: nextTuesdayAt(9).replace(".000Z", "Z") });

    // Calendly refuses the next one: the appointment says so and the owner gets an email.
    thirdParties.calendly.bookingRefusal = "That time is no longer available.";
    const refused = await book(11);
    await expect.poll(() => syncState(refused), { timeout: 30_000 }).toBe("failed");
    await expect.poll(() => emailsTo(owner.email), { timeout: 45_000 }).toContain("Calendar sync failed");

    await page.goto("/appointments?view=list");
    await expect(page.getByRole("cell", { name: common.appointments.calendarStates.failed, exact: true })).toBeVisible();
  } finally {
    thirdParties.calendly.bookingRefusal = null;
    await removeFixtures(database, { emails, businessIds });
  }
});

test("a Free Calendly account connects, and the dashboard says why it can't book", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    thirdParties.calendly.plan = "free";
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-free`);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");

    await connect(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(copy.planRequiredTitle, { exact: true })).toBeVisible();
    await expect(dialog.getByText(copy.planRequired, { exact: true })).toBeVisible();
    await expect(dialog.locator("#calendly-event-type")).toBeDisabled();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(card(page).getByRole("button", { name: copy.planRequiredTitle, exact: true })).toBeVisible();

    const [connection] = await database.db.select({ selected: calendarConnections.selectedCalendarId }).from(calendarConnections).where(eq(calendarConnections.businessId, owner.businessId));
    expect(connection?.selected ?? null).toBeNull();
  } finally {
    thirdParties.calendly.plan = "paid";
    await removeFixtures(database, { emails, businessIds });
  }
});
