import { auditLogs } from "@lobbystack/db";

import type { DomainDb } from "./context";
import { getAppPool, getWorkerPool, withDomainTransaction } from "./context";

export type AuditLogInput = {
  businessId?: string;
  actorUserId?: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  db?: DomainDb;
  pool?: ReturnType<typeof getAppPool>;
};

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  if (input.db) {
    if (!input.businessId) {
      throw new Error("businessId is required when recording an audit log in a transaction");
    }

    await input.db.insert(auditLogs).values({
      businessId: input.businessId,
      actorType: input.actorType,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.beforeJson ? { beforeJson: input.beforeJson } : {}),
      ...(input.afterJson ? { afterJson: input.afterJson } : {}),
      ...(input.metadataJson ? { metadataJson: input.metadataJson } : {}),
    });
    return;
  }

  if (!input.businessId) {
    throw new Error("businessId is required when recording an audit log outside a transaction");
  }

  const pool =
    input.pool ??
    (input.actorType === "worker" || input.actorType === "dispatcher"
      ? getWorkerPool()
      : getAppPool());

  await withDomainTransaction(
    {
      businessId: input.businessId,
      ...(input.actorUserId ? { userId: input.actorUserId } : {}),
      actorType: input.actorType as "user",
      pool,
    },
    async (db) => {
      await db.insert(auditLogs).values({
        businessId: input.businessId!,
        actorType: input.actorType,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        ...(input.beforeJson ? { beforeJson: input.beforeJson } : {}),
        ...(input.afterJson ? { afterJson: input.afterJson } : {}),
        ...(input.metadataJson ? { metadataJson: input.metadataJson } : {}),
      });
    },
  );
}
