import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embedMany: vi.fn(),
  createOpenAICompatible: vi.fn(),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mocks.createOpenAICompatible.mockImplementation(() => ({
    embeddingModel: (model: string) => ({ model, type: "embedding", specificationVersion: "v3" }),
  })),
}));
vi.mock("ai", () => mocks);

import { OpenAiCompatibleEmbeddingProvider } from "./embeddingProvider";

describe("provider-agnostic AI providers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("embeds and normalizes to a fixed dimension", async () => {
    mocks.embedMany.mockResolvedValue({
      embeddings: [new Array(1536).fill(0.5)],
      usage: { tokens: 4 },
    });

    const provider = new OpenAiCompatibleEmbeddingProvider({ apiKey: "test", model: "text-embedding-3-small" });
    const vectors = await provider.embed(["Greeting"]);

    expect(vectors).toHaveLength(1);
    const vector = vectors[0] as number[] | undefined;
    expect(vector).toBeDefined();
    expect(vector!).toHaveLength(1536);
    expect(Math.sqrt(vector!.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1);
  });

  it("reports the configured embedding model and only versioned pricing", async () => {
    mocks.embedMany.mockResolvedValue({
      embeddings: [new Array(1536).fill(0.5)],
      usage: { tokens: 1_000_000 },
    });
    const usage = vi.fn();
    const unversioned = new OpenAiCompatibleEmbeddingProvider({ apiKey: "test", model: "embedding-provider-model", inputCostPerMillionTokens: 0.5 });
    await unversioned.embed(["Greeting"], usage);
    expect(usage).toHaveBeenLastCalledWith(expect.objectContaining({ model: "embedding-provider-model" }));
    expect(usage.mock.calls.at(-1)?.[0]?.totalCostUsd).toBeUndefined();

    const versioned = new OpenAiCompatibleEmbeddingProvider({
      apiKey: "test",
      model: "embedding-provider-model",
      inputCostPerMillionTokens: 0.5,
      pricingVersion: "provider-2026-09",
      pricingSource: "https://provider.example/pricing",
      pricingEffectiveDate: "2026-09-01",
    });
    await versioned.embed(["Greeting"], usage);
    expect(usage).toHaveBeenLastCalledWith(expect.objectContaining({
      model: "embedding-provider-model",
      totalCostUsd: 0.5,
      pricingVersion: "provider-2026-09",
      ratesUsdPerMillionTokens: { input: 0.5 },
    }));
  });

  it("rejects vectors that do not match the fixed storage dimension", async () => {
    mocks.embedMany.mockResolvedValue({ embeddings: [new Array(768).fill(0.5)], usage: { tokens: 1 } });
    const provider = new OpenAiCompatibleEmbeddingProvider({ apiKey: "test" });
    await expect(provider.embed(["Greeting"])).rejects.toThrow("requires exactly 1536");
  });

  it("rejects non-finite vectors instead of coercing them", async () => {
    mocks.embedMany.mockResolvedValue({ embeddings: [Object.assign(new Array(1536).fill(0.5), { 12: Number.NaN })], usage: { tokens: 1 } });
    const provider = new OpenAiCompatibleEmbeddingProvider({ apiKey: "test" });
    await expect(provider.embed(["Greeting"])).rejects.toThrow("non-finite");
  });

  it("changes the embedding fingerprint when the operator bumps the revision", () => {
    const first = new OpenAiCompatibleEmbeddingProvider({ apiKey: "test", revision: "1" });
    const second = new OpenAiCompatibleEmbeddingProvider({ apiKey: "test", revision: "2" });
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it("limits embedding concurrency and composes caller cancellation with a timeout", async () => {
    mocks.embedMany.mockResolvedValue({ embeddings: [new Array(1536).fill(0.5)], usage: { tokens: 1 } });
    const controller = new AbortController();
    const provider = new OpenAiCompatibleEmbeddingProvider({ apiKey: "test", timeoutMs: 1234, maxParallelCalls: 3 });
    await provider.embed(["Greeting"], undefined, { abortSignal: controller.signal });
    const options = mocks.embedMany.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(options.maxParallelCalls).toBe(3);
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(options.abortSignal).not.toBe(controller.signal);
  });
});
