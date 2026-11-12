import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import { appointments, businessHours, businessMemberships, businesses, closures, contacts, createDatabaseClient, services, staff, users } from "@lobbystack/db";

import common from "../public/locales/en/common.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const password = "Appointments-Calendar-Password-123!";
const prefix = "appointments-calendar";
const timezone = "America/Toronto";
const copy = common.appointments;

function migrator() {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("The disposable E2E database is required.");
  return createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
}

// Removes only this test's user and business, so copies running in parallel keep theirs.
async function removeFixtures(database: ReturnType<typeof migrator>, email: string, businessId: string): Promise<void> {
  await database.db.execute(sql`delete from public.businesses where id = ${businessId}`);
  await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email = ${email})`);
  await database.db.execute(sql`delete from public.verifications where identifier = ${`email-verification-otp-${email}`}`);
  await database.db.execute(sql`delete from public.users where email = ${email}`);
}

async function signUp(page: Page, email: string, testInfo: Parameters<typeof isolateAuthRateLimit>[2]) {
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
}

test("an owner books from the calendar's week, sees the booking as a block, and closes a day that then can't be booked", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  const businessId = randomUUID();
  try {
    await signUp(page, email, testInfo);
    // Onboarding has its own journeys: this business is open all day, with Milan's consultation tomorrow at 3 PM.
    const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    const tomorrow = DateTime.now().setZone(timezone).plus({ days: 1 }).startOf("day");
    await database.db.insert(businesses).values({ id: businessId, slug: `${prefix}-${businessId}`, name: "Calendar clinic", timezone, businessType: "clinic", onboardingStage: "complete", telemetryEnabled: false });
    await database.db.insert(businessMemberships).values({ businessId, userId: user!.id, role: "business_owner", status: "active" });
    await database.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, user!.id));
    await database.db.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
    const [sam] = await database.db.insert(staff).values({ businessId, name: "Sam", timezone }).returning();
    const [service] = await database.db.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
    const [milan] = await database.db.insert(contacts).values({ businessId, name: "Milan", phone: "+14165550100" }).returning();
    const seeded = tomorrow.set({ hour: 15 });
    await database.db.insert(appointments).values({ businessId, contactId: milan!.id, staffId: sam!.id, serviceId: service!.id, startsAt: seeded.toJSDate(), endsAt: seeded.plus({ minutes: 30 }).toJSDate(), timezone, status: "confirmed", sourceChannel: "voice" });

    // The calendar opens on this week; tomorrow can be the first day of next week.
    await page.goto("/appointments");
    await expect(page.getByRole("tab", { name: copy.calendarView.week, exact: true })).toHaveAttribute("aria-selected", "true");
    if (tomorrow.weekday === 7) await page.getByRole("button", { name: copy.calendarView.next, exact: true }).click();
    const block = page.getByRole("button", { name: /^Milan, Consultation, .*3:00\s–\s3:30\sPM$/ });
    await expect(block).toBeVisible();
    await block.click();
    const sheet = page.getByRole("dialog", { name: "Milan" });
    await expect(sheet.getByText("Consultation", { exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: common.accessibility.close }).first().click();
    await expect(sheet).toBeHidden();

    // An empty slot tomorrow at 10 AM draws a draft there and opens a popover over the calendar on that time.
    const calendar = page.getByRole("region", { name: copy.views.calendar });
    const widthBefore = (await calendar.boundingBox())!.width;
    const ten = tomorrow.set({ hour: 10 });
    await page.locator(`[data-starts-at="${ten.toUTC().toISO()}"]`).click();
    const panel = page.locator('[data-slot="popover-content"]').filter({ has: page.getByText(copy.create.title, { exact: true }) });
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("calendar-draft")).toContainText(/10:00\s–\s11:00\sAM/);
    // The calendar keeps its width, the popover stays in the window, and its buttons show without scrolling it.
    expect((await calendar.boundingBox())!.width).toBe(widthBefore);
    const box = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await expect(panel.getByRole("button", { name: copy.create.confirm, exact: true })).toBeInViewport();
    await expect(panel.getByLabel(copy.openings.date, { exact: true })).toContainText(tomorrow.toFormat("LLL d, yyyy"));
    // Escape drops it with its draft.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page.getByTestId("calendar-draft")).toBeHidden();
    await page.locator(`[data-starts-at="${ten.toUTC().toISO()}"]`).click();
    await expect(panel).toBeVisible();
    await panel.getByRole("combobox", { name: copy.create.service }).click();
    await page.getByRole("option", { name: "Consultation", exact: true }).click();
    // The service sets the length, and the draft follows.
    await expect(page.getByTestId("calendar-draft")).toContainText(/10:00\s–\s10:30\sAM/);
    await expect(panel.getByRole("button", { name: "10:00 AM", exact: true })).toHaveAttribute("aria-pressed", "true");
    await panel.getByLabel(copy.create.contact, { exact: true }).fill("Milan");
    await page.getByRole("option", { name: /Milan/ }).click();
    await panel.getByLabel(copy.create.notes, { exact: true }).fill("Bring the referral letter");
    await panel.getByLabel(copy.create.internalNotes, { exact: true }).fill("Prefers mornings");
    const booked = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/appointments" && response.request().method() === "POST");
    await panel.getByRole("button", { name: copy.create.confirm, exact: true }).click();
    expect((await booked).status()).toBe(201);
    await expect(panel).toBeHidden();
    await expect(page.getByRole("button", { name: /^Milan, Consultation, .*10:00\s–\s10:30\sAM$/ })).toBeVisible();
    const [saved] = await database.db.select({ notes: appointments.notes, internalNotes: appointments.internalNotes }).from(appointments).where(and(eq(appointments.businessId, businessId), eq(appointments.startsAt, ten.toJSDate())));
    expect(saved).toEqual({ notes: "Bring the referral letter", internalNotes: "Prefers mornings" });

    // New appointment at the top opens the same form in a centered dialog.
    await page.getByRole("button", { name: copy.create.action, exact: true }).click();
    const dialog = page.locator('[data-slot="dialog-content"]').filter({ has: page.getByText(copy.create.title, { exact: true }) });
    await expect(dialog).toBeVisible();
    await expect(panel).toBeHidden();
    await dialog.getByRole("button", { name: copy.create.cancel, exact: true }).click();
    await expect(dialog).toBeHidden();

    // Time off closes tomorrow for the whole business; the calendar shows it and its slots can't be booked.
    await page.getByRole("button", { name: copy.timeOff.action, exact: true }).click();
    const timeOff = page.getByRole("dialog", { name: copy.timeOff.title });
    await timeOff.getByLabel(copy.timeOff.name, { exact: true }).fill("Staff training");
    // Each date field opens a calendar; the day picker stamps each day with its US-order date.
    await timeOff.getByLabel(copy.timeOff.startDate, { exact: true }).click();
    await page.locator(`[data-day="${tomorrow.toFormat("M/d/yyyy")}"]`).click();
    await timeOff.getByLabel(copy.timeOff.endDate, { exact: true }).click();
    await page.locator(`[data-day="${tomorrow.toFormat("M/d/yyyy")}"]`).click();
    const added = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/time-off" && response.request().method() === "POST");
    await timeOff.getByRole("button", { name: copy.timeOff.save, exact: true }).click();
    expect((await added).status()).toBe(201);
    await expect(page.getByRole("button", { name: /^Closed: Staff training, / })).toBeVisible();
    const [closure] = await database.db.select({ staffId: closures.staffId, startsAt: closures.startsAt }).from(closures).where(eq(closures.businessId, businessId));
    expect(closure).toEqual({ staffId: null, startsAt: tomorrow.toJSDate() });

    await page.locator(`[data-starts-at="${tomorrow.set({ hour: 17 }).toUTC().toISO()}"]`).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByText("This time is unavailable: Staff training.", { exact: true })).toBeVisible();
    await panel.getByRole("combobox", { name: copy.create.service }).click();
    await page.getByRole("option", { name: "Consultation", exact: true }).click();
    await expect(panel.getByText(copy.openings.noTimes, { exact: true })).toBeVisible();
    let posted = false;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/appointments" && request.method() === "POST") posted = true; });
    await panel.getByRole("button", { name: copy.create.confirm, exact: true }).click();
    await expect(panel).toBeVisible();
    expect(posted).toBe(false);
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});
