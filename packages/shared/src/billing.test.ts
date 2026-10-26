import { describe, expect, it } from "vitest";

import {
  billedOutsideEntitlement,
  billableVoiceSeconds,
  billingPlanCatalog,
  billingMeterEventNames,
  billingUsageKinds,
  contentRetentionCategories,
  contentRetentionDaysForPlan,
  getKnowledgeStorageLimitBytes,
  getPolarMeteredUsagePayload,
  hasLiveEntitlement,
  hasLivePackageSubscription,
  isPaidPartnerTierSlug,
  isPartnerTierSlug,
  packageEntitlement,
  packageOverageIn,
  partnerTierCatalog,
  partnerTierInForce,
  planEntitlement,
} from "./billing";

describe("direct plan entitlements", () => {
  it("holds a live entitlement only on a paid plan whose subscription is live", () => {
    for (const plan of ["starter", "pro", "enterprise"]) {
      for (const subscriptionState of ["active", "trialing", "past_due"]) expect(hasLiveEntitlement({ plan, subscriptionState })).toBe(true);
      for (const subscriptionState of ["canceled", "revoked", "incomplete", null]) expect(hasLiveEntitlement({ plan, subscriptionState })).toBe(false);
    }
    for (const plan of ["free_cloud", "self_host", "self_hosted_standard", "legacy_plan", null]) expect(hasLiveEntitlement({ plan, subscriptionState: "active" })).toBe(false);
    expect(hasLiveEntitlement(null)).toBe(false);
  });

  it("takes each plan's allowance, overage rates and numbers from the catalog", () => {
    expect(planEntitlement("free_cloud")).toMatchObject({ source: "plan", allowance: { voiceSeconds: 1_800, chats: 5, alertSms: 10, outboundAttempts: 2 }, overage: { enabled: false }, includedNumbers: 0 });
    expect(planEntitlement("starter", { live: true, capMinor: 1_000 })).toMatchObject({ live: true, overage: { enabled: true, currency: "USD", rates: { voiceMinute: 20, chat: 0, alertSms: 2, outboundAttempt: 2 }, capMinor: 1_000 }, includedNumbers: 1 });
    expect(planEntitlement("pro").overage.rates).toEqual({ voiceMinute: 18, chat: 0, alertSms: 2, outboundAttempt: 2 });
    expect(planEntitlement("enterprise")).toMatchObject({ source: "plan", allowance: { voiceSeconds: null, chats: null, alertSms: null, outboundAttempts: null }, overage: { enabled: true }, includedNumbers: null });
    expect(planEntitlement("self_host")).toMatchObject({ source: "unlimited", overage: { enabled: false }, includedNumbers: null, poolPartnerId: null });
  });
});

describe("partner tiers", () => {
  it("sells Free, Starter, Growth and Scale at the cloud's prices, pools and numbers", () => {
    const minutes = (tier: keyof typeof partnerTierCatalog) => partnerTierCatalog[tier].poolVoiceSeconds / 60;
    expect(Object.keys(partnerTierCatalog)).toEqual(["free", "starter", "growth", "scale"]);
    expect([partnerTierCatalog.free.monthlyChargeCents, partnerTierCatalog.starter.monthlyChargeCents, partnerTierCatalog.growth.monthlyChargeCents, partnerTierCatalog.scale.monthlyChargeCents]).toEqual([0, 4_900, 19_900, 49_900]);
    expect([minutes("free"), minutes("starter"), minutes("growth"), minutes("scale")]).toEqual([30, 250, 1_300, 4_000]);
    expect([partnerTierCatalog.free.poolChats, partnerTierCatalog.starter.poolChats, partnerTierCatalog.growth.poolChats, partnerTierCatalog.scale.poolChats]).toEqual([50, 1_000, 5_000, 10_000]);
    expect([partnerTierCatalog.free.includedNumbers, partnerTierCatalog.starter.includedNumbers, partnerTierCatalog.growth.includedNumbers, partnerTierCatalog.scale.includedNumbers]).toEqual([0, 2, 10, 25]);
    expect(partnerTierCatalog.free).toMatchObject({ paid: false, trialNumbers: 1, overagesBillable: false, voiceOverageRatePerMinuteCents: null, chatOverageRatePerChatCents: null });
    expect([partnerTierCatalog.starter, partnerTierCatalog.growth, partnerTierCatalog.scale].map((tier) => [tier.voiceOverageRatePerMinuteCents, tier.chatOverageRatePerChatCents])).toEqual([[20, 2], [15, 1.5], [12, 1]]);
  });

  it("takes 20% off each paid tier billed annually, rounded down to whole dollars a month", () => {
    for (const tier of ["starter", "growth", "scale"] as const) {
      const terms = partnerTierCatalog[tier];
      expect(terms.annualEffectiveMonthlyChargeCents).toBe(Math.floor((terms.monthlyChargeCents * 0.8) / 100) * 100);
      expect(terms.annualChargeCents).toBe(terms.annualEffectiveMonthlyChargeCents * 12);
    }
    expect([partnerTierCatalog.starter, partnerTierCatalog.growth, partnerTierCatalog.scale].map((tier) => tier.annualChargeCents)).toEqual([46_800, 190_800, 478_800]);
    expect(billingPlanCatalog.starter.annualChargeCents).toBe(billingPlanCatalog.starter.monthlyChargeCents * 12 * 0.8);
  });

  it("holds a paid tier only while its subscription is live, and Free otherwise", () => {
    for (const tier of ["starter", "growth", "scale"]) {
      for (const subscriptionState of ["active", "trialing", "past_due"]) expect(partnerTierInForce({ tier, subscriptionState })).toBe(tier);
      for (const subscriptionState of ["canceled", "revoked", "incomplete", null]) expect(partnerTierInForce({ tier, subscriptionState })).toBe("free");
    }
    for (const tier of ["free", "pro", "enterprise", null]) expect(partnerTierInForce({ tier, subscriptionState: "active" })).toBe("free");
    expect(partnerTierInForce(null)).toBe("free");
    expect(isPartnerTierSlug("free") && isPaidPartnerTierSlug("growth")).toBe(true);
    expect(isPaidPartnerTierSlug("free") || isPartnerTierSlug("pro")).toBe(false);
  });
});

describe("knowledge storage limits", () => {
  it("matches the configured plan allowances", () => {
    expect(getKnowledgeStorageLimitBytes("self_host")).toBeNull();
    expect(getKnowledgeStorageLimitBytes("free_cloud")).toBe(1 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("starter")).toBe(5 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("pro")).toBe(20 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("enterprise")).toBeNull();
  });
});

describe("content retention by plan", () => {
  it("keeps free content at 30 days across every category", () => {
    for (const category of contentRetentionCategories) {
      expect(contentRetentionDaysForPlan("free_cloud", category)).toBe(30);
    }
  });

  it("uses the longer paid and self-host defaults", () => {
    expect(contentRetentionDaysForPlan("starter", "messages")).toBe(365);
    expect(contentRetentionDaysForPlan("starter", "transcripts")).toBe(90);
    expect(contentRetentionDaysForPlan("starter", "recordings")).toBe(90);
    expect(contentRetentionDaysForPlan("starter", "follow_ups")).toBe(365);
    expect(contentRetentionDaysForPlan("pro", "messages")).toBe(365);
    expect(contentRetentionDaysForPlan("enterprise", "transcripts")).toBe(90);
    expect(contentRetentionDaysForPlan("self_host", "messages")).toBe(365);
    expect(contentRetentionDaysForPlan("self_host", "recordings")).toBe(90);
  });

  it("never raises free content above the 30 day hard cap", () => {
    expect(contentRetentionDaysForPlan("free_cloud", "messages", { messages: 999 })).toBe(30);
    expect(contentRetentionDaysForPlan("free_cloud", "recordings", { recordings: 5 })).toBe(30);
    expect(contentRetentionDaysForPlan("free_cloud", "follow_ups", { messages: 365, follow_ups: 365 })).toBe(30);
  });

  it("applies paid overrides per category and keeps paid defaults for absent categories", () => {
    expect(contentRetentionDaysForPlan("starter", "messages", { messages: 10 })).toBe(10);
    expect(contentRetentionDaysForPlan("starter", "transcripts", { messages: 10 })).toBe(90);
    expect(contentRetentionDaysForPlan("self_host", "recordings", { recordings: 45 })).toBe(45);
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
    expect(billingPlanCatalog.starter.monthlyChargeCents).toBe(3_000);
    expect(billingPlanCatalog.starter.annualEffectiveMonthlyChargeCents).toBe(2_400);
    expect(billingPlanCatalog.starter.annualChargeCents).toBe(28_800);
  });

  it("configures pro pricing and usage", () => {
    expect(billingPlanCatalog.pro.voiceSecondsIncluded).toBe(30_000);
    expect(billingPlanCatalog.pro.voiceOverageRatePerMinuteCents).toBe(18);
    expect(billingPlanCatalog.pro.monthlyChargeCents).toBe(10_000);
    expect(billingPlanCatalog.pro.annualEffectiveMonthlyChargeCents).toBe(8_000);
    expect(billingPlanCatalog.pro.annualChargeCents).toBe(96_000);
  });
});

describe("billableVoiceSeconds", () => {
  it("bills calls of 10 seconds or longer in full", () => {
    expect(billableVoiceSeconds(10)).toBe(10);
    expect(billableVoiceSeconds(184.5)).toBe(184.5);
  });

  it("exempts wrong numbers and instant hang-ups under 10 seconds", () => {
    expect(billableVoiceSeconds(9.99)).toBe(0);
    expect(billableVoiceSeconds(0)).toBe(0);
  });

  it("exempts a call that ran under 10 seconds even when the provider bills a minimum", () => {
    expect(billableVoiceSeconds(15, "caller_finished", 0.8)).toBe(0);
    expect(billableVoiceSeconds(15, "caller_finished", 12)).toBe(15);
  });

  it("exempts calls the receptionist ended as spam", () => {
    expect(billableVoiceSeconds(240, "spam_ended")).toBe(0);
  });

  it("bills other dispositions normally", () => {
    expect(billableVoiceSeconds(240, "caller_finished")).toBe(240);
    expect(billableVoiceSeconds(240, "abuse_ended")).toBe(240);
    expect(billableVoiceSeconds(240, null)).toBe(240);
  });

  it("treats negative durations as zero", () => {
    expect(billableVoiceSeconds(-30)).toBe(0);
  });
});

describe("billableVoiceSeconds with provider rounding", () => {
  it("exempts a 9.2 second call the provider reported as 10 seconds", () => {
    expect(billableVoiceSeconds(10, null, 9.2)).toBe(0);
  });

  it("bills a call both sources agree ran past the cutoff", () => {
    expect(billableVoiceSeconds(11, null, 10.4)).toBe(11);
  });

  it("keeps the provider duration when it is the longer measure", () => {
    expect(billableVoiceSeconds(65, null, 64.2)).toBe(65);
  });

  it("still exempts spam regardless of the measured time", () => {
    expect(billableVoiceSeconds(300, "spam_ended", 299.5)).toBe(0);
  });
});

describe("a partner business billed outside LobbyStack", () => {
  it("is live, with no allowance, overage or number limit, and draws on its partner's pool", () => {
    expect(billedOutsideEntitlement("partner-1")).toEqual({
      live: true,
      source: "billed_outside",
      allowance: { voiceSeconds: null, chats: null, alertSms: null, outboundAttempts: null },
      overage: { enabled: false, currency: "USD", rates: { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 }, capMinor: null },
      poolPartnerId: "partner-1",
      includedNumbers: null,
    });
  });

  it("gets nothing while its partner's businesses are paused, so calls forward and chat shows its message", () => {
    expect(billedOutsideEntitlement("partner-1", { live: false })).toMatchObject({ live: false, source: "billed_outside", allowance: { voiceSeconds: 0, chats: 0, alertSms: 0, outboundAttempts: 0 }, overage: { enabled: false }, poolPartnerId: "partner-1" });
  });
});

describe("a partner business on a package", () => {
  const frontDesk = { currency: "CAD", voiceMinutes: 300, chats: 1000 };

  it("gets the package's minutes and chats while its subscription is live, in the package's currency, with no overage", () => {
    expect(packageEntitlement("partner-1", frontDesk, { live: true })).toEqual({
      live: true,
      source: "package",
      allowance: { voiceSeconds: 18_000, chats: 1000, alertSms: null, outboundAttempts: null },
      overage: { enabled: false, currency: "CAD", rates: { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 }, capMinor: null },
      poolPartnerId: "partner-1",
      includedNumbers: null,
    });
  });

  it("gets nothing once its subscription isn't live, so calls forward and chat shows its message", () => {
    expect(packageEntitlement("partner-1", frontDesk, { live: false })).toMatchObject({ live: false, source: "package", allowance: { voiceSeconds: 0, chats: 0, alertSms: 0, outboundAttempts: 0 }, poolPartnerId: "partner-1" });
  });

  const overage = { enabled: true, currency: "CAD", voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: 5_000 };

  it("goes past its allowance at the rates and up to the cap its partner set, in the package's currency", () => {
    expect(packageEntitlement("partner-1", frontDesk, { live: true, overage })).toMatchObject({
      allowance: { voiceSeconds: 18_000, chats: 1000 },
      overage: { enabled: true, currency: "CAD", rates: { voiceMinute: 25, chat: 5, alertSms: 0, outboundAttempt: 0 }, capMinor: 5_000 },
    });
    // Overage the partner turned off, or a business that doesn't pay, gets the package's allowance alone.
    for (const account of [{ live: true, overage: { ...overage, enabled: false } }, { live: false, overage }]) {
      expect(packageEntitlement("partner-1", frontDesk, account).overage).toEqual({ enabled: false, currency: "CAD", rates: { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 }, capMinor: null });
    }
  });

  it("holds overage set in another currency than the package's as off", () => {
    expect(packageOverageIn("cad", overage)).toEqual(overage);
    expect(packageOverageIn("EUR", overage)).toEqual({ enabled: false, currency: "EUR", voiceMinuteRateMinor: 0, chatRateMinor: 0, capMinor: null });
    expect(packageOverageIn("CAD", null)).toEqual({ enabled: false, currency: "CAD", voiceMinuteRateMinor: 0, chatRateMinor: 0, capMinor: null });
    expect(packageEntitlement("partner-1", { ...frontDesk, currency: "EUR" }, { live: true, overage }).overage).toMatchObject({ enabled: false, currency: "EUR" });
  });

  it("counts a subscription live as a plan's is, past_due included", () => {
    for (const state of ["active", "trialing", "past_due"]) expect(hasLivePackageSubscription(state)).toBe(true);
    for (const state of ["incomplete", "incomplete_expired", "canceled", "unpaid", "paused", null, undefined]) expect(hasLivePackageSubscription(state)).toBe(false);
  });
});
