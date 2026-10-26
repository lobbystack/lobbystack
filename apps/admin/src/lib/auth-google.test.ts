import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Runs the real Better Auth config through Google's redirect flow, with an
// in-memory database and a stubbed Google token endpoint.
const store = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(store.tables) };
});
vi.mock("./databases", () => ({ getDatabase: (role: string) => ({ db: {}, role }) }));
vi.mock("@lobbystack/db", async importOriginal => ({ ...await importOriginal<typeof import("@lobbystack/db")>(), assertDatabaseRole: async () => undefined }));

const base = "http://localhost:3000";
const page = "/fr/signup?returnTo=%2Fagent&source=calculator";
// What the proxy sets on the host's domain, and on a partner's subdomain.
const hostBrand = { "x-lobbystack-brand": "host" };
const partnerOrigin = "http://acme.partners.localhost:3000";
const partnerBrand = { host: "acme.partners.localhost:3000", "x-lobbystack-brand": "partner:7b0c5a43-62c4-4a51-9d0e-6f6f0e0d9a11", "x-lobbystack-brand-origin": partnerOrigin };
// Better Auth keeps rate limits in one process-wide map, so each request gets its own client.
let client = 0;
const clientHeaders = (brand: Record<string, string> = hostBrand) => ({ "content-type": "application/json", "x-real-ip": `198.51.100.${++client}`, ...brand });

function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", kid: "fixture" })}.${part({ iss: "https://accounts.google.com", aud: "client-id", ...claims })}.signature`;
}

/** Starts Google sign-in the way AuthCard does, then returns from Google as the given account. */
async function signInWithGoogle(account: { sub: string; email: string; email_verified: boolean }) {
  const { getAuth } = await import("./auth");
  const auth = getAuth() as { handler: (request: Request) => Promise<Response> };
  const start = await auth.handler(new Request(`${base}/api/auth/sign-in/social`, {
    method: "POST",
    headers: clientHeaders(),
    body: JSON.stringify({ provider: "google", callbackURL: `${page}&google=login`, newUserCallbackURL: `${page}&google=signup`, errorCallbackURL: page, additionalData: { preferredLocale: "fr" } }),
  }));
  const authorize = new URL((await start.json() as { url: string }).url);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "access", id_token: idToken({ ...account, name: "Owner" }), token_type: "Bearer", expires_in: 3600, scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile" })));
  const cookie = start.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const callback = await auth.handler(new Request(`${base}/api/auth/callback/google?code=fixture&state=${authorize.searchParams.get("state")}`, { headers: { cookie, ...hostBrand } }));
  return { authorize, callback };
}

function seedUser(emailVerified: boolean) {
  const now = new Date();
  store.tables.user!.push({ id: "existing", name: "Owner", email: "owner@example.invalid", emailVerified, normalizedEmail: "owner@example.invalid", preferredLocale: "en", createdAt: now, updatedAt: now });
  store.tables.account!.push({ id: "credential", userId: "existing", providerId: "credential", accountId: "existing", password: "hash", createdAt: now, updatedAt: now });
}

beforeEach(() => {
  vi.resetModules();
  store.tables = Object.fromEntries(["user", "session", "account", "verification", "oauthClient", "oauthResource", "oauthClientResource", "oauthRefreshToken", "oauthAccessToken", "oauthConsent", "oauthClientAssertion"].map(model => [model, []]));
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
  vi.stubEnv("APP_BASE_URL", base);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("asks Google for the sign-in scopes only and creates a new user in the page's language", async () => {
  const { authorize, callback } = await signInWithGoogle({ sub: "google-new", email: "new@example.invalid", email_verified: true });
  expect(`${authorize.origin}${authorize.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(authorize.searchParams.get("redirect_uri")).toBe(`${base}/api/auth/callback/google`);
  expect(authorize.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
  expect(authorize.searchParams.has("include_granted_scopes")).toBe(false);
  expect(authorize.searchParams.has("access_type")).toBe(false);
  expect(callback.headers.get("location")).toBe(`${page}&google=signup`);
  expect(callback.headers.getSetCookie().some(value => value.startsWith("better-auth.session_token="))).toBe(true);
  expect(store.tables.user).toEqual([expect.objectContaining({ email: "new@example.invalid", emailVerified: true, preferredLocale: "fr" })]);
  expect(store.tables.account).toEqual([expect.objectContaining({ providerId: "google", accountId: "google-new" })]);
});

it("links Google to an existing verified account with the same email", async () => {
  seedUser(true);
  const { callback } = await signInWithGoogle({ sub: "google-owner", email: "owner@example.invalid", email_verified: true });
  expect(callback.headers.get("location")).toBe(`${page}&google=login`);
  expect(store.tables.user).toEqual([expect.objectContaining({ id: "existing", preferredLocale: "en" })]);
  expect(store.tables.account).toContainEqual(expect.objectContaining({ providerId: "google", accountId: "google-owner", userId: "existing" }));
});

it("refuses to link a Google identity whose email Google hasn't verified", async () => {
  seedUser(true);
  const { callback } = await signInWithGoogle({ sub: "google-owner", email: "owner@example.invalid", email_verified: false });
  expect(callback.headers.get("location")).toBe(`${page}&error=account_not_linked`);
  expect(store.tables.account?.map(account => account.providerId)).toEqual(["credential"]);
  expect(store.tables.session).toEqual([]);
});

it("refuses to link an existing account that never verified its email", async () => {
  seedUser(false);
  const { callback } = await signInWithGoogle({ sub: "google-owner", email: "owner@example.invalid", email_verified: true });
  expect(callback.headers.get("location")).toBe(`${page}&error=account_not_linked`);
  expect(store.tables.account?.map(account => account.providerId)).toEqual(["credential"]);
  expect(store.tables.session).toEqual([]);
});

it("refuses Google ID tokens posted straight to the sign-in endpoint", async () => {
  const { getAuth } = await import("./auth");
  const response = await getAuth().handler(new Request(`${base}/api/auth/sign-in/social`, { method: "POST", headers: clientHeaders(), body: JSON.stringify({ provider: "google", idToken: { token: idToken({ sub: "google-new", email: "new@example.invalid", email_verified: true }) } }) }));
  expect(response.status).toBe(404);
  expect(store.tables.user).toEqual([]);
});

it("turns Google off without the Calendar OAuth client", async () => {
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  const { getAuth, googleSignInEnabled } = await import("./auth");
  expect(googleSignInEnabled()).toBe(false);
  expect(getAuth().options.socialProviders).toBeUndefined();
});

it("keeps Google off a partner's host, where only email and password sign in", async () => {
  vi.stubEnv("PARTNER_BASE_DOMAIN", "partners.localhost");
  const { getAuth } = await import("./auth");
  const auth = getAuth() as { handler: (request: Request) => Promise<Response> };
  const start = await auth.handler(new Request(`${partnerOrigin}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { ...clientHeaders(partnerBrand), origin: partnerOrigin },
    body: JSON.stringify({ provider: "google", callbackURL: "/en/login" }),
  }));
  expect(start.status).toBe(404);
  // A Google answer that reaches a partner's host goes no further either.
  const callback = await auth.handler(new Request(`${partnerOrigin}/api/auth/callback/google?code=fixture&state=forged`, { headers: partnerBrand }));
  expect(callback.status).toBe(404);
  const link = await auth.handler(new Request(`${partnerOrigin}/api/auth/link-social`, { method: "POST", headers: { ...clientHeaders(partnerBrand), origin: partnerOrigin }, body: JSON.stringify({ provider: "google" }) }));
  expect(link.status).toBe(404);
  // A request the proxy resolved no brand for doesn't get Google either.
  const unresolved = await auth.handler(new Request(`${base}/api/auth/sign-in/social`, { method: "POST", headers: clientHeaders({}), body: JSON.stringify({ provider: "google", callbackURL: "/en/login" }) }));
  expect(unresolved.status).toBe(404);
  expect(store.tables.user).toEqual([]);
});

it("offers Google on the host's domain only", async () => {
  const { GET } = await import("../../app/api/auth/providers/route");
  const providers = async (headers: Record<string, string>) => await (GET(new Request(`${base}/api/auth/providers`, { headers })) as Response).json();
  expect(await providers(hostBrand)).toEqual({ google: true });
  expect(await providers(partnerBrand)).toEqual({ google: false });
  expect(await providers({})).toEqual({ google: false });
  // Without the OAuth client, the host's domain doesn't offer it either.
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  expect(await providers(hostBrand)).toEqual({ google: false });
});
