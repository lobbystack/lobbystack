import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(function PostHog() {
    return {
      capture: vi.fn(),
      captureException: captureExceptionMock,
      shutdown: vi.fn(),
    };
  }),
}));

const ENV_KEYS = [
  "CONVEX_SITE_URL",
  "DEPLOYMENT_MODE",
  "INTERNAL_SERVICE_TOKEN",
  "POSTHOG_HOST",
  "POSTHOG_KEY",
  "VOICE_GATEWAY_BASE_URL",
] as const;

describe("voice-gateway PostHog provider exception telemetry", () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    captureExceptionMock.mockClear();

    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
    }

    process.env.CONVEX_SITE_URL = "https://convex.example.com";
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.INTERNAL_SERVICE_TOKEN = "test-service-token";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    process.env.POSTHOG_KEY = "phc_test";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    originalEnv.clear();
    vi.clearAllMocks();
  });

  it("uses a safe synthetic exception message for provider failures", async () => {
    const { captureProviderFailureException } = await import("./posthog");
    const providerError = new Error(
      "The 'To' number +14165550123 is not a valid phone number.",
    );

    const classification = captureProviderFailureException({
      provider: "twilio",
      error: providerError,
      code: "21211",
      status: 400,
      businessId: "business_123",
      properties: {
        operation: "twilio_live_call_update",
      },
    });

    expect(classification.providerErrorMessage).toContain("+14165550123");
    expect(captureExceptionMock).toHaveBeenCalledOnce();

    const [capturedError, distinctId, properties] =
      captureExceptionMock.mock.calls[0] ?? [];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe(
      "twilio provider failure (invalid_request: 21211)",
    );
    expect((capturedError as Error).message).not.toContain("+14165550123");
    expect((capturedError as Error).cause).toBeUndefined();
    expect(distinctId).toBe("system:business:business_123");
    expect(properties).toMatchObject({
      $exception_message: "[redacted]",
      operation: "twilio_live_call_update",
      providerErrorCode: "21211",
      providerErrorMessage: "[redacted]",
    });
  });
});
