import { describe, expect, it } from "vitest";

import {
  getTerminalTwilioCallReconciliationFields,
  isNormalizableRuntimeDisposition,
} from "./voiceCallStatus";

describe("voice call status helpers", () => {
  it("normalizes transport-only websocket closures back to provider truth", () => {
    expect(
      getTerminalTwilioCallReconciliationFields(
        {
          status: "completed",
          disposition: "twilio_socket_closed",
        },
        {
          callStatus: "completed",
          providerUpdatedAt: "2026-03-10T20:05:00.000Z",
        },
      ),
    ).toEqual({
      endedAt: "2026-03-10T20:05:00.000Z",
      status: "completed",
      disposition: "call_completed",
    });
  });

  it("preserves specific outcomes while still updating the provider end time", () => {
    expect(
      getTerminalTwilioCallReconciliationFields(
        {
          status: "transferred",
          disposition: "transfer_completed",
        },
        {
          callStatus: "completed",
          providerUpdatedAt: "2026-03-10T20:05:00.000Z",
        },
      ),
    ).toEqual({
      endedAt: "2026-03-10T20:05:00.000Z",
    });
  });

  it("preserves contact-blocked outcomes during terminal reconciliation", () => {
    expect(
      getTerminalTwilioCallReconciliationFields(
        {
          status: "completed",
          disposition: "contact_blocked",
        },
        {
          callStatus: "completed",
          providerUpdatedAt: "2026-03-10T20:05:00.000Z",
        },
      ),
    ).toEqual({
      endedAt: "2026-03-10T20:05:00.000Z",
    });
  });

  it("treats twilio websocket closures as normalizable runtime outcomes", () => {
    expect(isNormalizableRuntimeDisposition("stream_stopped")).toBe(true);
    expect(isNormalizableRuntimeDisposition("twilio_socket_closed")).toBe(true);
    expect(isNormalizableRuntimeDisposition("openai_socket_error")).toBe(false);
  });
});
