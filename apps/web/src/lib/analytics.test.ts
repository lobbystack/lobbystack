import { beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  startExceptionAutocapture: vi.fn(),
  stopExceptionAutocapture: vi.fn(),
  set_config: vi.fn(),
  sessionRecordingStarted: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
  identify: vi.fn(),
  group: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
  people: { set: vi.fn() },
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
    posthogMock.stopExceptionAutocapture.mockReset();
    posthogMock.set_config.mockReset();
    posthogMock.sessionRecordingStarted.mockReset();
    posthogMock.startSessionRecording.mockReset();
    posthogMock.stopSessionRecording.mockReset();
    posthogMock.identify.mockReset();
    posthogMock.group.mockReset();
    posthogMock.capture.mockReset();
    posthogMock.reset.mockReset();
    posthogMock.people.set.mockReset();
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

  it("drops every event in before_send when the active business opted out", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics, identifyOperator, setBusinessTelemetryEnabled } =
      await import("./analytics");

    setBusinessTelemetryEnabled("business_123", false);
    initializeAnalytics();
    identifyOperator({
      userId: "user_123",
      businessId: "business_123",
      deploymentMode: "test",
    });

    const config = posthogMock.init.mock.calls[0]?.[1];
    expect(
      config.before_send({
        uuid: "event-opted-out",
        event: "$pageview",
        properties: {
          $current_url: "https://app.lobbystack.com/",
          $pathname: "/",
        },
      }),
    ).toBeNull();

    expect(
      config.before_send({
        uuid: "event-pop",
        event: "$exception",
        properties: {
          $pathname: "/",
          message: "boom",
        },
      }),
    ).toBeNull();
  });

  it("keeps sending business-scoped events after the business opts back in", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics, identifyOperator, setBusinessTelemetryEnabled } =
      await import("./analytics");

    setBusinessTelemetryEnabled("business_456", false);
    setBusinessTelemetryEnabled("business_456", true);
    initializeAnalytics();
    identifyOperator({
      userId: "user_456",
      businessId: "business_456",
      deploymentMode: "test",
    });

    const config = posthogMock.init.mock.calls[0]?.[1];
    const event = config.before_send({
      uuid: "event-back",
      event: "$pageview",
      properties: {
        $current_url: "https://app.lobbystack.com/calls",
        $pathname: "/calls",
      },
    });

    expect(event).not.toBeNull();
  });

  it("stops session recording for an opted-out business and resumes after enabling", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(false);

    const {
      initializeAnalytics,
      identifyOperator,
      setBusinessTelemetryEnabled,
    } = await import("./analytics");

    initializeAnalytics();
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    identifyOperator({
      userId: "user_789",
      businessId: "business_789",
      deploymentMode: "test",
    });
    setBusinessTelemetryEnabled("business_789", false);
    expect(posthogMock.stopSessionRecording).toHaveBeenCalledTimes(1);

    setBusinessTelemetryEnabled("business_789", true);
    expect(posthogMock.startSessionRecording).toHaveBeenCalledTimes(1);
  });

  it("drops events attributed to an opted-out business via $groups", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics, setBusinessTelemetryEnabled } = await import(
      "./analytics"
    );

    setBusinessTelemetryEnabled("business_abc", false);
    initializeAnalytics();

    const config = posthogMock.init.mock.calls[0]?.[1];
    expect(
      config.before_send({
        uuid: "event-opted-out",
        event: "$pageview",
        properties: {
          $groups: { business: "business:business_abc" },
          $current_url: "https://app.lobbystack.com/",
          $pathname: "/",
        },
      }),
    ).toBeNull();
  });

  it("holds events and session recording while telemetry is pending, then applies the resolved preference", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(false);

    const {
      initializeAnalytics,
      captureAnalyticsEvent,
      identifyOperator,
      markBusinessTelemetryPending,
      setBusinessTelemetryEnabled,
    } = await import("./analytics");

    initializeAnalytics();
    posthogMock.capture.mockClear();
    expect(posthogMock.startSessionRecording).toHaveBeenCalledTimes(1);
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    markBusinessTelemetryPending("business_race");
    expect(posthogMock.stopSessionRecording).toHaveBeenCalled();

    identifyOperator({
      userId: "user_race",
      businessId: "business_race",
      deploymentMode: "test",
    });
    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.group).not.toHaveBeenCalled();

    captureAnalyticsEvent("web.page.home_viewed", {
      businessId: "business_race",
    });
    expect(posthogMock.capture).not.toHaveBeenCalled();

    const config = posthogMock.init.mock.calls[0]?.[1];
    expect(
      config.before_send({
        uuid: "event-pending",
        event: "$pageview",
        properties: {
          $groups: { business: "business:business_race" },
          $current_url: "https://app.lobbystack.com/",
          $pathname: "/",
        },
      }),
    ).toBeNull();

    posthogMock.sessionRecordingStarted.mockReturnValue(false);
    setBusinessTelemetryEnabled("business_race", true);

    expect(posthogMock.startSessionRecording).toHaveBeenCalledTimes(2);
    captureAnalyticsEvent("web.page.home_viewed", {
      businessId: "business_race",
    });
    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
    expect(
      config.before_send({
        uuid: "event-resolved",
        event: "$pageview",
        properties: {
          $groups: { business: "business:business_race" },
          $current_url: "https://app.lobbystack.com/",
          $pathname: "/",
        },
      }),
    ).not.toBeNull();
  });

  it("drops group-less events while telemetry for the business is unresolved", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics, markBusinessTelemetryPending } = await import(
      "./analytics"
    );

    initializeAnalytics();
    markBusinessTelemetryPending("business_unresolved");

    const config = posthogMock.init.mock.calls[0]?.[1];
    expect(
      config.before_send({
        uuid: "event-pending-groupless",
        event: "$pageview",
        properties: {
          $current_url: "https://app.lobbystack.com/calls",
          $pathname: "/calls",
        },
      }),
    ).toBeNull();
    expect(
      config.before_send({
        uuid: "event-pending-exception",
        event: "$exception",
        properties: {
          $pathname: "/calls",
          message: "boom",
        },
      }),
    ).toBeNull();
  });

  it("does not consume the pageview dedupe slot while the business is opted out", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics, setBusinessTelemetryEnabled, trackPageView } =
      await import("./analytics");

    initializeAnalytics();
    posthogMock.capture.mockClear();
    setBusinessTelemetryEnabled("business_pageview", false);

    trackPageView("/calls", "business_pageview");
    expect(posthogMock.capture).not.toHaveBeenCalled();

    setBusinessTelemetryEnabled("business_pageview", true);
    trackPageView("/calls", "business_pageview");
    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
  });

  it("identifies the operator and registers the business group once telemetry resolution clears the pending state", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(false);

    const {
      initializeAnalytics,
      identifyOperator,
      markBusinessTelemetryPending,
      setBusinessTelemetryEnabled,
    } = await import("./analytics");

    initializeAnalytics();
    markBusinessTelemetryPending("business_resolve");
    identifyOperator({
      userId: "user_resolve",
      businessId: "business_resolve",
      deploymentMode: "test",
    });
    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.group).not.toHaveBeenCalled();

    setBusinessTelemetryEnabled("business_resolve", true);
    identifyOperator({
      userId: "user_resolve",
      businessId: "business_resolve",
      deploymentMode: "test",
    });
    expect(posthogMock.identify).toHaveBeenCalledTimes(1);
    expect(posthogMock.group).toHaveBeenCalledWith(
      "business",
      "business:business_resolve",
      expect.anything(),
    );
  });

  it("keeps events attributed to an enabled business when the active business opted out", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(true);

    const { initializeAnalytics, identifyOperator, setBusinessTelemetryEnabled } =
      await import("./analytics");

    setBusinessTelemetryEnabled("business_opted", false);
    initializeAnalytics();
    posthogMock.capture.mockClear();
    identifyOperator({
      userId: "user_opted",
      businessId: "business_opted",
      deploymentMode: "test",
    });
    setBusinessTelemetryEnabled("business_enabled", true);
    identifyOperator({
      userId: "user_opted",
      businessId: "business_enabled",
      deploymentMode: "test",
    });

    const config = posthogMock.init.mock.calls[0]?.[1];
    expect(
      config.before_send({
        uuid: "event-enabled",
        event: "$pageview",
        properties: {
          $groups: { business: "business:business_enabled" },
          $current_url: "https://app.lobbystack.com/calls",
          $pathname: "/calls",
        },
      }),
    ).not.toBeNull();
  });

  it("blocks automatic capture until deferred analytics initialization is enabled", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(false);

    const {
      captureAnalyticsEvent,
      enableAnalyticsCapture,
      initializeAnalytics,
    } = await import("./analytics");

    initializeAnalytics({ deferCapture: true });
    const config = posthogMock.init.mock.calls[0]?.[1];
    expect(
      config.before_send({
        uuid: "event-before-consent",
        event: "$pageview",
        properties: {
          $pathname: "/calls",
        },
      }),
    ).toBeNull();
    expect(posthogMock.startSessionRecording).not.toHaveBeenCalled();

    enableAnalyticsCapture();
    expect(posthogMock.startSessionRecording).toHaveBeenCalledTimes(1);

    posthogMock.capture.mockClear();
    captureAnalyticsEvent("web.page.calls_viewed", {
      pathname: "/calls",
    });
    expect(posthogMock.capture).toHaveBeenCalledOnce();
  });

  it("clears pending telemetry state when resetting analytics identity", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    posthogMock.sessionRecordingStarted.mockReturnValue(false);

    const {
      enableAnalyticsCapture,
      initializeAnalytics,
      markBusinessTelemetryPending,
      resetAnalyticsIdentity,
    } = await import("./analytics");

    initializeAnalytics({ deferCapture: true });
    markBusinessTelemetryPending("business_stale_pending");
    resetAnalyticsIdentity();
    enableAnalyticsCapture();

    const config = posthogMock.init.mock.calls[0]?.[1];
    expect(
      config.before_send({
        uuid: "event-after-reset",
        event: "$pageview",
        properties: {
          $pathname: "/calls",
        },
      }),
    ).not.toBeNull();
  });
});
