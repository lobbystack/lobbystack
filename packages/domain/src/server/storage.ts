import { randomUUID } from "node:crypto";

import { storageObjects } from "@lobbystack/db";
import type { CreateUploadRequest, UploadFinalizeRequest } from "@lobbystack/contracts";
import { and, eq, inArray, lt } from "drizzle-orm";

import {
  enqueueSideEffect,
  getAppPool,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

const DEFAULT_BUCKET = process.env.STORAGE_BUCKET ?? "lobbystack-uploads";

function safeFilename(filename: string): string {
  const normalized = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 160) || "upload";
}

export type StorageProvider = {
  createUpload: (input: {
    key: string;
    contentType: string;
    length: number;
    checksumSha256: string;
  }) => Promise<unknown>;
  headObject: (input: { key: string }) => Promise<{
    length: number;
    contentType?: string;
    checksumSha256?: string;
  }>;
  createDownloadUrl?: (input: {
    key: string;
    filename?: string;
    contentType?: string;
    length?: number;
  }) => Promise<string>;
};

export async function createPendingUpload(input: {
  businessId: string;
  userId: string;
  values: CreateUploadRequest;
  provider: StorageProvider;
  pool?: TransactionContext["pool"];
}) {
  const pool = input.pool ?? getAppPool();
  const objectId = randomUUID();
  const objectKey = `${input.businessId}/${objectId}/${safeFilename(input.values.filename)}`;

  await withDomainTransaction(
    { businessId: input.businessId, userId: input.userId, actorType: "user", pool },
    async (db) => {
      await db.insert(storageObjects).values({
        id: objectId,
        businessId: input.businessId,
        bucket: DEFAULT_BUCKET,
        objectKey,
        mimeType: input.values.contentType,
        byteLength: input.values.length,
        checksum: input.values.checksumSha256,
        status: "pending",
        metadataJson: {
          purpose: input.values.purpose,
          filename: safeFilename(input.values.filename),
          checksumSha256: input.values.checksumSha256,
        },
      });
    },
  );

  try {
    const upload = await input.provider.createUpload({
      key: objectKey,
      contentType: input.values.contentType,
      length: input.values.length,
      checksumSha256: input.values.checksumSha256,
    });

    return { objectId, objectKey, upload };
  } catch (error) {
    await withDomainTransaction(
      { businessId: input.businessId, userId: input.userId, actorType: "user", pool },
      async (db) => {
        await db
          .update(storageObjects)
          .set({ status: "failed", updatedAt: new Date() })
          .where(and(eq(storageObjects.id, objectId), eq(storageObjects.businessId, input.businessId)));
      },
    );
    throw error;
  }
}

export async function finalizeUpload(input: {
  businessId: string;
  userId: string;
  values: UploadFinalizeRequest;
  provider: StorageProvider;
  pool?: TransactionContext["pool"];
}) {
  const pool = input.pool ?? getAppPool();

  const [pending] = await withDomainTransaction(
    { businessId: input.businessId, userId: input.userId, actorType: "user", pool },
    async (db) =>
      db
        .select({
          id: storageObjects.id,
          objectKey: storageObjects.objectKey,
          byteLength: storageObjects.byteLength,
          mimeType: storageObjects.mimeType,
          checksum: storageObjects.checksum,
        })
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.id, input.values.objectId),
            eq(storageObjects.businessId, input.businessId),
          ),
        )
        .limit(1),
  );

  if (!pending) {
    throw new Error("Upload does not exist in the active business");
  }

  if (
    pending.byteLength !== input.values.length ||
    pending.mimeType !== input.values.contentType ||
    pending.checksum !== input.values.checksumSha256
  ) {
    throw new Error("Upload metadata does not match the pending upload");
  }

  const head = await input.provider.headObject({ key: pending.objectKey });
  if (
    head.length !== pending.byteLength ||
    (head.contentType && head.contentType !== pending.mimeType) ||
    (head.checksumSha256 && head.checksumSha256 !== pending.checksum)
  ) {
    throw new Error("Uploaded object metadata does not match the pending upload");
  }

  await withDomainTransaction(
    { businessId: input.businessId, userId: input.userId, actorType: "user", pool },
    async (db) => {
      await db
        .update(storageObjects)
        .set({ status: "active", updatedAt: new Date() })
        .where(
          and(
            eq(storageObjects.id, input.values.objectId),
            eq(storageObjects.businessId, input.businessId),
          ),
        );

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "knowledge.extractDocument",
        payload: { businessId: input.businessId, documentId: input.values.objectId },
        dedupeKey: `storage-object:${input.values.objectId}:finalized`,
      });
    },
  );

  return { objectId: input.values.objectId, status: "active" as const };
}

export async function createStorageDownloadUrl(input: {
  businessId: string;
  userId: string;
  objectId: string;
  provider: StorageProvider;
  pool?: TransactionContext["pool"];
}) {
  const pool = input.pool ?? getAppPool();

  const [object] = await withDomainTransaction(
    { businessId: input.businessId, userId: input.userId, actorType: "user", pool },
    async (db) =>
      db
        .select({
          objectKey: storageObjects.objectKey,
          mimeType: storageObjects.mimeType,
          byteLength: storageObjects.byteLength,
          metadataJson: storageObjects.metadataJson,
        })
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.id, input.objectId),
            eq(storageObjects.businessId, input.businessId),
            eq(storageObjects.status, "active"),
          ),
        )
        .limit(1),
  );

  if (!object || !input.provider.createDownloadUrl) {
    return null;
  }

  const filename =
    typeof object.metadataJson === "object" &&
    object.metadataJson !== null &&
    "filename" in object.metadataJson &&
    typeof object.metadataJson.filename === "string"
      ? object.metadataJson.filename
      : undefined;

  return input.provider.createDownloadUrl({
    key: object.objectKey,
    ...(filename ? { filename } : {}),
    ...(object.mimeType ? { contentType: object.mimeType } : {}),
    ...(object.byteLength !== null ? { length: object.byteLength } : {}),
  });
}

export async function cleanupPendingUploads(input: {
  businessId: string;
  olderThan?: Date;
  pool?: TransactionContext["pool"];
}) {
  const cutoff = input.olderThan ?? new Date(Date.now() - 24 * 60 * 60 * 1_000);

  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const stale = await db
        .update(storageObjects)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(storageObjects.businessId, input.businessId),
            eq(storageObjects.status, "pending"),
            lt(storageObjects.createdAt, cutoff),
          ),
        )
        .returning({ id: storageObjects.id });

      return stale.length;
    },
  );
}

export async function deleteStorageObject(input: {
  businessId: string;
  objectId: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      await db
        .delete(storageObjects)
        .where(
          and(eq(storageObjects.id, input.objectId), eq(storageObjects.businessId, input.businessId)),
        );
    },
  );
}
