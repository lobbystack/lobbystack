import { describe, expect, it } from "vitest";

import { OUTBOX_MAX_ATTEMPTS, shouldDeadLetterOutbox } from "./outbox";

describe("outbox retry policy", () => {
  it("retries below the terminal attempt threshold", () => {
    expect(shouldDeadLetterOutbox(OUTBOX_MAX_ATTEMPTS - 1)).toBe(false);
  });

  it("dead-letters at and above the terminal attempt threshold", () => {
    expect(shouldDeadLetterOutbox(OUTBOX_MAX_ATTEMPTS)).toBe(true);
    expect(shouldDeadLetterOutbox(OUTBOX_MAX_ATTEMPTS + 1)).toBe(true);
  });
});
