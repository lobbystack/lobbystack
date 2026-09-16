import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embedMany: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
  createOpenAICompatible: vi.fn(),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mocks.createOpenAICompatible.mockImplementation(() => ({
    chatModel: (model: string) => ({ model, type: "language", specificationVersion: "v3" }),
    embeddingModel: (model: string) => ({ model, type: "embedding", specificationVersion: "v3" }),
  })),
}));
vi.mock("ai", () => mocks);

import { OpenAiCompatibleEmbeddingProvider } from "./embeddingProvider";
import { createTextAiProvider, OpenAiCompatibleTextProvider } from "./textAiProvider";

describe("provider-agnostic AI providers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates through the AI SDK without recording prompt content", async () => {
    mocks.generateText.mockResolvedValue({
      text: " Reply ",
      usage: {
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
      },
    });

    const provider = new OpenAiCompatibleTextProvider({ apiKey: "test", model: "deepseek/deepseek-chat", baseURL: "https://api.deepseek.com/v1", name: "deepseek" });
    const result = await provider.generateReply({ instructions: "Be concise.", prompt: "Book an appointment" });

    expect(result.text).toBe("Reply");
    expect(result.usage).toMatchObject({ provider: "deepseek", model: "deepseek/deepseek-chat", inputTokens: 2, outputTokens: 3 });
    const call = mocks.generateText.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(call).toMatchObject({ prompt: "Book an appointment" });
    expect(JSON.stringify(call)).not.toContain("instructions=Be");
  });

  it("prepends context when supplied for reply generation", async () => {
    mocks.generateText.mockResolvedValue({ text: "Got it.", usage: {} });

    const provider = new OpenAiCompatibleTextProvider({ apiKey: "test" });
    await provider.generateReply({ instructions: "x", prompt: "Follow up", context: "Visitor asked about parking." });

    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Visitor asked about parking.\n\nUser message:\nFollow up" }));
  });

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

  it("passes provider configuration through and allows keyless local endpoints", () => {
    const provider = createTextAiProvider({ AI_CHAT_BASE_URL: "http://localhost:11434/v1", AI_CHAT_MODEL: "llama3.1:8b", AI_CHAT_PROVIDER_NAME: "ollama" });
    expect(provider).toBeDefined();
    expect(mocks.createOpenAICompatible).toHaveBeenCalledWith({ name: "ollama", baseURL: "http://localhost:11434/v1" });
  });

  it("requires credentials for the default OpenAI endpoint", () => {
    expect(createTextAiProvider({ AI_CHAT_API_KEY: "", OPENAI_API_KEY: "" })).toBeUndefined();
  });

  it("falls back to OPENAI_API_KEY for the default endpoint", () => {
    const provider = createTextAiProvider({ OPENAI_API_KEY: "fallback-key" });
    expect(provider).toBeDefined();
    expect(mocks.createOpenAICompatible).toHaveBeenCalledWith({ name: "openai", baseURL: "https://api.openai.com/v1", apiKey: "fallback-key" });
  });

  it("keeps configured token prices unknown until their versioned provenance is complete", async () => {
    mocks.generateText.mockResolvedValue({ text: "Reply", usage: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 } });
    const unversioned = new OpenAiCompatibleTextProvider({ apiKey: "test", inputCostPerMillionTokens: 1 });
    const unversionedResult = await unversioned.generateReply({ instructions: "x", prompt: "Hi" });
    expect(unversionedResult.usage.totalCostUsd).toBeUndefined();

    const versioned = new OpenAiCompatibleTextProvider({
      apiKey: "test",
      inputCostPerMillionTokens: 1,
      outputCostPerMillionTokens: 1,
      pricingVersion: "provider-2026-09",
      pricingSource: "https://provider.example/pricing",
      pricingEffectiveDate: "2026-09-01",
    });
    await expect(versioned.generateReply({ instructions: "x", prompt: "Hi" })).resolves.toMatchObject({
      usage: {
        totalCostUsd: 1,
        pricingVersion: "provider-2026-09",
        pricingSource: "https://provider.example/pricing",
        pricingEffectiveDate: "2026-09-01",
        ratesUsdPerMillionTokens: { input: 1 },
      },
    });
  });

  it("streams reply chunks", async () => {
    mocks.streamText.mockReturnValue({
      textStream: (async function* () {
        yield "Hel";
        yield "lo";
      })(),
      usage: Promise.resolve({ inputTokens: 2, outputTokens: 1, totalTokens: 3, inputTokenDetails: {}, outputTokenDetails: {} }),
      finishReason: Promise.resolve("stop"),
    });

    const provider = new OpenAiCompatibleTextProvider({ apiKey: "test" });
    const chunks: string[] = [];
    const stream = provider.streamReply({ instructions: "x", prompt: "Hi" });
    for await (const chunk of stream.textStream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hel", "lo"]);
    await expect(stream.usage).resolves.toMatchObject({ inputTokens: 2, outputTokens: 1, totalTokens: 3 });
    await expect(stream.finishReason).resolves.toBe("stop");
    expect(mocks.streamText).toHaveBeenCalled();
  });

  it("passes cancellation and timeout controls to streaming generations", () => {
    mocks.streamText.mockReturnValue({
      textStream: (async function* () { yield "ok"; })(),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2, inputTokenDetails: {}, outputTokenDetails: {} }),
      finishReason: Promise.resolve("stop"),
    });
    const controller = new AbortController();
    const onError = vi.fn();
    const onAbort = vi.fn();
    const provider = new OpenAiCompatibleTextProvider({ apiKey: "test", timeoutMs: 1234, chunkTimeoutMs: 456 });
    provider.streamReply({ instructions: "x", prompt: "Hi", abortSignal: controller.signal, onError, onAbort });
    const options = mocks.streamText.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(options).toMatchObject({ abortSignal: controller.signal, timeout: { totalMs: 1234, chunkMs: 456 } });
    (options.onError as (event: { error: unknown }) => void)({ error: new Error("provider") });
    (options.onAbort as () => void)();
    expect(onError).toHaveBeenCalled();
    expect(onAbort).toHaveBeenCalled();
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
