import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import { appointments, auditLogs, businessHours, businessMemberships, businesses, contacts, createDatabaseClient, services, staff, users } from "@lobbystack/db";

import common from "../public/locales/en/common.json" with { type: "json" };
import contactCopy from "../public/locales/en/contacts.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const password = "Manual-Create-Password-123!";
const prefix = "manual-create";
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

test("an owner creates a contact, books them an appointment, and both show in their lists", async ({ page }, testInfo) => {
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

    // Onboarding has its own journeys: this business is set up already, open all day, with one consultation.
    const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    await database.db.insert(businesses).values({ id: businessId, slug: `${prefix}-${businessId}`, name: "Manual clinic", timezone, businessType: "clinic", onboardingStage: "complete", telemetryEnabled: false });
    await database.db.insert(businessMemberships).values({ businessId, userId: user!.id, role: "business_owner", status: "active" });
    await database.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, user!.id));
    await database.db.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
    await database.db.insert(staff).values({ businessId, name: "Sam", timezone });
    await database.db.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 });

    // The owner adds Lea on Contacts, which opens her page.
    await page.goto("/contacts");
    await page.getByRole("button", { name: contactCopy.create.action, exact: true }).click();
    const contactDialog = page.getByRole("dialog", { name: contactCopy.create.title });
    await contactDialog.getByLabel(contactCopy.create.name, { exact: true }).fill("Lea Novak");
    await contactDialog.getByLabel(contactCopy.create.phone, { exact: true }).fill("4165550142");
    const created = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/contacts" && response.request().method() === "POST");
    await contactDialog.getByRole("button", { name: contactCopy.create.save, exact: true }).click();
    expect((await created).status()).toBe(201);
    const [lea] = await database.db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.phone, "+14165550142")));
    await expect(page).toHaveURL(new RegExp(`/contacts/${lea!.id}$`));
    await page.goto("/contacts");
    await expect(page.getByRole("cell", { name: /Lea Novak/ })).toBeVisible();

    // Then books her a consultation tomorrow at 2 PM from Appointments.
    const tomorrow = DateTime.now().setZone(timezone).plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
    await page.goto("/appointments?view=list");
    await page.getByRole("button", { name: common.appointments.create.action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: common.appointments.create.title });
    await dialog.getByLabel(common.appointments.create.contact, { exact: true }).fill("Lea");
    await page.getByRole("option", { name: /Lea Novak/ }).click();
    await dialog.getByRole("combobox", { name: common.appointments.create.service }).click();
    await page.getByRole("option", { name: "Consultation", exact: true }).click();
    await expect(dialog.getByRole("region", { name: common.appointments.openings.date })).toBeVisible();
    // Tomorrow can sit in next month's first week, which the calendar may show only after moving on.
    const day = dialog.locator(`button[data-day="${tomorrow.toJSDate().toLocaleDateString("en-US", { timeZone: timezone })}"]`).first();
    if (!(await day.isVisible())) await dialog.getByRole("button", { name: /next month/i }).click();
    await day.click();
    const time = dialog.getByRole("button", { name: tomorrow.setLocale("en").toFormat("h:mm a"), exact: true });
    await time.click();
    await expect(time).toHaveAttribute("aria-pressed", "true");
    const booked = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/appointments" && response.request().method() === "POST");
    await dialog.getByRole("button", { name: common.appointments.create.confirm, exact: true }).click();
    expect((await booked).status()).toBe(201);
    await expect(page.getByText(common.appointments.create.done, { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Lea Novak" })).toBeVisible();

    const [appointment] = await database.db.select({ id: appointments.id, startsAt: appointments.startsAt, sourceChannel: appointments.sourceChannel }).from(appointments).where(and(eq(appointments.businessId, businessId), eq(appointments.contactId, lea!.id)));
    expect(appointment!.startsAt.toISOString()).toBe(tomorrow.toJSDate().toISOString());
    expect(appointment!.sourceChannel).toBe("dashboard");
    const [audit] = await database.db.select({ actorUserId: auditLogs.actorUserId }).from(auditLogs).where(and(eq(auditLogs.entityId, appointment!.id), eq(auditLogs.eventType, "appointment_change.booked")));
    expect(audit!.actorUserId).toBe(user!.id);
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});
