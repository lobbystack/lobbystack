import { describe, expect, it } from "vitest";

import { redactTelemetryProperties } from "./shared";

describe("Convex telemetry redaction", () => {
  it("redacts bearer tokens embedded in URL values", () => {
    const redacted = redactTelemetryProperties({
      originUrl: "https://app.lobbystack.com/demo/acme-secret-token?source=campaign",
      signupUrl:
        "https://app.lobbystack.com/signup?returnTo=%2Fclaim-demo%3Ftoken%3Dacme-secret-token",
      statusDetail: "Invalid token",
    });

    expect(redacted.originUrl).toBe(
      "https://app.lobbystack.com/demo/[redacted]?source=campaign",
    );
    expect(redacted.signupUrl).toBe(
      "https://app.lobbystack.com/signup?returnTo=%2Fclaim-demo",
    );
    expect(redacted.statusDetail).toBe("Invalid token");
  });
});
