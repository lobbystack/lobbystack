import type { Database } from "@lobbystack/db";

import type { BrandChangePublisher } from "./brands";
import type { SnapshotCacheClient } from "./snapshotCache";

export type DomainContext = {
  db: Database;
  embeddings?: { fingerprint?: string; embed(values: string[], onUsage?: (usage: unknown) => Promise<void> | void): Promise<number[][]> };
  snapshotCache?: SnapshotCacheClient;
  /** Tells every other process that a brand changed, so they drop their cached copy at once. */
  brandChanges?: BrandChangePublisher;
};
