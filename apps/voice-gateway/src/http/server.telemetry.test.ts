import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { demoSnapshot } from "@lobbystack/shared";

const captureMock = vi.hoisted(() => vi.fn());

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(function PostHog() {
    return {
      capture: captureMock,
      captureException: vi.fn(),
      shutdown: vi.fn(),
    };
  }),
}));

const ENV_KEYS = [
  "BACKEND_INTERNAL_URL",
  "DEPLOYMENT_MODE",
  "INTERNAL_SERVICE_TOKEN",
  "INTERNAL_SERVICE_SECRET",
  "NODE_ENV",
  "POSTHOG_HOST",
  "POSTHOG_KEY",
  "VOICE_GATEWAY_BASE_URL",
] as const;

describe("snapshot cache telemetry wiring", () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    captureMock.mockClear();
    for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
    process.env.BACKEND_INTERNAL_URL = "https://admin.example.com";
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.INTERNAL_SERVICE_TOKEN = "voice-gateway-token-1234567890abcdef";
    process.env.INTERNAL_SERVICE_SECRET = "voice-gateway-secret-1234567890abcdef";
    process.env.NODE_ENV = "production";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    process.env.POSTHOG_KEY = "phc_test";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
    vi.clearAllMocks();
  });

  it("emits ops.voice.snapshot_cache_evicted from the server cache", async () => {
    const posthog = await import("../observability/posthog");
    posthog.setBusinessTelemetryConsent("business_123", true);
    const { createServer } = await import("./server");
    const server = createServer({ snapshotCache: { maxEntries: 1 } });

    server.snapshotCache.set("business_123", demoSnapshot);
    server.snapshotCache.set("business_456", demoSnapshot);

    expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "ops.voice.snapshot_cache_evicted",
      properties: expect.objectContaining({
        businessId: "business_123",
        channel: "phone",
        reason: "capacity",
      }),
    }));
    await server.close();
  });
});
