import { describe, expect, it } from "vitest";

import {
  estimateRealtimeTotalCostUsd,
  getRealtimeGenerationOutcome,
} from "./mediaStream";

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

  it("computes realtime voice cost from text, audio, and cached token buckets", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 132,
        outputTokens: 121,
        textInputTokens: 119,
        audioInputTokens: 13,
        cachedInputTokens: 64,
        cachedTextInputTokens: 64,
        cachedAudioInputTokens: 0,
        textOutputTokens: 30,
        audioOutputTokens: 91,
      },
      {
        textInputTokenPriceUsd: 0.000005,
        audioInputTokenPriceUsd: 0.000032,
        textOutputTokenPriceUsd: 0.00002,
        audioOutputTokenPriceUsd: 0.000064,
        cachedInputTokenPriceUsd: 0.0000025,
      },
    );

    expect(totalCostUsd).toBeCloseTo(0.007967);
  });

  it("returns undefined when detailed audio pricing is missing", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        textInputTokens: 119,
        audioInputTokens: 13,
        cachedInputTokens: 64,
        cachedTextInputTokens: 64,
        textOutputTokens: 30,
        audioOutputTokens: 91,
      },
      {
        textInputTokenPriceUsd: 0.000005,
        textOutputTokenPriceUsd: 0.00002,
        cachedInputTokenPriceUsd: 0.0000025,
      },
    );

    expect(totalCostUsd).toBeUndefined();
  });

  it("returns undefined when cached tokens are not broken down by modality", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        textInputTokens: 119,
        audioInputTokens: 13,
        cachedInputTokens: 64,
        textOutputTokens: 30,
        audioOutputTokens: 91,
      },
      {
        textInputTokenPriceUsd: 0.000005,
        audioInputTokenPriceUsd: 0.000032,
        textOutputTokenPriceUsd: 0.00002,
        audioOutputTokenPriceUsd: 0.000064,
        cachedInputTokenPriceUsd: 0.0000025,
      },
    );

    expect(totalCostUsd).toBeUndefined();
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

describe("getRealtimeGenerationOutcome", () => {
  it("does not mark completed generations as errors", () => {
    expect(getRealtimeGenerationOutcome("completed")).toEqual({
      isError: false,
    });
  });

  it("treats cancelled generations as interruptions instead of errors", () => {
    expect(getRealtimeGenerationOutcome("cancelled")).toEqual({
      isError: false,
      error: "cancelled",
    });
  });

  it("still marks other terminal statuses as errors", () => {
    expect(getRealtimeGenerationOutcome("failed")).toEqual({
      isError: true,
      error: "failed",
    });
  });
});
