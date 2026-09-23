import { randomUUID } from "node:crypto";

import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, notInArray, or, type SQL } from "drizzle-orm";

import { billingAccounts, businesses, calls, enqueueOutbox, knowledgeDocuments, storageObjects, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { getKnowledgeStorageLimitBytes } from "@lobbystack/shared";
import { getKnowledgeStorageUsageBytes } from "./knowledge";
import { isAllowedUploadContentType } from "@lobbystack/contracts";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { billingPlanForAccount, contentExpiryForPlan, isContentRetentionEnabled, resolveBusinessBillingPlan } from "./contentRetentionPolicy";

export type StorageProvider = {
  createUpload(input: { key: string; contentType: string; length: number; checksum?: string }): Promise<{ url: string; headers?: Record<string, string> }>;
  headObject(input: { key: string }): Promise<{ length: number; contentType: string; checksum?: string } | null>;
  deleteObject(input: { key: string }): Promise<void>;
  createDownloadUrl(input: { key: string; expiresInSeconds: number; range?: string }): Promise<string>;
};

export type BinaryStorageProvider = StorageProvider & {
  putObject(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
};

export async function createUpload(
  context: DomainContext,
  input: { userId: string; businessId: string; purpose: string; fileName: string; contentType: string; length: number; checksum?: string | undefined },
  storage: StorageProvider,
): Promise<{ objectId: string; key: string; url: string; headers?: Record<string, string> }> {
  if (!isAllowedUploadContentType(input.purpose, input.contentType)) throw new Error(`Content type is not allowed for ${input.purpose} uploads.`);
  if (input.purpose === "knowledge" && !input.checksum) throw new Error("Knowledge uploads require a SHA-256 checksum.");
  if (input.purpose === "knowledge" && input.length > 10 * 1024 * 1024) throw new Error("Documents must be 10 MB or smaller.");
  const objectId = randomUUID();
  const key = `${input.businessId}/${input.purpose}/${objectId}/${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    if (input.purpose === "knowledge") await requireBusinessAdmin(tx, input);
    else await requireBusinessMembership(tx, input);
    await tx.insert(storageObjects).values({ id: objectId, businessId: input.businessId, objectKey: key, purpose: input.purpose, fileName: input.fileName, contentType: input.contentType, contentLength: input.length, ...(input.checksum !== undefined ? { checksum: input.checksum } : {}), status: "pending", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  });
  const upload = await storage.createUpload({ key, contentType: input.contentType, length: input.length, ...(input.checksum !== undefined ? { checksum: input.checksum } : {}) });
  return { objectId, key, url: upload.url, ...(upload.headers ? { headers: upload.headers } : {}) };
}

export async function finalizeUpload(
  context: DomainContext,
  input: { userId: string; businessId: string; objectId: string; length: number; contentType: string; title?: string | undefined; tags?: string[] | undefined; checksum?: string | undefined },
  storage: StorageProvider,
): Promise<void> {
  const object = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const row = (await tx.select().from(storageObjects).where(and(eq(storageObjects.id, input.objectId), eq(storageObjects.businessId, input.businessId), eq(storageObjects.status, "pending"))).limit(1))[0];
    if (!row) {
      throw new Error("Upload is missing or already finalized.");
    }
    return row;
  });
  const metadata = await storage.headObject({ key: object.objectKey });
  if (!isAllowedUploadContentType(object.purpose, input.contentType)) throw new Error(`Content type is not allowed for ${object.purpose} uploads.`);
  if (object.purpose === "knowledge" && (!input.checksum || !object.checksum)) throw new Error("Knowledge uploads require a SHA-256 checksum.");
  if (!metadata || metadata.length !== input.length || metadata.length !== object.contentLength || metadata.contentType !== input.contentType || metadata.contentType !== object.contentType || (object.checksum && input.checksum !== object.checksum) || (input.checksum && metadata.checksum !== input.checksum)) {
    throw new Error("Uploaded object metadata does not match the requested upload.");
  }
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (object.purpose === "knowledge") {
      const [business] = await tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, input.businessId)).for("update");
      const [account] = await tx.select({ plan: billingAccounts.plan }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId));
      const plan = billingPlanForAccount(account?.plan, business?.deploymentMode);
      const limit = getKnowledgeStorageLimitBytes(plan);
      if (limit !== null && await getKnowledgeStorageUsageBytes(tx, input.businessId) + metadata.length > limit) throw new Error(`Knowledge storage limit reached. ${Math.ceil(limit / 1024 / 1024)} MB is included on this plan.`);
    }
    const finalized = await tx.update(storageObjects).set({ status: "ready", contentLength: metadata.length, contentType: metadata.contentType, ...(metadata.checksum ? { checksum: metadata.checksum } : {}), updatedAt: new Date() }).where(and(eq(storageObjects.id, input.objectId), eq(storageObjects.businessId, input.businessId), eq(storageObjects.status, "pending"))).returning({ id: storageObjects.id });
    if (!finalized.length) throw new Error("Upload is missing or already finalized.");
    if (object.purpose === "knowledge") {
      const [document] = await tx.insert(knowledgeDocuments).values({
        businessId: input.businessId,
        sourceType: "upload",
        title: input.title?.trim() || object.fileName,
        tags: input.tags ?? [],
        storageObjectId: input.objectId,
        mimeType: metadata.contentType,
        status: "pending",
        processingProgress: 0,
      }).returning({ id: knowledgeDocuments.id });
      if (!document) {
        throw new Error("Knowledge document could not be created for the uploaded object.");
      }
      await enqueueOutbox(tx, {
        topic: "knowledge.extractDocument",
        businessId: input.businessId,
        aggregateType: "knowledge_document",
        aggregateId: document.id,
        dedupeKey: `knowledge:${document.id}:extract`,
        payload: { documentId: document.id },
      });
      return;
    }

    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "storage_object",
      aggregateId: input.objectId,
      dedupeKey: `storage:${input.objectId}:ready`,
      payload: { type: "document.progressed", entityId: input.objectId },
    });
  });
}

export async function createObjectDownload(
  context: DomainContext,
  input: { userId: string; businessId: string; objectId: string; range?: string | undefined },
  storage: StorageProvider,
): Promise<{ url: string; fileName: string; contentType: string; length: number | null; headers?: Record<string, string> }> {
  const object = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return (await tx.select({
      objectKey: storageObjects.objectKey,
      fileName: storageObjects.fileName,
      contentType: storageObjects.contentType,
      contentLength: storageObjects.contentLength,
    }).from(storageObjects).where(and(
      eq(storageObjects.id, input.objectId),
      eq(storageObjects.businessId, input.businessId),
      eq(storageObjects.status, "ready"),
      or(isNull(storageObjects.retentionUntil), gte(storageObjects.retentionUntil, new Date())),
    )).limit(1))[0] ?? null;
  });
  if (!object) {
    throw new Error("Object not found.");
  }
  const url = await storage.createDownloadUrl({
    key: object.objectKey,
    expiresInSeconds: 300,
    ...(input.range ? { range: input.range } : {}),
  });
  return {
    url,
    fileName: object.fileName,
    contentType: object.contentType,
    length: object.contentLength,
    ...(input.range ? { headers: { range: input.range } } : {}),
  };
}

// Durable, retryable deletion states. `status` is an unconstrained varchar(32)
// and `finalizeUpload` only promotes `pending`, so a claimed row cannot be
// resurrected while its provider object is being deleted.
export const EXPIRED_UPLOAD_STATUS = "deleting_expired_upload";
export const RETAINED_DELETE_STATUS = "deleting_retained";
export const STORAGE_DELETE_BATCH = 500;

type ClaimedExpiredObject = { id: string; objectKey: string; kind: "expired_upload" | "retained" };
type StorageTimestampColumn = typeof storageObjects.expiresAt | typeof storageObjects.retentionUntil;
type StorageStatusPredicate = ReturnType<typeof inArray> | ReturnType<typeof notInArray>;

// Claims rows into their deleting state inside the caller's transaction,
// rechecking the original expiry/retention predicate so a concurrent extension
// is never swept. Rows already in a deleting state are re-claimed for retry.
async function claimExpiredObjectsForDeletion(
  tx: DatabaseTransaction,
  businessId: string,
  now: Date,
): Promise<ClaimedExpiredObject[]> {
  const claim = async (input: {
    kind: ClaimedExpiredObject["kind"];
    statusPredicate: StorageStatusPredicate;
    deletingStatus: string;
    expiryColumn: StorageTimestampColumn;
    extra?: SQL | undefined;
  }): Promise<ClaimedExpiredObject[]> => {
    const predicate = and(
      eq(storageObjects.businessId, businessId),
      input.statusPredicate,
      isNotNull(input.expiryColumn),
      lt(input.expiryColumn, now),
      input.extra,
    );
    const candidates = await tx.select({ id: storageObjects.id })
      .from(storageObjects)
      .where(predicate)
      .orderBy(asc(input.expiryColumn), asc(storageObjects.id))
      .limit(STORAGE_DELETE_BATCH)
      .for("update", { skipLocked: true });
    if (!candidates.length) return [];
    const rows = await tx.update(storageObjects)
      .set({ status: input.deletingStatus, updatedAt: now })
      .where(and(
        eq(storageObjects.businessId, businessId),
        inArray(storageObjects.id, candidates.map((row) => row.id)),
        input.statusPredicate,
        isNotNull(input.expiryColumn),
        lt(input.expiryColumn, now),
        input.extra,
      ))
      .returning({ id: storageObjects.id, objectKey: storageObjects.objectKey });
    return rows.map((row) => ({ ...row, kind: input.kind }));
  };

  // Expired uploads are claimed first so a row that carries both an expiry and
  // a retention timestamp is never handled by both branches.
  const uploads = await claim({
    kind: "expired_upload",
    statusPredicate: inArray(storageObjects.status, ["pending", EXPIRED_UPLOAD_STATUS]),
    deletingStatus: EXPIRED_UPLOAD_STATUS,
    expiryColumn: storageObjects.expiresAt,
  });
  const retained = await claim({
    kind: "retained",
    statusPredicate: notInArray(storageObjects.status, ["deleted", EXPIRED_UPLOAD_STATUS]),
    deletingStatus: RETAINED_DELETE_STATUS,
    expiryColumn: storageObjects.retentionUntil,
    extra: ne(storageObjects.purpose, "recording"),
  });
  return [...uploads, ...retained];
}

export async function deleteExpiredObjectsForBusiness(
  context: DomainContext,
  input: { businessId: string },
  storage: StorageProvider,
): Promise<number> {
  const now = new Date();
  // Claim rows before any external I/O so a concurrent finalize cannot turn a
  // claimed `pending` upload into a live `ready` row while its object is gone.
  const claimed = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) =>
    await claimExpiredObjectsForDeletion(tx, input.businessId, now),
  );
  if (!claimed.length) return 0;

  // Provider deletion and verification are external I/O and stay outside any
  // database transaction. A row stays in its deleting state until its object is
  // confirmed absent, so a provider error or a lingering object is retried by a
  // later sweep instead of being finalized.
  const succeededUploadIds: string[] = [];
  const succeededRetainedIds: string[] = [];
  const failures: unknown[] = [];
  for (const object of claimed) {
    try {
      await storage.deleteObject({ key: object.objectKey });
      if (await storage.headObject({ key: object.objectKey })) throw new Error(`Storage object is still present after deletion: ${object.objectKey}`);
      (object.kind === "expired_upload" ? succeededUploadIds : succeededRetainedIds).push(object.id);
    } catch (error) {
      failures.push(error);
    }
  }

  const deleted = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    let count = 0;
    if (succeededUploadIds.length) {
      const rows = await tx.delete(storageObjects)
        .where(and(eq(storageObjects.businessId, input.businessId), inArray(storageObjects.id, succeededUploadIds), eq(storageObjects.status, EXPIRED_UPLOAD_STATUS)))
        .returning({ id: storageObjects.id });
      count += rows.length;
    }
    if (succeededRetainedIds.length) {
      const rows = await tx.update(storageObjects)
        .set({ status: "deleted", updatedAt: new Date() })
        .where(and(eq(storageObjects.businessId, input.businessId), inArray(storageObjects.id, succeededRetainedIds), eq(storageObjects.status, RETAINED_DELETE_STATUS)))
        .returning({ id: storageObjects.id });
      count += rows.length;
    }
    return count;
  });

  // Succeeded rows are finalized first; the remaining failures stay retryable.
  if (failures.length) throw failures[0];
  return deleted;
}

export async function persistCallRecording(
  context: DomainContext,
  input: { businessId: string; callId: string; durationMs: number; contentType: string; body: Uint8Array },
  storage: BinaryStorageProvider,
): Promise<string> {
  const objectId = randomUUID();
  const key = `${input.businessId}/recording/${input.callId}/${objectId}.wav`;
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const call = (await tx.select({ id: calls.id }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1))[0];
    if (!call) {
      throw new Error("Call not found.");
    }
    const retentionPlan = isContentRetentionEnabled() ? await resolveBusinessBillingPlan(tx, input.businessId) : null;
    await tx.insert(storageObjects).values({ id: objectId, businessId: input.businessId, objectKey: key, purpose: "recording", fileName: `${input.callId}.wav`, contentType: input.contentType, contentLength: input.body.byteLength, status: "pending", retentionUntil: retentionPlan ? contentExpiryForPlan(retentionPlan, "recordings") : null });
  });
  await storage.putObject({ key, body: input.body, contentType: input.contentType });
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(storageObjects).set({ status: "ready", updatedAt: new Date() }).where(and(eq(storageObjects.id, objectId), eq(storageObjects.businessId, input.businessId)));
    await tx.update(calls).set({ recordingObjectId: objectId, updatedAt: new Date() }).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId)));
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "recording", aggregateId: input.callId, dedupeKey: `recording:${input.callId}:${objectId}:ready`, payload: { type: "recording.available", entityId: input.callId } });
  });
  void input.durationMs;
  return objectId;
}

export async function deleteCallRecording(
  context: DomainContext,
  input: { businessId: string; callId: string; objectId?: string },
  storage: StorageProvider,
): Promise<boolean> {
  const object = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ objectId: storageObjects.id, objectKey: storageObjects.objectKey, status: storageObjects.status })
      .from(calls)
      .innerJoin(storageObjects, eq(storageObjects.id, calls.recordingObjectId))
      .where(and(
        eq(calls.id, input.callId),
        eq(calls.businessId, input.businessId),
        ...(input.objectId ? [eq(storageObjects.id, input.objectId)] : []),
      ))
      .limit(1))[0];
    return row ?? null;
  });
  if (!object || object.status === "deleted") {
    return false;
  }

  await storage.deleteObject({ key: object.objectKey });
  if (await storage.headObject({ key: object.objectKey })) {
    throw new Error("Recording object still exists after deletion.");
  }
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(storageObjects)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(and(eq(storageObjects.id, object.objectId), ne(storageObjects.status, "deleted")));
    await tx.update(calls)
      .set({ recordingObjectId: null, updatedAt: new Date() })
      .where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId), eq(calls.recordingObjectId, object.objectId)));
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "call",
      aggregateId: input.callId,
      dedupeKey: `recording:${input.callId}:${object.objectId}:deleted`,
      payload: { type: "recording.available", entityId: input.callId, deleted: true },
    });
  });
  return true;
}
