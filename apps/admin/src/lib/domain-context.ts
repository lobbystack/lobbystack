import { getAppDatabase, getWorkerDatabase } from "./api-helpers";
import { GeminiEmbeddingProvider } from "@lobbystack/providers";

export function createDomainContext() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const embeddings = apiKey ? new GeminiEmbeddingProvider({ apiKey, ...(process.env.GEMINI_EMBEDDING_MODEL ? { model: process.env.GEMINI_EMBEDDING_MODEL } : {}) }) : undefined;
  return { db: getAppDatabase().db, ...(embeddings ? { embeddings } : {}) };
}

export function createWorkerDomainContext() {
  return { db: getWorkerDatabase().db };
}
