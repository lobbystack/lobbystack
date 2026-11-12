import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unsubscribedAt: new Map<string, Date>(),
  rate: vi.fn(),
}));

vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    ...actual,
    // The users row, kept in memory: the token is read for real.
    setMarketingEmailsSubscribedWithToken: vi.fn(async (_db: unknown, input: { token: string; subscribed: boolean }) => {
      const link = actual.readMarketingUnsubscribeToken(input.token);
      if (!link) return null;
      if (input.subscribed) mocks.unsubscribedAt.delete(link.userId);
      else if (!mocks.unsubscribedAt.has(link.userId)) mocks.unsubscribedAt.set(link.userId, new Date());
      return { subscribed: input.subscribed };
    }),
  };
});
vi.mock("@/lib/auth", () => ({ getAuthDatabase: () => ({ db: "auth-db" }) }));
vi.mock("@/lib/email-unsubscribe-limit", () => ({ enforceEmailUnsubscribeRateLimits: mocks.rate }));

import { marketingUnsubscribeToken, setMarketingEmailsSubscribedWithToken } from "@lobbystack/domain";

import { GET, POST } from "./route";

const userId = "7d0c2a51-1f7b-4bd4-9c43-2d1e3f4a5b6c";

/** What a mail app sends for one-click unsubscribe (RFC 8058): a form POST, no cookies, no Origin. */
function oneClick(token: string) {
  return POST(new NextRequest(`https://app.example.test/api/email/unsubscribe?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  }));
}

describe("POST /api/email/unsubscribe", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", "test-key");
    mocks.unsubscribedAt.clear();
    mocks.rate.mockReset().mockResolvedValue({ allowed: true });
    vi.mocked(setMarketingEmailsSubscribedWithToken).mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("unsubscribes the person the token names at once", async () => {
    const token = marketingUnsubscribeToken(userId);
    const response = await oneClick(token);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ subscribed: false });
    expect(setMarketingEmailsSubscribedWithToken).toHaveBeenCalledWith("auth-db", { token, subscribed: false });
    expect(mocks.unsubscribedAt.has(userId)).toBe(true);
    expect(mocks.rate).toHaveBeenCalledWith(expect.any(Request), token);
  });

  it("answers the same when the person unsubscribes again, and keeps the first time", async () => {
    const token = marketingUnsubscribeToken(userId);
    await oneClick(token);
    const first = mocks.unsubscribedAt.get(userId);
    const again = await oneClick(token);
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toEqual({ subscribed: false });
    expect(mocks.unsubscribedAt.get(userId)).toBe(first);
  });

  it("refuses a changed token, a missing one, and one for another purpose, unsubscribing nobody", async () => {
    const token = marketingUnsubscribeToken(userId);
    for (const bad of [`${token.slice(0, -2)}xx`, "", "v1.token.sig"]) {
      const response = await oneClick(bad);
      expect(response.status, bad).toBe(400);
    }
    expect(mocks.unsubscribedAt.size).toBe(0);
  });

  it("stops a client past its limit before it touches anyone", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_ip_minute" });
    const response = await oneClick(marketingUnsubscribeToken(userId));
    expect(response.status).toBe(429);
    expect(setMarketingEmailsSubscribedWithToken).not.toHaveBeenCalled();
  });
});

describe("GET /api/email/unsubscribe", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never unsubscribes, and sends a mail app's open to the page with the button, in the reader's language", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.mocked(setMarketingEmailsSubscribedWithToken).mockClear();
    const response = GET(new NextRequest("https://app.example.test/api/email/unsubscribe?token=v1.abc.def", { headers: { "accept-language": "fr-CA,fr;q=0.9" } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.test/fr/unsubscribe/v1.abc.def");
    expect(setMarketingEmailsSubscribedWithToken).not.toHaveBeenCalled();
  });
});
