import { describe, expect, it } from "vitest";

import {
  formatCallDispositionSummary,
} from "./call-outcome";

const t = ((key: string) => key) as Parameters<
  typeof formatCallDispositionSummary
>[1];

describe("formatCallDispositionSummary", () => {
  it("renders blocked contact call dispositions as blocked outcomes", () => {
    expect(formatCallDispositionSummary("contact_blocked", t)).toBe(
      "outcome.contactBlocked",
    );
  });

  it("renders abuse call dispositions as abuse outcomes", () => {
    expect(formatCallDispositionSummary("abuse_ended", t)).toBe("outcome.abuse");
  });

  it("renders spam call dispositions as spam outcomes", () => {
    expect(formatCallDispositionSummary("spam_ended", t)).toBe("outcome.spam");
  });
});

