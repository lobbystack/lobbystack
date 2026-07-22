import { beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  startExceptionAutocapture: vi.fn(),
  sessionRecordingStarted: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: posthogMock,
}));

describe("analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    posthogMock.init.mockReset();
    posthogMock.startExceptionAutocapture.mockReset();
    posthogMock.sessionRecordingStarted.mockReset();
    posthogMock.startSessionRecording.mockReset();
    posthogMock.stopSessionRecording.mockReset();
  });

  it("stops session replay on prospect demo routes", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics, syncAnalyticsSessionRecording } = await import(
      "./analytics"
    );
    initializeAnalytics();
    syncAnalyticsSessionRecording("/demo");

    expect(posthogMock.stopSessionRecording).toHaveBeenCalledTimes(1);
  });

  it("starts session recording without overriding PostHog project controls", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(false);

    const { initializeAnalytics } = await import("./analytics");

    initializeAnalytics();

    const config = posthogMock.init.mock.calls[0]?.[1];
    expect(config.request_queue_config).toEqual({ flush_interval_ms: 1000 });
    expect(config.session_recording).toMatchObject({
      compress_events: true,
      maskAllInputs: true,
    });
    expect(config.session_recording.maskCapturedNetworkRequestFn({
      name: "https://app.lobbystack.com/demo/acme-secret",
      requestBody: { prospectDemoToken: "acme-secret" },
      responseBody: { token: "acme-secret" },
      requestHeaders: { Authorization: "Bearer secret" },
      responseHeaders: { "Set-Cookie": "secret" },
    })).toEqual({
      name: "https://app.lobbystack.com/demo/[redacted]",
    });
    expect(config.__preview_eager_load_replay).toBeUndefined();
    expect(config.session_recording.full_snapshot_interval_millis).toBeUndefined();
    expect(posthogMock.startSessionRecording).toHaveBeenCalledTimes(1);
    expect(posthogMock.startSessionRecording).toHaveBeenCalledWith();
  });

  it("redacts checkout customer session tokens from PostHog event properties", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics } = await import("./analytics");

    initializeAnalytics();

    const config = posthogMock.init.mock.calls[0]?.[1];
    const event = config.before_send({
      uuid: "event-1",
      event: "$pageview",
      properties: {
        $current_url:
          "https://app.lobbystack.com/settings/plan?checkout=success&customer_session_token=polar_cst_secret",
        $pathname: "/settings/plan",
        customer_session_token: "polar_cst_secret",
      },
    });

    expect(event.properties.$current_url).toBe(
      "https://app.lobbystack.com/settings/plan?checkout=success",
    );
    expect(event.properties.customer_session_token).toBe("[redacted]");
  });

  it("preserves non-URL strings that mention sensitive parameter names", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics } = await import("./analytics");

    initializeAnalytics();
    const config = posthogMock.init.mock.calls[0]?.[1];
    const event = config.before_send({
      uuid: "event-error",
      event: "$exception",
      properties: {
        message: "Invalid token",
        detail: "Unable to returnTo the previous screen",
      },
    });

    expect(event.properties.message).toBe("Invalid token");
    expect(event.properties.detail).toBe(
      "Unable to returnTo the previous screen",
    );
  });

  it("redacts sensitive URLs inside nested replay and exception properties", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics } = await import("./analytics");

    initializeAnalytics();
    const config = posthogMock.init.mock.calls[0]?.[1];
    const event = config.before_send({
      uuid: "event-replay",
      event: "$snapshot",
      properties: {
        $snapshot_data: {
          href: "https://app.lobbystack.com/demo/acme-secret",
        },
        $exception_list: [
          {
            value:
              "Request failed while loading https://app.lobbystack.com/demo/acme-secret",
          },
        ],
      },
    });

    expect(event.properties.$snapshot_data.href).toBe(
      "https://app.lobbystack.com/demo/[redacted]",
    );
    expect(event.properties.$exception_list[0].value).toBe(
      "Request failed while loading https://app.lobbystack.com/demo/[redacted]",
    );
  });

  it("redacts prospect demo path tokens and claim token query params", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics } = await import("./analytics");

    initializeAnalytics();

    const config = posthogMock.init.mock.calls[0]?.[1];
    const demoEvent = config.before_send({
      uuid: "event-demo",
      event: "$pageview",
      properties: {
        $current_url: "https://app.lobbystack.com/demo/acme-dental-Ab12Cd34",
        $pathname: "/demo/acme-dental-Ab12Cd34",
      },
    });
    expect(demoEvent.properties.$current_url).toBe(
      "https://app.lobbystack.com/demo/[redacted]",
    );
    expect(demoEvent.properties.$pathname).toBe("/demo/[redacted]");

    const claimEvent = config.before_send({
      uuid: "event-claim",
      event: "$pageview",
      properties: {
        $current_url:
          "https://app.lobbystack.com/claim-demo?token=acme-dental-Ab12Cd34",
        $pathname: "/claim-demo",
        token: "acme-dental-Ab12Cd34",
      },
    });
    expect(claimEvent.properties.$current_url).toBe(
      "https://app.lobbystack.com/claim-demo",
    );
    expect(claimEvent.properties.token).toBe("[redacted]");

    const signupEvent = config.before_send({
      uuid: "event-signup",
      event: "$pageview",
      properties: {
        $current_url:
          "https://app.lobbystack.com/signup?returnTo=%2Fclaim-demo%3Ftoken%3Dacme-dental-Ab12Cd34",
        $pathname: "/signup",
      },
    });
    expect(signupEvent.properties.$current_url).toBe(
      "https://app.lobbystack.com/signup?returnTo=%2Fclaim-demo",
    );
  });
});
