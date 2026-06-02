import { describe, expect, it } from "vitest";

import {
  billingPlanCatalog,
  getBillingMonthlyChargeCents,
  getBillingPeriodChargeCents,
  getKnowledgeStorageLimitBytes,
} from "./billing";

describe("knowledge storage limits", () => {
  it("matches the configured plan allowances", () => {
    expect(getKnowledgeStorageLimitBytes("self_host")).toBeNull();
    expect(getKnowledgeStorageLimitBytes("free_cloud")).toBe(100 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("starter")).toBe(2 * 1024 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("pro")).toBe(10 * 1024 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("enterprise")).toBeNull();
  });
});

describe("hosted plan pricing", () => {
  it("configures the free cloud plan with 30 included minutes", () => {
    expect(billingPlanCatalog.free_cloud.voiceSecondsIncluded).toBe(1_800);
    expect(billingPlanCatalog.free_cloud.overagesBillable).toBe(false);
  });

  it("configures starter pricing and usage", () => {
    expect(billingPlanCatalog.starter.voiceSecondsIncluded).toBe(9_000);
    expect(billingPlanCatalog.starter.voiceOverageRatePerMinuteCents).toBe(20);
    expect(getBillingMonthlyChargeCents({ plan: "starter" })).toBe(3_000);
    expect(
      getBillingMonthlyChargeCents({
        plan: "starter",
        billingInterval: "annual",
      }),
    ).toBe(2_400);
    expect(
      getBillingPeriodChargeCents({
        plan: "starter",
        billingInterval: "annual",
      }),
    ).toBe(28_800);
  });

  it("configures pro pricing and usage", () => {
    expect(billingPlanCatalog.pro.voiceSecondsIncluded).toBe(30_000);
    expect(billingPlanCatalog.pro.voiceOverageRatePerMinuteCents).toBe(18);
    expect(getBillingMonthlyChargeCents({ plan: "pro" })).toBe(10_000);
    expect(
      getBillingMonthlyChargeCents({
        plan: "pro",
        billingInterval: "annual",
      }),
    ).toBe(8_000);
    expect(
      getBillingPeriodChargeCents({
        plan: "pro",
        billingInterval: "annual",
      }),
    ).toBe(96_000);
  });
});
