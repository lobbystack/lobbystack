import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { and, eq, like, sql } from "drizzle-orm";

import { appointments, auditLogs, businessHours, businesses, calls, contacts, conversations, createDatabaseClient, inboxItems, notifications, services, staff } from "@lobbystack/db";

import common from "../public/locales/en/common.json" with { type: "json" };
import contactsCopy from "../public/locales/en/contacts.json" with { type: "json" };
import onboarding from "../public/locales/en/onboarding.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const prefix = "operator-actions";
const password = "Operator-Actions-Password-123!";

function migrator() {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("The disposable E2E database is required.");
  return createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
}

async function removeFixtures(database: ReturnType<typeof migrator>, email: string, businessId: string | undefined): Promise<void> {
  if (businessId) await database.db.execute(sql`delete from public.businesses where id = ${businessId}`);
  await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email = ${email})`);
  await database.db.execute(sql`delete from public.verifications where identifier = ${`email-verification-otp-${email}`}`);
  await database.db.execute(sql`delete from public.users where email = ${email}`);
}

/** Signs up and creates a workspace through onboarding, then opens it on its dashboard. */
async function newOwner(page: Page, testInfo: TestInfo, database: ReturnType<typeof migrator>, email: string): Promise<string> {
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
  await page.getByLabel(onboarding.businessName.label).fill(`Operator Actions ${randomUUID().slice(0, 8)}`);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await page.getByRole("button", { name: onboarding.businessName.continue }).click();
  const { businessId } = await (await created).json() as { businessId: string };
  await expect(page).toHaveURL("/onboarding/website");
  await database.db.update(businesses).set({ onboardingStage: "complete", timezone: "UTC" }).where(eq(businesses.id, businessId));
  return businessId;
}

test("an operator approves a caller's reschedule request, which moves the appointment and closes it", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-reschedule-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, database, email);
    const contactId = randomUUID();
    const startsAt = (days: number, hour: number) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + days);
      date.setUTCHours(hour, 0, 0, 0);
      return date;
    };
    const current = startsAt(1, 10);
    const requested = startsAt(2, 11);
    const serviceId = randomUUID();
    await database.db.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId: businessId!, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
    await database.db.insert(services).values({ id: serviceId, businessId: businessId!, name: "Consultation", slug: `consultation-${serviceId.slice(0, 8)}`, durationMinutes: 30 });
    const [employee] = await database.db.select({ id: staff.id }).from(staff).where(eq(staff.businessId, businessId!)).limit(1);
    const [contact] = await database.db.insert(contacts).values({ id: contactId, businessId: businessId!, name: "Milan Obrenovic", phone: "+14165550123" }).returning();
    const [appointment] = await database.db.insert(appointments).values({ id: randomUUID(), businessId: businessId!, contactId: contact!.id, staffId: employee!.id, serviceId, startsAt: current, endsAt: new Date(current.getTime() + 30 * 60_000), timezone: "UTC", status: "confirmed", sourceChannel: "voice" }).returning();
    // The request came in on a call; Home's row opens it, and the call's Details approve it.
    const [conversation] = await database.db.insert(conversations).values({ businessId: businessId!, contactId: contact!.id, channel: "voice" }).returning();
    const callId = randomUUID();
    await database.db.insert(calls).values({ id: callId, businessId: businessId!, contactId: contact!.id, conversationId: conversation!.id, providerCallId: callId, transport: "voice", status: "completed", startedAt: new Date() });
    await database.db.insert(inboxItems).values({
      businessId: businessId!,
      relatedCallId: callId,
      kind: "voice_message",
      title: "Reschedule request from Milan Obrenovic",
      body: "Reschedule request: Consultation",
      metadata: { request: "appointment_reschedule", appointmentId: appointment!.id, requestedService: "Consultation", requestedStartsAt: current.toISOString().slice(0, 16), requestedNewStartsAt: requested.toISOString().slice(0, 16) },
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: common.appointments.reschedule.approve, exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: /Milan Obrenovic/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/inbox\\?call=${callId}$`));
    await page.getByRole("button", { name: common.appointments.reschedule.approve, exact: true }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toBeVisible();
    const moved = page.waitForResponse((response) => response.url().includes(`/api/appointments/${appointment!.id}/reschedule`) && response.request().method() === "POST");
    await confirmation.getByRole("button", { name: common.appointments.reschedule.confirm, exact: true }).click();
    expect((await moved).ok()).toBe(true);
    await expect(page.getByText(common.appointments.reschedule.done, { exact: true })).toBeVisible();

    const [saved] = await database.db.select({ startsAt: appointments.startsAt }).from(appointments).where(eq(appointments.id, appointment!.id));
    expect(saved?.startsAt.toISOString()).toBe(requested.toISOString());
    const [request] = await database.db.select({ status: inboxItems.status }).from(inboxItems).where(and(eq(inboxItems.businessId, businessId!), eq(inboxItems.kind, "voice_message")));
    expect(request?.status).toBe("done");
    // The caller hears the new time, as the agent promised when it saved the request.
    const confirmationTexts = await database.db.select({ kind: notifications.kind }).from(notifications).where(and(eq(notifications.businessId, businessId!), like(notifications.kind, "reschedule_confirmation:%")));
    expect(confirmationTexts).toHaveLength(1);
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});

test("an operator fixes a contact's name and email from the contacts page, which lands in the audit log", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-contact-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, database, email);
    await database.db.insert(contacts).values({ businessId, name: "Misheard Name", phone: "+14165550124" });

    await page.goto("/contacts");
    await expect(page.getByText("Misheard Name", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: contactsCopy.table.actions.moreOptions }).click();
    await page.getByRole("menuitem", { name: contactsCopy.table.actions.editContact }).click();
    const editor = page.getByRole("dialog");
    await expect(editor.getByLabel(contactsCopy.edit.name)).toHaveValue("Misheard Name");
    await editor.getByLabel(contactsCopy.edit.name).fill("Corrected Name");
    await editor.getByLabel(contactsCopy.edit.email).fill("corrected@example.com");
    await editor.getByRole("button", { name: contactsCopy.edit.save, exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByText("Corrected Name", { exact: true })).toBeVisible();
    await expect(page.getByText("corrected@example.com", { exact: true })).toBeVisible();

    const audits = await database.db.select({ eventType: auditLogs.eventType, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.entityType, "contact"), eq(auditLogs.eventType, "contact.updated")));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.payload).toEqual({ fields: ["name", "email"] });
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});
