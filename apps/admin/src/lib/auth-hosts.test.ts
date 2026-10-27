import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Runs the real Better Auth config on a partner's subdomain and on the host's
// domain, with an in-memory database, as the proxy hands requests on: with
// the brand headers it set.
const store = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>>, queued: [] as Array<Record<string, unknown>> }));
vi.mock("server-only", () => ({}));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(store.tables) };
});
vi.mock("./databases", () => ({ getDatabase: (role: string) => ({ db: {}, role }) }));
vi.mock("./branding", () => ({ loadRequestEmailBrand: async () => ({ kind: "partner", partnerId }) }));
vi.mock("@lobbystack/db", async importOriginal => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  assertDatabaseRole: async () => undefined,
  withBusinessTransaction: async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({}),
  enqueueOutbox: async (_tx: unknown, message: { payload: Record<string, unknown> }) => { store.queued.push(message.payload); return "message"; },
}));

const partnerId = "7b0c5a43-62c4-4a51-9d0e-6f6f0e0d9a11";
const base = "http://localhost:3000";
const acme = "http://acme.partners.localhost:3000";
const beta = "http://beta.partners.localhost:3000";
const hostBrand = { host: "localhost:3000", "x-lobbystack-brand": "host" };
const acmeBrand = { host: "acme.partners.localhost:3000", "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": acme };
// Better Auth keeps rate limits in one process-wide map, so each request gets its own client.
let client = 0;

/** The app's Better Auth, with the origin check Better Auth skips under NODE_ENV=test back on, as in production. */
async function auth() {
  const { getAuth } = await import("./auth");
  const instance = getAuth();
  (await instance.$context).skipOriginCheck = false;
  return instance;
}

async function post(path: string, brand: Record<string, string>, origin: string, body: unknown): Promise<Response> {
  const at = brand["x-lobbystack-brand-origin"] ?? base;
  return await (await auth()).handler(new Request(`${at}/api/auth${path}`, {
    method: "POST",
    // What a browser's fetch sends: the page's origin and its fetch metadata.
    headers: { ...brand, origin, "sec-fetch-site": origin === at ? "same-origin" : "same-site", "sec-fetch-mode": "cors", "content-type": "application/json", "x-real-ip": `198.51.100.${++client}` },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.resetModules();
  store.tables = Object.fromEntries(["user", "session", "account", "verification", "oauthClient", "oauthResource", "oauthClientResource", "oauthRefreshToken", "oauthAccessToken", "oauthConsent", "oauthClientAssertion"].map(model => [model, []]));
  store.queued = [];
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
  vi.stubEnv("APP_BASE_URL", base);
  vi.stubEnv("PARTNER_BASE_DOMAIN", "partners.localhost");
});
afterEach(() => vi.unstubAllEnvs());

it("trusts on a partner's host only the origin the proxy resolved, never another partner's or the host's", async () => {
  const signIn = { email: "nobody@example.invalid", password: "StrongPassword123!" };
  // The origin check passes, so the unknown account is what Better Auth refuses.
  expect((await post("/sign-in/email", acmeBrand, acme, signIn)).status).toBe(401);
  for (const origin of [beta, base, "http://partners.localhost:3000"]) {
    const response = await post("/sign-in/email", acmeBrand, origin, signIn);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_ORIGIN" });
  }
  // The host's domain trusts its own origins, and no partner's.
  expect((await post("/sign-in/email", hostBrand, base, signIn)).status).toBe(401);
  expect((await post("/sign-in/email", hostBrand, acme, signIn)).status).toBe(403);
  // Nor can a page on a partner's host send the browser on to another partner's host.
  const redirect = await post("/sign-in/email", acmeBrand, acme, { ...signIn, callbackURL: `${beta}/en/login` });
  expect(redirect.status).toBe(403);
  expect(await redirect.json()).toMatchObject({ code: "INVALID_CALLBACK_URL" });
});

it("trusts nothing on a request the proxy resolved no brand for", async () => {
  const response = await post("/sign-in/email", {}, base, { email: "nobody@example.invalid", password: "StrongPassword123!" });
  expect(response.status).toBe(403);
});

it("answers the link reset with a 404 on every host, since resets go by emailed code", async () => {
  const now = new Date();
  store.tables.user!.push({ id: "owner", name: "Owner", email: "owner@example.invalid", emailVerified: true, normalizedEmail: "owner@example.invalid", preferredLocale: "en", createdAt: now, updatedAt: now });
  for (const [brand, origin] of [[acmeBrand, acme], [{ ...hostBrand, host: "127.0.0.1:3000" }, base]] as const) {
    expect((await post("/request-password-reset", brand, origin, { email: "owner@example.invalid", redirectTo: "/en/reset-password" })).status).toBe(404);
    expect((await post("/reset-password", brand, origin, { token: "t", newPassword: "StrongPassword123!" })).status).toBe(404);
  }
  expect(store.queued).toEqual([]);
});

it("accepts requests on a partner's own domain once the proxy resolved it there, and with only Caddy's on-demand TLS turned on", async () => {
  const own = "http://app.acme.example:3000";
  const ownBrand = { host: "app.acme.example:3000", "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": own };
  const signIn = { email: "nobody@example.invalid", password: "StrongPassword123!" };
  for (const baseDomain of ["partners.localhost", ""]) {
    vi.resetModules();
    vi.stubEnv("PARTNER_BASE_DOMAIN", baseDomain);
    vi.stubEnv("CADDY_ON_DEMAND_TLS", "true");
    // The origin check passes, so the unknown account is what Better Auth refuses.
    expect((await post("/sign-in/email", ownBrand, own, signIn)).status, baseDomain).toBe(401);
    // The domain trusts only its own origin, as a subdomain does.
    expect((await post("/sign-in/email", ownBrand, acme, signIn)).status, baseDomain).toBe(403);
  }
});

it("keeps a partner's own domain among Better Auth's hosts for the brand cache's window after its last request", async () => {
  const { admitPartnerHost } = await import("./auth");
  const allowedHosts = ["*.partners.localhost", "*.partners.localhost:*"];
  const env = { PARTNER_BASE_DOMAIN: "partners.localhost" };
  const own = new Headers({ "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://app.acme.example" });
  admitPartnerHost(allowedHosts, own, env, 0);
  admitPartnerHost(allowedHosts, own, env, 10_000);
  expect(allowedHosts).toEqual(["*.partners.localhost", "*.partners.localhost:*", "app.acme.example"]);
  // A subdomain is already covered, and the host's domain is no partner's.
  admitPartnerHost(allowedHosts, new Headers(acmeBrand), env, 20_000);
  admitPartnerHost(allowedHosts, new Headers(hostBrand), env, 20_000);
  expect(allowedHosts).toEqual(["*.partners.localhost", "*.partners.localhost:*", "app.acme.example"]);
  // 30 seconds after its last request, the next request on any host drops it.
  admitPartnerHost(allowedHosts, new Headers(hostBrand), env, 40_001);
  expect(allowedHosts).toEqual(["*.partners.localhost", "*.partners.localhost:*"]);
});
