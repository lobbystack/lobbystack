import { describe, expect, it } from "vitest";

import { redactTelemetryProperties } from "./shared";

describe("Convex telemetry redaction", () => {
  it("redacts bearer tokens embedded in URL values", () => {
    const redacted = redactTelemetryProperties({
      originUrl: "https://app.lobbystack.com/demo/acme-secret-token?source=campaign",
      fragmentUrl:
        "https://app.lobbystack.com/demo#prospect_demo_token=acme-secret-token",
      signupUrl:
        "https://app.lobbystack.com/signup?returnTo=%2Fclaim-demo%3Ftoken%3Dacme-secret-token",
      errorDetail:
        "Request failed while loading https://app.lobbystack.com/demo/acme-secret-token",
      statusDetail: "Invalid token",
    });

    expect(redacted.originUrl).toBe(
      "https://app.lobbystack.com/demo/[redacted]?source=campaign",
    );
    expect(redacted.fragmentUrl).toBe("https://app.lobbystack.com/demo");
    expect(redacted.signupUrl).toBe(
      "https://app.lobbystack.com/signup?returnTo=%2Fclaim-demo",
    );
    expect(redacted.errorDetail).toBe(
      "Request failed while loading https://app.lobbystack.com/demo/[redacted]",
    );
    expect(redacted.statusDetail).toBe("Invalid token");
  });
});
