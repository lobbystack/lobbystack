import { beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  startExceptionAutocapture: vi.fn(),
  sessionRecordingStarted: vi.fn(),
  startSessionRecording: vi.fn(),
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
});
