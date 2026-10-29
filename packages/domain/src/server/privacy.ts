import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";

import { calls, conversations, conversationSessions, enqueueOutbox, inboxItems, messages, operatorNotificationDeliveries, storageObjects, transcripts, unansweredQuestions, withBusinessTransaction } from "@lobbystack/db";

import { EXPIRED_FOLLOW_UP_BODY, EXPIRED_FOLLOW_UP_TITLE } from "./followUpRetention";
import type { DomainContext } from "./context";
import { isContentRetentionEnabled } from "./contentRetentionPolicy";

export async function runPrivacyRetentionSweep(
  context: DomainContext,
  input: { businessId: string; now?: Date },
): Promise<{ scrubbedFollowUps: number; scrubbedMessages: number; scrubbedOperatorDeliveries: number; deletedTranscripts: number; deletedUnansweredQuestions: number; queuedRecordings: number }> {
  const now = input.now ?? new Date();
  const contentRetentionEnabled = isContentRetentionEnabled();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const scrubbedFollowUps = !contentRetentionEnabled ? [] : await tx.update(inboxItems)
      .set({ title: EXPIRED_FOLLOW_UP_TITLE, body: EXPIRED_FOLLOW_UP_BODY, metadata: null, contentRetentionStatus: "scrubbed", updatedAt: now })
      .where(and(eq(inboxItems.businessId, input.businessId), eq(inboxItems.contentRetentionStatus, "active"), isNotNull(inboxItems.contentExpiresAt), lt(inboxItems.contentExpiresAt, now)))
      .returning({ id: inboxItems.id });
    const scrubbedMessages = !contentRetentionEnabled ? [] : await tx.update(messages)
      .set({ body: "[content expired]", media: null, contentExpiresAt: null, updatedAt: now })
      .where(and(eq(messages.businessId, input.businessId), isNotNull(messages.contentExpiresAt), lt(messages.contentExpiresAt, now)))
      .returning({ id: messages.id });
    const deletedTranscripts = !contentRetentionEnabled ? [] : await tx.delete(transcripts)
      .where(and(eq(transcripts.businessId, input.businessId), isNotNull(transcripts.expiresAt), lt(transcripts.expiresAt, now)))
      .returning({ callId: transcripts.callId });
    // A question repeats what a caller said; its text entry, once answered, is the business's own and stays.
    // Dismissed questions expire too, so one asked again after that opens a new row.
    const deletedUnansweredQuestions = !contentRetentionEnabled ? [] : await tx.delete(unansweredQuestions)
      .where(and(eq(unansweredQuestions.businessId, input.businessId), isNotNull(unansweredQuestions.contentExpiresAt), lt(unansweredQuestions.contentExpiresAt, now)))
      .returning({ id: unansweredQuestions.id });
    const expiredCallIds = [...new Set(deletedTranscripts.map((row) => row.callId))];
    // A call's summary often quotes the caller, so its text expires with the transcript.
    const quotingSessions = !expiredCallIds.length ? [] : await tx.select({ id: conversationSessions.id, conversationId: conversationSessions.conversationId, summary: conversationSessions.summary })
      .from(conversationSessions)
      .where(and(eq(conversationSessions.businessId, input.businessId), inArray(conversationSessions.callId, expiredCallIds), inArray(conversationSessions.summaryKind, ["summary", "message_taking"])));
    for (const session of quotingSessions) {
      const text = session.summary?.summary;
      if (typeof text !== "string") continue;
      await tx.update(conversationSessions)
        .set(session.summary?.kind === "message_taking" ? { summary: { kind: "message_taking" }, updatedAt: now } : { summary: null, summaryKind: null, updatedAt: now })
        .where(and(eq(conversationSessions.id, session.id), eq(conversationSessions.businessId, input.businessId)));
      // A conversation spans many calls: clear its summary only while it still holds this call's text.
      await tx.update(conversations)
        .set({ summary: null, updatedAt: now })
        .where(and(eq(conversations.id, session.conversationId), eq(conversations.businessId, input.businessId), eq(conversations.summary, text)));
    }
    const scrubbedOperatorDeliveries = await tx.update(operatorNotificationDeliveries)
      .set({ subject: "[content expired]", body: "[content expired]", destination: "[expired]", sender: null, contentExpiresAt: new Date("9999-12-31T00:00:00.000Z"), updatedAt: now })
      .where(and(eq(operatorNotificationDeliveries.businessId, input.businessId), lt(operatorNotificationDeliveries.contentExpiresAt, now)))
      .returning({ id: operatorNotificationDeliveries.id });
    const expiredRecordings = !contentRetentionEnabled ? [] : await tx.select({ callId: calls.id, objectId: storageObjects.id })
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
    for (const callId of expiredCallIds) {
      await enqueueOutbox(tx, {
        topic: "realtime.publish",
        businessId: input.businessId,
        aggregateType: "call",
        aggregateId: callId,
        dedupeKey: `privacy:retention:transcript:${callId}:${dateKey}`,
        payload: { type: "transcript.upserted", entityId: callId, deleted: true },
      });
    }
    if (contentRetentionEnabled) {
      for (const recording of expiredRecordings) {
        await enqueueOutbox(tx, {
          topic: "privacy.deleteRecording",
          businessId: input.businessId,
          aggregateType: "call",
          aggregateId: recording.callId,
          dedupeKey: `privacy:retention:recording:${recording.objectId}:${dateKey}`,
          payload: { callId: recording.callId, objectId: recording.objectId, source: "retention" },
        });
      }
    }
    return {
      scrubbedFollowUps: scrubbedFollowUps.length,
      scrubbedMessages: scrubbedMessages.length,
      scrubbedOperatorDeliveries: scrubbedOperatorDeliveries.length,
      deletedTranscripts: deletedTranscripts.length,
      deletedUnansweredQuestions: deletedUnansweredQuestions.length,
      queuedRecordings: expiredRecordings.length,
    };
  });
}
