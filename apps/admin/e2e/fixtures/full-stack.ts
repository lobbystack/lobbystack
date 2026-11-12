import { expect, type Page, type TestInfo } from "@playwright/test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { billingAccounts, businesses, createDatabaseClient, phoneNumbers, defaultAgentIdOf } from "@lobbystack/db";

import onboardingEnglish from "../../public/locales/en/onboarding.json" with { type: "json" };
import onboardingFrench from "../../public/locales/fr/onboarding.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./email-verification";
import { TWILIO_AUTH_TOKEN } from "./full-stack-environment";

export const password = "Full-Stack-Journey-Password-123!";

/** The dashboard languages a fixture starts in; the signup page saves it as the account preference. */
export type SignUpLocale = "en" | "fr";

export function migrator() {
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("The disposable E2E database is required.");
  return createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
}
export type Migrator = ReturnType<typeof migrator>;

/** A person signed up through the real pages, with a verified email, sitting at the business step. */
export async function signUp(page: Page, testInfo: TestInfo, prefix: string, options: { locale?: SignUpLocale } = {}): Promise<{ email: string; userId: string }> {
  const locale = options.locale ?? "en";
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  await page.addInitScript((value) => localStorage.setItem("lobbystack.locale", value), locale);
  await isolateAuthRateLimit(page, email, testInfo);
  await page.goto(`/${locale}/signup`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const signedUp = page.waitForResponse((response) => response.url().endsWith("/api/auth/sign-up/email") && response.request().method() === "POST");
  await page.locator('button[type="submit"]').click();
  expect((await signedUp).ok()).toBe(true);
  const userId = await completeSignupEmailVerification(page, email, password);
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  return { email, userId };
}

/** Signs up an owner and names their business. The rest of onboarding has its own journeys, so the dashboard opens once it's marked complete. */
export async function signUpOwner(database: Migrator, page: Page, testInfo: TestInfo, prefix: string, options: { locale?: SignUpLocale } = {}): Promise<{ email: string; userId: string; businessId: string; businessName: string }> {
  const { email, userId } = await signUp(page, testInfo, prefix, options);
  const copy = options.locale === "fr" ? onboardingFrench : onboardingEnglish;
  const businessName = `${prefix} ${randomUUID().slice(0, 8)}`;
  await page.getByLabel(copy.businessName.label).fill(businessName);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await page.getByRole("button", { name: copy.businessName.continue }).click();
  const { businessId } = await (await created).json() as { businessId: string };
  // Let the page land on the next step first. Its navigation still in flight
  // would abort the spec's next page.goto.
  await expect(page).toHaveURL("/onboarding/website");
  await database.db.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
  // Marking the business complete can send the page on again. A spec that opens its own page before that finishes interrupts it, and its first goto fails with net::ERR_ABORTED.
  // The page does not always move (the website step can stay put), so this waits briefly and carries on.
  await page.waitForURL((url) => !url.pathname.includes("/onboarding"), { waitUntil: "load", timeout: 5_000 }).catch(() => undefined);
  return { email, userId, businessId, businessName };
}

/** Puts the business on a plan, as Polar's webhook would. */
export async function setPlan(database: Migrator, businessId: string, plan: "free_cloud" | "starter"): Promise<void> {
  const subscriptionState = plan === "free_cloud" ? null : "active";
  await database.db.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan, subscriptionState }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan, subscriptionState } });
}

/** Twilio's X-Twilio-Signature: an HMAC-SHA1 of the URL followed by each sorted parameter's name and value. */
export function twilioSignature(url: string, params: Record<string, string>): string {
  const signed = Object.keys(params).sort().reduce((text, name) => `${text}${name}${params[name]}`, url);
  return createHmac("sha1", TWILIO_AUTH_TOKEN).update(signed).digest("base64");
}

export const randomE164 = () => `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
export const twilioPhoneSid = () => `PN${randomBytes(16).toString("hex")}`;

/** An active number the business already holds, as a finished claim leaves it. */
export async function holdNumber(database: Migrator, businessId: string, input: { carrier: "twilio" | "telnyx"; providerPhoneId?: string; e164?: string }): Promise<{ id: string; e164: string }> {
  const e164 = input.e164 ?? randomE164();
  const [row] = await database.db.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164, carrier: input.carrier, providerPhoneId: input.providerPhoneId ?? null, status: "active", voiceEnabled: true, smsEnabled: true }).returning({ id: phoneNumbers.id });
  return { id: row!.id, e164 };
}

/** Removes only this test's people and business, so a retry starts clean. */
export async function removeFixtures(database: Migrator, input: { emails: string[]; businessIds: string[] }): Promise<void> {
  for (const businessId of input.businessIds) {
    await database.db.execute(sql`delete from public.outbox_messages where business_id = ${businessId}`);
    await database.db.execute(sql`delete from public.businesses where id = ${businessId}`);
  }
  for (const email of input.emails) {
    await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email = ${email})`);
    await database.db.execute(sql`delete from public.verifications where identifier = ${`email-verification-otp-${email}`}`);
    await database.db.execute(sql`delete from public.users where email = ${email}`);
  }
}
