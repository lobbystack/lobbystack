import { describe, expect, it } from "vitest";

import { effectiveBillingPlan, estimateSmsSegments, periodKeyFor } from "./usage";

describe("replacement non-AI usage policy", () => {
  it("uses the free plan when a cloud subscription is not active", () => {
    expect(effectiveBillingPlan({ deploymentMode: "cloud", accountPlan: "pro", subscriptionState: "canceled" })).toBe("free_cloud");
    expect(effectiveBillingPlan({ deploymentMode: "cloud", accountPlan: "pro", subscriptionState: "active" })).toBe("pro");
    expect(effectiveBillingPlan({ deploymentMode: "self_hosted", accountPlan: null, subscriptionState: null })).toBe("self_host");
  });

  it("estimates GSM and Unicode SMS segments conservatively", () => {
    expect(estimateSmsSegments("Appointment confirmed.")).toBe(1);
    expect(estimateSmsSegments("a".repeat(161))).toBe(2);
    expect(estimateSmsSegments("漢".repeat(71))).toBe(2);
    expect(estimateSmsSegments("😀".repeat(36))).toBe(1);
  });

  it("uses UTC month keys for usage accounting", () => {
    expect(periodKeyFor(new Date("2026-08-14T23:59:59.000Z"))).toBe("2026-08");
    expect(periodKeyFor(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09");
  });
});
