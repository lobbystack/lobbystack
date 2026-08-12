import { describe, expect, it } from "vitest";

import { calculateWebVoiceBillingAllowance } from "./billing";

describe("web voice billing policy", () => {
  it("allows self-hosted voice without a hosted account", () => {
    expect(calculateWebVoiceBillingAllowance({ deploymentMode: "self_hosted_standard", accountPlan: null, subscriptionState: null, voiceSecondsUsed: 99_999 })).toEqual({
      allowed: true,
      errorCode: null,
      maxDurationMs: 300_000,
      plan: "self_host",
    });
  });

  it("clamps free calls to the remaining monthly entitlement", () => {
    expect(calculateWebVoiceBillingAllowance({ deploymentMode: "cloud", accountPlan: null, subscriptionState: null, voiceSecondsUsed: 1_750, maxDurationMs: 300_000 })).toEqual({
      allowed: true,
      errorCode: null,
      maxDurationMs: 50_000,
      plan: "free_cloud",
    });
  });

  it("blocks free calls when the entitlement is exhausted", () => {
    expect(calculateWebVoiceBillingAllowance({ deploymentMode: "cloud", accountPlan: "free_cloud", subscriptionState: null, voiceSecondsUsed: 1_800 })).toEqual({
      allowed: false,
      errorCode: "voice_limit_reached",
      maxDurationMs: 0,
      plan: "free_cloud",
    });
  });

  it("requires an active paid subscription before granting overages", () => {
    expect(calculateWebVoiceBillingAllowance({ deploymentMode: "cloud", accountPlan: "pro", subscriptionState: "canceled", voiceSecondsUsed: 1_800 }).plan).toBe("free_cloud");
    expect(calculateWebVoiceBillingAllowance({ deploymentMode: "cloud", accountPlan: "pro", subscriptionState: "active", voiceSecondsUsed: 100_000 })).toEqual(expect.objectContaining({ allowed: true, plan: "pro", maxDurationMs: 300_000 }));
  });
});
