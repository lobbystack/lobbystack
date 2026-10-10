import { describe, expect, it } from "vitest";

import { reserveWebVoiceUsageInTransaction } from "./billing";
import { billableQuantityForEvent, effectiveBillingPlan, estimateSmsSegments, periodKeyFor, replayEvents, reserveUsageInTransaction, voiceSecondsLeft } from "./usage";

const event = (sourceKey: string, usageKind: string, quantity: number, isFinal: boolean, minute: number, billingInterval = "annual") => ({ sourceKey, usageKind, quantity, isFinal, planAtRecordTime: "starter", billingIntervalAtRecordTime: billingInterval, createdAt: new Date(Date.UTC(2026, 8, 1, 0, minute)) });

/** A transaction whose selects return these row sets in order and whose writes succeed. */
function fakeTx(selects: unknown[][]) {
  const chain = (resolved: unknown[]): unknown => new Proxy(function () {}, {
    get: (_target, property) => property === "then" ? (resolve: (value: unknown) => unknown) => resolve(resolved) : () => chain(resolved),
  });
  return { execute: () => chain([]), select: () => chain(selects.shift() ?? []), insert: () => chain([{ id: "event-1" }]), update: () => chain([]) } as never;
}

// A cloud Starter account with a $10 overage cap: the business row, then the billing account.
const starterWithCap = (): unknown[][] => [[{ deploymentMode: "cloud" }], [{ plan: "starter", subscriptionState: "active", overageSpendingCapCents: 1_000, billingInterval: "monthly" }]];

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

  it("lets a paid plan's website chat start once spend has passed the cap", async () => {
    // $12 of voice overage is spent; the owner then lowered the cap to $10.
    const spent = () => [...starterWithCap(), [], [event("voice:used", "voice_seconds", 12_600, true, 0, "monthly")]];
    const chat = await reserveUsageInTransaction(fakeTx(spent()), { businessId: "biz", usageKind: "chat_ai_tokens", sourceKey: "chat:1", quantity: 1 });
    expect(chat.allowed).toBe(true);
    const sms = await reserveUsageInTransaction(fakeTx(spent()), { businessId: "biz", usageKind: "alert_sms_segments", sourceKey: "sms:1", quantity: 1 });
    expect(sms).toMatchObject({ allowed: false, errorCode: "alert_sms_limit_reached" });
  });
});

describe("voice seconds left", () => {
  const capped = { plan: "starter" as const, capCents: 1_000 };

  it("gives phone and browser calls the same seconds within a cent of the cap", async () => {
    // 2,998 seconds past Starter's 9,000 at 20 cents a minute: $9.9933 of the $10 cap.
    const used = event("voice:used", "voice_seconds", 11_998, true, 0, "monthly");
    expect(voiceSecondsLeft(capped, replayEvents([used], "starter"))).toBe(2);
    const spendAfter = (seconds: number) => replayEvents([used, event("voice:next", "voice_seconds", seconds, false, 1, "monthly")], "starter").rawSpendCents;
    expect(spendAfter(2)).toBeLessThanOrEqual(1_000);
    expect(spendAfter(3)).toBeGreaterThan(1_000);

    const phone = await reserveUsageInTransaction(fakeTx([...starterWithCap(), [], [used]]), { businessId: "biz", usageKind: "voice_seconds", sourceKey: "voice:phone" });
    const browser = await reserveWebVoiceUsageInTransaction(fakeTx([...starterWithCap(), [used], ...starterWithCap(), [], [used]]), { businessId: "biz", callId: "web" });
    expect(phone).toMatchObject({ allowed: true, quantity: 2 });
    expect(browser).toMatchObject({ allowed: true, maxDurationMs: 2_000 });
  });

  it("keeps included seconds when alert texts reach the cap, and none once spend passes it", () => {
    const voice = event("voice:used", "voice_seconds", 8_000, true, 0, "monthly");
    const texts = (segments: number) => event("sms:used", "alert_sms_segments", segments, true, 1, "monthly");
    // 500 texts past the 50 included at 2 cents each: exactly the $10 cap.
    expect(voiceSecondsLeft(capped, replayEvents([voice, texts(550)], "starter"))).toBe(1_000);
    expect(voiceSecondsLeft(capped, replayEvents([voice, texts(551)], "starter"))).toBe(0);
  });

  it("never runs out on a plan without a voice limit, even with a cap set", () => {
    const replay = replayEvents([], "enterprise");
    expect(voiceSecondsLeft({ plan: "enterprise", capCents: 1_000 }, replay)).toBe(Number.POSITIVE_INFINITY);
    expect(voiceSecondsLeft({ plan: "self_host", capCents: null }, replay)).toBe(Number.POSITIVE_INFINITY);
    expect(voiceSecondsLeft({ plan: "pro", capCents: null }, replay)).toBe(Number.POSITIVE_INFINITY);
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
