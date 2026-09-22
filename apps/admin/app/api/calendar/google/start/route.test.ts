import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  business: vi.fn(),
  state: vi.fn(),
  store: vi.fn(),
  rate: vi.fn(),
  ip: vi.fn(),
}));

vi.mock("@lobbystack/providers", () => ({ GoogleCalendarProvider: class {
  buildAuthorizationUrl() { return "https://accounts.google.test/o/oauth2/v2/auth?state=signed-state"; }
} }));
vi.mock("@/lib/api-helpers", () => ({
  requireApiSession: mocks.session,
  businessIdFromRequest: mocks.business,
  withOperatorTransaction: mocks.membership,
  asApiResponse: () => Response.json({ error: "Request failed." }, { status: 500 }),
  jsonError: (message: string, status = 400, code?: string) => Response.json({ error: message, ...(code ? { code } : {}) }, { status }),
}));
vi.mock("@/lib/google-calendar-oauth", () => ({ createCalendarOAuthState: mocks.state }));
vi.mock("@/lib/google-calendar-oauth-store", () => ({ storeCalendarOAuthState: mocks.store }));
vi.mock("@/lib/google-calendar-oauth-limit", () => ({ enforceCalendarOAuthRateLimits: mocks.rate }));
vi.mock("@/lib/trusted-client-ip", () => ({ trustedClientIp: mocks.ip }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example.test/callback");
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.business.mockReturnValue("business-1");
  mocks.membership.mockResolvedValue(undefined);
  mocks.state.mockReturnValue("signed-state");
  mocks.store.mockResolvedValue(undefined);
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.ip.mockReturnValue("203.0.113.10");
});
afterEach(() => vi.unstubAllEnvs());

const startRequest = () => new Request("https://app.example.test/api/calendar/google/start?businessId=business-1");

it("requires a business before any rate-limit or state work", async () => {
  mocks.business.mockReturnValue(null);
  const response = await GET(new Request("https://app.example.test/api/calendar/google/start"));
  expect(response.status).toBe(400);
  expect(mocks.rate).not.toHaveBeenCalled();
  expect(mocks.state).not.toHaveBeenCalled();
});

it("confirms membership before consuming quota and creating OAuth state", async () => {
  const response = await GET(startRequest());
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ url: expect.stringContaining("accounts.google.test") });
  expect(mocks.rate).toHaveBeenCalledWith({ operation: "start", userId: "user-1", businessId: "business-1", ip: "203.0.113.10" }, { consume: true });
  expect(mocks.membership.mock.invocationCallOrder[0]).toBeLessThan(mocks.rate.mock.invocationCallOrder[0]!);
  expect(mocks.state).toHaveBeenCalledWith({ userId: "user-1", businessId: "business-1" });
  expect(mocks.store).toHaveBeenCalledWith("signed-state");
});

it("returns the rate-limit status without creating or storing state", async () => {
  mocks.rate.mockResolvedValueOnce({ allowed: false, status: 429, code: "calendar_oauth_rate_limited", reason: "rate_limit_user_hour" });
  const response = await GET(startRequest());
  expect(response.status).toBe(429);
  expect(mocks.state).not.toHaveBeenCalled();
  expect(mocks.store).not.toHaveBeenCalled();
});

it("fails closed when the limiter store is unavailable", async () => {
  mocks.rate.mockResolvedValueOnce({ allowed: false, status: 503, code: "calendar_oauth_rate_limit_unavailable", reason: "rate_limit_unavailable" });
  const response = await GET(startRequest());
  expect(response.status).toBe(503);
  expect(mocks.state).not.toHaveBeenCalled();
});
