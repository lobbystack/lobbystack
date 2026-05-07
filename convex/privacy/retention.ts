import { v } from "convex/values";
import type { StreamId } from "@convex-dev/persistent-text-streaming";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  persistentTextStreaming,
  receptionistAgent,
} from "../lib/components";
import {
  observedInternalAction as internalAction,
  observedInternalMutation as internalMutation,
} from "../telemetry/observedFunctions";

export const RAW_SENSITIVE_CONTENT_RETENTION_DAYS = 90;
export const CALL_RECORDING_RETENTION_DAYS = RAW_SENSITIVE_CONTENT_RETENTION_DAYS;
export const MESSAGE_CONTENT_RETENTION_DAYS = 365;
export const SENSITIVE_CONTENT_RETENTION_DAYS = RAW_SENSITIVE_CONTENT_RETENTION_DAYS;
export const RAW_SENSITIVE_CONTENT_RETENTION_MS =
  RAW_SENSITIVE_CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const CALL_RECORDING_RETENTION_MS = RAW_SENSITIVE_CONTENT_RETENTION_MS;
export const MESSAGE_CONTENT_RETENTION_MS =
  MESSAGE_CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const SENSITIVE_CONTENT_RETENTION_MS = RAW_SENSITIVE_CONTENT_RETENTION_MS;
export const REDACTED_MESSAGE_BODY = "[Expired by 365-day retention policy]";

const DEFAULT_RETENTION_CLEANUP_LIMIT = 100;
const MAX_RETENTION_CLEANUP_LIMIT = 200;

type CleanupArgs = {
  nowIso: string;
  limit: number;
};

type CleanupCount = {
  scanned: number;
  deleted: number;
  scrubbed: number;
};

type RetentionCleanupSummary = {
  nowIso: string;
  messages: CleanupCount;
  transcripts: CleanupCount;
  callRecordings: CleanupCount;
  previewSessions: CleanupCount;
  messageAttachmentDownloadTokens: CleanupCount;
  callRecordingDownloadTokens: CleanupCount;
};

export function getSensitiveContentExpiresAt(nowMs: number = Date.now()): string {
  return new Date(nowMs + SENSITIVE_CONTENT_RETENTION_MS).toISOString();
}

export function getCallRecordingExpiresAt(nowMs: number = Date.now()): string {
  return new Date(nowMs + CALL_RECORDING_RETENTION_MS).toISOString();
}

export function getMessageContentExpiresAt(nowMs: number = Date.now()): string {
  return new Date(nowMs + MESSAGE_CONTENT_RETENTION_MS).toISOString();
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_RETENTION_CLEANUP_LIMIT;
  }
  return Math.max(1, Math.min(Math.floor(limit), MAX_RETENTION_CLEANUP_LIMIT));
}

function isExpired(expiresAt: string | undefined, nowIso: string): expiresAt is string {
  return typeof expiresAt === "string" && expiresAt.length > 0 && expiresAt <= nowIso;
}

function isMissingOrInvalidComponentReferenceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("not found") ||
    message.includes("is not registered") ||
    message.includes("Invalid") ||
    message.includes("Value does not match validator")
  );
}

function isMissingOrInvalidStorageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("not found") ||
    message.includes("non-existent doc") ||
    message.includes("Invalid storage ID") ||
    message.includes("does not exist")
  );
}

function addStorageId(
  storageIds: Set<Id<"_storage">>,
  storageId: Id<"_storage"> | undefined,
): void {
  if (storageId !== undefined) {
    storageIds.add(storageId);
  }
}

async function deleteStorageIds(
  ctx: MutationCtx,
  storageIds: Set<Id<"_storage">>,
): Promise<number> {
  let deleted = 0;
  for (const storageId of storageIds) {
    try {
      await ctx.storage.delete(storageId);
      deleted += 1;
    } catch (error) {
      if (!isMissingOrInvalidStorageError(error)) {
        throw error;
      }
    }
  }
  return deleted;
}

async function deleteMessageAttachmentTokens(
  ctx: MutationCtx,
  messageId: Id<"messages">,
): Promise<number> {
  const tokens = await ctx.db
    .query("message_attachment_download_tokens")
    .withIndex("by_message_id", (q) => q.eq("messageId", messageId))
    .take(MAX_RETENTION_CLEANUP_LIMIT);

  for (const token of tokens) {
    await ctx.db.delete(token._id);
  }

  return tokens.length;
}

async function deleteSentAttachmentUploads(
  ctx: MutationCtx,
  messageId: Id<"messages">,
  storageIds: Set<Id<"_storage">>,
): Promise<number> {
  const uploads = await ctx.db
    .query("message_attachment_uploads")
    .withIndex("by_sent_message_id", (q) => q.eq("sentMessageId", messageId))
    .take(MAX_RETENTION_CLEANUP_LIMIT);

  for (const upload of uploads) {
    addStorageId(storageIds, upload.storageId);
    addStorageId(storageIds, upload.previewStorageId);
    await ctx.db.delete(upload._id);
  }

  return uploads.length;
}

function collectMessageStorageIds(
  message: Doc<"messages">,
  storageIds: Set<Id<"_storage">>,
): void {
  for (const attachment of message.media ?? []) {
    addStorageId(storageIds, attachment.storageId);
    addStorageId(storageIds, attachment.previewStorageId);
  }
}

async function deleteConversationAgentThread(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
): Promise<number> {
  const aiState = await ctx.db
    .query("conversation_ai_state")
    .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
    .unique();
  if (!aiState) {
    return 0;
  }

  try {
    await receptionistAgent.deleteThreadAsync(ctx, {
      threadId: aiState.threadId,
    });
  } catch (error) {
    if (!isMissingOrInvalidComponentReferenceError(error)) {
      throw error;
    }
  }
  await ctx.db.delete(aiState._id);
  return 1;
}

async function deletePreviewAgentThread(
  ctx: MutationCtx,
  threadId: string | undefined,
): Promise<number> {
  if (!threadId) {
    return 0;
  }

  try {
    await receptionistAgent.deleteThreadAsync(ctx, { threadId });
  } catch (error) {
    if (!isMissingOrInvalidComponentReferenceError(error)) {
      throw error;
    }
  }
  return 1;
}

async function deletePreviewStream(
  ctx: MutationCtx,
  streamId: string,
): Promise<number> {
  try {
    await persistentTextStreaming.deleteStream(ctx, streamId as StreamId);
  } catch (error) {
    if (!isMissingOrInvalidComponentReferenceError(error)) {
      throw error;
    }
  }
  return 1;
}

async function scrubVoiceMessageMirrors(
  ctx: MutationCtx,
  message: Doc<"messages">,
): Promise<void> {
  if (message.channel !== "voice") {
    return;
  }

  const conversation = await ctx.db.get(message.conversationId);
  if (
    conversation &&
    (conversation.currentIntent === "message_taking" ||
      conversation.summary?.includes(message.body))
  ) {
    await ctx.db.patch(conversation._id, {
      summary: REDACTED_MESSAGE_BODY,
    });
  }

  const session = message.conversationSessionId
    ? await ctx.db.get(message.conversationSessionId)
    : null;
  if (!session || session.channel !== "voice") {
    return;
  }

  if (session.summary) {
    await ctx.db.patch(session._id, {
      summary: {
        ...session.summary,
        summary: REDACTED_MESSAGE_BODY,
      },
    });
  }

  if (!session.callId) {
    return;
  }

  async function scrubOperatorNotificationDeliveries(
    inboxItemId: Id<"inbox_items">,
  ): Promise<void> {
    const deliveries = await ctx.db
      .query("operator_notification_deliveries")
      .withIndex("by_business_id_and_event_kind_and_event_key", (q) =>
        q
          .eq("businessId", message.businessId)
          .eq("eventKind", "voiceMessage")
          .eq("eventKey", `voiceMessage:${String(inboxItemId)}`),
      )
      .take(MAX_RETENTION_CLEANUP_LIMIT);

    for (const delivery of deliveries) {
      await ctx.db.patch(delivery._id, {
        subject: "Expired voice message",
        body: REDACTED_MESSAGE_BODY,
      });
    }
  }

  const inboxItems = await ctx.db
    .query("inbox_items")
    .withIndex("by_kind_and_related_id", (q) =>
      q.eq("kind", "voice_message").eq("relatedId", String(session.callId)),
    )
    .take(MAX_RETENTION_CLEANUP_LIMIT);
  for (const item of inboxItems) {
    await scrubOperatorNotificationDeliveries(item._id);
    await ctx.db.patch(item._id, {
      title: "Expired voice message",
      body: REDACTED_MESSAGE_BODY,
    });
  }
}

async function drainCleanup(
  runBatch: () => Promise<CleanupCount>,
  limit: number,
): Promise<CleanupCount> {
  const total: CleanupCount = {
    scanned: 0,
    deleted: 0,
    scrubbed: 0,
  };

  while (true) {
    const batch = await runBatch();
    total.scanned += batch.scanned;
    total.deleted += batch.deleted;
    total.scrubbed += batch.scrubbed;

    if (batch.scanned < limit) {
      return total;
    }
  }
}

async function deleteCallRecordingTokens(
  ctx: MutationCtx,
  callId: Id<"calls">,
): Promise<number> {
  const tokens = await ctx.db
    .query("call_recording_download_tokens")
    .withIndex("by_call_id", (q) => q.eq("callId", callId))
    .take(MAX_RETENTION_CLEANUP_LIMIT);

  for (const token of tokens) {
    await ctx.db.delete(token._id);
  }

  return tokens.length;
}

export const scrubExpiredMessages = internalMutation({
  args: {
    nowIso: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args: CleanupArgs): Promise<CleanupCount> => {
    const limit = normalizeLimit(args.limit);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_content_retention_status_and_content_expires_at", (q) =>
        q
          .eq("contentRetentionStatus", "active")
          .gt("contentExpiresAt", "")
          .lte("contentExpiresAt", args.nowIso),
      )
      .take(limit);

    let scrubbed = 0;
    for (const message of messages) {
      if (!isExpired(message.contentExpiresAt, args.nowIso)) {
        continue;
      }

      const storageIds = new Set<Id<"_storage">>();
      collectMessageStorageIds(message, storageIds);
      await deleteSentAttachmentUploads(ctx, message._id, storageIds);
      await deleteMessageAttachmentTokens(ctx, message._id);
      await deleteStorageIds(ctx, storageIds);
      await scrubVoiceMessageMirrors(ctx, message);
      await deleteConversationAgentThread(ctx, message.conversationId);

      await ctx.db.patch(message._id, {
        body: REDACTED_MESSAGE_BODY,
        fromPhoneNumber: undefined,
        media: undefined,
        contentRetentionStatus: "expired",
      });
      scrubbed += 1;
    }

    return {
      scanned: messages.length,
      deleted: 0,
      scrubbed,
    };
  },
});

export const deleteExpiredTranscripts = internalMutation({
  args: {
    nowIso: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args: CleanupArgs): Promise<CleanupCount> => {
    const limit = normalizeLimit(args.limit);
    const transcripts = await ctx.db
      .query("transcripts")
      .withIndex("by_expires_at", (q) => q.gt("expiresAt", "").lte("expiresAt", args.nowIso))
      .take(limit);

    let deleted = 0;
    for (const transcript of transcripts) {
      if (!isExpired(transcript.expiresAt, args.nowIso)) {
        continue;
      }
      await ctx.db.delete(transcript._id);
      deleted += 1;
    }

    return {
      scanned: transcripts.length,
      deleted,
      scrubbed: 0,
    };
  },
});

export const scrubExpiredCallRecordings = internalMutation({
  args: {
    nowIso: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args: CleanupArgs): Promise<CleanupCount> => {
    const limit = normalizeLimit(args.limit);
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_recording_retention_status_and_recording_expires_at", (q) =>
        q
          .eq("recordingRetentionStatus", "active")
          .gt("recordingExpiresAt", "")
          .lte("recordingExpiresAt", args.nowIso),
      )
      .take(limit);

    let scrubbed = 0;
    for (const call of calls) {
      if (!isExpired(call.recordingExpiresAt, args.nowIso)) {
        continue;
      }

      const storageIds = new Set<Id<"_storage">>();
      addStorageId(storageIds, call.recordingStorageId);
      await deleteCallRecordingTokens(ctx, call._id);
      await deleteStorageIds(ctx, storageIds);

      await ctx.db.patch(call._id, {
        recordingStorageId: undefined,
        recordingContentType: undefined,
        recordingByteLength: undefined,
        recordingDurationMs: undefined,
        recordingRetentionStatus: "expired",
      });
      scrubbed += 1;
    }

    return {
      scanned: calls.length,
      deleted: 0,
      scrubbed,
    };
  },
});

export const deleteExpiredPreviewSessions = internalMutation({
  args: {
    nowIso: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args: CleanupArgs): Promise<CleanupCount> => {
    const limit = normalizeLimit(args.limit);
    const sessions = await ctx.db
      .query("preview_sessions")
      .withIndex("by_expires_at", (q) => q.gt("expiresAt", "").lte("expiresAt", args.nowIso))
      .take(limit);

    let deleted = 0;
    for (const session of sessions) {
      if (!isExpired(session.expiresAt, args.nowIso)) {
        continue;
      }
      await deletePreviewAgentThread(ctx, session.threadId);
      await deletePreviewStream(ctx, session.streamId);
      await ctx.db.delete(session._id);
      deleted += 1;
    }

    return {
      scanned: sessions.length,
      deleted,
      scrubbed: 0,
    };
  },
});

export const deleteExpiredMessageAttachmentDownloadTokens = internalMutation({
  args: {
    nowIso: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args: CleanupArgs): Promise<CleanupCount> => {
    const limit = normalizeLimit(args.limit);
    const tokens = await ctx.db
      .query("message_attachment_download_tokens")
      .withIndex("by_expires_at", (q) => q.gt("expiresAt", "").lte("expiresAt", args.nowIso))
      .take(limit);

    for (const token of tokens) {
      await ctx.db.delete(token._id);
    }

    return {
      scanned: tokens.length,
      deleted: tokens.length,
      scrubbed: 0,
    };
  },
});

export const deleteExpiredCallRecordingDownloadTokens = internalMutation({
  args: {
    nowIso: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args: CleanupArgs): Promise<CleanupCount> => {
    const limit = normalizeLimit(args.limit);
    const tokens = await ctx.db
      .query("call_recording_download_tokens")
      .withIndex("by_expires_at", (q) => q.gt("expiresAt", "").lte("expiresAt", args.nowIso))
      .take(limit);

    for (const token of tokens) {
      await ctx.db.delete(token._id);
    }

    return {
      scanned: tokens.length,
      deleted: tokens.length,
      scrubbed: 0,
    };
  },
});

export const runMvpRetentionCleanup = internalAction({
  args: {
    nowIso: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RetentionCleanupSummary> => {
    const nowIso = args.nowIso ?? new Date().toISOString();
    const limit = normalizeLimit(args.limit ?? DEFAULT_RETENTION_CLEANUP_LIMIT);

    const messages = await drainCleanup(
      async () =>
        await ctx.runMutation(internal.privacy.retention.scrubExpiredMessages, {
          nowIso,
          limit,
        }),
      limit,
    );
    const transcripts = await drainCleanup(
      async () =>
        await ctx.runMutation(internal.privacy.retention.deleteExpiredTranscripts, {
          nowIso,
          limit,
        }),
      limit,
    );
    const callRecordings = await drainCleanup(
      async () =>
        await ctx.runMutation(internal.privacy.retention.scrubExpiredCallRecordings, {
          nowIso,
          limit,
        }),
      limit,
    );
    const previewSessions = await drainCleanup(
      async () =>
        await ctx.runMutation(internal.privacy.retention.deleteExpiredPreviewSessions, {
          nowIso,
          limit,
        }),
      limit,
    );
    const messageAttachmentDownloadTokens = await drainCleanup(
      async () =>
        await ctx.runMutation(
          internal.privacy.retention.deleteExpiredMessageAttachmentDownloadTokens,
          { nowIso, limit },
        ),
      limit,
    );
    const callRecordingDownloadTokens = await drainCleanup(
      async () =>
        await ctx.runMutation(
          internal.privacy.retention.deleteExpiredCallRecordingDownloadTokens,
          { nowIso, limit },
        ),
      limit,
    );

    return {
      nowIso,
      messages,
      transcripts,
      callRecordings,
      previewSessions,
      messageAttachmentDownloadTokens,
      callRecordingDownloadTokens,
    };
  },
});
