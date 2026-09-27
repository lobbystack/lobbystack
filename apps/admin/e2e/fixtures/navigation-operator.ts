import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { Browser, Page } from "@playwright/test";

import { and, eq, sql } from "drizzle-orm";

import { DateTime } from "luxon";

import { accounts, agents, appointments, businesses, calls, contacts, conversations, createDatabaseClient, knowledgeSnippets, messages, phoneNumbers, services, staff, users, widgetKeys, widgetVisitors } from "@lobbystack/db";
import { createBusiness, createReceptionist } from "@lobbystack/domain";

import { hashReplacementPassword } from "../../src/lib/password";
import { respectingAuthRateLimit } from "./auth-rate-limit";

// Test operators for the navigation specs and manual checks on a local
// database. They use example.test addresses and a fixed test password.
export const NAVIGATION_TEST_PASSWORD = "Navigation-Test-Password-123!";

export type NavigationOperator = { userId: string; businessId: string; email: string; receptionistIds: string[]; phoneNumberId: string; widgetKeyId: string };

function requireLocalDatabase(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error("A local database URL is required to seed navigation operators.");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Navigation operators can only be seeded into a local database.");
  return databaseUrl;
}

/**
 * Creates a verified owner with a finished business, the way signup and
 * onboarding leave it, plus a few shared services, knowledge, a phone number
 * and a widget key. `receptionists` adds receptionists after the default one.
 */
export async function seedNavigationOperator(input: {
  databaseUrl: string | undefined;
  email?: string;
  businessName?: string;
  locale?: "en" | "fr";
  newNavigation?: boolean;
  staffEnabled?: boolean;
  receptionists?: string[];
}): Promise<NavigationOperator> {
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: requireLocalDatabase(input.databaseUrl) });
  const context = { db: database.db };
  try {
    const userId = randomUUID();
    const email = input.email ?? `nav-${userId.slice(0, 8)}@example.test`;
    await database.db.insert(users).values({ id: userId, email, normalizedEmail: email.toLowerCase(), emailVerified: true, name: "Nav Owner", preferredLocale: input.locale ?? "en" });
    await database.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: await hashReplacementPassword(NAVIGATION_TEST_PASSWORD) });
    const { businessId } = await createBusiness(context, { userId, name: input.businessName ?? "Maple Dental", timezone: "America/Toronto", businessType: "clinic", deploymentMode: "self_hosted_standard" });
    await database.db.update(businesses).set({
      onboardingStage: "complete",
      defaultLocale: input.locale ?? "en",
      staffEnabled: input.staffEnabled ?? false,
      featureFlags: input.newNavigation === false ? {} : { new_navigation: true },
      setupGuideSkippedSteps: ["fullScan", "sources", "testCall", "phoneNumber"],
    }).where(eq(businesses.id, businessId));
    await database.db.insert(services).values([
      { businessId, name: "Cleaning", slug: "cleaning", durationMinutes: 30 },
      { businessId, name: "Whitening", slug: "whitening", durationMinutes: 60 },
    ]);
    await database.db.insert(knowledgeSnippets).values([
      { businessId, title: "Parking", content: "Free parking behind the building." },
      { businessId, title: "Payment", content: "We take debit and credit cards." },
    ]);
    const [number] = await database.db.insert(phoneNumbers).values({ businessId, e164: `+1555${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}` }).returning({ id: phoneNumbers.id });
    const [key] = await database.db.insert(widgetKeys).values({ businessId, keyHash: createHash("sha256").update(randomUUID()).digest("hex"), label: "Main website" }).returning({ id: widgetKeys.id });
    for (const name of input.receptionists ?? []) await createReceptionist(context, { userId, businessId, name });
    const rows = await database.db.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, businessId), sql`${agents.archivedAt} is null`)).orderBy(sql`${agents.isDefault} desc`, agents.createdAt);
    await database.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, userId));
    return { userId, businessId, email, receptionistIds: rows.map((row) => row.id), phoneNumberId: number!.id, widgetKeyId: key!.id };
  } finally {
    await database.pool.end();
  }
}

/**
 * Gives a seeded business a call, a website chat and a text, each answered by
 * the given receptionists, and one appointment today at 10:00 business time.
 */
export async function seedNavigationActivity(databaseUrl: string | undefined, operator: NavigationOperator, input: { callAgentId: string; chatAgentId: string; textAgentId: string }): Promise<void> {
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: requireLocalDatabase(databaseUrl) });
  try {
    const { businessId } = operator;
    const [contact] = await database.db.insert(contacts).values({ businessId, name: "Marie Roy", phone: `+1514${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}` }).returning({ id: contacts.id });
    const visitorId = randomUUID();
    await database.db.insert(widgetVisitors).values({ id: visitorId, businessId, name: "Sam Visitor" });
    const [callConversation] = await database.db.insert(conversations).values({ businessId, contactId: contact!.id, channel: "voice", agentId: input.callAgentId, summary: "Asked to move a cleaning to Friday." }).returning({ id: conversations.id });
    await database.db.insert(calls).values({ businessId, conversationId: callConversation!.id, contactId: contact!.id, providerCallId: `nav-${randomUUID()}`, transport: "voice", status: "completed", startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), endedAt: new Date(Date.now() - 3 * 60 * 60 * 1000 + 90_000), agentId: input.callAgentId });
    const [chat] = await database.db.insert(conversations).values({ businessId, widgetVisitorId: visitorId, channel: "web_chat", agentId: input.chatAgentId }).returning({ id: conversations.id });
    const [text] = await database.db.insert(conversations).values({ businessId, contactId: contact!.id, channel: "sms", agentId: input.textAgentId }).returning({ id: conversations.id });
    await database.db.insert(messages).values([
      { businessId, conversationId: chat!.id, direction: "inbound", channel: "web_chat", body: "Is there parking near you?", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      { businessId, conversationId: chat!.id, direction: "outbound", channel: "web_chat", body: "Yes, free parking behind the building.", aiGenerated: true, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5000) },
      { businessId, conversationId: text!.id, direction: "inbound", channel: "sms", body: "Running ten minutes late", createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    ]);
    const [service] = await database.db.select({ id: services.id }).from(services).where(eq(services.businessId, businessId)).limit(1);
    const [member] = await database.db.select({ id: staff.id }).from(staff).where(eq(staff.businessId, businessId)).limit(1);
    const [business] = await database.db.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    const startsAt = DateTime.now().setZone(business!.timezone).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
    await database.db.insert(appointments).values({ businessId, contactId: contact!.id, staffId: member!.id, serviceId: service!.id, startsAt: startsAt.toJSDate(), endsAt: startsAt.plus({ minutes: 30 }).toJSDate(), timezone: business!.timezone, sourceChannel: "voice" });
  } finally {
    await database.pool.end();
  }
}

let signIns = 0;

/** Signs a seeded operator in, in a fresh browser context. */
export async function signInNavigationOperator(browser: Browser, baseURL: string | undefined, operator: NavigationOperator, options: { locale?: string; colorScheme?: "light" | "dark" } = {}): Promise<Page> {
  const context = await browser.newContext({ locale: options.locale ?? "en-US", colorScheme: options.colorScheme ?? "light", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  signIns += 1;
  await page.setExtraHTTPHeaders({ "x-real-ip": `198.19.${signIns % 250}.${Math.floor(Math.random() * 250)}` });
  const origin = new URL(baseURL ?? "http://localhost:13000").origin;
  const response = await respectingAuthRateLimit(() => page.request.post(`${origin}/api/auth/sign-in/email`, { data: { email: operator.email, password: NAVIGATION_TEST_PASSWORD }, headers: { origin } }));
  if (!response.ok()) throw new Error(`Sign-in failed with ${response.status()}: ${await response.text()}`);
  return page;
}

/** Saves a screenshot when NAV_SCREENSHOT_DIR is set. */
export async function navigationScreenshot(page: Page, name: string): Promise<void> {
  const directory = process.env.NAV_SCREENSHOT_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.screenshot({ path: join(directory, `${name}.png`) });
}

/** Removes a seeded operator and everything their business owns. */
export async function removeNavigationOperator(databaseUrl: string | undefined, operator: Pick<NavigationOperator, "userId" | "businessId">): Promise<void> {
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: requireLocalDatabase(databaseUrl) });
  try {
    await database.db.execute(sql`delete from public.businesses where id = ${operator.businessId}::uuid`);
    await database.db.execute(sql`delete from public.users where id = ${operator.userId}::uuid`);
  } finally {
    await database.pool.end();
  }
}
