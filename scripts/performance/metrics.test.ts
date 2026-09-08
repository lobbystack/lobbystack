import { describe, expect, it } from "vitest";
import { percentile, summarize } from "./metrics";

describe("performance reporting", () => {
  it("does not invent latency for empty samples", () => {
    expect(percentile([], .95)).toBeNull();
    expect(summarize([], 1000).successful.p95).toBeNull();
  });
  it("retains failures in total latency and reports success latency separately", () => {
    const result = summarize([
      { durationMs: 10, ok: true, bytes: 42, status: 200 },
      { durationMs: 1000, ok: false, bytes: 0, status: null },
    ], 2000);
    expect(result).toMatchObject({ sampleCount: 2, errors: 1, throughputPerSecond: 1, bytes: 42, all: { p95: 1000 }, successful: { p95: 10 } });
  });
});
