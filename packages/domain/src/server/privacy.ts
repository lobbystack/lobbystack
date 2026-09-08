import { and, eq, isNotNull, lt } from "drizzle-orm";

import { calls, enqueueOutbox, inboxItems, messages, operatorNotificationDeliveries, storageObjects, transcripts, withBusinessTransaction } from "@lobbystack/db";

import { EXPIRED_FOLLOW_UP_BODY, EXPIRED_FOLLOW_UP_TITLE } from "./followUpRetention";
import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";

export async function scrubExpiredMessageContent(context: DomainContext, input: { businessId: string }): Promise<number> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(messages).set({ body: "[content expired]", contentExpiresAt: null, updatedAt: new Date() }).where(and(eq(messages.businessId, input.businessId), isNotNull(messages.contentExpiresAt), lt(messages.contentExpiresAt, new Date()))).returning({ id: messages.id });
    return rows.length;
  });
}

export async function runPrivacyRetentionSweep(
  context: DomainContext,
  input: { businessId: string; now?: Date },
): Promise<{ scrubbedFollowUps: number; scrubbedMessages: number; scrubbedOperatorDeliveries: number; deletedTranscripts: number; queuedRecordings: number }> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const scrubbedFollowUps = await tx.update(inboxItems)
      .set({ title: EXPIRED_FOLLOW_UP_TITLE, body: EXPIRED_FOLLOW_UP_BODY, contentRetentionStatus: "scrubbed", updatedAt: now })
      .where(and(eq(inboxItems.businessId, input.businessId), eq(inboxItems.contentRetentionStatus, "active"), isNotNull(inboxItems.contentExpiresAt), lt(inboxItems.contentExpiresAt, now)))
      .returning({ id: inboxItems.id });
    const scrubbedMessages = await tx.update(messages)
      .set({ body: "[content expired]", contentExpiresAt: null, updatedAt: now })
      .where(and(eq(messages.businessId, input.businessId), isNotNull(messages.contentExpiresAt), lt(messages.contentExpiresAt, now)))
      .returning({ id: messages.id });
    const deletedTranscripts = await tx.delete(transcripts)
      .where(and(eq(transcripts.businessId, input.businessId), isNotNull(transcripts.expiresAt), lt(transcripts.expiresAt, now)))
      .returning({ callId: transcripts.callId });
    const scrubbedOperatorDeliveries = await tx.update(operatorNotificationDeliveries)
      .set({ subject: "[content expired]", body: "[content expired]", destination: "[expired]", sender: null, contentExpiresAt: new Date("9999-12-31T00:00:00.000Z"), updatedAt: now })
      .where(and(eq(operatorNotificationDeliveries.businessId, input.businessId), lt(operatorNotificationDeliveries.contentExpiresAt, now)))
      .returning({ id: operatorNotificationDeliveries.id });
    const expiredRecordings = await tx.select({ callId: calls.id, objectId: storageObjects.id })
      .from(calls)
      .innerJoin(storageObjects, eq(storageObjects.id, calls.recordingObjectId))
      .where(and(
        eq(calls.businessId, input.businessId),
        eq(storageObjects.businessId, input.businessId),
        eq(storageObjects.purpose, "recording"),
        eq(storageObjects.status, "ready"),
        isNotNull(storageObjects.retentionUntil),
        lt(storageObjects.retentionUntil, now),
      ));

    const dateKey = now.toISOString().slice(0, 10);
    for (const callId of new Set(deletedTranscripts.map((row) => row.callId))) {
      await enqueueOutbox(tx, {
        topic: "realtime.publish",
        businessId: input.businessId,
        aggregateType: "call",
        aggregateId: callId,
        dedupeKey: `privacy:retention:transcript:${callId}:${dateKey}`,
        payload: { type: "transcript.upserted", entityId: callId, deleted: true },
      });
    }
    for (const recording of expiredRecordings) {
      await enqueueOutbox(tx, {
        topic: "privacy.deleteRecording",
        businessId: input.businessId,
        aggregateType: "call",
        aggregateId: recording.callId,
        dedupeKey: `privacy:retention:recording:${recording.objectId}:${dateKey}`,
        payload: { callId: recording.callId, objectId: recording.objectId },
      });
    }
    return {
      scrubbedFollowUps: scrubbedFollowUps.length,
      scrubbedMessages: scrubbedMessages.length,
      scrubbedOperatorDeliveries: scrubbedOperatorDeliveries.length,
      deletedTranscripts: deletedTranscripts.length,
      queuedRecordings: expiredRecordings.length,
    };
  });
}

export async function deleteTranscript(
  context: DomainContext,
  input: { userId: string; businessId: string; callId: string },
): Promise<number> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const rows = await tx.delete(transcripts).where(and(eq(transcripts.businessId, input.businessId), eq(transcripts.callId, input.callId))).returning({ id: transcripts.id });
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "call", aggregateId: input.callId, dedupeKey: `privacy:transcript:${input.callId}:${Date.now()}`, payload: { type: "transcript.upserted", entityId: input.callId, deleted: true } });
    return rows.length;
  });
}

export async function deleteTranscriptForRetention(
  context: DomainContext,
  input: { businessId: string; callId: string },
): Promise<number> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.delete(transcripts)
      .where(and(eq(transcripts.businessId, input.businessId), eq(transcripts.callId, input.callId)))
      .returning({ id: transcripts.id });
    if (rows.length > 0) {
      await enqueueOutbox(tx, {
        topic: "realtime.publish",
        businessId: input.businessId,
        aggregateType: "call",
        aggregateId: input.callId,
        dedupeKey: `privacy:transcript:${input.callId}:deleted`,
        payload: { type: "transcript.upserted", entityId: input.callId, deleted: true },
      });
    }
    return rows.length;
  });
}

export async function markRecordingForDeletion(
  context: DomainContext,
  input: { userId: string; businessId: string; callId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const call = (await tx.select({ objectId: calls.recordingObjectId }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1))[0];
    if (call?.objectId) {
      await enqueueOutbox(tx, { topic: "privacy.deleteRecording", businessId: input.businessId, aggregateType: "call", aggregateId: input.callId, dedupeKey: `privacy:recording:${input.callId}`, payload: { callId: input.callId, objectId: call.objectId } });
    }
  });
}
