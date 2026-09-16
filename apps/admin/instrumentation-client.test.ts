import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  posthog: {
    __loaded: false,
    init: vi.fn(),
    has_opted_out_capturing: vi.fn(() => true),
  },
}));
vi.mock("posthog-js", () => ({ default: mocks.posthog }));

function initConfig() {
  return mocks.posthog.init.mock.calls[0]![1] as {
    before_send: (event: { properties: Record<string, unknown> } | null) => { properties: Record<string, unknown> } | null;
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
  mocks.posthog.__loaded = false;
  mocks.posthog.has_opted_out_capturing.mockReturnValue(true);
});

describe("client analytics initialization", () => {
  it("initializes once with the documented Next.js configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture-key");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://ts.lobbystack.com");
    await import("./instrumentation-client");
    expect(mocks.posthog.init).toHaveBeenCalledTimes(1);
    const [token, config] = mocks.posthog.init.mock.calls[0]!;
    expect(token).toBe("fixture-key");
    expect(config).toMatchObject({
      api_host: "https://ts.lobbystack.com",
      ui_host: "https://us.posthog.com",
      defaults: "2026-05-30",
      autocapture: false,
      capture_exceptions: false,
      capture_pageview: "history_change",
      capture_pageleave: "if_capture_pageview",
      opt_out_capturing_by_default: true,
      save_campaign_params: false,
      save_referrer: false,
      session_recording: { maskTextSelector: ".ph-mask" },
    });
  });

  it("falls back to the PostHog host and does not initialize without a token", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    await import("./instrumentation-client");
    expect(mocks.posthog.init).not.toHaveBeenCalled();
  });

  it("drops events while opted out and sanitizes URLs when capturing", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture-key");
    await import("./instrumentation-client");
    const { before_send } = initConfig();
    const event = { properties: { $current_url: "https://example.invalid/demo/private-token?token=secret#secret", $referrer: "https://example.invalid/login?email=private@example.invalid" } };

    expect(before_send(event)).toBeNull();

    mocks.posthog.has_opted_out_capturing.mockReturnValue(false);
    expect(before_send(event)?.properties).toEqual({ $current_url: "https://example.invalid/demo/[token]", $referrer: "https://example.invalid/login" });
  });

  it("strips token and query data from initial person properties", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture-key");
    mocks.posthog.has_opted_out_capturing.mockReturnValue(false);
    await import("./instrumentation-client");
    const { before_send } = initConfig();
    const event = { properties: {
      $set: { $current_url: "https://example.invalid/reset-password/private?code=secret", plan: "free_cloud" },
      $set_once: { $initial_current_url: "https://example.invalid/demo/private?email=user@example.invalid", $initial_referrer: "https://example.invalid/login?token=secret#secret" },
    } };
    expect(before_send(event)?.properties).toEqual({
      $set: { $current_url: "https://example.invalid/reset-password/[token]", plan: "free_cloud" },
      $set_once: { $initial_current_url: "https://example.invalid/demo/[token]", $initial_referrer: "https://example.invalid/login" },
    });
  });

  it("removes nested web-vitals URLs and DOM attribution", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture-key");
    mocks.posthog.has_opted_out_capturing.mockReturnValue(false);
    await import("./instrumentation-client");
    const { before_send } = initConfig();
    const event = { properties: { $web_vitals_LCP_event: { name: "LCP", value: 123, $current_url: "https://example.invalid/private?token=secret", entries: [{ url: "private" }], attribution: { element: "private" } } } };
    expect(before_send(event)?.properties.$web_vitals_LCP_event).toEqual({ name: "LCP", value: 123 });
  });
});
