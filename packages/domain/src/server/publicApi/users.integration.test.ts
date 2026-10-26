import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDatabaseClient, outboxMessages, users } from "@lobbystack/db";

import { generatePlatformKey, resolveConfiguredPlatformKey, resolvePlatformKeyOwner } from "./platformKeys";
import { inviteUserForApi } from "./users";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("User integration tests require a dedicated local test database.");
  }
}

// The admin reads accounts with the lobbystack_auth role and queues email with lobbystack_app; run the same roles here.
function roleUrl(role: string): string {
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}

const admin = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
const auth = testUrl ? createDatabaseClient("lobbystack_auth", { DATABASE_URL: roleUrl("lobbystack_auth") }) : undefined;
const app = testUrl ? createDatabaseClient("lobbystack_app", { DATABASE_URL: roleUrl("lobbystack_app") }) : undefined;
const worker = testUrl ? createDatabaseClient("lobbystack_worker", { DATABASE_URL: roleUrl("lobbystack_worker") }) : undefined;
const emails: string[] = [];
const accounts: string[] = [];

afterAll(async () => {
  if (admin && emails.length) await admin.db.delete(outboxMessages).where(inArray(sql`${outboxMessages.payload}->>'to'`, emails));
  if (admin && accounts.length) await admin.db.delete(users).where(inArray(users.id, accounts));
  await Promise.all([admin?.pool.end(), auth?.pool.end(), app?.pool.end(), worker?.pool.end()]);
});

describe.skipIf(!testUrl)("POST /users", () => {
  const { key, entry } = generatePlatformKey({ name: "AlloPlace CLI", group: "alloplace", ownerEmail: "ops@alloplace.example" });
  const resolved = () => resolveConfiguredPlatformKey(key, { PLATFORM_API_KEYS: JSON.stringify([entry]) })!;
  const invite = async (email: string, idempotencyKey = `owner-${randomUUID()}`, locale?: "en" | "fr" | "es" | "sr") => await inviteUserForApi({ auth: auth!.db, app: app!.db }, { key: resolved(), idempotencyKey, body: { email, ...(locale ? { locale } : {}) }, appBaseUrl: "https://app.example.com" });
  const queued = async (email: string) => (await admin!.db.select({ payload: outboxMessages.payload, aggregateId: outboxMessages.aggregateId }).from(outboxMessages).where(and(eq(outboxMessages.topic, "email.send"), eq(sql`${outboxMessages.payload}->>'to'`, email)))).map((row) => ({ ...row.payload, aggregateId: row.aggregateId }));
  const accountsWith = async (email: string) => await admin!.db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, email));

  it("emails a new address a sign-up link and makes no account, so its owner can still sign up with a password or Google", async () => {
    const email = `owner-${randomUUID()}@example.invalid`;
    emails.push(email);
    const idempotencyKey = `owner-${randomUUID()}`;
    expect(await invite(` ${email.toUpperCase()} `, idempotencyKey, "es")).toEqual({ email, locale: "es" });
    expect(await accountsWith(email)).toEqual([]);
    expect(await queued(email)).toEqual([{ template: "account_setup", to: email, variables: { locale: "es", email, url: "https://app.example.com/es/signup" }, brand: { kind: "host" }, replyTo: null, aggregateId: null }]);
    // A retry of the same request sends nothing more.
    await invite(email, idempotencyKey, "es");
    expect(await queued(email)).toHaveLength(1);

    // The person signs up and verifies the address, as sign-up or Google does; nothing stood in the way.
    const [account] = await admin!.db.insert(users).values({ email, normalizedEmail: email, emailVerified: true }).returning({ id: users.id });
    accounts.push(account!.id);
    // Their verified account can own a platform key.
    expect(await resolvePlatformKeyOwner({ db: worker!.db }, email)).toBe(account!.id);
  });

  it("answers the same for an address that has an account, touches nothing, and sends it a sign-in link in its own language", async () => {
    const email = `taken-${randomUUID()}@example.invalid`;
    emails.push(email);
    const [account] = await admin!.db.insert(users).values({ email, normalizedEmail: email, emailVerified: false, preferredLocale: "fr", name: "Ana" }).returning();
    accounts.push(account!.id);
    expect(await invite(email.toUpperCase(), undefined, "es")).toEqual({ email, locale: "es" });
    const [after] = await admin!.db.select().from(users).where(eq(users.id, account!.id));
    expect(after).toEqual(account);
    expect(await accountsWith(email)).toHaveLength(1);
    expect(await queued(email)).toEqual([{ template: "existing_account", to: email, variables: { locale: "fr", signInUrl: "https://app.example.com/fr/login", resetUrl: "https://app.example.com/fr/forgot-password" }, brand: { kind: "host" }, replyTo: null, aggregateId: account!.id }]);
  });

  it("emails under the partner's brand, with links to its dashboard, for a partner's key", async () => {
    const email = `owner-${randomUUID()}@example.invalid`;
    emails.push(email);
    const partnerId = randomUUID();
    const partnerPlatformKey = { platformKeyId: randomUUID(), prefix: "lsp_0a1b2c3d", name: "Acme onboarding", group: partnerId, partnerId, access: "group" as const, scopes: ["users:create" as const], createdAt: new Date().toISOString() };
    await inviteUserForApi({ auth: auth!.db, app: app!.db }, { key: partnerPlatformKey, idempotencyKey: `owner-${randomUUID()}`, body: { email }, appBaseUrl: "https://acme.portal.example" });
    expect(await queued(email)).toEqual([{ template: "account_setup", to: email, variables: { locale: "en", email, url: "https://acme.portal.example/en/signup" }, brand: { kind: "partner", partnerId }, replyTo: null, aggregateId: null }]);
  });
});
