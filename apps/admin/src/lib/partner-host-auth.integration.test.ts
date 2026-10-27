import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// Sign-up, sign-in, email verification, password reset and email change on a
// partner's subdomain, through Better Auth's handler against PostgreSQL. Each
// request carries the brand headers the proxy sets on that subdomain, and the
// auth emails it queues are read back from the outbox.

const setup = vi.hoisted(() => {
  const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
  if (testUrl) {
    const url = new URL(testUrl);
    if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
      throw new Error("Partner host auth tests require a dedicated local test database.");
    }
    const roleUrl = (role: string) => {
      const withRole = new URL(testUrl);
      withRole.searchParams.set("options", `-c role=${role}`);
      return withRole.toString();
    };
    process.env.DATABASE_URL = testUrl;
    process.env.LOBBYSTACK_AUTH_DATABASE_URL = roleUrl("lobbystack_auth");
    process.env.LOBBYSTACK_APP_DATABASE_URL = roleUrl("lobbystack_app");
    process.env.LOBBYSTACK_WORKER_DATABASE_URL = roleUrl("lobbystack_worker");
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.PARTNER_BASE_DOMAIN = "partners.localhost";
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    delete process.env.REDIS_URL;
    delete process.env.TURNSTILE_SECRET_KEY;
  }
  // The headers of the request being answered, as next/headers gives them to the route handler.
  return { testUrl, headers: new Headers() };
});

vi.mock("server-only", () => ({}));
vi.mock("./error-reporting", () => ({ reportServerError: vi.fn(async () => undefined) }));
vi.mock("next/headers", async (original) => ({ ...await original<typeof import("next/headers")>(), headers: async () => setup.headers }));

import { accounts, createDatabaseClient, outboxMessages, users, verifications } from "@lobbystack/db";

import { getAuth } from "./auth";
import { getDatabase } from "./databases";
import { hashReplacementPassword } from "./password";

const partnerId = randomUUID();
const acme = "http://acme.partners.localhost:3000";
// What the proxy hands on for a request to acme's subdomain.
const acmeHeaders = { host: "acme.partners.localhost:3000", "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": acme };
const admin = setup.testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: setup.testUrl }) : undefined;
const createdEmails: string[] = [];
let nextIp = 1;

/** A request to Better Auth on acme's subdomain, from a page on it, with the origin check Better Auth skips under NODE_ENV=test back on. */
async function auth(path: string, init: { method?: string; cookie?: string; body?: unknown } = {}): Promise<Response> {
  const headers = new Headers({ ...acmeHeaders, origin: acme, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "x-forwarded-for": `203.0.113.${nextIp++}` });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  setup.headers = headers;
  const instance = getAuth();
  (await instance.$context).skipOriginCheck = false;
  const target = path.startsWith("http") ? path : `${acme}/api/auth${path}`;
  return await instance.handler(new Request(target, { method: init.method ?? "GET", headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }));
}

const cookieFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ");
const password = () => `Pw-${randomBytes(12).toString("base64url")}9!`;
const newEmail = () => {
  const email = `partner-host-it-${randomUUID().slice(0, 8)}@example.com`;
  createdEmails.push(email);
  return email;
};

async function userWithPassword(): Promise<{ email: string; current: string }> {
  const userId = randomUUID();
  const email = newEmail();
  const current = password();
  const hash = await hashReplacementPassword(current);
  await admin!.db.insert(users).values({ id: userId, email, normalizedEmail: email, emailVerified: true, name: "Owner", passwordHash: hash, passwordAlgorithm: "lobbystack-scrypt-v1" });
  await admin!.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: hash });
  return { email, current };
}

type Queued = { template: string; to: string; brand: unknown; replyTo: unknown; variables: Record<string, string> };

/** The auth emails queued for an address, oldest first. */
async function queuedFor(email: string): Promise<Queued[]> {
  const rows = await admin!.db.select({ payload: outboxMessages.payload }).from(outboxMessages)
    .where(and(eq(outboxMessages.topic, "email.send"), inArray(outboxMessages.aggregateType, ["auth_email"])))
    .orderBy(outboxMessages.createdAt);
  return rows.map((row) => row.payload as Queued).filter((payload) => payload.to === email);
}

/** The link an email carries. */
function urlOf(queued: Queued | undefined): string {
  const url = queued?.variables.url;
  if (!url) throw new Error("The email carries no link.");
  return url;
}

/** Every link in the emails queued for an address, which must all lead back to acme's subdomain. */
function linksIn(emails: Queued[]): string[] {
  return emails.flatMap((email) => Object.values(email.variables).filter((value) => /^https?:/.test(value)));
}

async function signIn(email: string, current: string): Promise<string> {
  const response = await auth("/sign-in/email", { method: "POST", body: { email, password: current } });
  expect(response.status).toBe(200);
  // The session cookie stays on acme's subdomain: Better Auth sets no Domain.
  expect(response.headers.getSetCookie().join("\n")).not.toMatch(/domain=/i);
  return cookieFrom(response);
}

afterAll(async () => {
  if (admin && createdEmails.length) {
    const created = await admin.db.select({ id: users.id }).from(users).where(inArray(users.email, createdEmails));
    const ids = created.map((user) => user.id);
    if (ids.length) await admin.db.delete(outboxMessages).where(inArray(outboxMessages.aggregateId, ids));
    if (ids.length) await admin.db.delete(users).where(inArray(users.id, ids));
    await admin.db.delete(verifications).where(like(verifications.identifier, "%partner-host-it-%"));
  }
  await Promise.all([admin?.pool.end(), getDatabase("lobbystack_auth").pool.end(), getDatabase("lobbystack_app").pool.end()]);
});

describe.skipIf(!setup.testUrl)("auth on a partner's subdomain", () => {
  it("signs up, verifies the email with a code, and signs in under the partner's brand", async () => {
    const email = newEmail();
    const current = password();
    expect((await auth("/sign-up/email", { method: "POST", body: { name: "Owner", email, password: current } })).status).toBe(200);
    // Signing in before the address is verified is refused, and sends another code.
    expect((await auth("/sign-in/email", { method: "POST", body: { email, password: current } })).status).toBe(403);

    const codes = await queuedFor(email);
    expect(codes.length).toBeGreaterThan(0);
    for (const queued of codes) expect(queued).toMatchObject({ template: "verify_email", brand: { kind: "partner", partnerId }, replyTo: null, variables: { code: expect.any(String) } });
    expect((await auth("/email-otp/verify-email", { method: "POST", body: { email, otp: codes.at(-1)!.variables.code } })).status).toBe(200);

    const cookie = await signIn(email, current);
    const session = await (await auth("/get-session", { cookie })).json() as { user?: { email?: string } } | null;
    expect(session?.user?.email).toBe(email);
  });

  it("tells an address that already has an account, with sign-in and reset links on the partner's subdomain", async () => {
    const { email } = await userWithPassword();
    expect((await auth("/sign-up/email", { method: "POST", body: { name: "Someone", email, password: password() } })).status).toBe(200);
    const [notice] = await queuedFor(email);
    expect(notice).toMatchObject({ template: "existing_account", brand: { kind: "partner", partnerId }, variables: { signInUrl: `${acme}/en/login`, resetUrl: `${acme}/en/forgot-password` } });
  });

  it("resets a password with a code, and refuses the link reset", async () => {
    const { email } = await userWithPassword();
    expect((await auth("/email-otp/request-password-reset", { method: "POST", body: { email } })).status).toBe(200);
    const [code] = await queuedFor(email);
    expect(code).toMatchObject({ template: "password_reset", brand: { kind: "partner", partnerId }, variables: { code: expect.any(String) } });
    const byCode = password();
    expect((await auth("/email-otp/reset-password", { method: "POST", body: { email, otp: code!.variables.code, password: byCode } })).status).toBe(200);
    await signIn(email, byCode);

    // Resets go by emailed code only, so no reset token ever goes to the host that asked for it.
    expect((await auth("/request-password-reset", { method: "POST", body: { email, redirectTo: "/en/reset-password" } })).status).toBe(404);
    expect(linksIn(await queuedFor(email)).every((url) => url.startsWith(`${acme}/`))).toBe(true);
  });

  it("changes the email through links on the partner's subdomain", async () => {
    const { email, current } = await userWithPassword();
    const cookie = await signIn(email, current);
    const next = newEmail();
    expect((await auth("/change-email", { method: "POST", cookie, body: { newEmail: next, callbackURL: "/settings/account?emailChanged=true" } })).status).toBe(200);

    // The current address confirms the change first.
    const [confirm] = await queuedFor(email);
    expect(confirm).toMatchObject({ template: "verify_email", brand: { kind: "partner", partnerId }, variables: { purpose: "email_change" } });
    expect(urlOf(confirm).startsWith(`${acme}/api/auth/verify-email?token=`)).toBe(true);
    const confirmed = await auth(urlOf(confirm), { cookie });
    expect(confirmed.status).toBe(302);
    expect(new URL(confirmed.headers.get("location")!, acme).origin).toBe(acme);

    // Then the new address verifies it, on the partner's confirmation page.
    const [verify] = await queuedFor(next);
    expect(verify).toMatchObject({ template: "verify_email", brand: { kind: "partner", partnerId } });
    const page = new URL(urlOf(verify));
    expect(`${page.origin}${page.pathname}`).toBe(`${acme}/en/confirm-email-change`);
    expect(page.searchParams.get("email")).toBe(next);
    expect((await auth(`/verify-email?token=${encodeURIComponent(page.searchParams.get("token")!)}`, { cookie })).status).toBe(200);
    expect((await admin!.db.select({ email: users.email }).from(users).where(eq(users.email, next))).length).toBe(1);
    expect(linksIn([...await queuedFor(email), ...await queuedFor(next)]).every((url) => url.startsWith(`${acme}/`))).toBe(true);
  });

  it("refuses Google sign-in on the partner's subdomain", async () => {
    const response = await auth("/sign-in/social", { method: "POST", body: { provider: "google", callbackURL: "/en/login" } });
    expect(response.status).toBe(404);
  });
});
