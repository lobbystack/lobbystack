import { describe, expect, it, vi } from "vitest";

import { createBrowserTelemetry, type BrowserAnalyticsClient } from "./browser.js";

function createClient() {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(),
    opt_in_capturing: vi.fn(),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
  } satisfies BrowserAnalyticsClient;
}

describe("browser telemetry consent and recording state", () => {
  it("opts in once, starts recording, and stops before opting out", () => {
    const client = createClient();
    const telemetry = createBrowserTelemetry(client, { optedOut: true });

    telemetry.setOptOut(false);
    expect(client.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
    expect(client.startSessionRecording).toHaveBeenCalledTimes(1);

    telemetry.setOptOut(false);
    expect(client.opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(client.startSessionRecording).toHaveBeenCalledTimes(1);

    telemetry.setOptOut(true);
    expect(client.stopSessionRecording).toHaveBeenCalledTimes(1);
    expect(client.opt_out_capturing).toHaveBeenCalledTimes(1);
  });

  it("keeps recording paused on sensitive routes and resumes when they are left", () => {
    const client = createClient();
    const telemetry = createBrowserTelemetry(client, { optedOut: false });

    telemetry.setSensitiveRoute(true);
    expect(client.stopSessionRecording).toHaveBeenCalledTimes(1);
    expect(client.startSessionRecording).not.toHaveBeenCalled();

    telemetry.setSensitiveRoute(false);
    expect(client.startSessionRecording).toHaveBeenCalledTimes(1);
  });

  it("never starts recording while opted out", () => {
    const client = createClient();
    const telemetry = createBrowserTelemetry(client, { optedOut: true, sensitiveRoute: true });

    telemetry.setSensitiveRoute(false);
    expect(client.startSessionRecording).not.toHaveBeenCalled();
  });

  it("drops events while opted out or on a sensitive route", () => {
    const client = createClient();
    const telemetry = createBrowserTelemetry(client, { optedOut: false, sensitiveRoute: true });

    telemetry.track("web.auth.login_succeeded", { businessId: "business" });
    expect(client.capture).not.toHaveBeenCalled();

    telemetry.identify("user:operator");
    expect(client.identify).not.toHaveBeenCalled();

    telemetry.setSensitiveRoute(false);
    telemetry.track("web.auth.login_succeeded", { businessId: "business" });
    expect(client.capture).toHaveBeenCalledTimes(1);

    telemetry.setOptOut(true);
    telemetry.track("web.auth.login_succeeded", { businessId: "business" });
    expect(client.capture).toHaveBeenCalledTimes(1);
  });

  it("redacts properties and resets identity", () => {
    const client = createClient();
    const telemetry = createBrowserTelemetry(client, { optedOut: false });

    telemetry.identify("user:operator", { email: "operator@example.invalid" });
    const [distinctId, properties] = client.identify.mock.calls[0]!;
    expect(distinctId).toBe("user:operator");
    expect((properties as Record<string, unknown>).email).not.toBe("operator@example.invalid");

    telemetry.reset();
    expect(client.reset).toHaveBeenCalledTimes(1);
  });

  it("tolerates a missing client", () => {
    const telemetry = createBrowserTelemetry(undefined, { optedOut: true });
    expect(() => {
      telemetry.track("web.auth.login_succeeded");
      telemetry.identify("user:operator");
      telemetry.setOptOut(false);
      telemetry.setSensitiveRoute(true);
      telemetry.reset();
    }).not.toThrow();
  });
});
