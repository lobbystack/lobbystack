import { describe, expect, it } from "vitest";

import { estimateRealtimeTotalCostUsd } from "./mediaStream";

describe("estimateRealtimeTotalCostUsd", () => {
  it("prefers provider-reported total cost when available", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 20,
        totalCostUsd: 0.42,
      },
      {
        inputTokenPriceUsd: 0.001,
        outputTokenPriceUsd: 0.002,
        cachedInputTokenPriceUsd: 0.0005,
      },
    );

    expect(totalCostUsd).toBe(0.42);
  });

  it("computes total cost from configured realtime token pricing", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 20,
      },
      {
        inputTokenPriceUsd: 0.001,
        outputTokenPriceUsd: 0.002,
        cachedInputTokenPriceUsd: 0.0005,
      },
    );

    expect(totalCostUsd).toBeCloseTo(0.19);
  });

  it("returns undefined when no provider cost or pricing config is available", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 100,
        outputTokens: 50,
      },
      {},
    );

    expect(totalCostUsd).toBeUndefined();
  });
});
