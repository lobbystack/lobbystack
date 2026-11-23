import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmbeddingProvider, OpenAiCompatibleEmbeddingProvider } from "./embeddingProvider";

type EmbeddingRequest = { model: string; input: string[]; dimensions?: number };
const fetchEmbeddings = vi.fn(async (_url: string, request: RequestInit) => {
  const { input } = JSON.parse(String(request.body)) as EmbeddingRequest;
  return Response.json({
    data: input.map(() => ({ embedding: new Array<number>(1536).fill(0.5) })),
    usage: { prompt_tokens: input.length },
  });
});

beforeEach(() => vi.stubGlobal("fetch", fetchEmbeddings));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchEmbeddings.mockClear();
});

describe("embedding requests", () => {
  it.each([undefined, "  "])("serializes 1,536 dimensions for the default model with override %s", async (override) => {
    await createEmbeddingProvider({ OPENAI_API_KEY: "test", AI_EMBEDDING_MODEL: override })!.embed(["hours"]);
    const [url, request] = fetchEmbeddings.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(JSON.parse(String(request.body))).toEqual({ model: "text-embedding-3-large", input: ["hours"], encoding_format: "float", dimensions: 1536 });
  });

  it("serializes a nonblank model override without dimensions", async () => {
    await createEmbeddingProvider({ OPENAI_API_KEY: "test", AI_EMBEDDING_MODEL: " text-embedding-3-small " })!.embed(["hours"]);
    expect(JSON.parse(String(fetchEmbeddings.mock.calls[0]![1].body))).toEqual({ model: "text-embedding-3-small", input: ["hours"], encoding_format: "float" });
  });

  it("records versioned usage for the default OpenAI embedding rate", async () => {
    const usage = vi.fn();
    await createEmbeddingProvider({ OPENAI_API_KEY: "test" })!.embed(["hours"], usage);
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({
      totalCostUsd: 0.13 / 1_000_000,
      ratesUsdPerMillionTokens: { input: 0.13 },
      pricingVersion: "text-embedding-3-large-2026-11",
      pricingSource: "https://developers.openai.com/api/docs/models/text-embedding-3-large",
      pricingEffectiveDate: "2026-11-22",
    }));
  });

  it.each([
    { AI_EMBEDDING_MODEL: "text-embedding-3-small" },
    { AI_EMBEDDING_BASE_URL: "https://gateway.example.test/v1" },
    { AI_EMBEDDING_PRICING_MODEL: "text-embedding-3-large", AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS: "0.20" },
  ])("leaves unversioned pricing unknown for %j", async (environment) => {
    const usage = vi.fn();
    await createEmbeddingProvider({ OPENAI_API_KEY: "test", ...environment })!.embed(["hours"], usage);
    expect(usage.mock.calls[0]?.[0].totalCostUsd).toBeUndefined();
  });

  it.each([
    [undefined, undefined, "text-embedding-3-large", 0.13, "text-embedding-3-large-2026-11"],
    ["text-embedding-3-large", "text-embedding-3-small", "text-embedding-3-large", 0.13, "text-embedding-3-large-2026-11"],
    ["text-embedding-3-small", "text-embedding-3-small", "text-embedding-3-small", 0.02, "text-embedding-3-small-2026-10"],
  ])("uses the rate for the effective model %s with pricing model %s", async (configuredModel, pricingModel, model, rate, pricingVersion) => {
    const usage = vi.fn();
    await createEmbeddingProvider({
      OPENAI_API_KEY: "test",
      AI_EMBEDDING_MODEL: configuredModel,
      AI_EMBEDDING_PRICING_MODEL: pricingModel,
      AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS: "0.02",
      AI_EMBEDDING_PRICING_VERSION: "text-embedding-3-small-2026-10",
      AI_EMBEDDING_PRICING_SOURCE: "https://developers.openai.com/api/docs/models/text-embedding-3-small",
      AI_EMBEDDING_PRICING_EFFECTIVE_DATE: "2026-10-01",
    })!.embed(["hours"], usage);
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({
      model,
      totalCostUsd: rate / 1_000_000,
      ratesUsdPerMillionTokens: { input: rate },
      pricingVersion,
    }));
  });

  it("records an explicitly configured rate with its own pricing metadata", async () => {
    const usage = vi.fn();
    await createEmbeddingProvider({
      OPENAI_API_KEY: "test",
      AI_EMBEDDING_BASE_URL: "https://gateway.example.test/v1",
      AI_EMBEDDING_MODEL: "custom-model",
      AI_EMBEDDING_PRICING_MODEL: "custom-model",
      AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS: "0.20",
      AI_EMBEDDING_PRICING_VERSION: "gateway-1",
      AI_EMBEDDING_PRICING_SOURCE: "https://gateway.example.test/prices",
      AI_EMBEDDING_PRICING_EFFECTIVE_DATE: "2026-10-01",
    })!.embed(["hours"], usage);
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({
      totalCostUsd: 0.20 / 1_000_000,
      pricingVersion: "gateway-1",
      pricingSource: "https://gateway.example.test/prices",
      pricingEffectiveDate: "2026-10-01",
    }));
  });

  it("splits a large document into requests the provider accepts, each with its own timeout", async () => {
    const usage = vi.fn();

    const vectors = await new OpenAiCompatibleEmbeddingProvider({ apiKey: "test", timeoutMs: 1234 }).embed(Array.from({ length: 300 }, (_, index) => `chunk ${index}`), usage);

    expect(vectors).toHaveLength(300);
    const requests = fetchEmbeddings.mock.calls.map(([, request]) => request);
    expect(requests.map((request) => (JSON.parse(String(request.body)) as EmbeddingRequest).input.length)).toEqual([128, 128, 44]);
    expect(new Set(requests.map((request) => request.signal)).size).toBe(3);
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 300 }));
  });
});
