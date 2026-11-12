import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { businesses, createDatabaseClient, websiteIngestionJobs } from "@lobbystack/db";

import common from "../public/locales/en/common.json" with { type: "json" };
import dashboard from "../public/locales/en/dashboard.json" with { type: "json" };
import onboarding from "../public/locales/en/onboarding.json" with { type: "json" };

import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const password = "Getting-Started-Password-123!";
const prefix = "getting-started";

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
  await page.getByLabel(onboarding.businessName.label).fill(`Getting Started ${randomUUID().slice(0, 8)}`);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
  await page.getByRole("button", { name: onboarding.businessName.continue }).click();
  const { businessId } = await (await created).json() as { businessId: string };
  // Let the form's own navigation settle before this test moves the stage on.
  await expect(page).toHaveURL("/onboarding/website");
  // The rest of onboarding has its own journeys; the dashboard opens once it's complete.
  await database.db.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
  return businessId;
}

test("Getting started opens the test window on the agent, and Escape closes it", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, database, email);
    await page.goto("/");
    await page.getByRole("button", { name: dashboard.setupGuide.steps.testCall }).click();
    await page.getByRole("button", { name: dashboard.setupGuide.stepActions.testCall, exact: true }).click();
    const window = page.getByRole("dialog");
    await expect(window.getByRole("heading", { name: "Default agent", exact: true })).toBeVisible();
    await expect(window.getByText(/^Getting Started /)).toBeVisible();
    await expect(window.getByRole("button", { name: common.testCall.start, exact: true })).toBeVisible();
    await expect(window.getByRole("textbox", { name: common.testWindow.message })).toBeVisible();
    await expect(window.getByText(common.testWindow.orCall)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(window).toHaveCount(0);
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});

const list = (page: Page) => page.getByRole("heading", { name: dashboard.setupGuide.title, exact: true });
const dailyView = (page: Page) => page.getByRole("heading", { name: dashboard.home.actionRequired.title, exact: true });

test("Home shows Getting started above the dashboard until the owner skips setup, old links land there, and it stays gone", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, database, email);
    await page.goto("/setup-guide");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: dashboard.home.title, exact: true })).toBeVisible();
    await expect(list(page)).toBeVisible();
    await expect(dailyView(page)).toBeVisible();
    await expect(page.locator('[data-slot="sidebar"]').getByText(dashboard.setupGuide.title, { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: dashboard.setupGuide.skip, exact: true }).click();
    await expect(page.getByText(dashboard.setupGuide.finished, { exact: true })).toBeVisible();
    await expect(dailyView(page)).toBeVisible();
    await expect(list(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);

    await page.reload();
    await expect(dailyView(page)).toBeVisible();
    await expect(list(page)).toHaveCount(0);
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});

test("Getting started says a website read stalled, and Try again starts it again", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, database, email);
    // A crawl the worker started 20 minutes ago and never reported on again, as when it crashed.
    const documentId = randomUUID();
    await database.db.execute(sql`update public.businesses set website_url = 'https://stalled.example.invalid/' where id = ${businessId}`);
    await database.db.execute(sql`insert into public.knowledge_documents (id, business_id, source_type, title, source_url, status) values (${documentId}, ${businessId}, 'website', 'https://stalled.example.invalid/', 'https://stalled.example.invalid/', 'processing')`);
    await database.db.execute(sql`insert into public.website_ingestion_jobs (business_id, root_document_id, website_url, provider, status, page_limit, created_at, updated_at) values (${businessId}, ${documentId}, 'https://stalled.example.invalid/', 'firecrawl', 'crawling', 50, now() - interval '20 minutes', now() - interval '20 minutes')`);
    await page.goto("/");
    await expect(list(page)).toBeVisible();
    await expect(page.getByText(common.websiteImport.stalledTitle.replace("{{host}}", "stalled.example.invalid"), { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: dashboard.setupGuide.skipStep, exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: dashboard.setupGuide.stepActions.tryAgain, exact: true }).click();
    // The read starts over, and the step shows it running again.
    await expect(page.getByText(common.websiteImport.inlineRunning.replace("{{host}}", "stalled.example.invalid").replace("{{count}}", "0"), { exact: true })).toBeVisible();
    const [job] = await database.db.select({ status: websiteIngestionJobs.status }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.rootDocumentId, documentId));
    expect(job?.status).toBe("queued");
  } finally {
    if (businessId) await database.db.execute(sql`delete from public.outbox_messages where business_id = ${businessId}`);
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});

test("Getting started stays after the first real conversation", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const email = `${prefix}-${randomUUID()}@example.invalid`;
  let businessId: string | undefined;
  try {
    businessId = await newOwner(page, testInfo, database, email);
    await page.goto("/");
    await expect(list(page)).toBeVisible();

    await database.db.execute(sql`insert into public.first_real_conversations (business_id, channel) values (${businessId}, 'voice')`);
    await page.reload();
    await expect(dailyView(page)).toBeVisible();
    await expect(list(page)).toBeVisible();
  } finally {
    await removeFixtures(database, email, businessId);
    await database.pool.end();
  }
});
