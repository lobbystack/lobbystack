import { describe, expect, it } from "vitest";

import { billableQuantityForEvent, effectiveBillingPlan, estimateSmsSegments, periodKeyFor, replayEvents } from "./usage";

const event = (sourceKey: string, usageKind: string, quantity: number, isFinal: boolean, minute: number, billingInterval = "annual") => ({ sourceKey, usageKind, quantity, isFinal, planAtRecordTime: "starter", billingIntervalAtRecordTime: billingInterval, createdAt: new Date(Date.UTC(2026, 8, 1, 0, minute)) });

describe("overage spend and annual billing", () => {
  it("never counts website chats as overage spend", () => {
    const chats = Array.from({ length: 60 }, (_, index) => event(`chat:${index}`, "chat_ai_tokens", 1, true, index, "monthly"));
    const replay = replayEvents(chats, "starter");
    expect(replay.usage.chat_ai_tokens).toBe(60);
    expect(replay.rawSpendCents).toBe(0);
  });

  it("bills annual voice overage only against usage already final", () => {
    // 8,900 of Starter's 9,000 seconds are used. A browser call holds 300 s
    // while a 120 s phone call ends, then the browser call ends at 30 s.
    const used = event("voice:used", "voice_seconds", 8_900, true, 0);
    const widget = event("voice:widget", "voice_seconds", 300, false, 1);
    const phone = event("voice:phone", "voice_seconds", 120, true, 2);
    expect(billableQuantityForEvent([used, widget], phone, "starter")).toBe(20);
    const widgetEnded = { ...widget, quantity: 30, isFinal: true };
    expect(billableQuantityForEvent([used, phone], widgetEnded, "starter")).toBe(30);
    // A repeat correction of the phone call keeps the 20 it already billed.
    expect(billableQuantityForEvent([used, widgetEnded], phone, "starter", { quantity: 120, billableQuantity: 20 })).toBe(20);
  });
});

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
