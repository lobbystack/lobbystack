import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultWidgetConfig, widgetConfigSchema } from "@lobbystack/shared";

import { createWidgetSessionToken, hashWidgetKey, isAllowedWidgetOrigin, normalizeOrigin, normalizeAllowedOrigins, serializeWidgetKeyConfig, verifyWidgetSessionToken } from "./widget-keys";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("widget key hashing and origin policy", () => {
  it("hashes widget keys deterministically", () => {
    expect(hashWidgetKey("wk_live_abc")).toBe(hashWidgetKey("  wk_live_abc  "));
    expect(hashWidgetKey("wk_live_abc")).not.toBe(hashWidgetKey("wk_live_abd"));
  });

  it("normalizes origins, stripping trailing slashes", () => {
    expect(normalizeOrigin("https://example.com/")).toBe("https://example.com");
    expect(normalizeOrigin("https://example.com:8443")).toBe("https://example.com:8443");
    expect(normalizeAllowedOrigins(["https://a.com", "https://a.com/", 42, "https://b.com"])).toEqual(new Set(["https://a.com", "https://b.com"]));
  });

  it("mirrors the static web voice allowlist and trusts the admin origin for the iframe", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_BASE_URL", "https://app.lobbystack.com");
    const allowed = ["https://example.com", "https://www.example.com"];
    expect(isAllowedWidgetOrigin("https://example.com", allowed)).toBe(true);
    expect(isAllowedWidgetOrigin("https://example.com/", allowed)).toBe(true);
    expect(isAllowedWidgetOrigin("https://evil.com", allowed)).toBe(false);
    expect(isAllowedWidgetOrigin("http://localhost:3000", allowed)).toBe(true);
    expect(isAllowedWidgetOrigin("https://app.lobbystack.com", allowed)).toBe(true);
  });

  it("serializes config with defaults and strict schema output", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_BASE_URL", "");
    const row = {
      id: "00000000-0000-4000-8000-000000000001",
      status: "active",
      label: "Site",
      allowedOrigins: ["https://example.com/"],
      config: { color: "#123456" },
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const key = serializeWidgetKeyConfig(row);
    expect(key.config.color).toBe("#123456");
    expect(key.config.position).toBe(defaultWidgetConfig.position);
    expect(key.allowedOrigins).toEqual(["https://example.com"]);
    expect(widgetConfigSchema.safeParse(key.config).success).toBe(true);
  });

  it("binds signed sessions to the visitor and normalized parent origin", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("WIDGET_SESSION_SECRET", "session-secret");
    const created = createWidgetSessionToken({
      widgetKeyId: "00000000-0000-4000-8000-000000000010",
      businessId: "00000000-0000-4000-8000-000000000011",
      visitorId: "00000000-0000-4000-8000-000000000012",
      origin: "https://example.com/",
    });
    expect(verifyWidgetSessionToken(created.token)).toMatchObject({
      widgetKeyId: "00000000-0000-4000-8000-000000000010",
      businessId: "00000000-0000-4000-8000-000000000011",
      visitorId: "00000000-0000-4000-8000-000000000012",
      origin: "https://example.com",
    });
  });

  it("rejects expired or tampered widget sessions", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("WIDGET_SESSION_SECRET", "session-secret");
    const expired = createWidgetSessionToken({
      widgetKeyId: "00000000-0000-4000-8000-000000000010",
      businessId: "00000000-0000-4000-8000-000000000011",
      visitorId: "00000000-0000-4000-8000-000000000012",
      origin: "https://example.com",
      ttlSeconds: -1,
    });
    expect(verifyWidgetSessionToken(expired.token)).toBeNull();
    expect(verifyWidgetSessionToken(`${expired.token.slice(0, -1)}x`)).toBeNull();
  });
});
