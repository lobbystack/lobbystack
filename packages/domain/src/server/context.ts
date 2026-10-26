import type { Database } from "@lobbystack/db";
import type { StripeConnectProvider } from "@lobbystack/providers";

import type { BrandChangePublisher } from "./brands";
import type { SnapshotCacheClient } from "./snapshotCache";

export type DomainContext = {
  db: Database;
  embeddings?: { fingerprint?: string; embed(values: string[], onUsage?: (usage: unknown) => Promise<void> | void): Promise<number[][]> };
  snapshotCache?: SnapshotCacheClient;
  /** Tells every other process that a brand changed, so they drop their cached copy at once. */
  brandChanges?: BrandChangePublisher;
  /** The deployment's Stripe Connect client, for partners' Stripe accounts and packages. Absent when Stripe Connect isn't set up. */
  stripeConnect?: StripeConnectProvider | null;
};
