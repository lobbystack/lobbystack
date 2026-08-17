import { describe, expect, it } from "vitest";

import {
  billingPlanCatalog,
  billingMeterEventNames,
  billingUsageKinds,
  getBillingMonthlyChargeCents,
  getBillingPeriodChargeCents,
  getKnowledgeStorageLimitBytes,
  getPolarMeteredUsagePayload,
} from "./billing";

describe("knowledge storage limits", () => {
  it("matches the configured plan allowances", () => {
    expect(getKnowledgeStorageLimitBytes("self_host")).toBeNull();
    expect(getKnowledgeStorageLimitBytes("free_cloud")).toBe(25 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("starter")).toBe(100 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("pro")).toBe(500 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("enterprise")).toBeNull();
  });
});

describe("website chat AI sessions", () => {
  it("declares chat_ai_tokens as a billing usage kind", () => {
    expect(billingUsageKinds).toContain("chat_ai_tokens");
    expect(billingMeterEventNames.chatAiTokens).toBe("billing.chat_ai_tokens");
    expect(getPolarMeteredUsagePayload("chat_ai_tokens", 3)).toEqual({ eventName: "billing.chat_ai_tokens", quantity: 3 });
  });

  it("configures chat session allowances per plan", () => {
    expect(billingPlanCatalog.free_cloud.chatAiTokensIncluded).toBe(5);
    expect(billingPlanCatalog.starter.chatAiTokensIncluded).toBe(50);
    expect(billingPlanCatalog.pro.chatAiTokensIncluded).toBe(200);
    expect(billingPlanCatalog.self_host.chatAiTokensIncluded).toBeNull();
    expect(billingPlanCatalog.enterprise.chatAiTokensIncluded).toBeNull();
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
