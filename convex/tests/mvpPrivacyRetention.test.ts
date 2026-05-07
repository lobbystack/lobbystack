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
const RETENTION_MARKER = "__OPE_127_RETENTION_MARKER__";
const FRESH_RETENTION_MARKER = "__OPE_127_FRESH_MARKER__";

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

  it("hides expired content from fresh reads when scheduled cleanup is late", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-read-guards-owner",
      slug: "mvp-retention-read-guards",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { contactId, conversationId } = await seedConversation(ctx, owner.businessId);
      await ctx.db.patch(conversationId, {
        automationState: "human_handoff",
        summary: "Leaky handoff summary before cron",
      });
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
      const inboxItemId = await ctx.db.insert("inbox_items", {
        businessId: owner.businessId,
        kind: "voice_message",
        title: "Expired voice follow-up before cron",
        body: "expired voice follow-up before cron",
        relatedId: String(callId),
        status: "open",
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
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
      const transcriptId = await ctx.db.insert("transcripts", {
        businessId: owner.businessId,
        callId,
        sequence: 1,
        speaker: "caller",
        text: "expired transcript before cron",
        final: true,
        expiresAt: EXPIRED_ISO,
      });
      const previewSessionId = await ctx.db.insert("preview_sessions", {
        businessId: owner.businessId,
        userId: owner.userId,
        prompt: "expired preview before cron",
        streamId: "expired-read-guard-preview-stream",
        expiresAt: EXPIRED_ISO,
      });

      return {
        callId,
        conversationId,
        inboxItemId,
        messageId,
        previewSessionId,
        transcriptId,
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
    expect(
      call && "recordingStorageId" in call ? call.recordingStorageId : undefined,
    ).toBeUndefined();
    expect(call?.recordingRetentionStatus).toBe("expired");
    expect(call?.transcriptReady).toBe(false);
    expect(call?.transcriptPreview).toBeNull();
    expect(call?.followUpTask?.title).toBe("Expired voice message");
    expect(call?.followUpTask?.body).toBe(REDACTED_MESSAGE_BODY);

    const homeSummary = await owner.authed.query(api.dashboard.overview.getHomeSummary, {
      businessId: owner.businessId,
      locale: "en",
    });
    const handoffTask = homeSummary.actionRequired.find(
      (item) => item.kind === "human_handoff",
    );
    expect(handoffTask?.body).toBe(REDACTED_MESSAGE_BODY);
    const voiceTask = homeSummary.actionRequired.find(
      (item) =>
        item.kind === "voice_message" &&
        "taskId" in item &&
        item.taskId === seeded.inboxItemId,
    );
    expect(voiceTask?.title).toBe("Expired voice message");
    expect(voiceTask?.body).toBe(REDACTED_MESSAGE_BODY);

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

    await t.run(async (ctx: TestRunCtx) => {
      const message = await ctx.db.get(seeded.messageId);
      const call = await ctx.db.get(seeded.callId);
      expect(message?.contentRetentionStatus).toBe("active");
      expect(call?.recordingRetentionStatus).toBe("active");
      expect(await ctx.db.get(seeded.transcriptId)).not.toBeNull();
      expect(await ctx.db.get(seeded.previewSessionId)).not.toBeNull();
    });
  });

  it("schedules row-level retention mutations when sensitive content is created", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-schedule-owner",
      slug: "mvp-retention-schedule",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { contactId, conversationId } = await seedConversation(ctx, owner.businessId);
      const callId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        conversationId,
        contactId,
        twilioCallSid: "CA-mvp-retention-schedule",
        status: "completed",
        startedAt: NOW_ISO,
      });
      const recordingStorageId = await storeTestBlob(ctx, "scheduled recording", "audio/wav");
      return { callId, contactId, recordingStorageId };
    });

    await t.mutation(internal.conversations.webhooks.storeInboundMessage, {
      businessId: owner.businessId,
      contactId: seeded.contactId,
      channel: "sms",
      body: "message scheduled for retention",
    });
    await t.mutation(internal.voice.runtime.appendTranscriptSegment, {
      businessId: owner.businessId,
      callId: seeded.callId,
      sequence: 1,
      speaker: "caller",
      text: "transcript scheduled for retention",
      final: true,
    });
    await t.mutation(internal.voice.runtime.attachCallRecording, {
      callId: seeded.callId,
      recordingStorageId: seeded.recordingStorageId,
      recordingContentType: "audio/wav",
      recordingByteLength: 19,
    });
    await t.mutation(internal.operatorNotifications.reserveDelivery, {
      businessId: owner.businessId,
      userId: owner.userId,
      eventKind: "voiceMessage",
      eventKey: "voiceMessage:scheduled-retention",
      channel: "email",
      subject: "Voice message scheduled for retention",
      body: "operator delivery scheduled for retention",
      contentExpiresAt: FRESH_ISO,
    });

    const scheduledNames = await t.run(async (ctx: TestRunCtx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return jobs.map((job) => String(job.name));
    });

    expect(scheduledNames).toContain("privacy/retention:scrubMessageContentAtExpiry");
    expect(scheduledNames).toContain("privacy/retention:deleteTranscriptAtExpiry");
    expect(scheduledNames).toContain("privacy/retention:scrubCallRecordingAtExpiry");
    expect(scheduledNames).toContain(
      "privacy/retention:scrubOperatorNotificationDeliveryContentAtExpiry",
    );
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
      const pausedSmsDeliveryId = await ctx.db.insert("operator_notification_deliveries", {
        businessId: owner.businessId,
        userId: owner.userId,
        eventKind: "pausedSms",
        eventKey: `pausedSms:${String(expiredMessageId)}`,
        channel: "sms",
        status: "sent",
        subject: "New message in paused SMS conversation",
        body: "A customer sent a new SMS while automation is paused.\n\nFrom: +14165550001\n\nold sensitive SMS body",
        sentAt: "2026-05-01T12:00:00.000Z",
        createdAt: "2026-05-01T12:00:00.000Z",
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
        pausedSmsDeliveryId,
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
      expect(await ctx.db.get(seeded.pausedSmsDeliveryId)).toMatchObject({
        subject: "Expired paused SMS message",
        body: REDACTED_MESSAGE_BODY,
      });
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

  it("deletes expired abandoned staged and sending attachment uploads", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-abandoned-upload-owner",
      slug: "mvp-retention-abandoned-upload",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { conversationId } = await seedConversation(ctx, owner.businessId);
      const expiredStagedStorageId = await storeTestBlob(ctx, "expired staged upload");
      const expiredStagedPreviewStorageId = await storeTestBlob(
        ctx,
        "expired staged preview",
        "image/png",
      );
      const expiredSendingStorageId = await storeTestBlob(ctx, "expired sending upload");
      const freshStorageId = await storeTestBlob(ctx, "fresh staged upload");
      const linkedStorageId = await storeTestBlob(ctx, "linked staged upload");
      const linkedMessageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "linked message body",
        status: "sent",
        aiGenerated: false,
      });

      const expiredStagedUploadId = await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId,
        uploaderUserId: owner.userId,
        storageId: expiredStagedStorageId,
        fileName: "expired-staged.txt",
        contentType: "text/plain",
        byteLength: 21,
        previewStorageId: expiredStagedPreviewStorageId,
        previewFileName: "expired-staged.png",
        previewContentType: "image/png",
        previewByteLength: 22,
        deliveryMode: "link",
        status: "staged",
        expiresAt: EXPIRED_ISO,
      });
      const expiredSendingUploadId = await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId,
        uploaderUserId: owner.userId,
        storageId: expiredSendingStorageId,
        fileName: "expired-sending.txt",
        contentType: "text/plain",
        byteLength: 22,
        deliveryMode: "link",
        status: "sending",
        expiresAt: EXPIRED_ISO,
      });
      const freshUploadId = await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId,
        uploaderUserId: owner.userId,
        storageId: freshStorageId,
        fileName: "fresh-staged.txt",
        contentType: "text/plain",
        byteLength: 18,
        deliveryMode: "link",
        status: "staged",
        expiresAt: FRESH_ISO,
      });
      const linkedUploadId = await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId,
        uploaderUserId: owner.userId,
        storageId: linkedStorageId,
        fileName: "linked-staged.txt",
        contentType: "text/plain",
        byteLength: 19,
        deliveryMode: "link",
        status: "staged",
        expiresAt: EXPIRED_ISO,
        sentMessageId: linkedMessageId,
      });

      return {
        expiredSendingStorageId,
        expiredSendingUploadId,
        expiredStagedPreviewStorageId,
        expiredStagedStorageId,
        expiredStagedUploadId,
        freshStorageId,
        freshUploadId,
        linkedStorageId,
        linkedUploadId,
      };
    });

    const summary = await t.action(internal.privacy.retention.runMvpRetentionCleanup, {
      nowIso: NOW_ISO,
      limit: 100,
    });

    expect(summary.abandonedMessageAttachmentUploads.deleted).toBe(2);
    await t.run(async (ctx: TestRunCtx) => {
      expect(await ctx.db.get(seeded.expiredStagedUploadId)).toBeNull();
      expect(await ctx.db.get(seeded.expiredSendingUploadId)).toBeNull();
      expect(await ctx.storage.get(seeded.expiredStagedStorageId)).toBeNull();
      expect(await ctx.storage.get(seeded.expiredStagedPreviewStorageId)).toBeNull();
      expect(await ctx.storage.get(seeded.expiredSendingStorageId)).toBeNull();

      expect(await ctx.db.get(seeded.freshUploadId)).not.toBeNull();
      expect(await ctx.storage.get(seeded.freshStorageId)).not.toBeNull();
      expect(await ctx.db.get(seeded.linkedUploadId)).not.toBeNull();
      expect(await ctx.db.get(seeded.linkedUploadId)).toMatchObject({
        status: "consumed",
      });
      expect(await ctx.storage.get(seeded.linkedStorageId)).not.toBeNull();
    });
  });

  it("does not loop on full batches of linked expired attachment uploads", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-linked-upload-owner",
      slug: "mvp-retention-linked-upload",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const { conversationId } = await seedConversation(ctx, owner.businessId);
      const messageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "linked message body",
        status: "sent",
        aiGenerated: false,
      });
      const storageId = await storeTestBlob(ctx, "linked expired upload");
      const uploadId = await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId,
        uploaderUserId: owner.userId,
        storageId,
        fileName: "linked-expired.txt",
        contentType: "text/plain",
        byteLength: 21,
        deliveryMode: "link",
        status: "staged",
        expiresAt: EXPIRED_ISO,
        sentMessageId: messageId,
      });
      return { storageId, uploadId };
    });

    const summary = await t.action(internal.privacy.retention.runMvpRetentionCleanup, {
      nowIso: NOW_ISO,
      limit: 1,
    });

    expect(summary.abandonedMessageAttachmentUploads.scanned).toBe(1);
    expect(summary.abandonedMessageAttachmentUploads.deleted).toBe(0);
    await t.run(async (ctx: TestRunCtx) => {
      expect(await ctx.db.get(seeded.uploadId)).toMatchObject({
        status: "consumed",
      });
      expect(await ctx.storage.get(seeded.storageId)).not.toBeNull();
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

  it("removes a sensitive marker from retained first-party communication mirrors", async () => {
    const t = convexTest(schema, convexModules);
    const owner = await seedWorkspace(t, {
      subject: "mvp-retention-marker-owner",
      slug: "mvp-retention-marker",
    });

    const seeded = await t.run(async (ctx: TestRunCtx) => {
      const sms = await seedConversation(ctx, owner.businessId);
      const smsSessionId = await ctx.db.insert("conversation_sessions", {
        businessId: owner.businessId,
        conversationId: sms.conversationId,
        channel: "sms",
        status: "closed",
        startedAt: 1,
        lastMessageAt: 2,
        closedAt: 2,
        summaryGeneratedAt: 3,
        summaryKind: "summary",
        summary: {
          kind: "summary",
          summary: `SMS session ${RETENTION_MARKER}`,
        },
      });
      await ctx.db.patch(sms.conversationId, {
        summary: `SMS conversation ${RETENTION_MARKER}`,
      });
      const smsStorageId = await storeTestBlob(ctx, `sms storage ${RETENTION_MARKER}`);
      const smsPreviewStorageId = await storeTestBlob(
        ctx,
        `sms preview ${RETENTION_MARKER}`,
        "image/png",
      );
      const smsMessageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId: sms.conversationId,
        conversationSessionId: smsSessionId,
        direction: "inbound",
        channel: "sms",
        fromPhoneNumber: "+14165559999",
        body: `expired sms ${RETENTION_MARKER}`,
        status: "received",
        aiGenerated: false,
        media: [
          {
            storageId: smsStorageId,
            fileName: `sms-${RETENTION_MARKER}.txt`,
            contentType: "text/plain",
            byteLength: 12,
            previewStorageId: smsPreviewStorageId,
            previewFileName: `sms-${RETENTION_MARKER}.png`,
            previewContentType: "image/png",
            previewByteLength: 10,
            deliveryMode: "link",
          },
        ],
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
      });
      const smsUploadId = await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId: sms.conversationId,
        uploaderUserId: owner.userId,
        storageId: smsStorageId,
        fileName: `sent-${RETENTION_MARKER}.txt`,
        contentType: "text/plain",
        byteLength: 12,
        previewStorageId: smsPreviewStorageId,
        previewFileName: `sent-${RETENTION_MARKER}.png`,
        previewContentType: "image/png",
        previewByteLength: 10,
        deliveryMode: "link",
        status: "sent",
        sentMessageId: smsMessageId,
      });
      const smsTokenId = await ctx.db.insert("message_attachment_download_tokens", {
        businessId: owner.businessId,
        messageId: smsMessageId,
        storageId: smsStorageId,
        fileName: `token-${RETENTION_MARKER}.txt`,
        contentType: "text/plain",
        disposition: "attachment",
        nonce: `nonce-${RETENTION_MARKER}`,
        expiresAt: FRESH_ISO,
      });
      const pausedDeliveryId = await ctx.db.insert("operator_notification_deliveries", {
        businessId: owner.businessId,
        userId: owner.userId,
        eventKind: "pausedSms",
        eventKey: `pausedSms:${String(smsMessageId)}`,
        channel: "email",
        status: "sent",
        subject: `Paused ${RETENTION_MARKER}`,
        body: `Paused body ${RETENTION_MARKER}`,
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
        sentAt: "2026-05-01T12:00:00.000Z",
        createdAt: "2026-05-01T12:00:00.000Z",
      });

      const voice = await seedConversation(ctx, owner.businessId);
      const voiceCallId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        conversationId: voice.conversationId,
        contactId: voice.contactId,
        twilioCallSid: "CA-marker-voice",
        status: "completed",
        startedAt: "2026-05-01T12:00:00.000Z",
      });
      const voiceSessionId = await ctx.db.insert("conversation_sessions", {
        businessId: owner.businessId,
        conversationId: voice.conversationId,
        channel: "voice",
        callId: voiceCallId,
        status: "closed",
        startedAt: 1,
        lastMessageAt: 2,
        closedAt: 2,
        summaryGeneratedAt: 3,
        summaryKind: "summary",
        summary: {
          kind: "summary",
          summary: `Voice session abstract ${RETENTION_MARKER}`,
        },
      });
      await ctx.db.patch(voice.conversationId, {
        currentIntent: "summary",
        summary: `Voice conversation abstract ${RETENTION_MARKER}`,
      });
      const voiceMessageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId: voice.conversationId,
        conversationSessionId: voiceSessionId,
        direction: "inbound",
        channel: "voice",
        body: `voice note ${RETENTION_MARKER}`,
        status: "captured",
        aiGenerated: false,
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
      });
      const voiceInboxItemId = await ctx.db.insert("inbox_items", {
        businessId: owner.businessId,
        kind: "voice_message",
        title: `Voice title ${RETENTION_MARKER}`,
        body: `Voice body ${RETENTION_MARKER}`,
        relatedId: String(voiceCallId),
        status: "open",
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
      });
      const voiceDeliveryId = await ctx.db.insert("operator_notification_deliveries", {
        businessId: owner.businessId,
        userId: owner.userId,
        eventKind: "voiceMessage",
        eventKey: `voiceMessage:${String(voiceInboxItemId)}`,
        channel: "email",
        status: "sent",
        subject: `Voice delivery ${RETENTION_MARKER}`,
        body: `Voice delivery body ${RETENTION_MARKER}`,
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
        sentAt: "2026-05-01T12:00:00.000Z",
        createdAt: "2026-05-01T12:00:00.000Z",
      });

      const orphanCallId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        twilioCallSid: "CA-marker-orphan-voice",
        status: "completed",
        startedAt: "2026-05-01T12:00:00.000Z",
      });
      const orphanInboxItemId = await ctx.db.insert("inbox_items", {
        businessId: owner.businessId,
        kind: "voice_message",
        title: `Orphan voice title ${RETENTION_MARKER}`,
        body: `Orphan voice body ${RETENTION_MARKER}`,
        relatedId: String(orphanCallId),
        status: "open",
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
      });
      const orphanDeliveryId = await ctx.db.insert("operator_notification_deliveries", {
        businessId: owner.businessId,
        userId: owner.userId,
        eventKind: "voiceMessage",
        eventKey: `voiceMessage:${String(orphanInboxItemId)}`,
        channel: "sms",
        status: "sent",
        subject: `Orphan delivery ${RETENTION_MARKER}`,
        body: `Orphan delivery body ${RETENTION_MARKER}`,
        contentRetentionStatus: "active",
        contentExpiresAt: EXPIRED_ISO,
        sentAt: "2026-05-01T12:00:00.000Z",
        createdAt: "2026-05-01T12:00:00.000Z",
      });

      const recordingStorageId = await storeTestBlob(
        ctx,
        `recording ${RETENTION_MARKER}`,
        "audio/wav",
      );
      const recordingCallId = await ctx.db.insert("calls", {
        businessId: owner.businessId,
        twilioCallSid: "CA-marker-recording",
        status: "completed",
        startedAt: "2026-05-01T12:00:00.000Z",
        recordingStorageId,
        recordingContentType: "audio/wav",
        recordingByteLength: 12,
        recordingRetentionStatus: "active",
        recordingExpiresAt: EXPIRED_ISO,
      });
      const recordingTokenId = await ctx.db.insert("call_recording_download_tokens", {
        businessId: owner.businessId,
        callId: recordingCallId,
        storageId: recordingStorageId,
        fileName: `recording-${RETENTION_MARKER}.wav`,
        contentType: "audio/wav",
        nonce: `recording-${RETENTION_MARKER}`,
        expiresAt: FRESH_ISO,
      });
      const transcriptId = await ctx.db.insert("transcripts", {
        businessId: owner.businessId,
        callId: recordingCallId,
        sequence: 1,
        speaker: "caller",
        text: `transcript ${RETENTION_MARKER}`,
        final: true,
        expiresAt: EXPIRED_ISO,
      });

      const previewSessionId = await ctx.db.insert("preview_sessions", {
        businessId: owner.businessId,
        userId: owner.userId,
        prompt: `preview prompt ${RETENTION_MARKER}`,
        streamId: "marker-preview-stream",
        threadId: "marker-preview-thread",
        response: `preview response ${RETENTION_MARKER}`,
        expiresAt: EXPIRED_ISO,
      });
      const stagedStorageId = await storeTestBlob(ctx, `staged ${RETENTION_MARKER}`);
      const stagedUploadId = await ctx.db.insert("message_attachment_uploads", {
        businessId: owner.businessId,
        conversationId: sms.conversationId,
        uploaderUserId: owner.userId,
        storageId: stagedStorageId,
        fileName: `staged-${RETENTION_MARKER}.txt`,
        contentType: "text/plain",
        byteLength: 12,
        deliveryMode: "link",
        status: "staged",
        expiresAt: EXPIRED_ISO,
      });

      const fresh = await seedConversation(ctx, owner.businessId);
      const freshMessageId = await ctx.db.insert("messages", {
        businessId: owner.businessId,
        conversationId: fresh.conversationId,
        direction: "inbound",
        channel: "sms",
        body: `fresh ${FRESH_RETENTION_MARKER}`,
        status: "received",
        aiGenerated: false,
        contentRetentionStatus: "active",
        contentExpiresAt: FRESH_ISO,
      });
      const freshInboxItemId = await ctx.db.insert("inbox_items", {
        businessId: owner.businessId,
        kind: "voice_message",
        title: `Fresh title ${FRESH_RETENTION_MARKER}`,
        body: `Fresh body ${FRESH_RETENTION_MARKER}`,
        relatedId: "fresh-call",
        status: "open",
        contentRetentionStatus: "active",
        contentExpiresAt: FRESH_ISO,
      });
      const freshDeliveryId = await ctx.db.insert("operator_notification_deliveries", {
        businessId: owner.businessId,
        userId: owner.userId,
        eventKind: "pausedSms",
        eventKey: "pausedSms:fresh-marker",
        channel: "email",
        status: "sent",
        subject: `Fresh subject ${FRESH_RETENTION_MARKER}`,
        body: `Fresh delivery ${FRESH_RETENTION_MARKER}`,
        contentRetentionStatus: "active",
        contentExpiresAt: FRESH_ISO,
        sentAt: "2026-05-01T12:00:00.000Z",
        createdAt: "2026-05-01T12:00:00.000Z",
      });

      return {
        freshDeliveryId,
        freshInboxItemId,
        freshMessageId,
        orphanDeliveryId,
        orphanInboxItemId,
        pausedDeliveryId,
        previewSessionId,
        recordingStorageId,
        recordingTokenId,
        smsMessageId,
        smsPreviewStorageId,
        smsSessionId,
        smsStorageId,
        smsTokenId,
        smsUploadId,
        stagedStorageId,
        stagedUploadId,
        transcriptId,
        voiceDeliveryId,
        voiceInboxItemId,
        voiceMessageId,
        voiceSessionId,
      };
    });

    const summary = await t.action(internal.privacy.retention.runMvpRetentionCleanup, {
      nowIso: NOW_ISO,
      limit: 100,
    });

    expect(summary.messages.scrubbed).toBe(2);
    expect(summary.inboxItems.scrubbed).toBe(1);
    expect(summary.operatorNotificationDeliveries.scrubbed).toBe(1);
    expect(summary.transcripts.deleted).toBe(1);
    expect(summary.callRecordings.scrubbed).toBe(1);
    expect(summary.previewSessions.deleted).toBe(1);
    expect(summary.abandonedMessageAttachmentUploads.deleted).toBe(1);

    await t.run(async (ctx: TestRunCtx) => {
      expect(await ctx.db.get(seeded.smsTokenId)).toBeNull();
      expect(await ctx.db.get(seeded.smsUploadId)).toBeNull();
      expect(await ctx.db.get(seeded.recordingTokenId)).toBeNull();
      expect(await ctx.db.get(seeded.transcriptId)).toBeNull();
      expect(await ctx.db.get(seeded.previewSessionId)).toBeNull();
      expect(await ctx.db.get(seeded.stagedUploadId)).toBeNull();
      expect(await ctx.storage.get(seeded.smsStorageId)).toBeNull();
      expect(await ctx.storage.get(seeded.smsPreviewStorageId)).toBeNull();
      expect(await ctx.storage.get(seeded.recordingStorageId)).toBeNull();
      expect(await ctx.storage.get(seeded.stagedStorageId)).toBeNull();

      expect(await ctx.db.get(seeded.smsMessageId)).toMatchObject({
        body: REDACTED_MESSAGE_BODY,
        contentRetentionStatus: "expired",
      });
      expect(await ctx.db.get(seeded.voiceMessageId)).toMatchObject({
        body: REDACTED_MESSAGE_BODY,
        contentRetentionStatus: "expired",
      });
      expect(await ctx.db.get(seeded.pausedDeliveryId)).toMatchObject({
        body: REDACTED_MESSAGE_BODY,
        contentRetentionStatus: "expired",
      });
      expect(await ctx.db.get(seeded.voiceDeliveryId)).toMatchObject({
        body: REDACTED_MESSAGE_BODY,
        contentRetentionStatus: "expired",
      });
      expect(await ctx.db.get(seeded.orphanDeliveryId)).toMatchObject({
        body: REDACTED_MESSAGE_BODY,
        contentRetentionStatus: "expired",
      });
      expect(await ctx.db.get(seeded.voiceInboxItemId)).toMatchObject({
        body: REDACTED_MESSAGE_BODY,
        contentRetentionStatus: "expired",
      });
      expect(await ctx.db.get(seeded.orphanInboxItemId)).toMatchObject({
        body: REDACTED_MESSAGE_BODY,
        contentRetentionStatus: "expired",
      });

      expect(await ctx.db.get(seeded.freshMessageId)).toMatchObject({
        body: `fresh ${FRESH_RETENTION_MARKER}`,
        contentRetentionStatus: "active",
      });
      expect(await ctx.db.get(seeded.freshInboxItemId)).toMatchObject({
        body: `Fresh body ${FRESH_RETENTION_MARKER}`,
        contentRetentionStatus: "active",
      });
      expect(await ctx.db.get(seeded.freshDeliveryId)).toMatchObject({
        body: `Fresh delivery ${FRESH_RETENTION_MARKER}`,
        contentRetentionStatus: "active",
      });

      const remainingRows = [
        ...(await ctx.db.query("messages").collect()),
        ...(await ctx.db.query("conversations").collect()),
        ...(await ctx.db.query("conversation_sessions").collect()),
        ...(await ctx.db.query("inbox_items").collect()),
        ...(await ctx.db.query("operator_notification_deliveries").collect()),
        ...(await ctx.db.query("calls").collect()),
        ...(await ctx.db.query("transcripts").collect()),
        ...(await ctx.db.query("preview_sessions").collect()),
        ...(await ctx.db.query("message_attachment_uploads").collect()),
        ...(await ctx.db.query("message_attachment_download_tokens").collect()),
        ...(await ctx.db.query("call_recording_download_tokens").collect()),
      ];
      for (const row of remainingRows) {
        expect(JSON.stringify(row)).not.toContain(RETENTION_MARKER);
      }
      expect(JSON.stringify(remainingRows)).toContain(FRESH_RETENTION_MARKER);
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
