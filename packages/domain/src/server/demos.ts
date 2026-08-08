import { createHash, randomBytes } from "node:crypto";

import { memberships } from "@lobbystack/db";
import type { DemoClaimRequest } from "@lobbystack/contracts";

import {
  enqueueSideEffect,
  getDispatcherPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

type DemoRecord = {
  id: string;
  businessId: string;
  tokenHash: string;
  status: string;
  websiteUrl: string;
  businessName: string;
  expiresAt: Date;
};

const demoStore = new Map<string, DemoRecord>();

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createProspectDemo(input: {
  businessId: string;
  operatorUserId: string;
  websiteUrl: string;
  businessName: string;
  locale?: string;
  expiresAt?: Date;
  pool?: TransactionContext["pool"];
}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  const id = randomBytes(16).toString("hex");

  const record: DemoRecord = {
    id,
    businessId: input.businessId,
    tokenHash: tokenHash(token),
    status: "active",
    websiteUrl: input.websiteUrl,
    businessName: input.businessName,
    expiresAt,
  };

  demoStore.set(record.tokenHash, record);

  await withDomainTransaction(
    { businessId: input.businessId, actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "knowledge.crawlWebsite",
        payload: {
          businessId: input.businessId,
          url: input.websiteUrl,
          title: input.businessName,
        },
        dedupeKey: `prospect-demo:${id}:crawl`,
      });
    },
  );

  return { id, token };
}

export async function getProspectDemoPreview(input: {
  token: string;
  pool?: TransactionContext["pool"];
}) {
  const demo = demoStore.get(tokenHash(input.token));
  if (!demo || demo.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return {
    id: demo.id,
    businessId: demo.businessId,
    status: demo.status,
    websiteUrl: demo.websiteUrl,
    businessName: demo.businessName,
    expiresAt: demo.expiresAt.toISOString(),
  };
}

export async function claimProspectDemo(input: {
  values: DemoClaimRequest;
  userId: string;
  pool?: TransactionContext["pool"];
}) {
  const demo = demoStore.get(tokenHash(input.values.token));
  if (!demo || demo.status !== "active" || demo.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  demo.status = "claimed";

  await withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db, client) => {
      await client.query(`SELECT set_config('app.business_id', $1, true)`, [demo.businessId]);

      await db
        .insert(memberships)
        .values({
          businessId: demo.businessId,
          userId: input.userId,
          role: "owner",
          status: "active",
          joinedAt: new Date(),
        })
        .onConflictDoNothing();
    },
  );

  return { businessId: demo.businessId };
}
