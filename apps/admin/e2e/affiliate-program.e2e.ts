import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { eq, like, sql } from "drizzle-orm";

import { affiliateAttributions, affiliateCommissions, affiliatePayoutItems, affiliateProfiles, businesses, createDatabaseClient, providerEvents, users, type Database } from "@lobbystack/db";
import { createBusiness, generateAffiliatePayoutRun, markAffiliatePayoutItemPaid, reconcileBillingProviderEvent } from "@lobbystack/domain";

import enAffiliate from "../public/locales/en/affiliate.json" with { type: "json" };
import frAffiliate from "../public/locales/fr/affiliate.json" with { type: "json" };
import enCommon from "../public/locales/en/common.json" with { type: "json" };
import frCommon from "../public/locales/fr/common.json" with { type: "json" };
import enNav from "../public/locales/en/nav.json" with { type: "json" };
import enOnboarding from "../public/locales/en/onboarding.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

// The affiliate program end to end: the referrer's page renders in English and
// French, a referral link click is counted, the referred signup is attributed,
// a simulated paid order becomes a commission, and the payout run moves it
// from pending to eligible to paid. No payment provider is contacted.

const prefix = "affiliate-e2e";
const password = "Affiliate-Journey-Password-123!";
const DAY = 24 * 60 * 60_000;
type Bundle = Record<string, unknown>;

function databaseUrl(): string {
  const url = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!url) throw new Error("The disposable E2E database is required.");
  return url;
}

function leafKeys(bundle: Bundle, path = ""): string[] {
  return Object.entries(bundle).flatMap(([key, value]) => value && typeof value === "object" ? leafKeys(value as Bundle, `${path}${key}.`) : [`${path}${key}`]);
}

async function cleanupFixtures(): Promise<void> {
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl() });
  try {
    const owned = database.db.select({ id: users.id }).from(users).where(like(users.email, `${prefix}-%@example.invalid`));
    await database.db.execute(sql`delete from public.affiliate_payout_runs where id in (select payout_run_id from public.affiliate_payout_items where affiliate_profile_id in (select id from public.affiliate_profiles where user_id in ${owned}))`);
    await database.db.execute(sql`delete from public.businesses where id in (select business_id from public.business_memberships where user_id in ${owned})`);
    await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in ${owned}`);
    await database.db.execute(sql`delete from public.verifications where identifier like ${`email-verification-otp-${prefix}-%@example.invalid`}`);
    await database.db.delete(users).where(like(users.email, `${prefix}-%@example.invalid`));
  } finally {
    await database.pool.end();
  }
}

async function signUp(page: Page, path: string, label: string, testInfo: TestInfo): Promise<string> {
  const email = `${prefix}-${label}-${randomUUID()}@example.invalid`;
  await isolateAuthRateLimit(page, email, testInfo);
  await page.goto(path);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/auth/sign-up/email") && response.request().method() === "POST");
  await page.locator('button[type="submit"]').click();
  expect((await submitted).ok()).toBe(true);
  await completeSignupEmailVerification(page, email, password);
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  return email;
}

/** Collects console errors and uncaught exceptions for the page's lifetime. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectFullyTranslated(page: Page, bundle: Bundle, retryLabel: string): Promise<void> {
  await expect(page.getByRole("heading", { name: (bundle as typeof enAffiliate).title })).toBeVisible();
  const copy = bundle as typeof enAffiliate;
  for (const text of [copy.referral.title, copy.referral.copy, copy.terms.title, copy.stats.clicks, copy.stats.clicksDescription, copy.tabs.quickstart, copy.tabs.earnings, copy.tabs.payouts, copy.tabs.faq, copy.settings.open, copy.quickstart.share.title]) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("button", { name: retryLabel })).toHaveCount(0);
  const text = await page.locator("#dashboard-main-content").innerText();
  const rawKeys = leafKeys(bundle).filter((key) => key.includes(".") && text.includes(key));
  expect(rawKeys).toEqual([]);
}

async function affiliateStats(page: Page): Promise<{ clickCount: number; referralCount: number; conversionCount: number; pendingCommissionCents: number; paidCommissionCents: number }> {
  const response = await page.request.get("/api/affiliate");
  expect(response.ok()).toBe(true);
  return (await response.json() as { stats: Awaited<ReturnType<typeof affiliateStats>> }).stats;
}

async function referredSignup(browser: Browser, referralLink: string, testInfo: TestInfo): Promise<{ email: string; businessId: string }> {
  const context = await browser.newContext({ locale: "en-US" });
  try {
    const page = await context.newPage();
    // The click is fire-and-forget and the page moves on, so check its status
    // here and the recorded count through the referrer's stats below.
    const click = page.waitForResponse((response) => response.url().endsWith("/api/affiliate/click") && response.request().method() === "POST").then((response) => response.status());
    const link = new URL(referralLink);
    const email = await signUp(page, `${link.pathname}${link.search}`, "referred", testInfo);
    expect(await click).toBe(200);
    await page.getByLabel(enOnboarding.businessName.label).fill("Referred Plumbing");
    const created = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/businesses" && response.request().method() === "POST");
    await page.getByRole("button", { name: enOnboarding.businessName.continue }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    return { email, businessId: (await response.json() as { businessId: string }).businessId };
  } finally {
    await context.close();
  }
}

test.beforeAll(cleanupFixtures);
test.afterAll(cleanupFixtures);

test("the affiliate program works from referral link to payout", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const migrator = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl() });
  const worker = createDatabaseClient("lobbystack_worker");
  const dispatcher = createDatabaseClient("lobbystack_dispatcher");
  const context = await browser.newContext({ locale: "en-US" });
  try {
    // An operator with a finished workspace opens the affiliate page.
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("lobbystack.locale", "en"));
    const ownerEmail = await signUp(page, "/en/signup", "owner", testInfo);
    // Watch after signup: the verification fixture expects one 403 sign-in.
    const errors = watchErrors(page);
    const owner = (await migrator.db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, ownerEmail)))[0]!;
    const { businessId: ownerBusinessId } = await createBusiness({ db: migrator.db as unknown as Database }, { userId: owner.id, name: "Affiliate Owner Co", timezone: "UTC", businessType: "service_company" });
    await migrator.db.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, ownerBusinessId));
    await migrator.db.update(users).set({ activeBusinessId: ownerBusinessId }).where(eq(users.id, owner.id));

    // Client navigation keeps the dashboard layout, so the namespace loads in the browser.
    await page.goto("/");
    await page.getByRole("link", { name: enNav.items.affiliate }).first().click();
    await expect(page).toHaveURL(/\/affiliate$/);
    await expectFullyTranslated(page, enAffiliate, enCommon.loading.retry);
    await page.screenshot({ path: testInfo.outputPath("affiliate-en.png"), fullPage: true });

    // A direct load gets the namespace from the server render.
    await page.goto("/affiliate?lng=fr");
    await expectFullyTranslated(page, frAffiliate, frCommon.loading.retry);
    await page.screenshot({ path: testInfo.outputPath("affiliate-fr.png"), fullPage: true });
    await page.getByRole("link", { name: frAffiliate.terms.link }).evaluate((link) => (link as HTMLAnchorElement).href).then((href) => expect(href).toBe("https://lobbystack.com/fr/terms/#affiliate-program"));

    // Payout settings.
    await page.getByRole("tab", { name: frAffiliate.settings.open }).click();
    await page.getByRole("button", { name: frAffiliate.settings.change }).click();
    await page.getByRole("textbox", { name: frAffiliate.settings.paypalEmail }).fill(`${prefix}-paypal@example.invalid`);
    await page.getByRole("button", { name: frAffiliate.settings.save }).click();
    await expect(page.getByText(`${prefix}-paypal@example.invalid`)).toBeVisible();

    await page.goto("/affiliate?lng=en");
    const referralLink = await page.locator("input[readonly]").inputValue();
    expect(referralLink).toMatch(/\/signup\?via=[a-z0-9-]+$/);
    const referralCode = new URL(referralLink).searchParams.get("via")!;
    expect(await affiliateStats(page)).toMatchObject({ clickCount: 0, referralCount: 0 });

    // A new visitor follows the link in a separate session and signs up.
    const referred = await referredSignup(browser, referralLink, testInfo);
    expect(await affiliateStats(page)).toMatchObject({ clickCount: 1, referralCount: 1 });
    const attribution = (await migrator.db.select().from(affiliateAttributions).where(eq(affiliateAttributions.businessId, referred.businessId)))[0];
    expect(attribution).toMatchObject({ referralCode, source: "referral_link" });

    // The referred workspace pays. This is the stored Polar event the webhook
    // route persists, reconciled by the same worker code, with no payment made.
    const orderId = `order-${randomUUID()}`;
    const paidAt = new Date();
    const [event] = await migrator.db.insert(providerEvents).values({
      provider: "polar",
      providerEventId: `evt-${randomUUID()}`,
      eventType: "order.paid",
      businessId: referred.businessId,
      payload: { billingKey: `business:${referred.businessId}`, order: { id: orderId, status: "paid", totalAmount: 60_000, currency: "usd", createdAt: paidAt.toISOString() } },
    }).returning({ id: providerEvents.id });
    await reconcileBillingProviderEvent({ db: worker.db }, { businessId: referred.businessId, providerEventId: event!.id });
    expect(await affiliateStats(page)).toMatchObject({ conversionCount: 1, pendingCommissionCents: 12_000 });

    await page.reload();
    await page.getByRole("tab", { name: enAffiliate.tabs.earnings }).click();
    await expect(page.getByRole("cell", { name: enAffiliate.statuses.pending })).toBeVisible();
    await expect(page.getByText(enAffiliate.stats.eligibleWaiting)).toBeVisible();

    // After the 30-day hold the commission is eligible. Advance the browser clock
    // instead of waiting.
    await page.clock.setFixedTime(new Date(paidAt.getTime() + 31 * DAY));
    await page.reload();
    await expect(page.getByText(enAffiliate.stats.eligibleReady)).toBeVisible();

    // The monthly payout run picks it up once it has cleared, then it is paid.
    const periodKey = `e2e-${randomUUID().slice(0, 8)}`;
    const early = await generateAffiliatePayoutRun({ db: worker.db }, { periodKey, createdAt: new Date(paidAt.getTime() + 29 * DAY).toISOString() });
    expect(early.assignedCommissions).toBe(0);
    const run = await generateAffiliatePayoutRun({ db: worker.db }, { periodKey, createdAt: new Date(paidAt.getTime() + 31 * DAY).toISOString() });
    expect(run).toMatchObject({ assignedCommissions: 1, totalCents: 12_000 });
    const profile = (await migrator.db.select({ id: affiliateProfiles.id }).from(affiliateProfiles).where(eq(affiliateProfiles.referralCode, referralCode)))[0]!;
    const item = (await migrator.db.select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.affiliateProfileId, profile.id)))[0]!;
    expect(item).toMatchObject({ status: "ready", amountCents: 12_000, payoutEmail: `${prefix}-paypal@example.invalid` });

    await page.reload();
    await page.getByRole("tab", { name: enAffiliate.tabs.payouts }).click();
    await expect(page.getByRole("cell", { name: enAffiliate.statuses.ready })).toBeVisible();

    expect(await markAffiliatePayoutItemPaid({ db: dispatcher.db }, { payoutItemId: item.id, externalReference: "PAYPAL-E2E" })).toBe(true);
    const commission = (await migrator.db.select().from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, `order:${orderId}`)))[0];
    expect(commission).toMatchObject({ status: "paid", payoutState: "paid" });
    expect(await affiliateStats(page)).toMatchObject({ pendingCommissionCents: 0, paidCommissionCents: 12_000 });
    await page.reload();
    await page.getByRole("tab", { name: enAffiliate.tabs.payouts }).click();
    await expect(page.getByRole("cell", { name: "PAYPAL-E2E" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("affiliate-paid-en.png"), fullPage: true });

    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await Promise.all([migrator.pool.end(), worker.pool.end(), dispatcher.pool.end()]);
  }
});
