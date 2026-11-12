import { afterEach, describe, expect, it, vi } from "vitest";

import { signPayload } from "@lobbystack/providers/crypto/signedPayload";

import { marketingUnsubscribeLinks, marketingUnsubscribeToken, readMarketingUnsubscribeToken } from "./marketingEmails";

afterEach(() => vi.unstubAllEnvs());

const userId = "7d0c2a51-1f7b-4bd4-9c43-2d1e3f4a5b6c";

describe("marketing unsubscribe tokens", () => {
  it("name the person they were signed for, with no expiry", () => {
    vi.stubEnv("ENCRYPTION_KEY", "test-key");
    const token = marketingUnsubscribeToken(userId);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(readMarketingUnsubscribeToken(token)).toEqual({ userId });
    vi.useFakeTimers({ now: new Date("2036-01-01T00:00:00Z") });
    try {
      expect(readMarketingUnsubscribeToken(token)).toEqual({ userId });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuse a changed token, one signed with another key or for another purpose, and anything else", () => {
    vi.stubEnv("ENCRYPTION_KEY", "test-key");
    const token = marketingUnsubscribeToken(userId);
    const [version, payload, signature] = token.split(".");
    const other = Buffer.from(JSON.stringify({ u: "0e1c2a51-1f7b-4bd4-9c43-2d1e3f4a5b6c" })).toString("base64url");
    expect(readMarketingUnsubscribeToken(`${version}.${other}.${signature}`)).toBeNull();
    expect(readMarketingUnsubscribeToken(`${version}.${payload}.${signature!.slice(0, -1)}A`)).toBeNull();
    expect(readMarketingUnsubscribeToken(signPayload("test-key", "check-in:answer", { u: userId }))).toBeNull();
    expect(readMarketingUnsubscribeToken(signPayload("test-key", "email:marketing-unsubscribe", { u: "not-a-uuid" }))).toBeNull();
    expect(readMarketingUnsubscribeToken("")).toBeNull();
    expect(readMarketingUnsubscribeToken("v1.token.sig")).toBeNull();
    vi.stubEnv("ENCRYPTION_KEY", "rotated-key");
    expect(readMarketingUnsubscribeToken(token)).toBeNull();
  });

  it("need ENCRYPTION_KEY in production", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => marketingUnsubscribeToken(userId)).toThrow(/ENCRYPTION_KEY/);
  });
});

describe("marketingUnsubscribeLinks", () => {
  it("point the footer at the page in the recipient's language and the header at the one-click URL, on the dashboard's origin", () => {
    vi.stubEnv("ENCRYPTION_KEY", "test-key");
    vi.stubEnv("APP_BASE_URL", "https://app.example.test/");
    const token = marketingUnsubscribeToken(userId);
    expect(marketingUnsubscribeLinks(userId, "fr")).toEqual({
      pageUrl: `https://app.example.test/fr/unsubscribe/${token}`,
      oneClickUrl: `https://app.example.test/api/email/unsubscribe?token=${token}`,
    });
    expect(marketingUnsubscribeLinks(userId, "de").pageUrl).toBe(`https://app.example.test/en/unsubscribe/${token}`);
  });
});
