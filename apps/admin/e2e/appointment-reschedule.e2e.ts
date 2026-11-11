import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import { appointments, businessHours, businessMemberships, businesses, calls, contacts, conversations, createDatabaseClient, inboxItems, services, staff, users } from "@lobbystack/db";

import callCopy from "../public/locales/en/calls.json" with { type: "json" };
import common from "../public/locales/en/common.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const password = "Appointment-Reschedule-Password-123!";
const prefix = "appointment-reschedule";
const timezone = "America/Toronto";

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

test("an owner opens a caller's reschedule request from Home and picks another open time on the call", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  const businessId = randomUUID();
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

    // Onboarding has its own journeys: this business is set up already, open all day, with
    // Milan's consultation tomorrow at 3 PM and his request to move it to 11 AM three days out.
    // The owner moves it to 1 PM that day instead.
    const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    const current = DateTime.now().setZone(timezone).plus({ days: 1 }).set({ hour: 15, minute: 0, second: 0, millisecond: 0 });
    const wanted = current.plus({ days: 2 }).set({ hour: 11 });
    const instead = wanted.set({ hour: 13 });
    await database.db.insert(businesses).values({ id: businessId, slug: `${prefix}-${businessId}`, name: "Reschedule clinic", timezone, businessType: "clinic", onboardingStage: "complete", telemetryEnabled: false });
    await database.db.insert(businessMemberships).values({ businessId, userId: user!.id, role: "business_owner", status: "active" });
    await database.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, user!.id));
    await database.db.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
    const [employee] = await database.db.insert(staff).values({ businessId, name: "Sam", timezone }).returning();
    const [service] = await database.db.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
    const [milan] = await database.db.insert(contacts).values({ businessId, name: "Milan", phone: "+14165550100" }).returning();
    const [appointment] = await database.db.insert(appointments).values({ businessId, contactId: milan!.id, staffId: employee!.id, serviceId: service!.id, startsAt: current.toJSDate(), endsAt: current.plus({ minutes: 30 }).toJSDate(), timezone, status: "confirmed", sourceChannel: "voice" }).returning();
    // The request came in on a call, which Home's row opens in the Inbox.
    const [conversation] = await database.db.insert(conversations).values({ businessId, contactId: milan!.id, channel: "voice" }).returning();
    const callId = randomUUID();
    await database.db.insert(calls).values({ id: callId, businessId, contactId: milan!.id, conversationId: conversation!.id, providerCallId: callId, transport: "voice", status: "completed", startedAt: new Date() });
    const [request] = await database.db.insert(inboxItems).values({
      businessId, relatedCallId: callId, kind: "voice_message", title: "Voice message from Milan", body: "Reschedule request: Consultation",
      metadata: { request: "appointment_reschedule", appointmentId: appointment!.id, requestedService: "Consultation", requestedStartsAt: current.toFormat("yyyy-LL-dd'T'HH:mm"), requestedNewStartsAt: wanted.toFormat("yyyy-LL-dd'T'HH:mm"), callerName: "Milan" },
    }).returning();

    // Home lists the request without buttons; the row opens its call, where Details shows Other time.
    await page.goto("/");
    await expect(page.getByRole("button", { name: common.appointments.move.otherTime, exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: /Milan/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/inbox\\?call=${callId}$`));
    await expect(page.getByRole("tab", { name: callCopy.detail.tabs.details, exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: common.appointments.move.otherTime, exact: true }).click();

    // The dialog opens on the requested day with the requested time picked.
    const dialog = page.getByRole("dialog", { name: common.appointments.move.title });
    await expect(dialog).toBeVisible();
    const time = dialog.getByRole("button", { name: wanted.setLocale("en").toFormat("h:mm a"), exact: true });
    await expect(time).toHaveAttribute("aria-pressed", "true");
    const other = dialog.getByRole("button", { name: instead.setLocale("en").toFormat("h:mm a"), exact: true });
    await other.click();
    await expect(other).toHaveAttribute("aria-pressed", "true");
    const moved = page.waitForResponse((response) => response.url().includes(`/api/appointments/${appointment!.id}/reschedule`) && response.request().method() === "POST");
    await dialog.getByRole("button", { name: common.appointments.move.confirm, exact: true }).click();
    expect((await moved).ok()).toBe(true);
    await expect(page.getByText(common.appointments.move.done, { exact: true })).toBeVisible();
    
    const [row] = await database.db.select({ startsAt: appointments.startsAt }).from(appointments).where(eq(appointments.id, appointment!.id));
    expect(row!.startsAt.toISOString()).toBe(instead.toJSDate().toISOString());
    const [closed] = await database.db.select({ status: inboxItems.status }).from(inboxItems).where(eq(inboxItems.id, request!.id));
    expect(closed!.status).toBe("done");
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});
