import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), consume: vi.fn(), exchange: vi.fn(), connect: vi.fn(), report: vi.fn(), rate: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ connectCalendar: mocks.connect }));
vi.mock("@lobbystack/providers", () => ({ GoogleCalendarProvider: class {
  exchangeCode = mocks.exchange;
  async getAccount() { return { id: "account", email: "owner@example.invalid" }; }
}, SecretBox: class { encrypt(token: string) { return `encrypted:${token}`; } } }));
vi.mock("@/lib/api-helpers", () => ({
  requireApiSession: mocks.session,
  asApiResponse: mocks.report,
  jsonError: (message: string, status = 400, code?: string) => Response.json({ error: message, ...(code ? { code } : {}) }, { status }),
}));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({}) }));
vi.mock("@/lib/google-calendar-oauth-store", () => ({ consumeCalendarOAuthState: mocks.consume }));
vi.mock("@/lib/google-calendar-oauth-limit", () => ({ enforceCalendarOAuthRateLimits: mocks.rate }));
import { createCalendarOAuthState } from "@/lib/google-calendar-oauth";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", "callback-secret");
  vi.stubEnv("ENCRYPTION_KEY", "encryption-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example.test/callback");
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.consume.mockResolvedValue(true);
  mocks.exchange.mockResolvedValue({ accessToken: "token", expiresIn: 3600 });
  mocks.rate.mockResolvedValue({ allowed: true });
});
afterEach(() => vi.unstubAllEnvs());
const callback = (state: string, query = "code=code") => new Request(`https://app.example.test/api/calendar/google/callback?state=${encodeURIComponent(state)}&${query}`);

it("rejects legacy state before session or DB work", async () => {
  expect((await GET(callback("legacy.signature"))).status).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.consume).not.toHaveBeenCalled();
});

it("checks user binding before consumption or exchanging the code", async () => {
  const state = createCalendarOAuthState({ userId: "other", businessId: "business" });
  expect((await GET(callback(state))).status).toBe(403);
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.exchange).not.toHaveBeenCalled();
});

it("consumes once and prevents a replay from exchanging a code", async () => {
  const state = createCalendarOAuthState({ userId: "user-1", businessId: "business" });
  mocks.consume.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await GET(callback(state))).status).toBe(307);
  expect((await GET(callback(state))).status).toBe(400);
  expect(mocks.consume).toHaveBeenCalledWith(state, "user-1", "business");
  expect(mocks.exchange).toHaveBeenCalledTimes(1);
  expect(mocks.connect).toHaveBeenCalledTimes(1);
});

it("consumes denied authorization without calling the provider", async () => {
  const state = createCalendarOAuthState({ userId: "user-1", businessId: "business" });
  const response = await GET(callback(state, "error=access_denied"));
  expect(response.headers.get("location")).toContain("status=error");
  expect(mocks.consume).toHaveBeenCalledTimes(1);
  expect(mocks.exchange).not.toHaveBeenCalled();
});

it("rate limits the unauthenticated entry before state, session, or consumption work", async () => {
  mocks.rate.mockResolvedValueOnce({ allowed: false, status: 429, code: "calendar_oauth_rate_limited", reason: "rate_limit_ip_hour" });
  const state = createCalendarOAuthState({ userId: "user-1", businessId: "business" });
  const response = await GET(callback(state));
  expect(response.status).toBe(429);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.rate).toHaveBeenNthCalledWith(1, { operation: "callback", ip: undefined }, { consume: true });
});

it("rate limits the authenticated user and business dimensions before consumption", async () => {
  mocks.rate
    .mockResolvedValueOnce({ allowed: true })
    .mockResolvedValueOnce({ allowed: false, status: 429, code: "calendar_oauth_rate_limited", reason: "rate_limit_user_hour" });
  const state = createCalendarOAuthState({ userId: "user-1", businessId: "business" });
  const response = await GET(callback(state));
  expect(response.status).toBe(429);
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.rate).toHaveBeenNthCalledWith(2, { operation: "callback", userId: "user-1", businessId: "business" }, { consume: true });
});

it("fails closed when the limiter store is unavailable", async () => {
  mocks.rate.mockResolvedValueOnce({ allowed: false, status: 503, code: "calendar_oauth_rate_limit_unavailable", reason: "rate_limit_unavailable" });
  const state = createCalendarOAuthState({ userId: "user-1", businessId: "business" });
  const response = await GET(callback(state));
  expect(response.status).toBe(503);
  expect(mocks.session).not.toHaveBeenCalled();
});
