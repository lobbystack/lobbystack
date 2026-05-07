import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getBillingKey } from "../lib/billing";
import {
  CALL_RECORDING_RETENTION_DAYS,
  MESSAGE_CONTENT_RETENTION_DAYS,
  REDACTED_MESSAGE_BODY,
  getCallRecordingExpiresAt,
  getMessageContentExpiresAt,
  getSensitiveContentExpiresAt,
} from "../privacy/retention";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;
const NOW_ISO = "2026-05-07T12:00:00.000Z";
const EXPIRED_ISO = "2026-05-06T12:00:00.000Z";
const FRESH_ISO = "2026-05-08T12:00:00.000Z";

type ConvexHarness = TestConvex<typeof schema>;
type TestRunCtx = Parameters<Parameters<ConvexHarness["run"]>[0]>[0];

type WorkspaceSeed = {
  authed: ReturnType<ConvexHarness["withIdentity"]>;
  businessId: Id<"businesses">;
  userId: Id<"users">;
};

async function seedWorkspace(
  t: ConvexHarness,
  input: {
    subject: string;
    slug: string;
    role?: "business_owner" | "business_admin" | "scheduler" | "viewer";
  },
): Promise<WorkspaceSeed> {
  const { businessId, userId } = await t.run(async (ctx: TestRunCtx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: input.slug,
      name: "MVP Privacy Test Business",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "cloud",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
      displayName: "MVP Privacy Tester",
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: input.role ?? "business_owner",
      status: "active",
    });

    return { businessId, userId };
  });

  return {
    authed: t.withIdentity({ subject: input.subject }),
    businessId,
    userId,
  };
}

async function seedUserWithoutMembership(
  t: ConvexHarness,
  subject: string,
): Promise<ReturnType<ConvexHarness["withIdentity"]>> {
  await t.run(async (ctx: TestRunCtx) => {
    await ctx.db.insert("users", {
      authSubject: subject,
      email: `${subject}@example.com`,
      displayName: "Outside User",
    });
  });
  return t.withIdentity({ subject });
}

async function seedConversation(ctx: TestRunCtx, businessId: Id<"businesses">) {
  const contactId = await ctx.db.insert("contacts", {
    businessId,
    phone: "+14165550111",
    name: "Taylor Customer",
  });
  const conversationId = await ctx.db.insert("conversations", {
    businessId,
    contactId,
    channel: "sms",
    status: "open",
  });

  return { contactId, conversationId };
}

async function storeTestBlob(
  ctx: TestRunCtx,
  contents: string,
  contentType: string = "text/plain",
): Promise<Id<"_storage">> {
  return await ctx.storage.store(new Blob([contents], { type: contentType }));
}

describe("MVP privacy retention", () => {
  it("uses 365 days for message content and 90 days for raw sensitive artifacts", () => {
    const nowMs = Date.parse(NOW_ISO);

    expect(Date.parse(getMessageContentExpiresAt(nowMs)) - nowMs).toBe(
      MESSAGE_CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(Date.parse(getCallRecordingExpiresAt(nowMs)) - nowMs).toBe(
      CALL_RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(Date.parse(getSensitiveContentExpiresAt(nowMs)) - nowMs).toBe(
      CALL_RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("hides expired content from read paths before cleanup runs", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-read-guards-owner",
      slug: "mvp-retention-read-guards",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { contactId, conversationId } = await seedConversation(ctx, owner.businessId);
      const messageStorageId = await storeTestBlob(ctx, "expired visible attachment");
      const messageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        direction: "inbound",
        channel: "sms",
        body: "expired body before cron",
        status: "received",
        aiGenerated: false,
        media: [
          {
            storageId: messageStorageId,
            fileName: "expired.txt",
            contentType: "text/plain",
            byteLength: 25,
            deliveryMode: "link",
          },
        ],
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
      });
      await ctx.db.insert("message_attachment_download_tokens", {
        businessId: owner.businessId,
        messageId,
        storageId: messageStorageId,
        fileName: "expired.txt",
        contentType: "text/plain",
        disposition: "attachment",
        nonce: "expired-read-guard-message-token",
        expiresAt: FRESH_ISO,
      });

      const recordingStorageId = await storeTestBlob(ctx, "expired recording", "audio/wav");
      const callId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        conversationId,
        contactId,
        twilioCallSid: "CA-mvp-retention-read-guards",
        status: "completed",
        startedAt: "2026-05-01T12:00:00.000Z",
        recordingStorageId,
        recordingContentType: "audio/wav",
        recordingByteLength: 17,
        recordingRetentionStatus: "active",
        recordingExpiresAt: EXPIRED_ISO,
      });
      await ctx.db.insert("call_recording_download_tokens", {
        businessId: owner.businessId,
        callId,
        storageId: recordingStorageId,
        fileName: "expired-recording.wav",
        contentType: "audio/wav",
        nonce: "expired-read-guard-recording-token",
        expiresAt: FRESH_ISO,
      });
      await ctx.db.insert("transcripts", {
        businessId: owner.businessId,
        callId,
        sequence: 1,
        speaker: "caller",
        text: "expired transcript before cron",
        final: true,
        expiresAt: EXPIRED_ISO,
      });
      await ctx.db.insert("preview_sessions", {
        businessId: owner.businessId,
        userId: owner.userId,
        prompt: "expired preview before cron",
        streamId: "expired-read-guard-preview-stream",
        expiresAt: EXPIRED_ISO,
      });

      return {
        callId,
        conversationId,
      };
    });

    const thread = await owner.authed.query(api.dashboard.messages.getConversationThread, {
      businessId: owner.businessId,
      conversationId: seeded.conversationId,
    });
    expect(thread.messages[0]?.body).toBe(REDACTED_MESSAGE_BODY);
    expect(thread.messages[0]?.attachments).toEqual([]);

    await expect(
      t.query(internal.dashboard.messages.getMessageAttachmentDownloadToken, {
        token: "expired-read-guard-message-token",
      }),
    ).resolves.toBeNull();

    const call = await owner.authed.query(api.voice.runtime.getCallForDashboard, {
      businessId: owner.businessId,
      callId: seeded.callId,
    });
    expect(call?.recordingUrl).toBeNull();
    expect(call?.transcriptReady).toBe(false);
    expect(call?.transcriptPreview).toBeNull();

    await expect(
      owner.authed.query(api.voice.runtime.getCallTranscript, {
        businessId: owner.businessId,
        callId: seeded.callId,
      }),
    ).resolves.toEqual([]);
    await expect(
      t.query(internal.voice.runtime.getCallRecordingDownloadToken, {
        token: "expired-read-guard-recording-token",
      }),
    ).resolves.toBeNull();
    await expect(
      owner.authed.query(api.ai.preview.stream.getPreviewBody, {
        streamId: "expired-read-guard-preview-stream",
      }),
    ).rejects.toThrow("Preview session not found.");
  });

  it("scrubs expired message content and attachment storage while preserving fresh and legacy rows", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-messages-owner",
      slug: "mvp-retention-messages",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { conversationId } = await seedConversation(ctx, owner.businessId);
      const expiredStorageId = await storeTestBlob(ctx, "expired attachment", "text/plain");
      const expiredPreviewStorageId = await storeTestBlob(ctx, "expired preview", "image/png");
      const freshStorageId = await storeTestBlob(ctx, "fresh attachment", "text/plain");

      const expiredMessageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        direction: "inbound",
        channel: "sms",
        fromPhoneNumber: "+14165550001",
        body: "old sensitive SMS body",
        status: "received",
        aiGenerated: false,
        media: [
          {
            storageId: expiredStorageId,
            fileName: "expired.txt",
            contentType: "text/plain",
            byteLength: 18,
            previewStorageId: expiredPreviewStorageId,
            previewFileName: "expired.png",
            previewContentType: "image/png",
            previewByteLength: 15,
            deliveryMode: "link",
          },
        ],
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
      });
      await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId,
        uploaderUserId: owner.userId,
        storageId: expiredStorageId,
        fileName: "expired.txt",
        contentType: "text/plain",
        byteLength: 18,
        previewStorageId: expiredPreviewStorageId,
        previewFileName: "expired.png",
        previewContentType: "image/png",
        previewByteLength: 15,
        deliveryMode: "link",
        status: "sent",
        sentMessageId: expiredMessageId,
      });
      const expiredTokenId = await ctx.db.insert("message_attachment_download_tokens", {
        businessId: owner.businessId,
        messageId: expiredMessageId,
        storageId: expiredStorageId,
        fileName: "expired.txt",
        contentType: "text/plain",
        disposition: "attachment",
        nonce: "expired-message-token",
        expiresAt: FRESH_ISO,
      });
      const conversationAiStateId = await ctx.db.insert("conversation_ai_state", {
        businessId: owner.businessId,
        conversationId,
        threadId: "thread-with-expired-sms-copy",
      });

      const freshMessageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        direction: "inbound",
        channel: "sms",
        fromPhoneNumber: "+14165550002",
        body: "fresh SMS body",
        status: "received",
        aiGenerated: false,
        media: [
          {
            storageId: freshStorageId,
            fileName: "fresh.txt",
            contentType: "text/plain",
            byteLength: 16,
            deliveryMode: "link",
          },
        ],
        contentRetentionStatus: "active",
        contentExpiresAt: FRESH_ISO,
      });
      const legacyMessageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        direction: "inbound",
        channel: "sms",
        body: "legacy body without retention fields",
        status: "received",
        aiGenerated: false,
      });

      return {
        expiredMessageId,
        expiredStorageId,
        expiredPreviewStorageId,
        expiredTokenId,
        conversationAiStateId,
        freshMessageId,
        freshStorageId,
        legacyMessageId,
      };
    });

    const summary = await t.action(internal.privacy.retention.runMvpRetentionCleanup, {
      nowIso: NOW_ISO,
      limit: 100,
    });

    expect(summary.messages.scrubbed).toBe(1);
    await t.run(async (ctx: TestRunCtx) => {
      const expiredMessage = await ctx.db.get(seeded.expiredMessageId);
      const freshMessage = await ctx.db.get(seeded.freshMessageId);
      const legacyMessage = await ctx.db.get(seeded.legacyMessageId);

      expect(expiredMessage).toMatchObject({
        body: REDACTED_MESSAGE_BODY,
        contentRetentionStatus: "expired",
      });
      expect(expiredMessage?.media).toBeUndefined();
      expect(expiredMessage?.fromPhoneNumber).toBeUndefined();
      expect(await ctx.db.get(seeded.expiredTokenId)).toBeNull();
      expect(await ctx.db.get(seeded.conversationAiStateId)).toBeNull();
      expect(await ctx.storage.get(seeded.expiredStorageId)).toBeNull();
      expect(await ctx.storage.get(seeded.expiredPreviewStorageId)).toBeNull();
      expect(
        await ctx.db
          .query("message_attachment_uploads")
          .withIndex("by_sent_message_id", (q) =>
            q.eq("sentMessageId", seeded.expiredMessageId),
          )
          .take(1),
      ).toHaveLength(0);

      expect(freshMessage?.body).toBe("fresh SMS body");
      expect(freshMessage?.media).toHaveLength(1);
      expect(await ctx.storage.get(seeded.freshStorageId)).not.toBeNull();
      expect(legacyMessage?.body).toBe("legacy body without retention fields");
    });
  });

  it("scrubs expired attachment messages when consumed upload blobs are already gone", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-consumed-upload-owner",
      slug: "mvp-retention-consumed-upload",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { conversationId } = await seedConversation(ctx, owner.businessId);
      const sentStorageId = await storeTestBlob(ctx, "sent attachment clone");
      const sentPreviewStorageId = await storeTestBlob(ctx, "sent preview clone", "image/png");
      const consumedStorageId = await storeTestBlob(ctx, "already deleted upload");
      const consumedPreviewStorageId = await storeTestBlob(
        ctx,
        "already deleted preview",
        "image/png",
      );
      await ctx.storage.delete(consumedStorageId);
      await ctx.storage.delete(consumedPreviewStorageId);

      const messageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "old outbound attachment body",
        status: "sent",
        aiGenerated: false,
        media: [
          {
            storageId: sentStorageId,
            fileName: "sent.txt",
            contentType: "text/plain",
            byteLength: 21,
            previewStorageId: sentPreviewStorageId,
            previewFileName: "sent.png",
            previewContentType: "image/png",
            previewByteLength: 18,
            deliveryMode: "link",
          },
        ],
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
      });
      const uploadId = await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId,
        uploaderUserId: owner.userId,
        storageId: consumedStorageId,
        fileName: "original.txt",
        contentType: "text/plain",
        byteLength: 22,
        previewStorageId: consumedPreviewStorageId,
        previewFileName: "original.png",
        previewContentType: "image/png",
        previewByteLength: 21,
        deliveryMode: "link",
        status: "consumed",
        sentMessageId: messageId,
      });

      return {
        messageId,
        sentPreviewStorageId,
        sentStorageId,
        uploadId,
      };
    });

    const summary = await t.action(internal.privacy.retention.runMvpRetentionCleanup, {
      nowIso: NOW_ISO,
      limit: 100,
    });

    expect(summary.messages.scrubbed).toBe(1);
    await t.run(async (ctx: TestRunCtx) => {
      const message = await ctx.db.get(seeded.messageId);
      expect(message?.body).toBe(REDACTED_MESSAGE_BODY);
      expect(message?.contentRetentionStatus).toBe("expired");
      expect(message?.media).toBeUndefined();
      expect(await ctx.db.get(seeded.uploadId)).toBeNull();
      expect(await ctx.storage.get(seeded.sentStorageId)).toBeNull();
      expect(await ctx.storage.get(seeded.sentPreviewStorageId)).toBeNull();
    });
  });

  it("deletes expired transcripts, preview sessions, recordings, and standalone download tokens", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-voice-owner",
      slug: "mvp-retention-voice",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { contactId, conversationId } = await seedConversation(ctx, owner.businessId);
      const expiredRecordingStorageId = await storeTestBlob(ctx, "expired recording", "audio/wav");
      const freshRecordingStorageId = await storeTestBlob(ctx, "fresh recording", "audio/wav");
      const expiredCallId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        conversationId,
        contactId,
        twilioCallSid: "CA-mvp-retention-expired",
        status: "completed",
        startedAt: "2026-01-01T12:00:00.000Z",
        recordingStorageId: expiredRecordingStorageId,
        recordingContentType: "audio/wav",
        recordingByteLength: 17,
        recordingDurationMs: 12000,
        recordingRetentionStatus: "active",
        recordingExpiresAt: EXPIRED_ISO,
      });
      const freshCallId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        conversationId,
        contactId,
        twilioCallSid: "CA-mvp-retention-fresh",
        status: "completed",
        startedAt: "2026-05-01T12:00:00.000Z",
        recordingStorageId: freshRecordingStorageId,
        recordingContentType: "audio/wav",
        recordingByteLength: 15,
        recordingDurationMs: 8000,
        recordingRetentionStatus: "active",
        recordingExpiresAt: FRESH_ISO,
      });
      const expiredRecordingTokenId = await ctx.db.insert("call_recording_download_tokens", {
        businessId: owner.businessId,
        callId: expiredCallId,
        storageId: expiredRecordingStorageId,
        fileName: "expired.wav",
        contentType: "audio/wav",
        nonce: "expired-recording-token",
        expiresAt: FRESH_ISO,
      });
      const standaloneMessageTokenId = await ctx.db.insert("message_attachment_download_tokens", {
        businessId: owner.businessId,
        messageId: await ctx.db.insert("messages", {
          businessId: owner.businessId,
          conversationId,
          direction: "inbound",
          channel: "sms",
          body: "token owner",
          status: "received",
          aiGenerated: false,
        }),
        storageId: await storeTestBlob(ctx, "standalone token storage"),
        fileName: "standalone.txt",
        contentType: "text/plain",
        disposition: "attachment",
        nonce: "standalone-message-token",
        expiresAt: EXPIRED_ISO,
      });
      const standaloneRecordingTokenId = await ctx.db.insert("call_recording_download_tokens", {
        businessId: owner.businessId,
        callId: freshCallId,
        storageId: freshRecordingStorageId,
        fileName: "standalone-recording.wav",
        contentType: "audio/wav",
        nonce: "standalone-recording-token",
        expiresAt: EXPIRED_ISO,
      });
      const expiredTranscriptId = await ctx.db.insert("transcripts", {
        businessId: owner.businessId,
        callId: expiredCallId,
        sequence: 1,
        speaker: "caller",
        text: "old transcript",
        final: true,
        expiresAt: EXPIRED_ISO,
      });
      const freshTranscriptId = await ctx.db.insert("transcripts", {
        businessId: owner.businessId,
        callId: freshCallId,
        sequence: 1,
        speaker: "caller",
        text: "fresh transcript",
        final: true,
        expiresAt: FRESH_ISO,
      });
      const legacyTranscriptId = await ctx.db.insert("transcripts", {
        businessId: owner.businessId,
        callId: freshCallId,
        sequence: 2,
        speaker: "agent",
        text: "legacy transcript",
        final: true,
      });
      const expiredPreviewSessionId = await ctx.db.insert("preview_sessions", {
        businessId: owner.businessId,
        userId: owner.userId,
        prompt: "old preview",
        streamId: "stream-old",
        threadId: "thread-old-preview",
        response: "old generated preview answer",
        expiresAt: EXPIRED_ISO,
      });
      const freshPreviewSessionId = await ctx.db.insert("preview_sessions", {
        businessId: owner.businessId,
        userId: owner.userId,
        prompt: "fresh preview",
        streamId: "stream-fresh",
        expiresAt: FRESH_ISO,
      });
      const legacyPreviewSessionId = await ctx.db.insert("preview_sessions", {
        businessId: owner.businessId,
        userId: owner.userId,
        prompt: "legacy preview",
        streamId: "stream-legacy",
      });

      return {
        expiredCallId,
        freshCallId,
        expiredRecordingStorageId,
        freshRecordingStorageId,
        expiredRecordingTokenId,
        standaloneMessageTokenId,
        standaloneRecordingTokenId,
        expiredTranscriptId,
        freshTranscriptId,
        legacyTranscriptId,
        expiredPreviewSessionId,
        freshPreviewSessionId,
        legacyPreviewSessionId,
      };
    });

    const summary = await t.action(internal.privacy.retention.runMvpRetentionCleanup, {
      nowIso: NOW_ISO,
      limit: 100,
    });

    expect(summary.transcripts.deleted).toBe(1);
    expect(summary.callRecordings.scrubbed).toBe(1);
    expect(summary.previewSessions.deleted).toBe(1);
    expect(summary.messageAttachmentDownloadTokens.deleted).toBe(1);
    await t.run(async (ctx: TestRunCtx) => {
      const expiredCall = await ctx.db.get(seeded.expiredCallId);
      const freshCall = await ctx.db.get(seeded.freshCallId);

      expect(expiredCall?.recordingRetentionStatus).toBe("expired");
      expect(expiredCall?.recordingStorageId).toBeUndefined();
      expect(expiredCall?.recordingContentType).toBeUndefined();
      expect(expiredCall?.recordingByteLength).toBeUndefined();
      expect(expiredCall?.recordingDurationMs).toBeUndefined();
      expect(await ctx.storage.get(seeded.expiredRecordingStorageId)).toBeNull();
      expect(await ctx.db.get(seeded.expiredRecordingTokenId)).toBeNull();

      expect(freshCall?.recordingStorageId).toBe(seeded.freshRecordingStorageId);
      expect(await ctx.storage.get(seeded.freshRecordingStorageId)).not.toBeNull();
      expect(await ctx.db.get(seeded.standaloneMessageTokenId)).toBeNull();
      expect(await ctx.db.get(seeded.standaloneRecordingTokenId)).toBeNull();

      expect(await ctx.db.get(seeded.expiredTranscriptId)).toBeNull();
      expect(await ctx.db.get(seeded.freshTranscriptId)).not.toBeNull();
      expect(await ctx.db.get(seeded.legacyTranscriptId)).not.toBeNull();
      expect(await ctx.db.get(seeded.expiredPreviewSessionId)).toBeNull();
      expect(await ctx.db.get(seeded.freshPreviewSessionId)).not.toBeNull();
      expect(await ctx.db.get(seeded.legacyPreviewSessionId)).not.toBeNull();
    });
  });

  it("scrubs voice-message mirror fields when the retained message expires", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-voice-mirrors-owner",
      slug: "mvp-retention-voice-mirrors",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { contactId, conversationId } = await seedConversation(ctx, owner.businessId);
      const callId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        conversationId,
        contactId,
        twilioCallSid: "CA-mvp-retention-voice-mirrors",
        status: "completed",
        startedAt: "2026-05-01T12:00:00.000Z",
      });
      const sessionId = await ctx.db.insert("conversation_sessions", {
        businessId: owner.businessId,
        conversationId,
        channel: "voice",
        callId,
        status: "closed",
        startedAt: 1,
        lastMessageAt: 2,
        summaryGeneratedAt: 3,
        summaryKind: "message_taking",
        summary: {
          kind: "message_taking",
          summary: "Callback: +14165551212\n\nold voice message body",
        },
      });
      const inboxItemId = await ctx.db.insert("inbox_items", {
        businessId: owner.businessId,
        kind: "voice_message",
        title: "Voice message from Taylor Customer",
        body: "Callback: +14165551212\n\nold voice message body",
        relatedId: String(callId),
        status: "open",
      });
      const deliveryId = await ctx.db.insert("operator_notification_deliveries", {
        businessId: owner.businessId,
        userId: owner.userId,
        eventKind: "voiceMessage",
        eventKey: `voiceMessage:${String(inboxItemId)}`,
        channel: "sms",
        status: "sent",
        subject: "Voice message from Taylor Customer",
        body: "Callback: +14165551212\n\nold voice message body",
        sentAt: "2026-05-01T12:00:00.000Z",
        createdAt: "2026-05-01T12:00:00.000Z",
      });
      await ctx.db.patch(conversationId, {
        currentIntent: "message_taking",
        summary: "Callback: +14165551212\n\nold voice message body",
      });
      const messageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        conversationSessionId: sessionId,
        direction: "inbound",
        channel: "voice",
        body: "old voice message body",
        status: "captured",
        aiGenerated: false,
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
      });

      return {
        conversationId,
        deliveryId,
        inboxItemId,
        messageId,
        sessionId,
      };
    });

    const summary = await t.action(internal.privacy.retention.runMvpRetentionCleanup, {
      nowIso: NOW_ISO,
      limit: 100,
    });

    expect(summary.messages.scrubbed).toBe(1);
    await t.run(async (ctx: TestRunCtx) => {
      const message = await ctx.db.get(seeded.messageId);
      const conversation = await ctx.db.get(seeded.conversationId);
      const delivery = await ctx.db.get(seeded.deliveryId);
      const session = await ctx.db.get(seeded.sessionId);
      const inboxItem = await ctx.db.get(seeded.inboxItemId);

      expect(message?.body).toBe(REDACTED_MESSAGE_BODY);
      expect(conversation?.summary).toBe(REDACTED_MESSAGE_BODY);
      expect(session?.summary?.summary).toBe(REDACTED_MESSAGE_BODY);
      expect(inboxItem?.title).toBe("Expired voice message");
      expect(inboxItem?.body).toBe(REDACTED_MESSAGE_BODY);
      expect(delivery?.subject).toBe("Expired voice message");
      expect(delivery?.body).toBe(REDACTED_MESSAGE_BODY);
    });
  });

  it("drains expired rows across multiple batches in one cleanup action", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-batch-owner",
      slug: "mvp-retention-batch",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { conversationId } = await seedConversation(ctx, owner.businessId);
      const messageIds: Array<Id<"messages">> = [];
      for (let index = 0; index < 3; index += 1) {
        messageIds.push(
          await ctx.db.insert("messages", {
            businessId: owner.businessId,
            conversationId,
            direction: "inbound",
            channel: "sms",
            body: `old batched SMS body ${index}`,
            status: "received",
            aiGenerated: false,
            contentRetentionStatus: "active",
            contentExpiresAt: EXPIRED_ISO,
          }),
        );
      }
      return { messageIds };
    });

    const summary = await t.action(internal.privacy.retention.runMvpRetentionCleanup, {
      nowIso: NOW_ISO,
      limit: 2,
    });

    expect(summary.messages.scanned).toBe(3);
    expect(summary.messages.scrubbed).toBe(3);
    await t.run(async (ctx: TestRunCtx) => {
      for (const messageId of seeded.messageIds) {
        const message = await ctx.db.get(messageId);
        expect(message?.body).toBe(REDACTED_MESSAGE_BODY);
        expect(message?.contentRetentionStatus).toBe("expired");
      }
    });
  });

  it("records preview thread handles for later retention cleanup", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-preview-output-owner",
      slug: "mvp-retention-preview-output",
    });

    const previewSessionId = await t.run(async (ctx: TestRunCtx) => {
      return await ctx.db.insert("preview_sessions", {
        businessId: owner.businessId,
        userId: owner.userId,
        prompt: "preview prompt",
        streamId: "preview-output-stream",
        expiresAt: FRESH_ISO,
      });
    });

    await t.mutation(internal.ai.preview.stream.recordPreviewOutput, {
      streamId: "preview-output-stream",
      threadId: "preview-output-thread",
    });

    await t.run(async (ctx: TestRunCtx) => {
      const previewSession = await ctx.db.get(previewSessionId);
      expect(previewSession?.threadId).toBe("preview-output-thread");
    });
  });
});

describe("MVP tenant access boundaries", () => {
  it("rejects non-members across high-risk public business data functions", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-access-owner",
      slug: "mvp-access-owner",
    });
    const outsider = await seedUserWithoutMembership(t, "mvp-access-outsider");

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { contactId, conversationId } = await seedConversation(ctx, owner.businessId);
      await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        direction: "inbound",
        channel: "sms",
        body: "tenant-private message",
        status: "received",
        aiGenerated: false,
      });
      const callId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        conversationId,
        contactId,
        twilioCallSid: "CA-mvp-access",
        status: "completed",
        startedAt: "2026-05-01T12:00:00.000Z",
      });
      await ctx.db.insert("transcripts", {
        businessId: owner.businessId,
        callId,
        sequence: 1,
        speaker: "caller",
        text: "tenant-private transcript",
        final: true,
      });
      await ctx.db.insert("knowledge_documents", {
        businessId: owner.businessId,
        sourceType: "manual",
        title: "Tenant-private policy",
        textContent: "Private knowledge",
        status: "ready",
        tags: [],
        importance: 75,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId: owner.businessId,
        title: "Tenant-private snippet",
        content: "Private snippet",
        tags: [],
        priority: 10,
        active: true,
      });
      await ctx.db.insert("calendar_connections", {
        businessId: owner.businessId,
        provider: "google",
        ownerUserId: owner.userId,
        externalAccountId: "google-account",
        externalAccountEmail: "calendar@example.com",
        selectedCalendarId: "primary",
        selectedCalendarSummary: "Primary",
        status: "connected",
      });
      await ctx.db.insert("billing_accounts", {
        businessId: owner.businessId,
        billingKey: getBillingKey(owner.businessId),
        currentPlan: "pro",
        activeAddons: ["ai_sms"],
        subscriptionState: "active",
        billingContactEmail: "owner@example.com",
        billingContactName: "Owner",
        lastSyncedAt: NOW_ISO,
      });

      return { contactId, conversationId, callId };
    });

    await expect(
      owner.authed.query(api.dashboard.messages.getConversationThread, {
        businessId: owner.businessId,
        conversationId: seeded.conversationId,
      }),
    ).resolves.toMatchObject({
      conversation: expect.objectContaining({ id: seeded.conversationId }),
    });

    const denied = "You do not have access to this business.";
    await expect(
      outsider.query(api.dashboard.overview.getHomeSummary, {
        businessId: owner.businessId,
        locale: "en",
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.dashboard.messages.listConversationSummaries, {
        businessId: owner.businessId,
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.dashboard.messages.getConversationThread, {
        businessId: owner.businessId,
        conversationId: seeded.conversationId,
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.dashboard.contacts.listContacts, {
        businessId: owner.businessId,
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.dashboard.contacts.getContactDetail, {
        businessId: owner.businessId,
        contactId: seeded.contactId,
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.voice.runtime.listRecentCalls, {
        businessId: owner.businessId,
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.voice.runtime.getCallTranscript, {
        businessId: owner.businessId,
        callId: seeded.callId,
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.ai.context.knowledge.listKnowledge, {
        businessId: owner.businessId,
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.integrations.calendar.listCalendarConnections, {
        businessId: owner.businessId,
      }),
    ).rejects.toThrow(denied);
    await expect(
      outsider.query(api.billing.getStatus, {
        businessId: owner.businessId,
      }),
    ).rejects.toThrow(denied);
  });
});
