import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Runs the real Better Auth config against an in-memory database: the passkey
// routes answer on the host's domain with the relying party we name, and
// nowhere else.
const store = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(store.tables) };
});
vi.mock("./databases", () => ({ getDatabase: (role: string) => ({ db: {}, role }) }));
vi.mock("@lobbystack/db", async importOriginal => ({ ...await importOriginal<typeof import("@lobbystack/db")>(), assertDatabaseRole: async () => undefined }));

const base = "http://localhost:3000";
const secret = "passkey-test-secret-with-enough-length";
const hostBrand = { "x-lobbystack-brand": "host" };
const partnerOrigin = "http://acme.partners.localhost:3000";
const partnerBrand = { host: "acme.partners.localhost:3000", "x-lobbystack-brand": "partner:7b0c5a43-62c4-4a51-9d0e-6f6f0e0d9a11", "x-lobbystack-brand-origin": partnerOrigin };
// Better Auth keeps rate limits in one process-wide map, so each request gets its own client.
let client = 0;
const clientHeaders = (brand: Record<string, string>) => ({ "x-real-ip": `198.51.100.${++client}`, ...brand });

async function handle(path: string, brand: Record<string, string>, init: RequestInit = {}) {
  const { getAuth } = await import("./auth");
  const auth = getAuth() as { handler: (request: Request) => Promise<Response> };
  return await auth.handler(new Request(`${base}/api/auth${path}`, { ...init, headers: { ...clientHeaders(brand), ...(init.headers as Record<string, string> | undefined) } }));
}

beforeEach(() => {
  vi.resetModules();
  store.tables = Object.fromEntries(["user", "session", "account", "verification", "passkey", "oauthClient", "oauthResource", "oauthClientResource", "oauthRefreshToken", "oauthAccessToken", "oauthConsent", "oauthClientAssertion"].map(name => [name, []]));
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
  vi.stubEnv("APP_BASE_URL", base);
  vi.stubEnv("PASSKEY_RP_ID", "");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("starts a passkey sign-in on the host's domain for the app's relying party", async () => {
  const response = await handle("/passkey/generate-authenticate-options", hostBrand);
  expect(response.status).toBe(200);
  // Better Auth's own default would be "localhost" for every host, since the base URL is resolved per request.
  expect((await response.json() as { rpId: string }).rpId).toBe("localhost");
});

it("uses the relying party named in PASSKEY_RP_ID", async () => {
  vi.stubEnv("PASSKEY_RP_ID", "login.example.test");
  const response = await handle("/passkey/generate-authenticate-options", hostBrand);
  expect((await response.json() as { rpId: string }).rpId).toBe("login.example.test");
});

it.each([
  ["a partner's host", partnerBrand],
  ["a request the proxy resolved no brand for", {}],
])("has no passkey routes for %s", async (_name, brand) => {
  for (const path of ["/passkey/generate-authenticate-options", "/passkey/list-user-passkeys"]) {
    expect((await handle(path, brand)).status).toBe(404);
  }
  expect((await handle("/passkey/verify-authentication", brand, { method: "POST", body: JSON.stringify({ response: {} }), headers: { "content-type": "application/json" } })).status).toBe(404);
});

/** Puts a signed-in user in the store and returns the cookie of their new session. */
function signIn(emailVerified: boolean): { cookie: string } {
  const now = new Date();
  const token = "session-token";
  store.tables.user!.push({ id: "user-1", name: "Owner", email: "owner@example.test", emailVerified, createdAt: now, updatedAt: now });
  store.tables.session!.push({ id: "session-1", token, userId: "user-1", expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now });
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return { cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}` };
}

it("lets an account with a verified email start adding a passkey", async () => {
  const response = await handle("/passkey/generate-register-options", hostBrand, { headers: signIn(true) });
  expect(response.status).toBe(200);
  expect((await response.json() as { rp: { id: string } }).rp.id).toBe("localhost");
});

it("refuses a passkey for an account whose email isn't verified", async () => {
  const cookie = signIn(false);
  const options = await handle("/passkey/generate-register-options", hostBrand, { headers: cookie });
  expect(options.status).toBe(403);
  expect(await options.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  const verify = await handle("/passkey/verify-registration", hostBrand, { method: "POST", body: JSON.stringify({ response: {} }), headers: { "content-type": "application/json", origin: base, ...cookie } });
  expect(verify.status).toBe(403);
  expect(store.tables.passkey).toEqual([]);
});

it("needs a signed-in session to list or register passkeys", async () => {
  expect((await handle("/passkey/list-user-passkeys", hostBrand)).status).toBe(401);
  expect((await handle("/passkey/generate-register-options", hostBrand)).status).toBe(401);
});
