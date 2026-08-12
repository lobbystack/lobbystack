import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embedMany: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => Object.assign(
    (model: string) => ({ model, type: "language" }),
    { embedding: (model: string) => ({ model, type: "embedding" }) },
  ),
}));
vi.mock("ai", () => mocks);

import { GeminiEmbeddingProvider } from "./geminiEmbeddingProvider";
import { GeminiTextProvider } from "./geminiTextProvider";

describe("Gemini providers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates through the AI SDK without recording prompt content", async () => {
    mocks.generateText.mockResolvedValue({
      text: " Reply ",
      usage: {
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
        inputTokenDetails: { cacheReadTokens: 1 },
        outputTokenDetails: { reasoningTokens: 0 },
      },
    });

    const result = await new GeminiTextProvider({ apiKey: "test-key" }).generateReply({
      instructions: "System instructions",
      context: "Business context",
      prompt: "Customer prompt",
    });

    expect(result.text).toBe("Reply");
    expect(result.usage).toEqual(expect.objectContaining({
      provider: "google",
      model: "gemini-2.0-flash",
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
      cachedInputTokens: 1,
      reasoningTokens: 0,
      latencyMs: expect.any(Number),
    }));
    expect(result.usage.totalCostUsd).toBeCloseTo(0.0000014, 12);
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({
      system: "System instructions",
      prompt: "Business context\n\nUser message:\nCustomer prompt",
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.gemini.generate",
      },
    }));
  });

  it("embeds through the AI SDK with private telemetry and configured dimensions", async () => {
    mocks.embedMany.mockResolvedValue({ embeddings: [[3, 4]], usage: { tokens: 2 } });
    const onUsage = vi.fn();

    const result = await new GeminiEmbeddingProvider({ apiKey: "test-key", dimensions: 2 }).embed(["Knowledge text"], onUsage);

    expect(result).toEqual([[0.6, 0.8]]);
    expect(mocks.embedMany).toHaveBeenCalledWith(expect.objectContaining({
      values: ["Knowledge text"],
      providerOptions: { google: { outputDimensionality: 2 } },
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.gemini.embed",
      },
    }));
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({
      provider: "google",
      model: "gemini-embedding-001",
      inputTokens: 2,
      totalTokens: 2,
      totalCostUsd: 0.0000003,
    }));
  });
});
