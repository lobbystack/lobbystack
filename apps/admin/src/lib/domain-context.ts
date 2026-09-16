import { getAppDatabase, getWorkerDatabase } from "./api-helpers";
import { createEmbeddingProvider } from "@lobbystack/providers";

import { getAdminSnapshotCache } from "./widget-snapshot-cache";

export function createDomainContext() {
  const embeddings = createEmbeddingProvider();
  return { db: getAppDatabase().db, ...(embeddings ? { embeddings } : {}) };
}

export function createWorkerDomainContext() {
  const embeddings = createEmbeddingProvider();
  return { db: getWorkerDatabase().db, snapshotCache: getAdminSnapshotCache(), ...(embeddings ? { embeddings } : {}) };
}
