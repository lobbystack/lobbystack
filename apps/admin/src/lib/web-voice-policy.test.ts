import { describe, expect, it, vi } from "vitest";

import { buildWebVoiceRateLimits, enforceWebVoiceRateLimits, type WebVoiceLimitStore } from "./web-voice-policy";

describe("web voice policy", () => {
  it("builds all normal tenant abuse dimensions", () => {
    const names = buildWebVoiceRateLimits({ businessId: "business", origin: "https://example.test", ipHash: "ip", visitorId: "visitor" }).map((entry) => entry.name);
    expect(names).toEqual(["ip-hour", "ip-day", "visitor-hour", "visitor-day", "origin-10m", "business-hour", "business-day", "global-minute"]);
  });

  it("restricts demos to global and durable visitor identities", () => {
    const limits = buildWebVoiceRateLimits({ businessId: "business", origin: "https://example.test", prospectDemoId: "demo", visitorId: "visitor" });
    expect(limits.map((entry) => [entry.name, entry.limit, entry.windowSeconds])).toEqual([
      ["global-minute", 120, 60],
      ["demo-visitor-30d", 5, 2_592_000],
    ]);
  });

  it("preserves the higher verified dashboard test-call quotas", () => {
    const limits = buildWebVoiceRateLimits({ businessId: "business", origin: "https://example.test", ipHash: "ip", visitorId: "visitor", widgetId: "lobbystack-dashboard-test-call", dashboardTestCall: true });
    expect(limits.map((entry) => [entry.name, entry.limit])).toEqual([
      ["dashboard-ip-hour", 30],
      ["dashboard-ip-day", 100],
      ["dashboard-visitor-hour", 30],
      ["dashboard-visitor-day", 100],
      ["dashboard-origin-10m", 120],
      ["dashboard-business-hour", 120],
      ["dashboard-business-day", 600],
      ["global-minute", 120],
    ]);
  });

  it("reports the blocked dimension without exposing its key", async () => {
    const store: WebVoiceLimitStore = { evaluate: vi.fn().mockResolvedValue(2) };
    await expect(enforceWebVoiceRateLimits({ businessId: "business", origin: "https://example.test", ipHash: "ip" }, { consume: true, store })).resolves.toEqual({
      allowed: false,
      status: 429,
      code: "web_voice_rate_limited",
      reason: "rate_limit_ip_day",
    });
  });

  it("rejects demos without a visitor or IP identity", async () => {
    const store: WebVoiceLimitStore = { evaluate: vi.fn() };
    await expect(enforceWebVoiceRateLimits({ businessId: "business", origin: "https://example.test", prospectDemoId: "demo" }, { consume: false, store })).resolves.toEqual(expect.objectContaining({ allowed: false, status: 429 }));
    expect(store.evaluate).not.toHaveBeenCalled();
  });
});
