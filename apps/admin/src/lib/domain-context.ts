import { getAppDatabase, getWorkerDatabase } from "./api-helpers";
import { OpenAiCompatibleEmbeddingProvider } from "@lobbystack/providers";

import { getAdminSnapshotCache } from "./widget-snapshot-cache";

export function createDomainContext() {
  const apiKey = process.env.AI_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY;
  const embeddings = apiKey
    ? new OpenAiCompatibleEmbeddingProvider({
        apiKey,
        ...(process.env.AI_EMBEDDING_MODEL ? { model: process.env.AI_EMBEDDING_MODEL } : {}),
        ...(process.env.AI_EMBEDDING_BASE_URL ? { baseURL: process.env.AI_EMBEDDING_BASE_URL } : {}),
        ...(process.env.AI_EMBEDDING_PROVIDER_NAME ? { name: process.env.AI_EMBEDDING_PROVIDER_NAME } : {}),
      })
    : undefined;
  return { db: getAppDatabase().db, ...(embeddings ? { embeddings } : {}) };
}

export function createWorkerDomainContext() {
  return { db: getWorkerDatabase().db, snapshotCache: getAdminSnapshotCache() };
}
