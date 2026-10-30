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

it("needs a signed-in session to list or register passkeys", async () => {
  expect((await handle("/passkey/list-user-passkeys", hostBrand)).status).toBe(401);
  expect((await handle("/passkey/generate-register-options", hostBrand)).status).toBe(401);
});
