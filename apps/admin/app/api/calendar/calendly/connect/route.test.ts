import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ operator: vi.fn(), role: vi.fn(), verifyLink: vi.fn(), state: vi.fn(), store: vi.fn(), rate: vi.fn() }));

vi.mock("@lobbystack/providers", () => ({ calendlyCodeChallenge: () => "challenge" }));
vi.mock("@/lib/api-helpers", () => ({
  asApiResponse: (error: unknown) => Response.json({ error: "Request failed." }, { status: (error as { status?: number }).status ?? 500 }),
}));
vi.mock("@/lib/operator-request", () => ({ requireOperator: mocks.operator }));
vi.mock("@/lib/calendar-providers", () => ({ calendlyCalendarProvider: () => ({ buildAuthorizationUrl: ({ state }: { state: string }) => `https://auth.calendly.test/oauth/authorize?state=${state}` }) }));
vi.mock("@/lib/google-calendar-oauth", () => ({ calendarPkceVerifier: () => "verifier", createCalendarOAuthState: mocks.state, verifyCalendarConnectLinkToken: mocks.verifyLink }));
vi.mock("@/lib/google-calendar-oauth-store", () => ({ storeCalendarOAuthState: mocks.store }));
vi.mock("@/lib/google-calendar-oauth-limit", () => ({ enforceCalendarOAuthRateLimits: mocks.rate }));
vi.mock("@/lib/trusted-client-ip", () => ({ trustedClientIp: () => "203.0.113.10" }));

import { GET } from "./route";

const businessId = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const open = () => GET(new Request(`https://app.example.test/api/calendar/calendly/connect?businessId=${businessId}&token=signed-link`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  mocks.verifyLink.mockReturnValue({ businessId, issuedAt: Date.now(), nonce: "2f0c1d2e-3f40-4a51-8b62-7c83d94ea5b6" });
  mocks.operator.mockImplementation(async () => ({ userId: "user-1", businessId, transaction: async (callback: (tx: unknown, role: string) => unknown, options: unknown) => { mocks.role(options); return await callback({}, "business_admin"); } }));
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.state.mockReturnValue("signed-state");
  mocks.store.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("sends an owner or admin of the link's business to Calendly", async () => {
  expect((await open()).headers.get("location")).toBe("https://auth.calendly.test/oauth/authorize?state=signed-state");
  expect(mocks.role).toHaveBeenCalledWith({ minimumRole: "business_admin" });
});

it("tells someone who isn't an owner or admin why the link didn't work", async () => {
  mocks.operator.mockRejectedValueOnce(Object.assign(new Error("You don't have access to this business."), { status: 403 }));
  expect((await open()).headers.get("location")).toBe("https://app.example.test/integrations?calendar=calendly&status=not_admin");
  expect(mocks.state).not.toHaveBeenCalled();
});

it("keeps the general error for anything else", async () => {
  mocks.operator.mockRejectedValueOnce(new Error("database down"));
  expect((await open()).headers.get("location")).toBe("https://app.example.test/integrations?calendar=calendly&status=error");
});
