import { google } from "@ai-sdk/google";
import type { EmbeddingModel } from "ai";

export const EMBEDDING_PROVIDER = "google";
export const DEFAULT_EMBEDDING_MODEL_ID = "gemini-embedding-001";
const EMBEDDING_MODEL_DIMENSIONS: Record<string, number> = {
  "gemini-embedding-001": 3072,
};
export const EMBEDDING_DIMENSION =
  EMBEDDING_MODEL_DIMENSIONS[DEFAULT_EMBEDDING_MODEL_ID];

export type EmbeddingModelConfig = {
  provider: typeof EMBEDDING_PROVIDER;
  modelId: string;
  dimension: number;
};

export function getEmbeddingConfig(): EmbeddingModelConfig {
  const modelId = process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL_ID;
  const dimension = EMBEDDING_MODEL_DIMENSIONS[modelId];
  if (dimension === undefined) {
    throw new Error(
      `Unsupported GEMINI_EMBEDDING_MODEL "${modelId}". Add its dimension to convex/lib/providers/embeddings.ts before using it.`,
    );
  }
  return {
    provider: EMBEDDING_PROVIDER,
    modelId,
    dimension,
  };
}

export function getEmbeddingModelId(): string {
  return getEmbeddingConfig().modelId;
}

export function createEmbeddingModel(modelId = getEmbeddingModelId()): EmbeddingModel {
  return google.embedding(modelId);
}
