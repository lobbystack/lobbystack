import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), consume: vi.fn(), exchange: vi.fn(), account: vi.fn(), connect: vi.fn(), switchWorkspace: vi.fn(), report: vi.fn(), rate: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ connectCalendar: mocks.connect, switchWorkspace: mocks.switchWorkspace }));
vi.mock("@lobbystack/providers", () => ({ SecretBox: class { encrypt(token: string) { return `encrypted:${token}`; } } }));
vi.mock("@/lib/calendar-providers", () => ({ calendlyCalendarProvider: () => ({ exchangeCode: mocks.exchange, getAccount: mocks.account }) }));
vi.mock("@/lib/api-helpers", () => ({
  requireApiSession: mocks.session,
  asApiResponse: mocks.report,
  jsonError: (message: string, status = 400, code?: string) => Response.json({ error: message, ...(code ? { code } : {}) }, { status }),
}));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({}) }));
vi.mock("@/lib/google-calendar-oauth-store", () => ({ consumeCalendarOAuthState: mocks.consume }));
vi.mock("@/lib/google-calendar-oauth-limit", () => ({ enforceCalendarOAuthRateLimits: mocks.rate }));
import { calendarOAuthCodeVerifier, createCalendarOAuthState } from "@/lib/google-calendar-oauth";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", "callback-secret");
  vi.stubEnv("ENCRYPTION_KEY", "encryption-secret");
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.consume.mockResolvedValue(true);
  mocks.exchange.mockResolvedValue({ accessToken: "token", refreshToken: "refresh", expiresIn: 1800 });
  mocks.account.mockResolvedValue({ id: "1234", email: "owner@example.invalid" });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.switchWorkspace.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
const callback = (state: string, query = "code=code") => new Request(`https://app.example.test/api/calendar/calendly/callback?state=${encodeURIComponent(state)}&${query}`);
const calendlyState = (userId = "user-1") => createCalendarOAuthState({ userId, businessId: "business", provider: "calendly" });

it("refuses a state signed for Google before any session or provider work", async () => {
  const response = await GET(callback(createCalendarOAuthState({ userId: "user-1", businessId: "business" })));
  expect(response.status).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.consume).not.toHaveBeenCalled();
});

it("checks the user before consuming the state or exchanging the code", async () => {
  expect((await GET(callback(calendlyState("other")))).status).toBe(403);
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.exchange).not.toHaveBeenCalled();
});

it("connects the Calendly account with encrypted tokens and lands on the integrations page", async () => {
  const state = calendlyState();
  const response = await GET(callback(state));
  expect(response.headers.get("location")).toBe("https://app.example.test/integrations?calendar=calendly&status=success");
  expect(mocks.consume).toHaveBeenCalledWith(state, "user-1", "business", "calendly");
  expect(mocks.exchange).toHaveBeenCalledWith("code", calendarOAuthCodeVerifier(state));
  expect(mocks.connect).toHaveBeenCalledWith({}, expect.objectContaining({ userId: "user-1", businessId: "business", provider: "calendly", externalAccountId: "1234", encryptedAccessToken: "encrypted:token", encryptedRefreshToken: "encrypted:refresh" }));
  expect(mocks.switchWorkspace).toHaveBeenCalledWith({}, { userId: "user-1", businessId: "business", brand: { kind: "host" } });
});

it("consumes a denied authorization without calling Calendly", async () => {
  const response = await GET(callback(calendlyState(), "error=access_denied"));
  expect(response.headers.get("location")).toContain("calendar=calendly&status=error");
  expect(mocks.consume).toHaveBeenCalledTimes(1);
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("reports a failed exchange and sends the operator back with an error", async () => {
  mocks.exchange.mockRejectedValueOnce(new Error("Calendly OAuth token exchange failed with status 400."));
  const response = await GET(callback(calendlyState()));
  expect(response.headers.get("location")).toContain("status=error");
  expect(mocks.report).toHaveBeenCalledOnce();
  expect(mocks.connect).not.toHaveBeenCalled();
});
