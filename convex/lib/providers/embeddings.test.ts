import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Convex provider adapters", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("keeps the default Gemini model ids stable", async () => {
    vi.stubEnv("GEMINI_TEXT_MODEL", "gemini-3.1-flash-lite-preview");
    vi.stubEnv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001");

    const {
      DEFAULT_EMBEDDING_MODEL_ID,
      EMBEDDING_DIMENSION,
      getEmbeddingConfig,
    } = await import("./embeddings");
    const { DEFAULT_NON_REALTIME_TEXT_MODEL_ID } = await import("./nonRealtimeText");
    const { getKnowledgeNamespace, KNOWLEDGE_INDEX_VERSION } = await import("../components");

    expect(DEFAULT_NON_REALTIME_TEXT_MODEL_ID).toBe(
      "gemini-3.1-flash-lite-preview",
    );
    expect(DEFAULT_EMBEDDING_MODEL_ID).toBe("gemini-embedding-001");
    expect(getEmbeddingConfig()).toMatchObject({
      modelId: DEFAULT_EMBEDDING_MODEL_ID,
      dimension: EMBEDDING_DIMENSION,
    });
    expect(EMBEDDING_DIMENSION).toBe(3072);
    expect(KNOWLEDGE_INDEX_VERSION).toBe(`${DEFAULT_EMBEDDING_MODEL_ID}-v1`);
    expect(getKnowledgeNamespace("demo-business")).toBe(
      `knowledge:${DEFAULT_EMBEDDING_MODEL_ID}-v1:business:demo-business`,
    );
  });

  it("rejects embedding model overrides without a registered dimension", async () => {
    vi.stubEnv("GEMINI_EMBEDDING_MODEL", "custom-embedding-model");

    const { getEmbeddingConfig } = await import("./embeddings");

    expect(() => getEmbeddingConfig()).toThrow(
      'Unsupported GEMINI_EMBEDDING_MODEL "custom-embedding-model"',
    );
  });
});
