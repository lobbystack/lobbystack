import { randomBytes, randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// A new password, from settings or from an emailed reset code, must sign the
// account out everywhere else. Runs Better Auth's handler against PostgreSQL.

const setup = vi.hoisted(() => {
  const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
  if (testUrl) {
    const url = new URL(testUrl);
    if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
      throw new Error("Session revocation tests require a dedicated local test database.");
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
    delete process.env.REDIS_URL;
  }
  return { testUrl };
});

vi.mock("./error-reporting", () => ({ reportServerError: vi.fn(async () => undefined) }));

import { accounts, createDatabaseClient, users } from "@lobbystack/db";

import { getAuth } from "./auth";
import { getDatabase } from "./databases";
import { hashReplacementPassword } from "./password";

const base = "http://localhost:3000";
const admin = setup.testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: setup.testUrl }) : undefined;
const createdUsers: string[] = [];
let nextIp = 1;

// Each request comes from its own address so Better Auth's per-IP sign-in limit never trips.
async function auth(path: string, init: { method?: string; cookie?: string; body?: unknown } = {}): Promise<Response> {
  const headers = new Headers({ origin: base, "x-forwarded-for": `203.0.113.${nextIp++}` });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return await getAuth().handler(new Request(`${base}/api/auth${path}`, { method: init.method ?? "GET", headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }));
}

const cookieFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ");
const password = () => `Pw-${randomBytes(12).toString("base64url")}9!`;

async function userWithPassword(): Promise<{ email: string; current: string }> {
  const userId = randomUUID();
  const email = `revoke-it-${userId.slice(0, 8)}@example.com`;
  const current = password();
  const hash = await hashReplacementPassword(current);
  await admin!.db.insert(users).values({ id: userId, email, normalizedEmail: email, emailVerified: true, name: "Owner", passwordHash: hash, passwordAlgorithm: "lobbystack-scrypt-v1" });
  await admin!.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: hash });
  createdUsers.push(userId);
  return { email, current };
}

async function signIn(email: string, current: string): Promise<string> {
  const response = await auth("/sign-in/email", { method: "POST", body: { email, password: current } });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

async function signedIn(cookie: string): Promise<boolean> {
  const response = await auth("/get-session", { cookie });
  return (await response.json() as { session?: unknown } | null)?.session !== undefined;
}

afterAll(async () => {
  if (admin && createdUsers.length) await admin.db.delete(users).where(inArray(users.id, createdUsers));
  await Promise.all([admin?.pool.end(), getDatabase("lobbystack_auth").pool.end(), getDatabase("lobbystack_app").pool.end()]);
});

describe.skipIf(!setup.testUrl)("session revocation on a new password", () => {
  it("signs out every other browser on a password change, even when the client asks to keep them", async () => {
    const { email, current } = await userWithPassword();
    const browserA = await signIn(email, current);
    const browserB = await signIn(email, current);
    expect(await signedIn(browserB)).toBe(true);

    const change = await auth("/change-password", { method: "POST", cookie: browserA, body: { currentPassword: current, newPassword: password(), revokeOtherSessions: false } });
    expect(change.status).toBe(200);

    expect(await signedIn(browserB)).toBe(false);
    // The browser that changed it keeps going on the new session it was given.
    expect(await signedIn(cookieFrom(change))).toBe(true);
  });

  it("signs out every browser when a reset code sets a new password", async () => {
    const { email, current } = await userWithPassword();
    const browserA = await signIn(email, current);
    const browserB = await signIn(email, current);

    const otp = await getAuth().api.createVerificationOTP({ body: { email, type: "forget-password" } });
    const reset = await auth("/email-otp/reset-password", { method: "POST", body: { email, otp, password: password() } });
    expect(reset.status).toBe(200);

    expect(await signedIn(browserA)).toBe(false);
    expect(await signedIn(browserB)).toBe(false);
  });
});
