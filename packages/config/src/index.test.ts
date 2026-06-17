import { describe, expect, it } from "vitest";

import { loadClientEnv, loadVoiceGatewayEnv } from "./index";

const baseVoiceGatewayEnv = {
  VOICE_GATEWAY_BASE_URL: "https://voice.example.com",
  CONVEX_SITE_URL: "https://example.convex.site",
  INTERNAL_SERVICE_TOKEN: "test-token",
};

describe("loadVoiceGatewayEnv", () => {
  it("rejects development deployment mode in production", () => {
    expect(() =>
      loadVoiceGatewayEnv({
        ...baseVoiceGatewayEnv,
        NODE_ENV: "production",
        DEPLOYMENT_MODE: "development",
      }),
    ).toThrow("DEPLOYMENT_MODE=development is not allowed when NODE_ENV=production.");
  });

  it("allows development deployment mode outside production", () => {
    expect(
      loadVoiceGatewayEnv({
        ...baseVoiceGatewayEnv,
        NODE_ENV: "development",
        DEPLOYMENT_MODE: "development",
      }).DEPLOYMENT_MODE,
    ).toBe("development");
  });

  it("defaults web call allowed origins to production-safe origins", () => {
    const env = loadVoiceGatewayEnv({
      ...baseVoiceGatewayEnv,
      DEPLOYMENT_MODE: "cloud",
    });

    expect(env.WEB_CALL_ALLOWED_ORIGINS).toBe(
      "https://app.lobbystack.com,https://lobbystack.com,https://www.lobbystack.com",
    );
    expect(env.WEB_CALL_ALLOWED_ORIGINS).toContain(
      "https://app.lobbystack.com",
    );
    expect(env.WEB_CALL_ALLOWED_ORIGINS).toContain("https://lobbystack.com");
    expect(env.WEB_CALL_ALLOWED_ORIGINS).toContain(
      "https://www.lobbystack.com",
    );
    expect(env.WEB_CALL_ALLOWED_ORIGINS).not.toContain("localhost");
    expect(env.WEB_CALL_ALLOWED_ORIGINS).not.toContain("127.0.0.1");
  });

  it("does not trust proxy headers unless explicitly enabled", () => {
    expect(loadVoiceGatewayEnv(baseVoiceGatewayEnv).VOICE_GATEWAY_TRUST_PROXY).toBe(false);
    expect(
      loadVoiceGatewayEnv({
        ...baseVoiceGatewayEnv,
        VOICE_GATEWAY_TRUST_PROXY: "true",
      }).VOICE_GATEWAY_TRUST_PROXY,
    ).toEqual(["loopback", "linklocal", "uniquelocal"]);
    expect(
      loadVoiceGatewayEnv({
        ...baseVoiceGatewayEnv,
        VOICE_GATEWAY_TRUST_PROXY: "10.0.0.0/8, 192.168.0.0/16",
      }).VOICE_GATEWAY_TRUST_PROXY,
    ).toEqual(["10.0.0.0/8", "192.168.0.0/16"]);
  });

  it("rejects web call max durations above the Convex stale timeout window", () => {
    expect(() =>
      loadVoiceGatewayEnv({
        ...baseVoiceGatewayEnv,
        WEB_CALL_MAX_DURATION_MS: String(31 * 60 * 1000),
      }),
    ).toThrow();
  });

  it("treats empty optional telemetry env vars as unset", () => {
    const env = loadVoiceGatewayEnv({
      ...baseVoiceGatewayEnv,
      POSTHOG_KEY: "",
      POSTHOG_HOST: "",
    });

    expect(env.POSTHOG_KEY).toBeUndefined();
    expect(env.POSTHOG_HOST).toBeUndefined();
  });

  it("loads the optional dashboard test call token for server-side proof checks", () => {
    const env = loadVoiceGatewayEnv({
      ...baseVoiceGatewayEnv,
      DASHBOARD_TEST_CALL_TOKEN: "dashboard-token",
    });

    expect(env.DASHBOARD_TEST_CALL_TOKEN).toBe("dashboard-token");
  });
});

describe("loadClientEnv", () => {
  it("loads the optional web call endpoint", () => {
    const env = loadClientEnv({
      CONVEX_URL: "https://example.convex.cloud",
      CONVEX_SITE_URL: "https://example.convex.site",
      VITE_WEB_CALL_ENDPOINT: "https://voice.example.com/web-call/sessions",
    });

    expect(env.VITE_WEB_CALL_ENDPOINT).toBe(
      "https://voice.example.com/web-call/sessions",
    );
  });
});
