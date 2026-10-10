import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  store: vi.fn(),
  rate: vi.fn(),
  ip: vi.fn(),
}));

vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/google-calendar-oauth", () => ({ createCalendarOAuthState: mocks.state }));
vi.mock("@/lib/google-calendar-provider", () => ({
  googleCalendarProvider: () => ({ buildAuthorizationUrl: () => "https://accounts.google.test/o/oauth2/v2/auth?state=signed-state" }),
}));
vi.mock("@/lib/google-calendar-oauth-store", () => ({ storeCalendarOAuthState: mocks.store }));
vi.mock("@/lib/google-calendar-oauth-limit", () => ({ enforceCalendarOAuthRateLimits: mocks.rate }));
vi.mock("@/lib/trusted-client-ip", () => ({ trustedClientIp: mocks.ip }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example.test/callback");
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user-1", businessId: "business-1" });
  mocks.state.mockReturnValue("signed-state");
  mocks.store.mockResolvedValue(undefined);
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.ip.mockReturnValue("203.0.113.10");
});
afterEach(() => vi.unstubAllEnvs());

const startRequest = () => new Request("https://app.example.test/api/calendar/google/start?businessId=business-1");

it("refuses an operator below admin before any rate-limit or state work", async () => {
  fakeOperator.denied = Object.assign(new Error("You do not have access to this business."), { status: 403 });
  const response = await GET(startRequest());
  expect(response.status).toBe(403);
  expect(mocks.rate).not.toHaveBeenCalled();
  expect(mocks.state).not.toHaveBeenCalled();
});

it("confirms membership before consuming quota and creating OAuth state", async () => {
  const response = await GET(startRequest());
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ url: expect.stringContaining("accounts.google.test") });
  expect(mocks.rate).toHaveBeenCalledWith({ operation: "start", userId: "user-1", businessId: "business-1", ip: "203.0.113.10" });
  expect(fakeOperator.transactions).toEqual([{ minimumRole: "business_admin" }]);
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
