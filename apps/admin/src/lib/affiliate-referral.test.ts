// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { captureAffiliateReferralFromUrl, getStoredAffiliateReferralCode, normalizeClientReferralCode } from "./affiliate-referral";

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
});

describe("normalizeClientReferralCode", () => {
  it("normalizes referral codes for storage and lookup", () => {
    expect(normalizeClientReferralCode("  Partner Name!  ")).toBe("partner-name");
    expect(normalizeClientReferralCode("a".repeat(40))).toHaveLength(32);
  });

  it("captures current and legacy referral parameters", () => {
    expect(captureAffiliateReferralFromUrl(new URL("https://app.example/signup?ref=Partner-One"))).toBe("partner-one");
    expect(getStoredAffiliateReferralCode()).toBe("partner-one");
    expect(captureAffiliateReferralFromUrl(new URL("https://app.example/signup?via=Partner-Two"))).toBe("partner-two");
    expect(getStoredAffiliateReferralCode()).toBe("partner-two");
  });
});
