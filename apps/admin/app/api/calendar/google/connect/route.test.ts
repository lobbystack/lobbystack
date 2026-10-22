import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  operator: vi.fn(),
  role: vi.fn(),
  verifyLink: vi.fn(),
  state: vi.fn(),
  store: vi.fn(),
  rate: vi.fn(),
  ip: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  asApiResponse: (error: unknown) => error instanceof Response ? error : Response.json({ error: "Request failed." }, { status: 500 }),
}));
vi.mock("@/lib/operator-request", () => ({ requireOperator: mocks.operator }));
vi.mock("@/lib/google-calendar-oauth", () => ({ createCalendarOAuthState: mocks.state, verifyCalendarConnectLinkToken: mocks.verifyLink }));
vi.mock("@/lib/google-calendar-provider", () => ({
  googleCalendarProvider: () => ({ buildAuthorizationUrl: ({ state }: { state: string }) => `https://accounts.google.test/o/oauth2/v2/auth?state=${state}` }),
}));
vi.mock("@/lib/google-calendar-oauth-store", () => ({ storeCalendarOAuthState: mocks.store }));
vi.mock("@/lib/google-calendar-oauth-limit", () => ({ enforceCalendarOAuthRateLimits: mocks.rate }));
vi.mock("@/lib/trusted-client-ip", () => ({ trustedClientIp: mocks.ip }));

import { GET } from "./route";

const businessId = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const failed = "https://app.example.test/integrations?calendar=google&status=error";
const open = (query = `businessId=${businessId}&token=signed-link`) => GET(new Request(`https://app.example.test/api/calendar/google/connect?${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  mocks.verifyLink.mockReturnValue({ businessId, issuedAt: Date.now(), nonce: "2f0c1d2e-3f40-4a51-8b62-7c83d94ea5b6" });
  mocks.operator.mockImplementation(async () => ({ userId: "user-1", businessId, transaction: async (callback: (tx: unknown, role: string) => unknown, options: unknown) => { mocks.role(options); return await callback({}, "business_admin"); } }));
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.ip.mockReturnValue("203.0.113.10");
  mocks.state.mockReturnValue("signed-state");
  mocks.store.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("sends an owner or admin of the link's business to Google for that business", async () => {
  const response = await open();
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://accounts.google.test/o/oauth2/v2/auth?state=signed-state");
  expect(mocks.verifyLink).toHaveBeenCalledWith("signed-link");
  expect(mocks.operator).toHaveBeenCalledWith(expect.any(Request));
  expect(mocks.role).toHaveBeenCalledWith({ minimumRole: "business_admin" });
  expect(mocks.rate).toHaveBeenCalledWith({ operation: "start", userId: "user-1", businessId, ip: "203.0.113.10" });
  expect(mocks.state).toHaveBeenCalledWith({ userId: "user-1", businessId });
  expect(mocks.store).toHaveBeenCalledWith("signed-state");
});

it("refuses an invalid or expired link, or one opened for another business, before asking who is signed in", async () => {
  mocks.verifyLink.mockReturnValueOnce(null);
  expect((await open()).headers.get("location")).toBe(failed);
  expect((await open("businessId=0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6&token=signed-link")).headers.get("location")).toBe(failed);
  expect((await open("token=signed-link")).headers.get("location")).toBe(failed);
  expect(mocks.operator).not.toHaveBeenCalled();
  expect(mocks.state).not.toHaveBeenCalled();
});

it("asks a signed-out visitor to sign in, then brings them back to the link", async () => {
  mocks.operator.mockRejectedValueOnce(Response.json({ error: "Authentication required.", code: "unauthorized" }, { status: 401 }));
  const location = new URL((await open()).headers.get("location")!);
  expect(`${location.origin}${location.pathname}`).toBe("https://app.example.test/login");
  expect(location.searchParams.get("returnTo")).toBe(`/api/calendar/google/connect?businessId=${businessId}&token=signed-link`);
  expect(mocks.state).not.toHaveBeenCalled();
});

it("sends back anyone who isn't an owner or admin, or is over the limits, without asking Google", async () => {
  mocks.role.mockImplementationOnce(() => { throw Object.assign(new Error("Business admin access is required."), { status: 403 }); });
  expect((await open()).headers.get("location")).toBe(failed);
  mocks.rate.mockResolvedValueOnce({ allowed: false, status: 429, code: "calendar_oauth_rate_limited", reason: "rate_limit_user_hour" });
  expect((await open()).headers.get("location")).toBe(failed);
  expect(mocks.state).not.toHaveBeenCalled();
  expect(mocks.store).not.toHaveBeenCalled();
});
