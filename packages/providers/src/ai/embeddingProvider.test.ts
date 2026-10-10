import { describe, expect, it, vi } from "vitest";

const doEmbed = vi.hoisted(() => vi.fn());

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => ({
    embeddingModel: (modelId: string) => ({ specificationVersion: "v3", provider: "test", modelId, maxEmbeddingsPerCall: 2048, supportsParallelCalls: true, doEmbed }),
  }),
}));

import { OpenAiCompatibleEmbeddingProvider } from "./embeddingProvider";

describe("embedding requests", () => {
  it("splits a large document into requests the provider accepts, each with its own timeout", async () => {
    doEmbed.mockImplementation(async ({ values }: { values: string[] }) => ({ embeddings: values.map(() => new Array(1536).fill(0.5)), usage: { tokens: values.length } }));
    const usage = vi.fn();

    const vectors = await new OpenAiCompatibleEmbeddingProvider({ apiKey: "test", timeoutMs: 1234 }).embed(Array.from({ length: 300 }, (_, index) => `chunk ${index}`), usage);

    expect(vectors).toHaveLength(300);
    const requests = doEmbed.mock.calls.map(([options]) => options as { values: string[]; abortSignal: AbortSignal });
    expect(requests.map((request) => request.values.length)).toEqual([128, 128, 44]);
    expect(new Set(requests.map((request) => request.abortSignal)).size).toBe(3);
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 300 }));
  });
});
