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
