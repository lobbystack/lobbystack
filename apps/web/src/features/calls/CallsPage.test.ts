import { describe, expect, it } from "vitest";

import { formatCallDispositionSummary } from "@/features/calls/CallsPage";

const t = ((key: string) => key) as Parameters<
  typeof formatCallDispositionSummary
>[1];

describe("formatCallDispositionSummary", () => {
  it("renders abuse call dispositions as abuse outcomes", () => {
    expect(formatCallDispositionSummary("abuse_ended", t)).toBe("outcome.abuse");
  });

  it("renders spam call dispositions as spam outcomes", () => {
    expect(formatCallDispositionSummary("spam_ended", t)).toBe("outcome.spam");
  });
});
