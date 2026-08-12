import { randomUUID } from "node:crypto";

import { and, eq, isNotNull, lt, ne, or } from "drizzle-orm";

import { calls, enqueueOutbox, knowledgeDocuments, storageObjects, withBusinessTransaction } from "@lobbystack/db";
import { isAllowedUploadContentType } from "@lobbystack/contracts";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

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
  const objectId = randomUUID();
  const key = `${input.businessId}/${input.purpose}/${objectId}/${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    await tx.insert(storageObjects).values({ id: objectId, businessId: input.businessId, objectKey: key, purpose: input.purpose, fileName: input.fileName, contentType: input.contentType, contentLength: input.length, ...(input.checksum !== undefined ? { checksum: input.checksum } : {}), status: "pending", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  });
  const upload = await storage.createUpload({ key, contentType: input.contentType, length: input.length, ...(input.checksum !== undefined ? { checksum: input.checksum } : {}) });
  return { objectId, key, url: upload.url, ...(upload.headers ? { headers: upload.headers } : {}) };
}

export async function finalizeUpload(
  context: DomainContext,
  input: { userId: string; businessId: string; objectId: string; length: number; contentType: string; checksum?: string | undefined },
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
  if (!metadata || metadata.length !== input.length || metadata.contentType !== input.contentType || metadata.contentType !== object.contentType || (object.checksum && input.checksum !== object.checksum) || (input.checksum && metadata.checksum !== input.checksum)) {
    throw new Error("Uploaded object metadata does not match the requested upload.");
  }
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await tx.update(storageObjects).set({ status: "ready", contentLength: metadata.length, contentType: metadata.contentType, ...(metadata.checksum ? { checksum: metadata.checksum } : {}), updatedAt: new Date() }).where(eq(storageObjects.id, input.objectId));
    if (object.purpose === "knowledge") {
      const [document] = await tx.insert(knowledgeDocuments).values({
        businessId: input.businessId,
        sourceType: "upload",
        title: object.fileName,
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

export async function deleteExpiredObjectsForBusiness(
  context: DomainContext,
  input: { businessId: string },
  storage: StorageProvider,
): Promise<number> {
  const expired = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) =>
    await tx.select({ id: storageObjects.id, objectKey: storageObjects.objectKey, status: storageObjects.status })
      .from(storageObjects)
      .where(and(
        eq(storageObjects.businessId, input.businessId),
        or(
          and(eq(storageObjects.status, "pending"), isNotNull(storageObjects.expiresAt), lt(storageObjects.expiresAt, new Date())),
          and(ne(storageObjects.purpose, "recording"), ne(storageObjects.status, "deleted"), isNotNull(storageObjects.retentionUntil), lt(storageObjects.retentionUntil, new Date())),
        ),
      )),
  );
  let deleted = 0;
  for (const object of expired) {
    await storage.deleteObject({ key: object.objectKey });
    await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
      const rows = object.status === "pending"
        ? await tx.delete(storageObjects)
          .where(and(eq(storageObjects.id, object.id), eq(storageObjects.businessId, input.businessId), eq(storageObjects.status, "pending")))
          .returning({ id: storageObjects.id })
        : await tx.update(storageObjects)
          .set({ status: "deleted", updatedAt: new Date() })
          .where(and(eq(storageObjects.id, object.id), eq(storageObjects.businessId, input.businessId), ne(storageObjects.status, "deleted")))
          .returning({ id: storageObjects.id });
      deleted += rows.length;
    });
  }
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
    await tx.insert(storageObjects).values({ id: objectId, businessId: input.businessId, objectKey: key, purpose: "recording", fileName: `${input.callId}.wav`, contentType: input.contentType, contentLength: input.body.byteLength, status: "pending", retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) });
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
