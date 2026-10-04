import type { Database } from "@lobbystack/db";

import type { SnapshotCacheClient } from "./snapshotCache";

export type DomainContext = {
  db: Database;
  embeddings?: { fingerprint?: string; embed(values: string[], onUsage?: (usage: unknown) => Promise<void> | void): Promise<number[][]> };
  snapshotCache?: SnapshotCacheClient;
};
