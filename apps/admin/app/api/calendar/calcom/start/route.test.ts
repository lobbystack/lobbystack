import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  store: vi.fn(),
  rate: vi.fn(),
  ip: vi.fn(),
}));

vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/google-calendar-oauth", () => ({ createCalendarOAuthState: mocks.state }));
vi.mock("@/lib/calendar-providers", () => ({
  calcomCalendarProvider: () => ({ buildAuthorizationUrl: ({ state }: { state: string }) => `https://app.cal.test/auth/oauth2/authorize?state=${state}` }),
}));
vi.mock("@/lib/google-calendar-oauth-store", () => ({ storeCalendarOAuthState: mocks.store }));
vi.mock("@/lib/google-calendar-oauth-limit", () => ({ enforceCalendarOAuthRateLimits: mocks.rate }));
vi.mock("@/lib/trusted-client-ip", () => ({ trustedClientIp: mocks.ip }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user-1", businessId: "business-1" });
  mocks.state.mockReturnValue("signed-state");
  mocks.store.mockResolvedValue(undefined);
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.ip.mockReturnValue("203.0.113.10");
});
afterEach(() => vi.unstubAllEnvs());

const startRequest = () => new Request("https://app.example.test/api/calendar/calcom/start?businessId=business-1");

it("refuses an operator below admin before any rate-limit or state work", async () => {
  fakeOperator.denied = Object.assign(new Error("You do not have access to this business."), { status: 403 });
  expect((await GET(startRequest())).status).toBe(403);
  expect(mocks.rate).not.toHaveBeenCalled();
  expect(mocks.state).not.toHaveBeenCalled();
});

it("signs a Cal.com state, stores it, and returns Cal.com's authorization page", async () => {
  const response = await GET(startRequest());
  await expect(response.json()).resolves.toEqual({ url: "https://app.cal.test/auth/oauth2/authorize?state=signed-state" });
  expect(mocks.rate).toHaveBeenCalledWith({ operation: "start", userId: "user-1", businessId: "business-1", ip: "203.0.113.10" });
  expect(mocks.state).toHaveBeenCalledWith({ userId: "user-1", businessId: "business-1", origin: null, provider: "calcom" });
  expect(mocks.store).toHaveBeenCalledWith("signed-state", "calcom");
});

it("stops at the rate limit", async () => {
  mocks.rate.mockResolvedValueOnce({ allowed: false, status: 429, code: "calendar_oauth_rate_limited", reason: "rate_limit_user_hour" });
  expect((await GET(startRequest())).status).toBe(429);
  expect(mocks.state).not.toHaveBeenCalled();
});
