import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { createDatabaseClient, businesses, businessMemberships, outboxMessages, users } from "@lobbystack/db";
import { createObjectDownload, createUpload, finalizeUpload } from "@lobbystack/domain";
import { S3StorageProvider } from "@lobbystack/providers";

const postgresPort = process.env.POSTGRES_PORT ?? "15433";
const appPassword = process.env.LOBBYSTACK_APP_PASSWORD ?? "replace-with-app-password";
const postgresPassword = process.env.POSTGRES_PASSWORD ?? "replace-with-a-long-local-password";
const migrator = createDatabaseClient("lobbystack_migrator", {
  DATABASE_URL: process.env.REPLACEMENT_MIGRATOR_DATABASE_URL ?? `postgres://postgres:${postgresPassword}@127.0.0.1:${postgresPort}/lobbystack`,
});
const app = createDatabaseClient("lobbystack_app", {
  DATABASE_URL: process.env.REPLACEMENT_APP_DATABASE_URL ?? `postgres://lobbystack_app:${appPassword}@127.0.0.1:${postgresPort}/lobbystack`,
});
const storage = new S3StorageProvider({
  bucket: process.env.S3_BUCKET ?? "lobbystack",
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.REPLACEMENT_S3_ENDPOINT ?? "http://127.0.0.1:9000",
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "replace-with-a-long-minio-password",
  forcePathStyle: true,
});

async function main(): Promise<void> {
  const suffix = randomUUID();
  const userId = randomUUID();
  const firstBusinessId = randomUUID();
  const secondBusinessId = randomUUID();
  let objectKey: string | undefined;
  let realtimeDedupeKey: string | undefined;

  try {
    await migrator.db.insert(users).values({ id: userId, email: `${suffix}@storage.invalid`, normalizedEmail: `${suffix}@storage.invalid`, name: "Storage Check" });
    await migrator.db.insert(businesses).values([
      { id: firstBusinessId, slug: `storage-a-${suffix}`, name: "Storage A", timezone: "UTC", businessType: "service_company" },
      { id: secondBusinessId, slug: `storage-b-${suffix}`, name: "Storage B", timezone: "UTC", businessType: "service_company" },
    ]);
    await migrator.db.insert(businessMemberships).values([
      { businessId: firstBusinessId, userId, role: "business_owner" },
      { businessId: secondBusinessId, userId, role: "business_owner" },
    ]);

    const body = new TextEncoder().encode("replacement-storage-range-check");
    const upload = await createUpload({ db: app.db }, {
      userId,
      businessId: firstBusinessId,
      purpose: "attachment",
      fileName: "range-check.txt",
      contentType: "text/plain",
      length: body.byteLength,
    }, storage);
    objectKey = upload.key;
    realtimeDedupeKey = `storage:${upload.objectId}:ready`;
    const uploadResponse = await fetch(upload.url, { method: "PUT", headers: upload.headers, body });
    if (!uploadResponse.ok) throw new Error(`MinIO upload failed with status ${uploadResponse.status}.`);

    await finalizeUpload({ db: app.db }, {
      userId,
      businessId: firstBusinessId,
      objectId: upload.objectId,
      length: body.byteLength,
      contentType: "text/plain",
    }, storage);

    const full = await createObjectDownload({ db: app.db }, { userId, businessId: firstBusinessId, objectId: upload.objectId }, storage);
    const fullResponse = await fetch(full.url);
    if (!fullResponse.ok || new Uint8Array(await fullResponse.arrayBuffer()).byteLength !== body.byteLength) {
      throw new Error("Full object download did not match the finalized object.");
    }

    const partial = await createObjectDownload({ db: app.db }, { userId, businessId: firstBusinessId, objectId: upload.objectId, range: "bytes=0-10" }, storage);
    const partialResponse = await fetch(partial.url, { headers: partial.headers });
    if (partialResponse.status !== 206 || new TextDecoder().decode(await partialResponse.arrayBuffer()) !== "replacement") {
      throw new Error("Range download did not return the requested bytes.");
    }

    let isolated = false;
    try {
      await createObjectDownload({ db: app.db }, { userId, businessId: secondBusinessId, objectId: upload.objectId }, storage);
    } catch {
      isolated = true;
    }
    if (!isolated) throw new Error("Cross-tenant storage access unexpectedly succeeded.");

    const deadline = Date.now() + 5_000;
    let published = false;
    while (Date.now() < deadline) {
      const row = (await migrator.db.select({ publishedAt: outboxMessages.publishedAt }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, realtimeDedupeKey)).limit(1))[0];
      if (row?.publishedAt) {
        published = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!published) throw new Error("Storage realtime outbox event was not published before cleanup.");

    await storage.deleteObject({ key: upload.key });
    if (await storage.headObject({ key: upload.key })) throw new Error("Deleted storage object remained readable.");
    objectKey = undefined;

    console.log("storage-upload-finalize: ok");
    console.log("storage-range: ok");
    console.log("storage-cross-tenant: ok");
    console.log("storage-delete: ok");
  } finally {
    if (objectKey) await storage.deleteObject({ key: objectKey }).catch(() => undefined);
    if (realtimeDedupeKey) await migrator.db.delete(outboxMessages).where(eq(outboxMessages.dedupeKey, realtimeDedupeKey)).catch(() => undefined);
    await migrator.db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    await migrator.db.delete(businesses).where(eq(businesses.id, firstBusinessId)).catch(() => undefined);
    await migrator.db.delete(businesses).where(eq(businesses.id, secondBusinessId)).catch(() => undefined);
    await Promise.all([app.pool.end(), migrator.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
