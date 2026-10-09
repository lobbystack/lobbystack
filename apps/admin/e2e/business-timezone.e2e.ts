import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { businesses, createDatabaseClient, outboxMessages, receptionistProfiles, staff } from "@lobbystack/db";

import agent from "../public/locales/en/agent.json" with { type: "json" };
import onboarding from "../public/locales/en/onboarding.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const password = "Business-Timezone-Password-123!";
const prefix = "business-timezone";

function migrator() {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("The disposable E2E database is required.");
  return createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
}

// Removes only this test's user and business, so copies running in parallel keep theirs.
async function removeFixtures(database: ReturnType<typeof migrator>, email: string, businessId: string | undefined): Promise<void> {
  if (businessId) await database.db.execute(sql`delete from public.businesses where id = ${businessId}`);
  await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email = ${email})`);
  await database.db.execute(sql`delete from public.verifications where identifier = ${`email-verification-otp-${email}`}`);
  await database.db.execute(sql`delete from public.users where email = ${email}`);
}

test.use({ timezoneId: "Europe/Belgrade" });

test("the owner's browser zone becomes the business timezone, and AI settings changes it", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    const zones = async (businessId: string) => ({
      business: (await database.db.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)))[0]?.timezone,
      staff: (await database.db.select({ timezone: staff.timezone }).from(staff).where(eq(staff.businessId, businessId))).map((row) => row.timezone),
    });

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

    // Onboarding names the business and sends the browser's zone.
    await page.getByLabel(onboarding.businessName.label).fill(`Business Timezone ${randomUUID().slice(0, 8)}`);
    const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
    await page.getByRole("button", { name: onboarding.businessName.continue }).click();
    businessId = (await (await created).json() as { businessId: string }).businessId;
    expect(await zones(businessId)).toEqual({ business: "Europe/Belgrade", staff: ["Europe/Belgrade"] });

    // The rest of onboarding has its own journeys; the dashboard opens once it's complete.
    await database.db.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
    await page.goto("/agent");
    const select = page.getByRole("combobox", { name: agent.fields.timezone.label, exact: true });
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue("Europe/Belgrade");
    await expect(select.locator(`optgroup[label="${agent.fields.timezone.regions.america}"] option[value="America/Vancouver"]`)).toHaveCount(1);

    // An unsaved transfer number survives the timezone save.
    const transferNumber = page.locator("#agent-transfer-number");
    await transferNumber.pressSequentially("+14165550100");
    const savedZone = page.waitForResponse((response) => response.url().includes("/api/agent?") && response.request().method() === "PATCH");
    await select.selectOption("America/Vancouver");
    expect((await savedZone).ok()).toBe(true);
    await expect(page.getByText(agent.actions.saved, { exact: true })).toBeVisible();
    expect(await zones(businessId)).toEqual({ business: "America/Vancouver", staff: ["America/Vancouver"] });
    const refreshes = await database.db.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "snapshot.refresh")));
    expect(refreshes.map((row) => row.payload)).toContainEqual({ businessId, reason: "business_updated" });

    const savedTransfer = page.waitForResponse((response) => response.url().includes("/api/agent?") && response.request().method() === "PATCH");
    await page.getByRole("button", { name: agent.actions.save, exact: true }).click();
    expect((await savedTransfer).ok()).toBe(true);
    const savedTransferNumber = async () => (await database.db.select({ transferNumber: receptionistProfiles.transferNumber }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId!)))[0]?.transferNumber;
    expect(await savedTransferNumber()).toBe("+14165550100");

    // Clearing the number and typing another at a person's pace keeps only the new digits.
    await transferNumber.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await transferNumber.pressSequentially("+14165550199", { delay: 30 });
    const savedRetyped = page.waitForResponse((response) => response.url().includes("/api/agent?") && response.request().method() === "PATCH");
    await page.getByRole("button", { name: agent.actions.save, exact: true }).click();
    expect((await savedRetyped).ok()).toBe(true);
    expect(await savedTransferNumber()).toBe("+14165550199");

    await page.reload();
    await expect(select).toHaveValue("America/Vancouver");

    // The API refuses offsets and names that aren't IANA zones, and keeps the saved zone.
    for (const timezone of ["+05:00", "Eastern"]) {
      const response = await page.request.patch(`${baseURL}/api/agent?businessId=${businessId}`, { data: { timezone }, headers: { Origin: baseURL!, "Sec-Fetch-Site": "same-origin" } });
      expect(response.status()).toBe(400);
    }
    expect(await zones(businessId)).toEqual({ business: "America/Vancouver", staff: ["America/Vancouver"] });
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});
