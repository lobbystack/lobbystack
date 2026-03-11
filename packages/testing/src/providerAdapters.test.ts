import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMBEDDING_MODEL_ID,
  EMBEDDING_DIMENSION,
} from "../../../convex/lib/providers/embeddings";
import { DEFAULT_NON_REALTIME_TEXT_MODEL_ID } from "../../../convex/lib/providers/nonRealtimeText";
import {
  getKnowledgeNamespace,
  KNOWLEDGE_INDEX_VERSION,
} from "../../../convex/lib/components";

describe("Convex provider adapters", () => {
  it("keeps the default Gemini model ids stable", () => {
    expect(DEFAULT_NON_REALTIME_TEXT_MODEL_ID).toBe(
      "gemini-3.1-flash-lite-preview",
    );
    expect(DEFAULT_EMBEDDING_MODEL_ID).toBe("gemini-embedding-001");
    expect(EMBEDDING_DIMENSION).toBe(3072);
  });

  it("derives the knowledge namespace version from the embedding model id", () => {
    expect(KNOWLEDGE_INDEX_VERSION).toBe("gemini-embedding-001-v1");
    expect(getKnowledgeNamespace("demo-business")).toBe(
      "knowledge:gemini-embedding-001-v1:business:demo-business",
    );
  });
});
