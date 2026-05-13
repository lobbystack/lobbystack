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

    expect(posthogMock.startSessionRecording).toHaveBeenCalledTimes(1);
    expect(posthogMock.startSessionRecording).toHaveBeenCalledWith();
  });
});
