import { describe, expect, it } from "vitest";

import { loadVoiceGatewayEnv } from "./index";

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

    expect(env.WEB_CALL_ALLOWED_ORIGINS).toBe("https://lobbystack.com");
    expect(env.WEB_CALL_ALLOWED_ORIGINS).not.toContain("localhost");
    expect(env.WEB_CALL_ALLOWED_ORIGINS).not.toContain("127.0.0.1");
  });
});
