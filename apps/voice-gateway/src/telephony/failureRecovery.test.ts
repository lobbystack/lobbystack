import { describe, expect, it } from "vitest";

import {
  buildProviderFailureMessage,
  buildToolFailureRecoveryInstructions,
} from "./failureRecovery";

describe("failure recovery helpers", () => {
  it("builds a transfer-oriented provider failure message when transfer is available", () => {
    expect(buildProviderFailureMessage({ transferAvailable: true })).toContain(
      "Please hold while I connect you to someone.",
    );
  });

  it("builds a hangup-oriented provider failure message when no transfer is available", () => {
    expect(buildProviderFailureMessage({ transferAvailable: false })).toContain(
      "Please call back in a moment.",
    );
  });

  it("gives booking-specific instructions for scheduling tool failures", () => {
    expect(
      buildToolFailureRecoveryInstructions({
        toolName: "bookAppointment",
        transferAvailable: false,
      }),
    ).toContain("scheduling is temporarily unavailable");
  });
});
