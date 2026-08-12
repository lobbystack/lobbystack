import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { businesses, calls, conversations, createDatabaseClient, messages, storageObjects, transcripts } from "@lobbystack/db";
import { deleteExpiredObjectsForBusiness, runPrivacyRetentionSweep } from "@lobbystack/domain";
import { S3StorageProvider } from "@lobbystack/providers";

const postgresPort = process.env.POSTGRES_PORT ?? "15433";
const postgresPassword = process.env.POSTGRES_PASSWORD ?? "replace-with-a-long-local-password";
const workerPassword = process.env.LOBBYSTACK_WORKER_PASSWORD ?? "replace-with-worker-password";
const migrator = createDatabaseClient("lobbystack_migrator", {
  DATABASE_URL: process.env.REPLACEMENT_MIGRATOR_DATABASE_URL ?? `postgres://postgres:${postgresPassword}@127.0.0.1:${postgresPort}/lobbystack`,
});
const worker = createDatabaseClient("lobbystack_worker", {
  DATABASE_URL: process.env.REPLACEMENT_WORKER_DATABASE_URL ?? `postgres://lobbystack_worker:${workerPassword}@127.0.0.1:${postgresPort}/lobbystack`,
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
  const businessId = randomUUID();
  const conversationId = randomUUID();
  const callId = randomUUID();
  const recordingObjectId = randomUUID();
  const attachmentObjectId = randomUUID();
  const recordingKey = `${businessId}/recording/${callId}/${recordingObjectId}.wav`;
  const attachmentKey = `${businessId}/attachment/${attachmentObjectId}.txt`;
  const now = new Date();

  try {
    await storage.ensureBucket();
    await storage.putObject({ key: recordingKey, body: new TextEncoder().encode("expired-recording"), contentType: "audio/wav" });
    await storage.putObject({ key: attachmentKey, body: new TextEncoder().encode("expired-attachment"), contentType: "text/plain" });
    await migrator.db.insert(businesses).values({ id: businessId, slug: `privacy-${suffix}`, name: "Privacy Check", timezone: "UTC", businessType: "service_company" });
    await migrator.db.insert(conversations).values({ id: conversationId, businessId, channel: "voice" });
    await migrator.db.insert(storageObjects).values([
      { id: recordingObjectId, businessId, objectKey: recordingKey, purpose: "recording", fileName: "recording.wav", contentType: "audio/wav", status: "ready", retentionUntil: new Date(now.getTime() - 60_000) },
      { id: attachmentObjectId, businessId, objectKey: attachmentKey, purpose: "attachment", fileName: "attachment.txt", contentType: "text/plain", status: "ready", retentionUntil: new Date(now.getTime() - 60_000) },
    ]);
    await migrator.db.insert(calls).values({ id: callId, businessId, conversationId, providerCallId: `privacy-${suffix}`, transport: "web", status: "completed", startedAt: new Date(now.getTime() - 120_000), endedAt: new Date(now.getTime() - 60_000), recordingObjectId });
    await migrator.db.insert(messages).values({ businessId, conversationId, direction: "inbound", channel: "sms", body: "expired customer content", status: "received", contentExpiresAt: new Date(now.getTime() - 60_000) });
    await migrator.db.insert(transcripts).values([
      { businessId, callId, sequence: 1, speaker: "caller", text: "expired transcript", expiresAt: new Date(now.getTime() - 60_000) },
      { businessId, callId, sequence: 2, speaker: "assistant", text: "retained transcript", expiresAt: new Date(now.getTime() + 60_000) },
    ]);

    const result = await runPrivacyRetentionSweep({ db: worker.db }, { businessId, now });
    if (result.scrubbedMessages !== 1 || result.deletedTranscripts !== 1 || result.queuedRecordings !== 1) {
      throw new Error(`Unexpected retention sweep result: ${JSON.stringify(result)}`);
    }
    const [message] = await migrator.db.select({ body: messages.body, contentExpiresAt: messages.contentExpiresAt }).from(messages).where(eq(messages.businessId, businessId));
    const remainingTranscripts = await migrator.db.select({ text: transcripts.text }).from(transcripts).where(eq(transcripts.callId, callId));
    if (message?.body !== "[content expired]" || message.contentExpiresAt !== null || remainingTranscripts.length !== 1 || remainingTranscripts[0]?.text !== "retained transcript") {
      throw new Error("Message or transcript retention did not preserve the expected state.");
    }

    const cleanedAttachments = await deleteExpiredObjectsForBusiness({ db: worker.db }, { businessId }, storage);
    if (cleanedAttachments !== 1 || await storage.headObject({ key: attachmentKey })) {
      throw new Error("Expired attachment cleanup did not remove the object.");
    }

    const deadline = Date.now() + 30_000;
    let recordingDeleted = false;
    let lastObserved: { objectStatus?: string; callRecordingObjectId?: string | null } = {};
    while (Date.now() < deadline) {
      const [object] = await migrator.db.select({ status: storageObjects.status }).from(storageObjects).where(and(eq(storageObjects.id, recordingObjectId), eq(storageObjects.businessId, businessId)));
      const [call] = await migrator.db.select({ recordingObjectId: calls.recordingObjectId }).from(calls).where(eq(calls.id, callId));
      lastObserved = { ...(object?.status ? { objectStatus: object.status } : {}), ...(call ? { callRecordingObjectId: call.recordingObjectId } : {}) };
      if (object?.status === "deleted" && call?.recordingObjectId === null) {
        recordingDeleted = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!recordingDeleted) throw new Error(`Expired recording outbox job was not completed by the worker: ${JSON.stringify(lastObserved)}`);

    console.log("privacy-message-scrub: ok");
    console.log("privacy-transcript-retention: ok");
    console.log("privacy-attachment-cleanup: ok");
    console.log("privacy-recording-outbox: ok");
  } finally {
    await storage.deleteObject({ key: recordingKey }).catch(() => undefined);
    await storage.deleteObject({ key: attachmentKey }).catch(() => undefined);
    await migrator.db.delete(businesses).where(eq(businesses.id, businessId)).catch(() => undefined);
    await Promise.all([worker.pool.end(), migrator.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
