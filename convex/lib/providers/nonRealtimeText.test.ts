import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../_generated/dataModel";
import {
  extractGenerationMetrics,
  withAiTelemetryContext,
} from "./nonRealtimeText";

describe("withAiTelemetryContext", () => {
  it("stores middleware telemetry metadata under providerOptions", () => {
    const input = withAiTelemetryContext<{
      prompt: string;
      providerOptions?: Record<string, unknown>;
    }>(
      {
        prompt: "hello",
      },
      {
        traceId: "trace-123",
        businessId: "business-123" as Id<"businesses">,
        mutationRunner: {
          runMutation: vi.fn(),
        },
        properties: {
          channel: "sms",
        },
      },
    );

    expect(input.providerOptions).toMatchObject({
      aiReceptionistTelemetry: {
        traceId: "trace-123",
        businessId: "business-123",
        mutationRunner: {
          runMutation: expect.any(Function),
        },
        properties: {
          channel: "sms",
        },
      },
    });
  });
});

describe("extractGenerationMetrics", () => {
  it("reads nested AI SDK v3 usage totals", () => {
    expect(
      extractGenerationMetrics({
        usage: {
          inputTokens: { total: 128 },
          outputTokens: { total: 64 },
          totalTokens: 192,
          inputTokenDetails: {
            cacheReadTokens: 8,
          },
          outputTokenDetails: {
            reasoningTokens: 12,
          },
        },
      }),
    ).toEqual({
      inputTokens: 128,
      outputTokens: 64,
      totalTokens: 192,
      cachedInputTokens: 8,
      reasoningTokens: 12,
    });
  });

  it("falls back to raw Google usage metadata", () => {
    expect(
      extractGenerationMetrics({
        providerMetadata: {
          google: {
            usageMetadata: {
              promptTokenCount: 21,
              candidatesTokenCount: 9,
              totalTokenCount: 30,
              cachedContentTokenCount: 3,
            },
          },
        },
      }),
    ).toEqual({
      inputTokens: 21,
      outputTokens: 9,
      totalTokens: 30,
      cachedInputTokens: 3,
    });
  });
});
