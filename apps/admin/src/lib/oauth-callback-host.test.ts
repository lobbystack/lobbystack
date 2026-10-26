import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeBrandPartner } from "./brand-database.fake";

// A Google Calendar or Instagram connection a partner's client starts on the
// partner's host. The provider sends its callback to the host's domain, which
// hands it on, and the connection finishes on the partner's host with the
// session the person signed in with there. Runs the real routes, Better Auth
// on an in-memory database, and host resolution through the brand pipeline.
// The providers, the state stores, the rate limits and the domain's connect
// functions are fakes, and the start routes skip the membership check.
const fixture = vi.hoisted(() => ({
  tables: Object.fromEntries(["user", "session", "account", "verification"].map((model) => [model, [] as Array<Record<string, unknown>>])),
  partners: [] as FakeBrandPartner[],
  databaseDown: false,
  states: new Set<string>(),
  connectCalendar: vi.fn(),
  connectInstagram: vi.fn(),
  switchWorkspace: vi.fn(),
  exchanged: [] as string[],
  report: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(fixture.tables) };
});
vi.mock("./databases", async () => {
  const { fakeBrandDatabase } = await import("./brand-database.fake");
  return {
    getDatabase: () => ({
      db: fakeBrandDatabase({
        saved: async () => [],
        partners: () => {
          if (fixture.databaseDown) throw new Error("database unavailable");
          return fixture.partners;
        },
      }),
    }),
  };
});
vi.mock("./branding", () => ({ loadRequestEmailBrand: async () => ({ kind: "host" }) }));
vi.mock("./error-reporting", () => ({ reportServerError: fixture.report }));
vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  assertDatabaseRole: async () => undefined,
}));
vi.mock("@lobbystack/domain", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/domain")>(),
  connectCalendar: fixture.connectCalendar,
  connectInstagramAccount: fixture.connectInstagram,
  switchWorkspace: fixture.switchWorkspace,
}));
vi.mock("@lobbystack/providers", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/providers")>(),
  GoogleCalendarProvider: class {
    buildAuthorizationUrl({ state }: { state: string }) { return `https://accounts.google.test/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`; }
    async exchangeCode(code: string) { fixture.exchanged.push(code); return { accessToken: "google-token", expiresIn: 3600 }; }
    async getAccount() { return { id: "google-account", email: "owner@example.invalid" }; }
  },
  InstagramProvider: class {
    buildAuthorizationUrl({ state }: { state: string }) { return `https://www.instagram.test/oauth/authorize?state=${encodeURIComponent(state)}`; }
    async exchangeCode(code: string) { fixture.exchanged.push(code); return { accessToken: "instagram-token", expiresIn: 5_184_000, permissions: ["instagram_business_manage_messages"] }; }
    async getAccount() { return { instagramUserId: "17841400000000000", username: "acmeclinic" }; }
    async subscribeToMessages() { return undefined; }
  },
  SecretBox: class { encrypt(value: string) { return `encrypted:${value}`; } },
}));
vi.mock("./google-calendar-oauth-store", () => ({
  storeCalendarOAuthState: async (state: string) => { fixture.states.add(state); },
  consumeCalendarOAuthState: async (state: string) => fixture.states.delete(state),
}));
vi.mock("./google-calendar-oauth-limit", () => ({ enforceCalendarOAuthRateLimits: async () => ({ allowed: true }) }));
vi.mock("./instagram-oauth", async (importOriginal) => ({
  ...await importOriginal<typeof import("./instagram-oauth")>(),
  storeInstagramOAuthState: async (state: string) => { fixture.states.add(state); },
  consumeInstagramOAuthState: async (state: string) => fixture.states.delete(state),
  enforceInstagramOAuthRateLimits: async () => ({ allowed: true }),
}));
vi.mock("./operator-request", () => import("./operator-request.fake"));

const { forgetCachedBrands } = await import("@lobbystack/domain");
const { getAuth } = await import("./auth");
const { hashReplacementPassword } = await import("./password");
const { fakeOperator, resetFakeOperator } = await import("./operator-request.fake");
const calendarStart = (await import("../../app/api/calendar/google/start/route")).GET;
const calendarCallback = (await import("../../app/api/calendar/google/callback/route")).GET;
const instagramStart = (await import("../../app/api/integrations/instagram/start/route")).GET;
const instagramCallback = (await import("../../app/api/integrations/instagram/callback/route")).GET;

const partnerId = "7b0c5a43-62c4-4a51-9d0e-6f6f0e0d9a11";
const otherPartnerId = "2e6f8a10-4b3c-4d5e-8f70-9a1b2c3d4e5f";
const businessId = "c3a1e9d2-5b7f-4c80-9e1d-2f3a4b5c6d7e";
const base = "http://localhost:3000";
const subdomain = "http://acme.partners.localhost:3000";
const own = "http://app.acme.example";
const hostBrand = { host: "localhost:3000", "x-lobbystack-brand": "host" };
const subdomainBrand = { host: "acme.partners.localhost:3000", "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": subdomain };
const ownBrand = { host: "app.acme.example", "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": own };
const otherBrand = { host: "beta.partners.localhost:3000", "x-lobbystack-brand": `partner:${otherPartnerId}`, "x-lobbystack-brand-origin": "http://beta.partners.localhost:3000" };
const acme: FakeBrandPartner = { partnerId, name: "Acme Agency", subdomain: "acme.partners.localhost", customDomain: "app.acme.example" };
const beta: FakeBrandPartner = { partnerId: otherPartnerId, name: "Beta Agency", subdomain: "beta.partners.localhost" };

const flows = {
  calendar: { start: calendarStart, callback: calendarCallback, startPath: "/api/calendar/google/start", callbackPath: "/api/calendar/google/callback", landing: "/integrations?calendar=google&status=success", connect: fixture.connectCalendar },
  instagram: { start: instagramStart, callback: instagramCallback, startPath: "/api/integrations/instagram/start", callbackPath: "/api/integrations/instagram/callback", landing: "/integrations?instagram=success", connect: fixture.connectInstagram },
};
type Flow = (typeof flows)[keyof typeof flows];

let client = 0;
let userCount = 0;

/** Signs a new account in on a host, through Better Auth's handler as the proxy hands it the request, and returns its id and session cookie. */
async function signIn(origin: string, brand: Record<string, string>): Promise<{ userId: string; cookie: string }> {
  const userId = `user-${++userCount}`;
  const email = `${userId}@example.invalid`;
  const password = "StrongPassword123!";
  const now = new Date();
  fixture.tables.user!.push({ id: userId, name: "Owner", email, emailVerified: true, normalizedEmail: email, preferredLocale: "en", createdAt: now, updatedAt: now });
  fixture.tables.account!.push({ id: `account-${userId}`, userId, providerId: "credential", accountId: userId, password: await hashReplacementPassword(password), createdAt: now, updatedAt: now });
  const response: Response = await getAuth().handler(new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { ...brand, origin, "content-type": "application/json", "x-real-ip": `198.51.100.${++client}` },
    body: JSON.stringify({ email, password }),
  }));
  expect(response.status).toBe(200);
  return { userId, cookie: response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ") };
}

/** Starts a connection on a host, as the integrations page's Connect button does, and returns the state the provider gets. */
async function start(flow: Flow, origin: string, headers: Record<string, string>): Promise<string> {
  const response = await flow.start(new Request(`${origin}${flow.startPath}?businessId=${businessId}`, { headers }));
  expect(response.status).toBe(200);
  return new URL((await response.json() as { url: string }).url).searchParams.get("state")!;
}

/** Where the provider sends the person back: the one redirect URI the host registered, on its own domain. */
const providerReturn = (flow: Flow, state: string) => new Request(`${base}${flow.callbackPath}?code=provider-code&state=${encodeURIComponent(state)}`, { headers: hostBrand });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("BETTER_AUTH_SECRET", "oauth-callback-host-secret");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
  vi.stubEnv("APP_BASE_URL", base);
  vi.stubEnv("PARTNER_BASE_DOMAIN", "partners.localhost");
  vi.stubEnv("CADDY_ON_DEMAND_TLS", "true");
  vi.stubEnv("ENCRYPTION_KEY", "encryption-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", `${base}/api/calendar/google/callback`);
  vi.stubEnv("INSTAGRAM_APP_ID", "app");
  vi.stubEnv("INSTAGRAM_APP_SECRET", "secret");
  vi.stubEnv("INSTAGRAM_REDIRECT_URI", `${base}/api/integrations/instagram/callback`);
  fixture.partners = [acme, beta];
  fixture.connectCalendar.mockResolvedValue("connection");
  fixture.connectInstagram.mockResolvedValue(undefined);
  fixture.switchWorkspace.mockResolvedValue(undefined);
  resetFakeOperator();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  forgetCachedBrands();
  fixture.databaseDown = false;
  fixture.states.clear();
  fixture.exchanged = [];
});

describe.each([
  ["Google Calendar", "its own domain", flows.calendar, own, ownBrand],
  ["Google Calendar", "its subdomain", flows.calendar, subdomain, subdomainBrand],
  ["Instagram", "its own domain", flows.instagram, own, ownBrand],
  ["Instagram", "its subdomain", flows.instagram, subdomain, subdomainBrand],
] as const)("a %s connection started on a partner's host, on %s", (_name, _where, flow, origin, brand) => {
  it("comes back from the host's domain and finishes there, with the session it started with", async () => {
    const { userId, cookie } = await signIn(origin, brand);
    Object.assign(fakeOperator, { userId, businessId });
    const state = await start(flow, origin, { ...brand, cookie });

    // The host's domain has no session for the person: it hands the callback on, code and state unchanged, and uses up nothing.
    const returned = await flow.callback(providerReturn(flow, state));
    expect(returned.status).toBe(307);
    const handedOn = new URL(returned.headers.get("location")!);
    expect(`${handedOn.origin}${handedOn.pathname}`).toBe(`${origin}${flow.callbackPath}`);
    expect(handedOn.searchParams.get("code")).toBe("provider-code");
    expect(handedOn.searchParams.get("state")).toBe(state);
    expect(fixture.states.has(state)).toBe(true);
    expect(fixture.exchanged).toEqual([]);

    // On the partner's host, the session it signed in with finishes the connection and lands it on that host.
    const finished = await flow.callback(new Request(handedOn, { headers: { ...brand, cookie } }));
    expect(finished.headers.get("location")).toBe(`${origin}${flow.landing}`);
    expect(flow.connect).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId, businessId }));
    expect(fixture.exchanged).toEqual(["provider-code"]);
    if (flow === flows.calendar) expect(fixture.switchWorkspace).toHaveBeenCalledWith(expect.anything(), { userId, businessId, brand: { kind: "partner", partnerId } });
    // The person is still signed in there.
    const session = await getAuth().api.getSession({ headers: new Headers({ ...brand, cookie }) }) as { user: { id: string } } | null;
    expect(session?.user.id).toBe(userId);
    // The state is used up, so the same callback can't connect twice.
    expect((await flow.callback(new Request(handedOn, { headers: { ...brand, cookie } }))).status).toBe(400);
    expect(flow.connect).toHaveBeenCalledTimes(1);
  });

  it("finishes only for the person who started it, on the host it started on", async () => {
    const { userId, cookie } = await signIn(origin, brand);
    Object.assign(fakeOperator, { userId, businessId });
    const state = await start(flow, origin, { ...brand, cookie });
    const handedOn = new URL((await flow.callback(providerReturn(flow, state))).headers.get("location")!);

    // Another partner's host, or the host's domain, never finishes it, even with the right session.
    const elsewhere = await flow.callback(new Request(`http://beta.partners.localhost:3000${handedOn.pathname}${handedOn.search}`, { headers: { ...otherBrand, cookie } }));
    expect(elsewhere.status).toBe(400);
    // Without the person's session, the partner's host shows the error on itself.
    const signedOut = await flow.callback(new Request(handedOn, { headers: brand }));
    expect(signedOut.headers.get("location")).toBe(`${origin}${flow.landing.replace("success", "error")}`);
    expect(fixture.states.has(state)).toBe(true);
    expect(flow.connect).not.toHaveBeenCalled();
    expect(fixture.exchanged).toEqual([]);
  });
});

describe("handing a callback on", () => {
  it("never sends a code to a partner's domain the partner removed after the connection started", async () => {
    const { userId, cookie } = await signIn(own, ownBrand);
    Object.assign(fakeOperator, { userId, businessId });
    for (const flow of [flows.calendar, flows.instagram]) {
      const state = await start(flow, own, { ...ownBrand, cookie });
      fixture.partners = [{ ...acme, customDomain: null }, beta];
      forgetCachedBrands();
      const returned = await flow.callback(providerReturn(flow, state));
      expect(returned.status).toBe(400);
      expect(returned.headers.get("location")).toBeNull();
      fixture.partners = [acme, beta];
      forgetCachedBrands();
    }
    expect(fixture.exchanged).toEqual([]);
  });

  it("hands nothing on while the database can't say whether the partner's host still answers", async () => {
    const { userId, cookie } = await signIn(own, ownBrand);
    Object.assign(fakeOperator, { userId, businessId });
    const state = await start(flows.calendar, own, { ...ownBrand, cookie });
    forgetCachedBrands();
    fixture.databaseDown = true;
    const returned = await calendarCallback(providerReturn(flows.calendar, state));
    expect(returned.status).toBe(500);
    expect(returned.headers.get("location")).toBeNull();
    // The person can reload once the database answers again.
    fixture.databaseDown = false;
    expect((await calendarCallback(providerReturn(flows.calendar, state))).headers.get("location")).toMatch(new RegExp(`^${own}/api/calendar/google/callback\\?`));
  });

  it("keeps a connection started on the host's domain there, and never sends it to a partner's host", async () => {
    const { userId, cookie } = await signIn(base, hostBrand);
    Object.assign(fakeOperator, { userId, businessId });
    for (const flow of [flows.calendar, flows.instagram]) {
      const state = await start(flow, base, { ...hostBrand, cookie });
      const onPartner = await flow.callback(new Request(`${own}${flow.callbackPath}?code=provider-code&state=${encodeURIComponent(state)}`, { headers: { ...ownBrand, cookie } }));
      expect(onPartner.status).toBe(400);
      const finished = await flow.callback(new Request(`${base}${flow.callbackPath}?code=provider-code&state=${encodeURIComponent(state)}`, { headers: { ...hostBrand, cookie } }));
      expect(finished.headers.get("location")).toBe(`${base}${flow.landing}`);
    }
    expect(fixture.switchWorkspace).toHaveBeenCalledWith(expect.anything(), { userId, businessId, brand: { kind: "host" } });
  });
});
