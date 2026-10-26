import { describe, expect, it } from "vitest";

import { isPackageAllowance, isPackageAmount, isPackageOverageAmount, isStripeAccountCountry, normalizePackageName, packageSubscriptionStatus, partnerStripeStatus } from "./partnerStripe";

describe("a partner's Stripe status", () => {
  it("follows the account from no connection, through onboarding and review, to taking payments", () => {
    expect(partnerStripeStatus(null)).toBe("not_connected");
    expect(partnerStripeStatus({ detailsSubmitted: false, chargesEnabled: false, disconnectedAt: null })).toBe("onboarding");
    expect(partnerStripeStatus({ detailsSubmitted: true, chargesEnabled: false, disconnectedAt: null })).toBe("restricted");
    expect(partnerStripeStatus({ detailsSubmitted: true, chargesEnabled: true, disconnectedAt: null })).toBe("active");
  });

  it("says disconnected once the partner disconnects, whatever Stripe said of the account before", () => {
    expect(partnerStripeStatus({ detailsSubmitted: true, chargesEnabled: true, disconnectedAt: new Date("2026-10-26T00:00:00Z") })).toBe("disconnected");
    expect(partnerStripeStatus({ detailsSubmitted: false, chargesEnabled: false, disconnectedAt: "2026-10-26T00:00:00.000Z" })).toBe("disconnected");
  });
});

describe("Stripe account countries", () => {
  it("takes the countries Stripe opens accounts in, as uppercase codes", () => {
    for (const country of ["US", "CA", "FR", "GB", "JP", "AE"]) expect(isStripeAccountCountry(country), country).toBe(true);
    for (const country of ["us", "RS", "IN", "", null, 1]) expect(isStripeAccountCountry(country), String(country)).toBe(false);
  });
});

describe("package terms", () => {
  it("keeps a name of 1 to 80 visible characters, with whitespace collapsed", () => {
    expect(normalizePackageName("  Front   desk  ")).toBe("Front desk");
    expect(normalizePackageName("x".repeat(80))).toBe("x".repeat(80));
    for (const name of ["", "   ", "x".repeat(81), "Desk\u202e", 42, null]) expect(normalizePackageName(name), String(name)).toBeNull();
  });

  it("takes prices of 1 to 99,999,999 in the currency's smallest unit", () => {
    for (const amount of [1, 4900, 99_999_999]) expect(isPackageAmount(amount), String(amount)).toBe(true);
    for (const amount of [0, -1, 49.5, 100_000_000, Number.NaN, "4900"]) expect(isPackageAmount(amount), String(amount)).toBe(false);
  });

  it("takes allowances of 0 to 1,000,000 minutes or chats", () => {
    for (const allowance of [0, 250, 1_000_000]) expect(isPackageAllowance(allowance), String(allowance)).toBe(true);
    for (const allowance of [-1, 2.5, 1_000_001, "250"]) expect(isPackageAllowance(allowance), String(allowance)).toBe(false);
  });

  it("takes overage rates and caps of 0 to 99,999,999 in the currency's smallest unit", () => {
    for (const amount of [0, 25, 99_999_999]) expect(isPackageOverageAmount(amount), String(amount)).toBe(true);
    for (const amount of [-1, 2.5, 100_000_000, Number.NaN, "25", null]) expect(isPackageOverageAmount(amount), String(amount)).toBe(false);
  });
});

describe("a business's package subscription status", () => {
  it("waits for payment until the first one goes through, then follows Stripe's status", () => {
    expect(packageSubscriptionStatus(null)).toBe("awaiting_payment");
    expect(packageSubscriptionStatus("incomplete")).toBe("awaiting_payment");
    expect(packageSubscriptionStatus("active")).toBe("active");
    expect(packageSubscriptionStatus("trialing")).toBe("active");
    expect(packageSubscriptionStatus("past_due")).toBe("past_due");
    for (const state of ["canceled", "incomplete_expired", "unpaid", "paused"]) expect(packageSubscriptionStatus(state)).toBe("inactive");
  });
});
