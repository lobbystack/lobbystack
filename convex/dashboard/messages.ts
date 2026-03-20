import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { buildConversationOutcome } from "./outcomes";
import { requireCurrentUser, requireIdentity, requireMembership } from "../lib/auth";
import { buildMessageAttachmentDownloadUrl } from "../lib/messageAttachmentUrls";
import {
  ATTACHMENT_DOWNLOAD_TOKEN_TTL_MS,
  MAX_SMS_REPLY_ATTACHMENTS,
  formatAttachmentDisplayName,
  inferFileNameFromContentType,
  isImageAttachment,
  isSupportedAttachmentContentType,
  normalizeAttachmentFileName,
  resolveAttachmentDeliveryModes,
} from "../lib/messageAttachments";
import { selectSmsSenderPhoneNumber } from "../lib/smsPhoneNumbers";

type MessageMediaRecord = NonNullable<Doc<"messages">["media"]>[number];
type ConversationOutcome =
  | {
      kind: "booked";
      serviceName: string | null;
      startsAt: string;
    }
  | {
      kind: "booking_in_progress";
      serviceName: string | null;
      startsAt: string | null;
    }
  | {
      kind: "message_taking";
    }
  | {
      kind: "summary";
      summary: string;
    }
  | {
      kind: "disposition";
      disposition: string;
    }
  | {
      kind: "none";
    };

async function getContact(
  ctx: QueryCtx,
  contactId: Id<"contacts"> | undefined,
): Promise<Doc<"contacts"> | null> {
  if (!contactId) {
    return null;
  }

  return await ctx.db.get(contactId);
}

async function getPreferredConversationSmsSenderPhoneNumber(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<string | null> {
  const messages = ctx.db
    .query("messages")
    .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
    .order("desc");

  for await (const message of messages) {
    if (message.channel !== "sms" || message.direction !== "outbound" || !message.fromPhoneNumber) {
      continue;
    }

    return message.fromPhoneNumber;
  }

  return null;
}

function getLatestMessagePreviewKind(
  message: Doc<"messages"> | null,
): "text" | "attachment_image" | "attachment_file" {
  if (!message) {
    return "text";
  }

  if (message.body.trim().length > 0) {
    return "text";
  }

  const firstAttachment = message.media?.[0];
  if (!firstAttachment) {
    return "text";
  }

  return isImageAttachment(firstAttachment.contentType ?? "application/octet-stream")
    ? "attachment_image"
    : "attachment_file";
}

function assertSmsConversation(
  conversation: Doc<"conversations"> | null,
  businessId: Id<"businesses">,
): Doc<"conversations"> {
  if (!conversation || conversation.businessId !== businessId) {
    throw new Error("Conversation not found.");
  }

  if (conversation.channel !== "sms") {
    throw new Error("Only SMS conversations can use attachments.");
  }

  return conversation;
}

function createAttachmentNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type SmsReplyContextArgs = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  userId: Id<"users">;
  attachmentIds?: Array<Id<"message_attachment_uploads">>;
};

type SmsReplyContextResult = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  fromPhoneNumber: string;
  attachments: Array<{
    storageId: Id<"_storage">;
    fileName: string;
    contentType: string;
    byteLength: number;
    previewStorageId?: Id<"_storage">;
    previewFileName?: string;
    previewContentType?: string;
    previewByteLength?: number;
    deliveryMode: "mms" | "link";
  }>;
};

type SmsReplyAttachment = SmsReplyContextResult["attachments"][number];

type FinalizeStagedAttachmentContextArgs = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  userId: Id<"users">;
  storageId: Id<"_storage">;
};

type FinalizeStagedAttachmentContextResult = {
  contentType: string;
  byteLength: number;
};

type ConversationAutomationState = "ai_active" | "human_handoff";

function resolveConversationAutomationState(
  conversation: Pick<
    Doc<"conversations">,
    "automationState"
  >,
): ConversationAutomationState {
  return conversation.automationState === "human_handoff" ? "human_handoff" : "ai_active";
}

function formatOperatorDisplayName(user: Doc<"users"> | null): string | null {
  if (!user) {
    return null;
  }

  return user.displayName ?? user.name ?? user.email ?? null;
}

async function requireDashboardMessagesUserId(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<Id<"users">> {
  const identity = await requireIdentity(ctx);
  const authUserId = await getAuthUserId(ctx);
  const userId = await ctx.runQuery(internal.users.resolveAuthenticatedUserForBusiness, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId !== null ? { authUserId } : {}),
  });

  if (!userId) {
    throw new Error("User profile not initialized.");
  }

  const membership = await ctx.runQuery(internal.ai.agents.runtime.requireMembershipByUserId, {
    businessId,
    userId,
  });
  if (!membership || membership.status !== "active") {
    throw new Error("Unauthorized.");
  }

  return userId;
}

async function cloneSmsReplyAttachments(
  ctx: ActionCtx,
  attachments: Array<SmsReplyAttachment>,
): Promise<Array<SmsReplyAttachment>> {
  const createdStorageIds: Array<Id<"_storage">> = [];

  try {
    const clonedAttachments: Array<SmsReplyAttachment> = [];
    for (const attachment of attachments) {
      const blob = await ctx.storage.get(attachment.storageId);
      if (!blob) {
        throw new Error(`Attachment "${attachment.fileName}" is no longer available.`);
      }

      const storageId = await ctx.storage.store(blob);
      createdStorageIds.push(storageId);

      let previewFields:
        | Pick<
            SmsReplyAttachment,
            | "previewStorageId"
            | "previewFileName"
            | "previewContentType"
            | "previewByteLength"
          >
        | undefined;
      if (
        attachment.previewStorageId &&
        attachment.previewFileName &&
        attachment.previewContentType
      ) {
        const previewBlob = await ctx.storage.get(attachment.previewStorageId);
        if (previewBlob) {
          const previewStorageId = await ctx.storage.store(previewBlob);
          createdStorageIds.push(previewStorageId);
          previewFields = {
            previewStorageId,
            previewFileName: attachment.previewFileName,
            previewContentType: attachment.previewContentType,
            previewByteLength: previewBlob.size,
          };
        }
      }

      clonedAttachments.push({
        storageId,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        byteLength: blob.size,
        ...(previewFields ?? {}),
        deliveryMode: attachment.deliveryMode,
      });
    }

    return clonedAttachments;
  } catch (error) {
    await Promise.allSettled(
      createdStorageIds.map((storageId) => ctx.storage.delete(storageId)),
    );
    throw error;
  }
}

export const assertDashboardMessagesWriteAccess = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args) => {
    await requireMembership(ctx, args.businessId);
    return null;
  },
});

export const getSmsReplyContext = internalQuery({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    attachmentIds: v.optional(v.array(v.id("message_attachment_uploads"))),
  },
  handler: async (
    ctx: QueryCtx,
    args: SmsReplyContextArgs,
  ): Promise<SmsReplyContextResult> => {
    const conversation = assertSmsConversation(
      await ctx.db.get(args.conversationId),
      args.businessId,
    );

    if (!conversation.contactId) {
      throw new Error("Conversation is missing a contact.");
    }

    const [contact, phoneNumbers, stagedAttachments] = await Promise.all([
      ctx.db.get(conversation.contactId),
      ctx.db
        .query("phone_numbers")
        .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
        .collect(),
      Promise.all(
        (args.attachmentIds ?? []).map(async (attachmentId) => {
          const attachment = await ctx.db.get(attachmentId);
          if (!attachment) {
            throw new Error("Attachment not found.");
          }
          if (
            attachment.businessId !== args.businessId ||
            attachment.conversationId !== args.conversationId ||
            attachment.uploaderUserId !== args.userId ||
            attachment.status !== "staged"
          ) {
            throw new Error("Attachment is no longer available.");
          }
          return attachment;
        }),
      ),
    ]);

    if (!contact?.phone) {
      throw new Error("Contact phone number not found.");
    }

    if (contact.smsConsentStatus === "opted_out") {
      throw new Error("This contact has opted out of SMS messages.");
    }

    const preferredSenderPhoneNumber = await getPreferredConversationSmsSenderPhoneNumber(
      ctx,
      conversation._id,
    );
    const fromPhoneNumber = selectSmsSenderPhoneNumber(
      phoneNumbers,
      preferredSenderPhoneNumber ?? undefined,
    );
    if (!fromPhoneNumber) {
      throw new Error(
        "At least one active SMS-enabled phone number must be mapped to the business.",
      );
    }

    const attachmentIds = args.attachmentIds ?? [];
    if (new Set(attachmentIds.map(String)).size !== attachmentIds.length) {
      throw new Error("Duplicate attachments are not allowed.");
    }
    if (stagedAttachments.length > MAX_SMS_REPLY_ATTACHMENTS) {
      throw new Error(`You can send up to ${MAX_SMS_REPLY_ATTACHMENTS} attachments at a time.`);
    }

    const resolvedAttachments = resolveAttachmentDeliveryModes(
      stagedAttachments.map((attachment) => ({
        storageId: attachment.storageId,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        byteLength: attachment.byteLength,
      })),
    );
    const attachments = resolvedAttachments.map((attachment, index) => ({
      ...attachment,
      ...(stagedAttachments[index]?.previewStorageId
        ? { previewStorageId: stagedAttachments[index].previewStorageId }
        : {}),
      ...(stagedAttachments[index]?.previewFileName
        ? { previewFileName: stagedAttachments[index].previewFileName }
        : {}),
      ...(stagedAttachments[index]?.previewContentType
        ? { previewContentType: stagedAttachments[index].previewContentType }
        : {}),
      ...(stagedAttachments[index]?.previewByteLength
        ? { previewByteLength: stagedAttachments[index].previewByteLength }
        : {}),
    }));

    return {
      businessId: args.businessId,
      conversationId: conversation._id,
      fromPhoneNumber,
      attachments,
    };
  },
});

export const setConversationAutomationState = internalMutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    automationState: v.union(v.literal("ai_active"), v.literal("human_handoff")),
    actorUserId: v.id("users"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.businessId !== args.businessId) {
      throw new Error("Conversation not found.");
    }
    if (conversation.channel !== "sms") {
      throw new Error("Only SMS conversations support human handoff controls.");
    }

    if (args.automationState === "human_handoff") {
      await ctx.db.patch(args.conversationId, {
        automationState: "human_handoff",
        automationPausedAt: new Date().toISOString(),
        automationPausedByUserId: args.actorUserId,
      });
      return null;
    }

    const { _id, _creationTime, automationPausedAt, automationPausedByUserId, ...rest } = conversation;
    void _id;
    void _creationTime;
    void automationPausedAt;
    void automationPausedByUserId;
    await ctx.db.replace(args.conversationId, {
      ...rest,
      automationState: "ai_active",
    });
    return null;
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx: MutationCtx, args): Promise<string> => {
    await requireMembership(ctx, args.businessId);
    assertSmsConversation(await ctx.db.get(args.conversationId), args.businessId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFinalizeStagedAttachmentContext = internalQuery({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
  },
  handler: async (
    ctx: QueryCtx,
    args: FinalizeStagedAttachmentContextArgs,
  ): Promise<FinalizeStagedAttachmentContextResult> => {
    assertSmsConversation(await ctx.db.get(args.conversationId), args.businessId);

    const stagedAttachments = await ctx.db
      .query("message_attachment_uploads")
      .withIndex("by_uploader_user_id_and_conversation_id", (q) =>
        q.eq("uploaderUserId", args.userId).eq("conversationId", args.conversationId),
      )
      .collect();
    const activeAttachments = stagedAttachments.filter((attachment) => attachment.status === "staged");
    if (activeAttachments.length >= MAX_SMS_REPLY_ATTACHMENTS) {
      throw new Error(`You can send up to ${MAX_SMS_REPLY_ATTACHMENTS} attachments at a time.`);
    }

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) {
      throw new Error("Uploaded file not found.");
    }

    return {
      contentType: metadata.contentType ?? "application/octet-stream",
      byteLength: metadata.size,
    };
  },
});

export const insertStagedAttachment = internalMutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    uploaderUserId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    byteLength: v.number(),
    previewStorageId: v.optional(v.id("_storage")),
    previewFileName: v.optional(v.string()),
    previewContentType: v.optional(v.string()),
    previewByteLength: v.optional(v.number()),
    deliveryMode: v.union(v.literal("mms"), v.literal("link")),
  },
  handler: async (ctx: MutationCtx, args) => {
    return await ctx.db.insert("message_attachment_uploads", {
      businessId: args.businessId,
      conversationId: args.conversationId,
      uploaderUserId: args.uploaderUserId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      byteLength: args.byteLength,
      ...(args.previewStorageId ? { previewStorageId: args.previewStorageId } : {}),
      ...(args.previewFileName ? { previewFileName: args.previewFileName } : {}),
      ...(args.previewContentType ? { previewContentType: args.previewContentType } : {}),
      ...(args.previewByteLength ? { previewByteLength: args.previewByteLength } : {}),
      deliveryMode: args.deliveryMode,
      status: "staged",
    });
  },
});

export const finalizeStagedAttachment = action({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    id: Id<"message_attachment_uploads">;
    fileName: string;
    contentType: string;
    byteLength: number;
    deliveryMode: "mms" | "link";
    kind: "image" | "file";
  }> => {
    const userId = await requireDashboardMessagesUserId(ctx, args.businessId);
    const metadata: FinalizeStagedAttachmentContextResult = await ctx.runQuery(
      internal.dashboard.messages.getFinalizeStagedAttachmentContext,
      {
        businessId: args.businessId,
        conversationId: args.conversationId,
        userId,
        storageId: args.storageId,
      },
    );

    const contentType = metadata.contentType;
    if (!isSupportedAttachmentContentType(contentType)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("This file type isn't supported for SMS/MMS attachments.");
    }

    const fallbackName = inferFileNameFromContentType(contentType);
    const normalizedFileName = normalizeAttachmentFileName(args.fileName, fallbackName.split(".").pop() ?? "bin");
    const deliveryMode =
      contentType === "application/pdf" || contentType.startsWith("image/")
        ? ("mms" as const)
        : ("link" as const);
    const preview = contentType.startsWith("image/")
      ? await ctx.runAction(internal.integrations.messageMedia.createImagePreviewForStorage, {
          storageId: args.storageId,
          fileName: normalizedFileName,
          contentType,
        })
      : null;
    const attachmentId: Id<"message_attachment_uploads"> = await ctx.runMutation(
      internal.dashboard.messages.insertStagedAttachment,
      {
        businessId: args.businessId,
        conversationId: args.conversationId,
        uploaderUserId: userId,
        storageId: args.storageId,
        fileName: normalizedFileName,
        contentType,
        byteLength: metadata.byteLength,
        ...(preview?.storageId ? { previewStorageId: preview.storageId } : {}),
        ...(preview?.fileName ? { previewFileName: preview.fileName } : {}),
        ...(preview?.contentType ? { previewContentType: preview.contentType } : {}),
        ...(preview?.byteLength ? { previewByteLength: preview.byteLength } : {}),
        deliveryMode,
      },
    );

    return {
      id: attachmentId,
      fileName: normalizedFileName,
      contentType,
      byteLength: metadata.byteLength,
      deliveryMode,
      kind: contentType.startsWith("image/") ? ("image" as const) : ("file" as const),
    };
  },
});

export const removeStagedAttachment = mutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    attachmentId: v.id("message_attachment_uploads"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const user = await requireCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);

    const attachment = await ctx.db.get(args.attachmentId);
    if (
      !attachment ||
      attachment.businessId !== args.businessId ||
      attachment.conversationId !== args.conversationId ||
      attachment.uploaderUserId !== user._id ||
      attachment.status !== "staged"
    ) {
      throw new Error("Attachment not found.");
    }

    await ctx.storage.delete(attachment.storageId);
    if (attachment.previewStorageId) {
      await ctx.storage.delete(attachment.previewStorageId);
    }
    await ctx.db.delete(attachment._id);

    return null;
  },
});

export const clearStagedAttachments = mutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const user = await requireCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    assertSmsConversation(await ctx.db.get(args.conversationId), args.businessId);

    const attachments = await ctx.db
      .query("message_attachment_uploads")
      .withIndex("by_uploader_user_id_and_conversation_id", (q) =>
        q.eq("uploaderUserId", user._id).eq("conversationId", args.conversationId),
      )
      .collect();

    for (const attachment of attachments) {
      if (attachment.status !== "staged") {
        continue;
      }

      await ctx.storage.delete(attachment.storageId);
      if (attachment.previewStorageId) {
        await ctx.storage.delete(attachment.previewStorageId);
      }
      await ctx.db.delete(attachment._id);
    }

    return null;
  },
});

export const listStagedAttachments = query({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx: QueryCtx, args) => {
    const user = await requireCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    assertSmsConversation(await ctx.db.get(args.conversationId), args.businessId);

    const attachments = await ctx.db
      .query("message_attachment_uploads")
      .withIndex("by_uploader_user_id_and_conversation_id", (q) =>
        q.eq("uploaderUserId", user._id).eq("conversationId", args.conversationId),
      )
      .collect();

    return await Promise.all(
      attachments
        .filter((attachment) => attachment.status === "staged")
        .map(async (attachment) => {
          const previewUrl = attachment.previewStorageId
            ? await ctx.storage.getUrl(attachment.previewStorageId)
            : isImageAttachment(attachment.contentType)
              ? await ctx.storage.getUrl(attachment.storageId)
              : null;

          return {
            id: attachment._id,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            byteLength: attachment.byteLength,
            deliveryMode: attachment.deliveryMode as "mms" | "link",
            kind: isImageAttachment(attachment.contentType)
              ? ("image" as const)
              : ("file" as const),
            previewUrl,
          };
        }),
    );
  },
});

export const materializeMessageAttachmentUrls = internalMutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message?.media || message.media.length === 0) {
      return null;
    }

    const nextMedia = [];
    for (const attachment of message.media) {
      let nextAttachment = attachment;

      if (
        !nextAttachment.url &&
        nextAttachment.storageId &&
        nextAttachment.fileName &&
        nextAttachment.contentType
      ) {
        const nonce = createAttachmentNonce();
        const expiresAt = new Date(Date.now() + ATTACHMENT_DOWNLOAD_TOKEN_TTL_MS).toISOString();
        await ctx.db.insert("message_attachment_download_tokens", {
          businessId: message.businessId,
          messageId: message._id,
          storageId: nextAttachment.storageId,
          fileName: nextAttachment.fileName,
          contentType: nextAttachment.contentType,
          disposition: nextAttachment.deliveryMode === "link" ? "attachment" : "inline",
          nonce,
          expiresAt,
        });

        nextAttachment = {
          ...nextAttachment,
          url: buildMessageAttachmentDownloadUrl(nonce),
        };
      }

      if (
        !nextAttachment.previewUrl &&
        nextAttachment.previewStorageId &&
        nextAttachment.previewFileName &&
        nextAttachment.previewContentType
      ) {
        const previewNonce = createAttachmentNonce();
        const previewExpiresAt = new Date(
          Date.now() + ATTACHMENT_DOWNLOAD_TOKEN_TTL_MS,
        ).toISOString();
        await ctx.db.insert("message_attachment_download_tokens", {
          businessId: message.businessId,
          messageId: message._id,
          storageId: nextAttachment.previewStorageId,
          fileName: nextAttachment.previewFileName,
          contentType: nextAttachment.previewContentType,
          disposition: "inline",
          nonce: previewNonce,
          expiresAt: previewExpiresAt,
        });

        nextAttachment = {
          ...nextAttachment,
          previewUrl: buildMessageAttachmentDownloadUrl(previewNonce),
        };
      }

      nextMedia.push(nextAttachment);
    }

    await ctx.db.patch(args.messageId, {
      media: nextMedia,
    });

    return null;
  },
});

export const markStagedAttachmentsConsumed = internalMutation({
  args: {
    attachmentIds: v.array(v.id("message_attachment_uploads")),
    messageId: v.id("messages"),
  },
  handler: async (ctx: MutationCtx, args) => {
    for (const attachmentId of args.attachmentIds) {
      await ctx.db.patch(attachmentId, {
        status: "consumed",
        sentMessageId: args.messageId,
      });
    }

    return null;
  },
});

export const getMessageAttachmentDownloadToken = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("message_attachment_download_tokens")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.token))
      .unique();
  },
});

export const getConversationMessages = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .collect();
  },
});

export const patchMessageMedia = internalMutation({
  args: {
    messageId: v.id("messages"),
    media: v.array(
      v.object({
        url: v.optional(v.string()),
        storageId: v.optional(v.id("_storage")),
        fileName: v.optional(v.string()),
        contentType: v.optional(v.string()),
        byteLength: v.optional(v.number()),
        previewUrl: v.optional(v.string()),
        previewStorageId: v.optional(v.id("_storage")),
        previewFileName: v.optional(v.string()),
        previewContentType: v.optional(v.string()),
        previewByteLength: v.optional(v.number()),
        deliveryMode: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.patch(args.messageId, {
      media: args.media,
    });
    return null;
  },
});

export const listConversationSummaries = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))
      .collect();

    const summaries = await Promise.all(
      conversations.map(async (conversation) => {
        const [contact, messages] = await Promise.all([
          getContact(ctx, conversation.contactId),
          ctx.db
            .query("messages")
            .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
            .collect(),
        ]);

        const latestMessage = messages[messages.length - 1] ?? null;

        if (messages.length === 0) {
          return null;
        }

        return {
          id: conversation._id,
          channel: conversation.channel,
          status: conversation.status,
          contactName: contact?.name ?? null,
          contactPhone: contact?.phone ?? null,
          contactEmail: contact?.email ?? null,
          messageCount: messages.length,
          lastMessageBody: latestMessage?.body ?? null,
          lastMessagePreviewKind: getLatestMessagePreviewKind(latestMessage),
          lastMessageDirection: latestMessage?.direction ?? null,
          lastMessageAt: latestMessage?._creationTime ?? conversation._creationTime,
        };
      }),
    );

    return summaries
      .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
      .sort((left, right) => right.lastMessageAt - left.lastMessageAt);
  },
});

async function hydrateMessageAttachments(
  ctx: QueryCtx,
  message: Doc<"messages">,
) {
  const now = Date.now();
  const tokens = await ctx.db
    .query("message_attachment_download_tokens")
    .withIndex("by_message_id", (q) => q.eq("messageId", message._id))
    .collect();
  const stableUrlByStorageId = new Map<string, string>();
  for (const token of tokens) {
    if (Date.parse(token.expiresAt) < now) {
      continue;
    }
    stableUrlByStorageId.set(String(token.storageId), buildMessageAttachmentDownloadUrl(token.nonce));
  }

  return await Promise.all(
    (message.media ?? []).map(async (attachment: MessageMediaRecord, index) => {
      const contentType = attachment.contentType ?? "application/octet-stream";
      const stableUrl =
        attachment.storageId
          ? (stableUrlByStorageId.get(String(attachment.storageId)) ?? null)
          : (attachment.url ?? null);
      const signedUrl =
        !stableUrl && attachment.storageId ? await ctx.storage.getUrl(attachment.storageId) : null;
      const resolvedUrl = stableUrl ?? signedUrl ?? null;
      const stablePreviewUrl =
        attachment.previewStorageId
          ? (stableUrlByStorageId.get(String(attachment.previewStorageId)) ?? null)
          : (attachment.previewUrl ?? null);
      const signedPreviewUrl =
        !stablePreviewUrl && attachment.previewStorageId
          ? await ctx.storage.getUrl(attachment.previewStorageId)
          : null;
      const resolvedPreviewUrl = stablePreviewUrl ?? signedPreviewUrl ?? resolvedUrl;
      const hasDedicatedPreview = Boolean(attachment.previewStorageId && resolvedPreviewUrl !== resolvedUrl);

      return {
        id: `${String(message._id)}:${index}`,
        fileName: formatAttachmentDisplayName({
          fileName: attachment.fileName ?? null,
          contentType: attachment.contentType ?? null,
          index,
        }),
        contentType,
        byteLength: attachment.byteLength ?? null,
        deliveryMode: attachment.deliveryMode ?? null,
        kind: isImageAttachment(contentType) ? ("image" as const) : ("file" as const),
        previewUrl: isImageAttachment(contentType) ? resolvedPreviewUrl : null,
        downloadUrl: resolvedUrl,
        hasDedicatedPreview,
        source: attachment.storageId
          ? stableUrl
            ? ("tokenized" as const)
            : ("storage" as const)
          : ("external" as const),
      };
    }),
  );
}

function buildLegacySessionSummaryItem(input: {
  outcome: ConversationOutcome;
  createdAt: number;
  legacySummary: string | null;
}) {
  switch (input.outcome.kind) {
    case "booked":
      return {
        kind: "session_summary" as const,
        id: `legacy:${input.createdAt}:booked`,
        sessionId: null,
        createdAt: input.createdAt,
        startedAt: input.createdAt,
        closedAt: input.createdAt,
        summaryKind: input.outcome.kind,
        summary: {
          kind: input.outcome.kind,
          serviceName: input.outcome.serviceName,
          startsAt: input.outcome.startsAt,
        },
      };
    case "booking_in_progress":
      return {
        kind: "session_summary" as const,
        id: `legacy:${input.createdAt}:booking_in_progress`,
        sessionId: null,
        createdAt: input.createdAt,
        startedAt: input.createdAt,
        closedAt: input.createdAt,
        summaryKind: input.outcome.kind,
        summary: {
          kind: input.outcome.kind,
          serviceName: input.outcome.serviceName,
          startsAt: input.outcome.startsAt,
        },
      };
    case "message_taking":
      return {
        kind: "session_summary" as const,
        id: `legacy:${input.createdAt}:message_taking`,
        sessionId: null,
        createdAt: input.createdAt,
        startedAt: input.createdAt,
        closedAt: input.createdAt,
        summaryKind: input.outcome.kind,
        summary: {
          kind: input.outcome.kind,
          summary: input.legacySummary,
        },
      };
    case "summary":
      return {
        kind: "session_summary" as const,
        id: `legacy:${input.createdAt}:summary`,
        sessionId: null,
        createdAt: input.createdAt,
        startedAt: input.createdAt,
        closedAt: input.createdAt,
        summaryKind: input.outcome.kind,
        summary: {
          kind: input.outcome.kind,
          summary: input.outcome.summary,
        },
      };
    case "disposition":
      return {
        kind: "session_summary" as const,
        id: `legacy:${input.createdAt}:disposition`,
        sessionId: null,
        createdAt: input.createdAt,
        startedAt: input.createdAt,
        closedAt: input.createdAt,
        summaryKind: input.outcome.kind,
        summary: {
          kind: input.outcome.kind,
          disposition: input.outcome.disposition,
        },
      };
    default:
      return null;
  }
}

export const getConversationThread = query({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.businessId !== args.businessId) {
      throw new Error("Conversation not found.");
    }

    const [contact, messages, sessions] = await Promise.all([
      getContact(ctx, conversation.contactId),
      ctx.db
        .query("messages")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
        .collect(),
      ctx.db
        .query("conversation_sessions")
        .withIndex("by_conversation_id_and_started_at", (q) =>
          q.eq("conversationId", args.conversationId),
        )
        .collect(),
    ]);

    const hydratedMessages = await Promise.all(
      messages.map(async (message) => ({
        kind: "message" as const,
        id: message._id,
        conversationSessionId: message.conversationSessionId ?? null,
        direction: message.direction,
        body: message.body,
        status: message.status,
        channel: message.channel,
        createdAt: message._creationTime,
        attachments: await hydrateMessageAttachments(ctx, message),
      })),
    );

    const summaryTimelineItems = sessions
      .filter((session) => session.summaryGeneratedAt && session.summary)
      .map((session) => ({
        kind: "session_summary" as const,
        id: session._id,
        sessionId: session._id,
        createdAt: session.closedAt ?? session.lastMessageAt,
        startedAt: session.startedAt,
        closedAt: session.closedAt ?? session.lastMessageAt,
        summaryKind: session.summaryKind ?? session.summary!.kind,
        summary: session.summary!,
      }));

    const hasLegacyMessages = hydratedMessages.some(
      (message) => message.conversationSessionId === null,
    );
    const legacyOutcome = (await buildConversationOutcome(ctx, {
      conversation,
    })) as ConversationOutcome;
    const legacySummaryItem =
      (sessions.length === 0 || hasLegacyMessages) && legacyOutcome
        ? buildLegacySessionSummaryItem({
            outcome: legacyOutcome,
            createdAt:
              [...hydratedMessages]
                .reverse()
                .find((message) => message.conversationSessionId === null)?.createdAt ??
              hydratedMessages[hydratedMessages.length - 1]?.createdAt ??
              conversation._creationTime,
            legacySummary: conversation.summary ?? null,
          })
        : null;

    const timeline = [...hydratedMessages, ...summaryTimelineItems, ...(legacySummaryItem ? [legacySummaryItem] : [])]
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt - right.createdAt;
        }

        if (left.kind === right.kind) {
          return 0;
        }

        return left.kind === "message" ? -1 : 1;
      });

    return {
      conversation: {
        id: conversation._id,
        channel: conversation.channel,
        status: conversation.status,
        automationState: resolveConversationAutomationState(conversation),
        automationPausedAt: conversation.automationPausedAt ?? null,
        automationPausedByName: conversation.automationPausedByUserId
          ? formatOperatorDisplayName(await ctx.db.get(conversation.automationPausedByUserId))
          : null,
        summary: conversation.summary ?? null,
        currentIntent: conversation.currentIntent ?? null,
      },
      contact: contact
        ? {
            id: contact._id,
            name: contact.name ?? null,
            phone: contact.phone,
            email: contact.email ?? null,
          }
        : null,
      messages: hydratedMessages,
      timeline,
    };
  },
});

export const sendSmsReply = action({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    body: v.string(),
    attachmentIds: v.optional(v.array(v.id("message_attachment_uploads"))),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{ messageId: Id<"messages"> }> => {
    const body = args.body.trim();
    const userId = await requireDashboardMessagesUserId(ctx, args.businessId);

    const replyContext: SmsReplyContextResult = await ctx.runQuery(
      internal.dashboard.messages.getSmsReplyContext,
      {
        businessId: args.businessId,
        conversationId: args.conversationId,
        userId,
        ...(args.attachmentIds !== undefined ? { attachmentIds: args.attachmentIds } : {}),
      },
    );

    if (body.length === 0 && replyContext.attachments.length === 0) {
      throw new Error("Message body or attachments are required.");
    }

    const outboundAttachments =
      replyContext.attachments.length > 0
        ? await cloneSmsReplyAttachments(ctx, replyContext.attachments)
        : [];
    const messageId = await ctx.runMutation(internal.conversations.webhooks.storeOutboundMessage, {
      businessId: replyContext.businessId,
      conversationId: replyContext.conversationId,
      channel: "sms",
      body,
      fromPhoneNumber: replyContext.fromPhoneNumber,
      aiGenerated: false,
      ...(outboundAttachments.length > 0
        ? {
            media: outboundAttachments.map((attachment) => ({
              storageId: attachment.storageId,
              fileName: attachment.fileName,
              contentType: attachment.contentType,
              byteLength: attachment.byteLength,
              ...(attachment.previewStorageId
                ? { previewStorageId: attachment.previewStorageId }
                : {}),
              ...(attachment.previewFileName
                ? { previewFileName: attachment.previewFileName }
                : {}),
              ...(attachment.previewContentType
                ? { previewContentType: attachment.previewContentType }
                : {}),
              ...(attachment.previewByteLength
                ? { previewByteLength: attachment.previewByteLength }
                : {}),
              deliveryMode: attachment.deliveryMode,
            })),
          }
        : {}),
    });

    await ctx.runAction(internal.conversations.webhooks.sendStoredOutboundMessage, {
      messageId,
    });

    if (args.attachmentIds && args.attachmentIds.length > 0) {
      await ctx.runMutation(internal.dashboard.messages.markStagedAttachmentsConsumed, {
        attachmentIds: args.attachmentIds,
        messageId,
      });
    }

    await ctx.runMutation(internal.dashboard.messages.setConversationAutomationState, {
      businessId: args.businessId,
      conversationId: args.conversationId,
      automationState: "human_handoff",
      actorUserId: userId,
    });

    return { messageId };
  },
});

export const pauseConversationAutomation = action({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx: ActionCtx, args): Promise<null> => {
    const userId = await requireDashboardMessagesUserId(ctx, args.businessId);
    await ctx.runMutation(internal.dashboard.messages.setConversationAutomationState, {
      businessId: args.businessId,
      conversationId: args.conversationId,
      automationState: "human_handoff",
      actorUserId: userId,
    });
    return null;
  },
});

export const resumeConversationAutomation = action({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx: ActionCtx, args): Promise<null> => {
    const userId = await requireDashboardMessagesUserId(ctx, args.businessId);
    await ctx.runMutation(internal.dashboard.messages.setConversationAutomationState, {
      businessId: args.businessId,
      conversationId: args.conversationId,
      automationState: "ai_active",
      actorUserId: userId,
    });
    return null;
  },
});

export const repairConversationAttachmentPreviews = action({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{ repairedMessages: number; repairedAttachments: number }> => {
    await requireDashboardMessagesUserId(ctx, args.businessId);

    const conversation: Doc<"conversations"> | null = await ctx.runQuery(
      internal.conversations.webhooks.getConversationById,
      {
        conversationId: args.conversationId,
      },
    );
    if (!conversation || conversation.businessId !== args.businessId) {
      throw new Error("Conversation not found.");
    }
    if (conversation.channel !== "sms") {
      throw new Error("Only SMS conversations support attachment preview repair.");
    }

    const messages: Array<Doc<"messages">> = await ctx.runQuery(
      internal.dashboard.messages.getConversationMessages,
      {
        conversationId: args.conversationId,
      },
    );

    let repairedMessages = 0;
    let repairedAttachments = 0;

    for (const message of messages) {
      let currentMedia = message.media ?? [];
      const imageMediaMissingPreview = currentMedia.filter(
        (attachment) =>
          attachment.storageId &&
          attachment.fileName &&
          attachment.contentType &&
          isImageAttachment(attachment.contentType) &&
          !attachment.previewStorageId,
      );
      const needsStableUrlMaterialization = currentMedia.some(
        (attachment) =>
          ((attachment.storageId &&
            !attachment.url &&
            attachment.fileName &&
            attachment.contentType) ||
            (attachment.previewStorageId &&
              !attachment.previewUrl &&
              attachment.previewFileName &&
              attachment.previewContentType)),
      );
      const mediaNeedingRepair =
        message.direction === "inbound"
          ? currentMedia.filter((attachment) => attachment.url && !attachment.storageId)
          : [];
      let patchedMessage = false;

      if (mediaNeedingRepair.length > 0) {
        const repairedMedia = await ctx.runAction(internal.integrations.twilioSms.ingestInboundMedia, {
          media: mediaNeedingRepair.map((attachment) => ({
            url: attachment.url ?? "",
            ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
          })),
        });

        let repairedForMessage = 0;
        let repairedIndex = 0;
        const nextMedia = currentMedia.map((attachment) => {
          if (!attachment.url || attachment.storageId) {
            return attachment;
          }

          const replacement = repairedMedia[repairedIndex];
          repairedIndex += 1;
          if (
            replacement &&
            "storageId" in replacement &&
            replacement.storageId
          ) {
            repairedForMessage += 1;
            return replacement;
          }

          return attachment;
        });

        if (repairedForMessage > 0) {
          patchedMessage = true;
          repairedMessages += 1;
          repairedAttachments += repairedForMessage;
          currentMedia = nextMedia;
          await ctx.runMutation(internal.dashboard.messages.patchMessageMedia, {
            messageId: message._id,
            media: nextMedia,
          });
        }
      }

      if (imageMediaMissingPreview.length > 0) {
        let generatedForMessage = 0;
        const nextMedia = await Promise.all(
          currentMedia.map(async (attachment) => {
            if (
              !attachment.storageId ||
              !attachment.fileName ||
              !attachment.contentType ||
              !isImageAttachment(attachment.contentType) ||
              attachment.previewStorageId
            ) {
              return attachment;
            }

            const preview = await ctx.runAction(
              internal.integrations.messageMedia.createImagePreviewForStorage,
              {
                storageId: attachment.storageId,
                fileName: attachment.fileName,
                contentType: attachment.contentType,
              },
            );
            if (!preview?.storageId) {
              return attachment;
            }

            generatedForMessage += 1;
            return {
              ...attachment,
              previewStorageId: preview.storageId,
              previewFileName: preview.fileName,
              previewContentType: preview.contentType,
              previewByteLength: preview.byteLength,
            };
          }),
        );

        if (generatedForMessage > 0) {
          if (!patchedMessage) {
            repairedMessages += 1;
          }
          patchedMessage = true;
          repairedAttachments += generatedForMessage;
          currentMedia = nextMedia;
          await ctx.runMutation(internal.dashboard.messages.patchMessageMedia, {
            messageId: message._id,
            media: nextMedia,
          });
        }
      }

      if (needsStableUrlMaterialization || patchedMessage) {
        await ctx.runMutation(internal.dashboard.messages.materializeMessageAttachmentUrls, {
          messageId: message._id,
        });
      }
    }

    return {
      repairedMessages,
      repairedAttachments,
    };
  },
});
