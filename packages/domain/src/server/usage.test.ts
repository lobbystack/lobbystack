import { describe, expect, it } from "vitest";

import { packageEntitlement, planEntitlement, type BillingPlanSlug } from "@lobbystack/shared";

import { reserveWebVoiceUsageInTransaction } from "./billing";
import { effectiveBillingPlan } from "./entitlement";
import { billableQuantityForEvent, businessOverageFor, estimateSmsSegments, periodKeyFor, replayEvents, reserveUsageInTransaction, voiceSecondsLeft } from "./usage";

const event = (sourceKey: string, usageKind: string, quantity: number, isFinal: boolean, minute: number, billingInterval = "annual") => ({ sourceKey, usageKind, quantity, isFinal, planAtRecordTime: "starter", billingIntervalAtRecordTime: billingInterval, createdAt: new Date(Date.UTC(2026, 8, 1, 0, minute)) });

/** A business on this plan, with the plan's catalog entitlement. */
const onPlan = (plan: BillingPlanSlug) => ({ plan, entitlement: planEntitlement(plan) });

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
    const replay = replayEvents(chats, onPlan("starter"));
    expect(replay.usage.chat_ai_tokens).toBe(60);
    expect(replay.rawSpendCents).toBe(0);
  });

  it("bills annual voice overage only against usage already final", () => {
    // 8,900 of Starter's 9,000 seconds are used. A browser call holds 300 s
    // while a 120 s phone call ends, then the browser call ends at 30 s.
    const used = event("voice:used", "voice_seconds", 8_900, true, 0);
    const widget = event("voice:widget", "voice_seconds", 300, false, 1);
    const phone = event("voice:phone", "voice_seconds", 120, true, 2);
    expect(billableQuantityForEvent([used, widget], phone, onPlan("starter"))).toBe(20);
    const widgetEnded = { ...widget, quantity: 30, isFinal: true };
    expect(billableQuantityForEvent([used, phone], widgetEnded, onPlan("starter"))).toBe(30);
    // A repeat correction of the phone call keeps the 20 it already billed.
    expect(billableQuantityForEvent([used, widgetEnded], phone, onPlan("starter"), { quantity: 120, billableQuantity: 20 })).toBe(20);
  });

  it("prices usage on the current plan by the business's entitlement, and usage on another plan by that plan's terms", () => {
    // Starter's 50 included texts, at 5 cents each past them instead of the catalog's 2.
    const starter = planEntitlement("starter", { live: true, capMinor: 1_000 });
    const current = { plan: "starter" as const, entitlement: { ...starter, overage: { ...starter.overage, rates: { ...starter.overage.rates, alertSms: 5 } } } };
    const texts = (planAtRecordTime: string | null) => ({ ...event("sms:used", "alert_sms_segments", 60, true, 0, "monthly"), planAtRecordTime });
    expect(replayEvents([texts("starter")], current).rawSpendCents).toBe(50);
    // An event that recorded no plan counts as the current one.
    expect(replayEvents([texts(null)], current).rawSpendCents).toBe(50);
    // Free bills no overage, whatever the business is on now.
    expect(replayEvents([texts("free_cloud")], current).rawSpendCents).toBe(0);
    // The cap leaves the included seconds plus what $9.50 more pays for at the catalog's 20 cents a minute.
    expect(voiceSecondsLeft(current.entitlement, replayEvents([texts("starter")], current))).toBe(9_000 + 2_850);
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
  const capped = planEntitlement("starter", { live: true, capMinor: 1_000 });

  it("gives phone and browser calls the same seconds within a cent of the cap", async () => {
    // 2,998 seconds past Starter's 9,000 at 20 cents a minute: $9.9933 of the $10 cap.
    const used = event("voice:used", "voice_seconds", 11_998, true, 0, "monthly");
    expect(voiceSecondsLeft(capped, replayEvents([used], onPlan("starter")))).toBe(2);
    const spendAfter = (seconds: number) => replayEvents([used, event("voice:next", "voice_seconds", seconds, false, 1, "monthly")], onPlan("starter")).rawSpendCents;
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
    expect(voiceSecondsLeft(capped, replayEvents([voice, texts(550)], onPlan("starter")))).toBe(1_000);
    expect(voiceSecondsLeft(capped, replayEvents([voice, texts(551)], onPlan("starter")))).toBe(0);
  });

  it("never runs out on a plan without a voice limit, even with a cap set", () => {
    const replay = replayEvents([], onPlan("enterprise"));
    expect(voiceSecondsLeft(planEntitlement("enterprise", { live: true, capMinor: 1_000 }), replay)).toBe(Number.POSITIVE_INFINITY);
    expect(voiceSecondsLeft(planEntitlement("self_host"), replay)).toBe(Number.POSITIVE_INFINITY);
    expect(voiceSecondsLeft(planEntitlement("pro", { live: true, capMinor: null }), replay)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("a business's overage on its package", () => {
  // Front desk: 10 minutes and 3 chats, then 30 cents a minute and 10 a chat, up to $4.
  const frontDesk = packageEntitlement("partner-1", { currency: "CAD", voiceMinutes: 10, chats: 3 }, { live: true, overage: { enabled: true, currency: "CAD", voiceMinuteRateMinor: 30, chatRateMinor: 10, capMinor: 400 } });
  const onPackage = { plan: "self_host" as const, entitlement: frontDesk };
  const usage = (sourceKey: string, usageKind: string, quantity: number, isFinal: boolean, minute: number) => ({ ...event(sourceKey, usageKind, quantity, isFinal, minute, "monthly"), planAtRecordTime: "self_host" });

  it("goes to the usage that ended past the allowance, never to a call still open", () => {
    const ended = usage("voice:ended", "voice_seconds", 500, true, 0);
    const open = usage("voice:open", "voice_seconds", 300, false, 1);
    // The call that ends now is past the 600 seconds by 200, whatever the open call holds.
    expect(businessOverageFor([ended, open], { usageKind: "voice_seconds", quantity: 300 }, frontDesk, null)).toEqual({ quantity: 200, minor: 100 });
    // Corrected again, it moves only by its own change.
    expect(businessOverageFor([ended, open], { usageKind: "voice_seconds", quantity: 360 }, frontDesk, { quantity: 300, overageQuantity: 200 })).toEqual({ quantity: 260, minor: 130 });
    const chats = [0, 1, 2].map((minute) => usage(`chat:${minute}`, "chat_ai_tokens", 1, true, minute));
    expect(businessOverageFor(chats, { usageKind: "chat_ai_tokens", quantity: 1 }, frontDesk, null)).toEqual({ quantity: 1, minor: 10 });
  });

  it("prices nothing a package doesn't sell, and nothing past the allowance while overage is off", () => {
    expect(businessOverageFor([], { usageKind: "alert_sms_segments", quantity: 5 }, frontDesk, null)).toBeNull();
    expect(businessOverageFor([], { usageKind: "voice_seconds", quantity: 900 }, planEntitlement("starter", { live: true, capMinor: null }), null)).toBeNull();
    const off = packageEntitlement("partner-1", { currency: "CAD", voiceMinutes: 10, chats: 3 }, { live: true });
    expect(businessOverageFor([], { usageKind: "voice_seconds", quantity: 900 }, off, null)).toEqual({ quantity: 0, minor: 0 });
  });

  it("counts open calls against the cap, and prices each event by the terms it recorded", () => {
    const ended = usage("voice:ended", "voice_seconds", 1_200, true, 0);
    // 600 seconds past the allowance at half a cent each leave 100 cents of the cap, or 200 seconds.
    expect(voiceSecondsLeft(frontDesk, replayEvents([ended], onPackage))).toBe(200);
    expect(voiceSecondsLeft(frontDesk, replayEvents([ended, usage("voice:open", "voice_seconds", 100, false, 1)], onPackage))).toBe(100);
    // An event recorded at 15 cents a minute keeps that price after the partner doubled it.
    const cheaper = { ...ended, termsAtRecordTime: { source: "package", allowance: frontDesk.allowance, overage: { ...frontDesk.overage, rates: { ...frontDesk.overage.rates, voiceMinute: 15 } } } };
    expect(replayEvents([cheaper], onPackage).rawSpendCents).toBe(150);
    expect(replayEvents([ended], onPackage).rawSpendCents).toBe(300);
  });

  it("lets minutes that cost nothing past the allowance run whatever the cap", () => {
    const free = packageEntitlement("partner-1", { currency: "CAD", voiceMinutes: 10, chats: 3 }, { live: true, overage: { enabled: true, currency: "CAD", voiceMinuteRateMinor: 0, chatRateMinor: 10, capMinor: 0 } });
    expect(voiceSecondsLeft(free, replayEvents([usage("voice:ended", "voice_seconds", 1_200, true, 0)], { plan: "self_host", entitlement: free }))).toBe(Number.POSITIVE_INFINITY);
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
