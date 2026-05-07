import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  observedInternalAction as internalAction,
  observedInternalMutation as internalMutation,
} from "../telemetry/observedFunctions";

export const SENSITIVE_CONTENT_RETENTION_DAYS = 90;
export const SENSITIVE_CONTENT_RETENTION_MS =
  SENSITIVE_CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const REDACTED_MESSAGE_BODY = "[Expired by 90-day retention policy]";

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

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_RETENTION_CLEANUP_LIMIT;
  }
  return Math.max(1, Math.min(Math.floor(limit), MAX_RETENTION_CLEANUP_LIMIT));
}

function isExpired(expiresAt: string | undefined, nowIso: string): expiresAt is string {
  return typeof expiresAt === "string" && expiresAt.length > 0 && expiresAt <= nowIso;
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
    await ctx.storage.delete(storageId);
    deleted += 1;
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

    const messages: CleanupCount = await ctx.runMutation(
      internal.privacy.retention.scrubExpiredMessages,
      { nowIso, limit },
    );
    const transcripts: CleanupCount = await ctx.runMutation(
      internal.privacy.retention.deleteExpiredTranscripts,
      { nowIso, limit },
    );
    const callRecordings: CleanupCount = await ctx.runMutation(
      internal.privacy.retention.scrubExpiredCallRecordings,
      { nowIso, limit },
    );
    const previewSessions: CleanupCount = await ctx.runMutation(
      internal.privacy.retention.deleteExpiredPreviewSessions,
      { nowIso, limit },
    );
    const messageAttachmentDownloadTokens: CleanupCount = await ctx.runMutation(
      internal.privacy.retention.deleteExpiredMessageAttachmentDownloadTokens,
      { nowIso, limit },
    );
    const callRecordingDownloadTokens: CleanupCount = await ctx.runMutation(
      internal.privacy.retention.deleteExpiredCallRecordingDownloadTokens,
      { nowIso, limit },
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
