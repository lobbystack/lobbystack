import { google } from "@ai-sdk/google";
import type { EmbeddingModel } from "ai";

export const EMBEDDING_PROVIDER = "google";
export const DEFAULT_EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_DIMENSION = 3072;

export function getEmbeddingModelId(): string {
  return process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL_ID;
}

export function createEmbeddingModel(): EmbeddingModel {
  return google.embedding(getEmbeddingModelId());
}
