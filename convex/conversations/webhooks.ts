import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "../telemetry/shared";
import { v } from "convex/values";
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { getOpenConversationForContact } from "../lib/indexedQueries";
import {
  buildLinkOnlyAttachmentText,
  formatAttachmentDisplayName,
  isImageAttachment,
} from "../lib/messageAttachments";
import { selectSmsSenderPhoneNumber } from "../lib/smsPhoneNumbers";
import { mapTwilioStatusToMessageStatus } from "../lib/twilioMessageStatus";
import { buildTwilioSmsStatusCallbackUrl } from "../lib/twilioUrls";
import {
  enqueuePostHogOutboxRecord,
  serializePostHogEvent,
} from "../telemetry/posthog";
import { ensureSessionForStoredMessage } from "./sessions";

function asConversationId(value: string): Id<"conversations"> {
  return value as Id<"conversations">;
}

function asMessageId(value: string): Id<"messages"> {
  return value as Id<"messages">;
}

type MessageMediaAttachment = {
  url?: string;
  storageId?: Id<"_storage">;
  fileName?: string;
  contentType?: string;
  byteLength?: number;
  previewUrl?: string;
  previewStorageId?: Id<"_storage">;
  previewFileName?: string;
  previewContentType?: string;
  previewByteLength?: number;
  deliveryMode?: string;
};

type ConversationIdArgs = { conversationId: Id<"conversations"> };
type MessageIdArgs = { messageId: Id<"messages"> };
type ClaimInboundMessageSidArgs = { scope: string; key: string };
type ClaimInboundMessageSidResult =
  | { claimed: false; existing: Doc<"idempotency_keys"> }
  | { claimed: true; id: Id<"idempotency_keys"> };
type LinkIdempotencyKeyArgs = {
  idempotencyKeyId: Id<"idempotency_keys">;
  resourceTable: string;
  resourceId: string;
  status: string;
};
type ConversationForContactArgs = {
  businessId: Id<"businesses">;
  contactId: Id<"contacts">;
  channel: string;
};
type GetOrCreateContactArgs = {
  businessId: Id<"businesses">;
  phone: string;
};
type StoreInboundMessageArgs = {
  businessId: Id<"businesses">;
  contactId: Id<"contacts">;
  channel: string;
  body: string;
  providerMessageSid?: string;
  media?: Array<MessageMediaAttachment>;
};
type StoreOutboundMessageArgs = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  channel: string;
  body: string;
  fromPhoneNumber?: string;
  appointmentId?: Id<"appointments">;
  media?: Array<MessageMediaAttachment>;
  aiGenerated?: boolean;
};
type ReserveOutboundAiMessageArgs = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  channel: string;
  fromPhoneNumber?: string;
};
type FinalizeReservedOutboundMessageArgs = {
  messageId: Id<"messages">;
  body: string;
  appointmentId?: Id<"appointments">;
  media?: Array<MessageMediaAttachment>;
};
type OutboundMessageDeliveryContext = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  body: string;
  from: string;
  to: string;
  providerMessageSid?: string;
  status: string;
  media?: Array<MessageMediaAttachment>;
  appointmentId?: Id<"appointments">;
};
type MarkOutboundMessageAcceptedArgs = {
  messageId: Id<"messages">;
  providerMessageSid: string;
  providerStatus: string;
  providerUpdatedAt: string;
};
type MarkOutboundMessageSendFailedArgs = {
  messageId: Id<"messages">;
  providerUpdatedAt: string;
  providerStatus?: string;
};
type SendStoredOutboundMessageResult = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  reply: string;
  providerMessageSid?: string;
  status: string;
};
type HandleTwilioSmsInboundArgs = {
  from: string;
  to: string;
  body: string;
  messageSid?: string;
  smsSid?: string;
  optOutType?: string;
  media?: Array<MessageMediaAttachment>;
};
type HandleTwilioSmsInboundResult = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  reply: string | null;
};
type SmsConsentUpdate = {
  status: "opted_out" | "subscribed";
  source: string;
};
type IngestInboundSmsArgs = {
  businessId: Id<"businesses">;
  from: string;
  channel: string;
  body: string;
  providerMessageSid?: string;
  optOutType?: string;
  idempotencyKeyId?: Id<"idempotency_keys">;
  media?: Array<MessageMediaAttachment>;
};
type IngestInboundSmsResult = {
  conversationId: Id<"conversations">;
  contactId: Id<"contacts">;
  replySuppressed: boolean;
  automationState: "ai_active" | "human_handoff";
};

const SMS_STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT", "CANCEL"]);
const SMS_START_KEYWORDS = new Set(["START", "UNSTOP", "SUBSCRIBE"]);

function normalizeSmsKeyword(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function classifySmsConsentUpdate(input: {
  body: string;
  optOutType?: string;
}): SmsConsentUpdate | null {
  const normalizedOptOutType = input.optOutType?.trim().toUpperCase();
  if (normalizedOptOutType) {
    if (SMS_STOP_KEYWORDS.has(normalizedOptOutType)) {
      return {
        status: "opted_out",
        source: `twilio_opt_out:${normalizedOptOutType}`,
      };
    }
    if (SMS_START_KEYWORDS.has(normalizedOptOutType)) {
      return {
        status: "subscribed",
        source: `twilio_opt_out:${normalizedOptOutType}`,
      };
    }
  }

  const normalizedBody = normalizeSmsKeyword(input.body);
  if (SMS_STOP_KEYWORDS.has(normalizedBody)) {
    return {
      status: "opted_out",
      source: `keyword:${normalizedBody}`,
    };
  }
  if (SMS_START_KEYWORDS.has(normalizedBody)) {
    return {
      status: "subscribed",
      source: `keyword:${normalizedBody}`,
    };
  }

  return null;
}

function buildInboundSmsPrompt(input: {
  body: string;
  media?: Array<MessageMediaAttachment>;
}): string {
  const body = input.body.trim();
  if (!input.media || input.media.length === 0) {
    return body;
  }

  const attachmentLines = input.media.map((attachment, index) => {
    const contentType = attachment.contentType ?? "application/octet-stream";
    const label = formatAttachmentDisplayName({
      fileName: attachment.fileName ?? null,
      contentType: attachment.contentType ?? null,
      index,
    });
    const kind = isImageAttachment(contentType) ? "Photo" : "File";

    return `- ${kind}: ${label}`;
  });

  return [body, `Customer attachments:\n${attachmentLines.join("\n")}`]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export const getLatestOutboundReply = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (
    ctx: QueryCtx,
    args: ConversationIdArgs,
  ): Promise<Doc<"messages"> | null> => {
    const messages = ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .order("desc");

    for await (const message of messages) {
      if (message.direction === "outbound") {
        return message;
      }
    }

    return null;
  },
});

export const claimInboundMessageSid = internalMutation({
  args: {
    scope: v.string(),
    key: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: ClaimInboundMessageSidArgs,
  ): Promise<ClaimInboundMessageSidResult> => {
    const existing = await ctx.db
      .query("idempotency_keys")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", args.key))
      .unique();

    if (existing) {
      return { claimed: false, existing };
    }

    const id = await ctx.db.insert("idempotency_keys", {
      scope: args.scope,
      key: args.key,
      status: "claimed",
    });

    return { claimed: true, id };
  },
});

export const linkIdempotencyKey = internalMutation({
  args: {
    idempotencyKeyId: v.id("idempotency_keys"),
    resourceTable: v.string(),
    resourceId: v.string(),
    status: v.string(),
  },
  handler: async (ctx: MutationCtx, args: LinkIdempotencyKeyArgs) => {
    await ctx.db.patch(args.idempotencyKeyId, {
      resourceTable: args.resourceTable,
      resourceId: args.resourceId,
      status: args.status,
    });
    return null;
  },
});

export const getConversationById = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx: QueryCtx, args: ConversationIdArgs) => {
    return await ctx.db.get(args.conversationId);
  },
});

export const getMessageById = internalQuery({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx: QueryCtx, args: MessageIdArgs) => {
    return await ctx.db.get(args.messageId);
  },
});

export const getConversationForContact = internalQuery({
  args: {
    businessId: v.id("businesses"),
    contactId: v.id("contacts"),
    channel: v.string(),
  },
  handler: async (
    ctx: QueryCtx,
    args: ConversationForContactArgs,
  ): Promise<Doc<"conversations"> | null> => {
    return await getOpenConversationForContact(ctx, args);
  },
});

export const ingestInboundSms = internalMutation({
  args: {
    businessId: v.id("businesses"),
    from: v.string(),
    channel: v.string(),
    body: v.string(),
    providerMessageSid: v.optional(v.string()),
    optOutType: v.optional(v.string()),
    idempotencyKeyId: v.optional(v.id("idempotency_keys")),
    media: v.optional(
      v.array(
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
    ),
  },
  handler: async (
    ctx: MutationCtx,
    args: IngestInboundSmsArgs,
  ): Promise<IngestInboundSmsResult> => {
    const existingContact = await ctx.db
      .query("contacts")
      .withIndex("by_business_id_and_phone", (q) =>
        q.eq("businessId", args.businessId).eq("phone", args.from),
      )
      .unique();

    const consentUpdate = classifySmsConsentUpdate({
      body: args.body,
      ...(args.optOutType !== undefined ? { optOutType: args.optOutType } : {}),
    });
    const consentUpdatedAt = consentUpdate ? new Date().toISOString() : undefined;

    const contactId =
      existingContact?._id ??
      (await ctx.db.insert("contacts", {
        businessId: args.businessId,
        phone: args.from,
        ...(consentUpdate ? { smsConsentStatus: consentUpdate.status } : {}),
        ...(consentUpdatedAt ? { smsConsentUpdatedAt: consentUpdatedAt } : {}),
        ...(consentUpdate ? { smsConsentSource: consentUpdate.source } : {}),
      }));

    if (existingContact && consentUpdate) {
      await ctx.db.patch(existingContact._id, {
        smsConsentStatus: consentUpdate.status,
        ...(consentUpdatedAt ? { smsConsentUpdatedAt: consentUpdatedAt } : {}),
        smsConsentSource: consentUpdate.source,
      });
    }

    const conversation = await ctx.runQuery(internal.conversations.webhooks.getConversationForContact, {
      businessId: args.businessId,
      contactId,
      channel: args.channel,
    });

    const { conversationId }: { conversationId: Id<"conversations"> } = await ctx.runMutation(
      internal.conversations.webhooks.storeInboundMessage,
      {
        businessId: args.businessId,
        contactId,
        channel: args.channel,
        body: args.body,
        ...(args.providerMessageSid !== undefined
          ? { providerMessageSid: args.providerMessageSid }
          : {}),
        ...(args.media !== undefined && args.media.length > 0 ? { media: args.media } : {}),
      },
    );

    if (args.idempotencyKeyId) {
      await ctx.db.patch(args.idempotencyKeyId, {
        resourceTable: "conversations",
        resourceId: String(conversationId),
        status: "inbound_recorded",
      });
    }

    const nextConsentStatus = consentUpdate?.status ?? existingContact?.smsConsentStatus;
    const automationState =
      conversation?.automationState === "human_handoff" ? "human_handoff" : "ai_active";

    return {
      conversationId,
      contactId,
      replySuppressed:
        nextConsentStatus === "opted_out" || automationState === "human_handoff",
      automationState,
    };
  },
});

export const getOrCreateContact = internalMutation({
  args: {
    businessId: v.id("businesses"),
    phone: v.string(),
  },
  handler: async (ctx: MutationCtx, args: GetOrCreateContactArgs): Promise<Id<"contacts">> => {
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_business_id_and_phone", (q) =>
        q.eq("businessId", args.businessId).eq("phone", args.phone),
      )
      .unique();
    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("contacts", {
      businessId: args.businessId,
      phone: args.phone,
    });
  },
});

export const getOutboundMessageDeliveryContext = internalQuery({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (
    ctx: QueryCtx,
    args: MessageIdArgs,
  ): Promise<OutboundMessageDeliveryContext | null> => {
    const message = await ctx.db.get(args.messageId);
    if (!message || message.direction !== "outbound" || message.channel !== "sms") {
      return null;
    }

    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation || !conversation.contactId) {
      throw new Error("Conversation is missing a contact for SMS delivery.");
    }

    const [contact, phoneNumbers] = await Promise.all([
      ctx.db.get(conversation.contactId),
      ctx.db
        .query("phone_numbers")
        .withIndex("by_business_id", (q) => q.eq("businessId", message.businessId))
        .collect(),
    ]);

    if (!contact) {
      throw new Error("Contact not found for SMS delivery.");
    }

    const senderPhoneNumber = selectSmsSenderPhoneNumber(
      phoneNumbers,
      message.fromPhoneNumber,
    );
    if (!senderPhoneNumber) {
      throw new Error(
        "At least one active SMS-enabled phone number must be mapped to the business.",
      );
    }

    return {
      businessId: message.businessId,
      conversationId: message.conversationId,
      messageId: message._id,
      body: message.body,
      from: senderPhoneNumber,
      to: contact.phone,
      ...(message.providerMessageSid !== undefined
        ? { providerMessageSid: message.providerMessageSid }
        : {}),
      status: message.status,
      ...(message.media !== undefined ? { media: message.media } : {}),
      ...(message.appointmentId !== undefined ? { appointmentId: message.appointmentId } : {}),
    };
  },
});

export const storeInboundMessage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    contactId: v.id("contacts"),
    channel: v.string(),
    body: v.string(),
    providerMessageSid: v.optional(v.string()),
    media: v.optional(
      v.array(
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
    ),
  },
  handler: async (
    ctx: MutationCtx,
    args: StoreInboundMessageArgs,
  ): Promise<{ conversationId: Id<"conversations"> }> => {
    const existing: Doc<"conversations"> | null = await ctx.runQuery(
      internal.conversations.webhooks.getConversationForContact,
      {
        businessId: args.businessId,
        contactId: args.contactId,
        channel: args.channel,
      },
    );

    const conversationId: Id<"conversations"> =
      existing?._id ??
      (await ctx.db.insert("conversations", {
        businessId: args.businessId,
        contactId: args.contactId,
        channel: args.channel,
        status: "open",
        automationState: "ai_active",
      }));

    const messageId = await ctx.db.insert("messages", {
      businessId: args.businessId,
      conversationId,
      direction: "inbound",
      channel: args.channel,
      ...(args.providerMessageSid !== undefined
        ? { providerMessageSid: args.providerMessageSid }
        : {}),
      ...(args.media !== undefined && args.media.length > 0 ? { media: args.media } : {}),
      body: args.body,
      status: "received",
      aiGenerated: false,
    });

    await ensureSessionForStoredMessage(ctx, {
      businessId: args.businessId,
      conversationId,
      channel: args.channel,
      messageId,
    });

    if (
      args.media?.some(
        (attachment) =>
          ((attachment.storageId &&
            !attachment.url &&
            attachment.fileName &&
            attachment.contentType) ||
            (attachment.previewStorageId &&
              !attachment.previewUrl &&
              attachment.previewFileName &&
              attachment.previewContentType)),
      )
    ) {
      await ctx.runMutation(internal.dashboard.messages.materializeMessageAttachmentUrls, {
        messageId,
      });
    }

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "sms.inbound_received",
        businessId: args.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
        conversationId: String(conversationId),
        messageId: String(messageId),
        channel: args.channel,
        provider: "twilio",
        properties: {
          hasMedia: Boolean(args.media?.length),
          mediaCount: args.media?.length ?? 0,
        },
      }),
    );

    return { conversationId };
  },
});

export const storeOutboundMessage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    channel: v.string(),
    body: v.string(),
    fromPhoneNumber: v.optional(v.string()),
    appointmentId: v.optional(v.id("appointments")),
    media: v.optional(
      v.array(
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
    ),
    aiGenerated: v.optional(v.boolean()),
  },
  handler: async (ctx: MutationCtx, args: StoreOutboundMessageArgs): Promise<Id<"messages">> => {
    const messageId = await ctx.db.insert("messages", {
      businessId: args.businessId,
      conversationId: args.conversationId,
      direction: "outbound",
      channel: args.channel,
      ...(args.fromPhoneNumber !== undefined ? { fromPhoneNumber: args.fromPhoneNumber } : {}),
      ...(args.appointmentId !== undefined ? { appointmentId: args.appointmentId } : {}),
      ...(args.media !== undefined && args.media.length > 0 ? { media: args.media } : {}),
      body: args.body,
      status: "queued",
      aiGenerated: args.aiGenerated ?? true,
    });

    await ensureSessionForStoredMessage(ctx, {
      businessId: args.businessId,
      conversationId: args.conversationId,
      channel: args.channel,
      messageId,
    });

    if (
      args.media?.some(
        (attachment) =>
          ((attachment.storageId &&
            !attachment.url &&
            attachment.fileName &&
            attachment.contentType) ||
            (attachment.previewStorageId &&
              !attachment.previewUrl &&
              attachment.previewFileName &&
              attachment.previewContentType)),
      )
    ) {
      await ctx.runMutation(internal.dashboard.messages.materializeMessageAttachmentUrls, {
        messageId,
      });
    }

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "sms.reply_generated",
        businessId: args.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
        conversationId: String(args.conversationId),
        messageId: String(messageId),
        ...(args.appointmentId !== undefined
          ? { appointmentId: String(args.appointmentId) }
          : {}),
        channel: args.channel,
        provider: "twilio",
        properties: {
          aiGenerated: args.aiGenerated ?? true,
          hasMedia: Boolean(args.media?.length),
          mediaCount: args.media?.length ?? 0,
        },
      }),
    );

    return messageId;
  },
});

export const reserveOutboundAiMessage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    channel: v.string(),
    fromPhoneNumber: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: ReserveOutboundAiMessageArgs,
  ): Promise<Id<"messages">> => {
    return await ctx.db.insert("messages", {
      businessId: args.businessId,
      conversationId: args.conversationId,
      direction: "outbound",
      channel: args.channel,
      ...(args.fromPhoneNumber !== undefined ? { fromPhoneNumber: args.fromPhoneNumber } : {}),
      body: "",
      status: "draft",
      aiGenerated: true,
    });
  },
});

export const finalizeReservedOutboundMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    body: v.string(),
    appointmentId: v.optional(v.id("appointments")),
    media: v.optional(
      v.array(
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
    ),
  },
  handler: async (ctx: MutationCtx, args: FinalizeReservedOutboundMessageArgs) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Reserved outbound message not found.");
    }

    if (message.direction !== "outbound") {
      throw new Error("Only outbound messages can be finalized.");
    }

    await ctx.db.patch(args.messageId, {
      body: args.body,
      status: "queued",
      ...(args.appointmentId !== undefined ? { appointmentId: args.appointmentId } : {}),
      ...(args.media !== undefined && args.media.length > 0 ? { media: args.media } : {}),
    });

    await ensureSessionForStoredMessage(ctx, {
      businessId: message.businessId,
      conversationId: message.conversationId,
      channel: message.channel,
      messageId: args.messageId,
    });

    if (
      args.media?.some(
        (attachment) =>
          ((attachment.storageId &&
            !attachment.url &&
            attachment.fileName &&
            attachment.contentType) ||
            (attachment.previewStorageId &&
              !attachment.previewUrl &&
              attachment.previewFileName &&
              attachment.previewContentType)),
      )
    ) {
      await ctx.runMutation(internal.dashboard.messages.materializeMessageAttachmentUrls, {
        messageId: args.messageId,
      });
    }

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "sms.reply_generated",
        businessId: message.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(message.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(message.businessId)),
        conversationId: String(message.conversationId),
        messageId: String(args.messageId),
        ...(args.appointmentId !== undefined
          ? { appointmentId: String(args.appointmentId) }
          : {}),
        channel: message.channel,
        provider: "twilio",
        properties: {
          aiGenerated: message.aiGenerated,
          hasMedia: Boolean(args.media?.length),
          mediaCount: args.media?.length ?? 0,
        },
      }),
    );

    return null;
  },
});

export const discardReservedOutboundMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx: MutationCtx, args: MessageIdArgs) => {
    const message = await ctx.db.get(args.messageId);
    if (!message || message.direction !== "outbound") {
      return null;
    }

    if (message.status === "draft" && message.body.trim().length === 0) {
      await ctx.db.delete(args.messageId);
    }

    return null;
  },
});

export const markOutboundMessageAccepted = internalMutation({
  args: {
    messageId: v.id("messages"),
    providerMessageSid: v.string(),
    providerStatus: v.string(),
    providerUpdatedAt: v.string(),
  },
  handler: async (ctx: MutationCtx, args: MarkOutboundMessageAcceptedArgs) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found.");
    }

    await ctx.db.patch(args.messageId, {
      providerMessageSid: args.providerMessageSid,
      status: mapTwilioStatusToMessageStatus(args.providerStatus),
      providerStatus: args.providerStatus,
      providerUpdatedAt: args.providerUpdatedAt,
    });

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "sms.delivery_accepted",
        businessId: message.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(message.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(message.businessId)),
        conversationId: String(message.conversationId),
        messageId: String(args.messageId),
        ...(message.appointmentId !== undefined
          ? { appointmentId: String(message.appointmentId) }
          : {}),
        channel: message.channel,
        provider: "twilio",
        properties: {
          providerMessageSid: args.providerMessageSid,
          providerStatus: args.providerStatus,
        },
      }),
    );
    return null;
  },
});

export const markOutboundMessageSendFailed = internalMutation({
  args: {
    messageId: v.id("messages"),
    providerUpdatedAt: v.string(),
    providerStatus: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: MarkOutboundMessageSendFailedArgs) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found.");
    }

    await ctx.db.patch(args.messageId, {
      status: "failed",
      providerStatus: args.providerStatus ?? "failed",
      providerUpdatedAt: args.providerUpdatedAt,
    });

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "sms.delivery_failed",
        businessId: message.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(message.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(message.businessId)),
        conversationId: String(message.conversationId),
        messageId: String(args.messageId),
        ...(message.appointmentId !== undefined
          ? { appointmentId: String(message.appointmentId) }
          : {}),
        channel: message.channel,
        provider: "twilio",
        properties: {
          providerStatus: args.providerStatus ?? "failed",
        },
      }),
    );
    return null;
  },
});

export const sendStoredOutboundMessage = internalAction({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (
    ctx: ActionCtx,
    args: MessageIdArgs,
  ): Promise<SendStoredOutboundMessageResult> => {
    const context: OutboundMessageDeliveryContext | null = await ctx.runQuery(
      internal.conversations.webhooks.getOutboundMessageDeliveryContext,
      {
        messageId: args.messageId,
      },
    );

    if (!context) {
      throw new Error("Outbound message not found.");
    }

    if (context.providerMessageSid) {
      return {
        businessId: context.businessId,
        conversationId: context.conversationId,
        messageId: context.messageId,
        reply: context.body,
        providerMessageSid: context.providerMessageSid,
        status: context.status,
      };
    }

    if (context.appointmentId && context.status === "failed") {
      await ctx.runMutation(
        internal.notifications.reminders.ensureBookingConfirmationNotification,
        {
          appointmentId: context.appointmentId,
        },
      );

      return {
        businessId: context.businessId,
        conversationId: context.conversationId,
        messageId: context.messageId,
        reply: context.body,
        status: context.status,
      };
    }

    try {
      const directMediaUrls =
        context.media
          ?.filter((attachment) => attachment.deliveryMode !== "link" && attachment.url)
          .map((attachment) => attachment.url!)
          .filter((url): url is string => Boolean(url)) ?? [];
      const linkOnlyAttachments =
        context.media?.filter(
          (attachment): attachment is MessageMediaAttachment & { url: string } =>
            attachment.deliveryMode === "link" && Boolean(attachment.url),
        ) ?? [];
      const outboundBodyParts = [
        context.body.trim(),
        linkOnlyAttachments.length > 0 ? buildLinkOnlyAttachmentText(linkOnlyAttachments) : "",
      ].filter((part) => part.length > 0);

      const result = await ctx.runAction(internal.integrations.twilioSms.sendMessage, {
        to: context.to,
        from: context.from,
        body: outboundBodyParts.join("\n\n"),
        statusCallbackUrl: buildTwilioSmsStatusCallbackUrl(),
        ...(directMediaUrls.length > 0 ? { mediaUrls: directMediaUrls } : {}),
      });

      await ctx.runMutation(internal.conversations.webhooks.markOutboundMessageAccepted, {
        messageId: context.messageId,
        providerMessageSid: result.providerMessageSid,
        providerStatus: result.providerStatus,
        providerUpdatedAt: new Date().toISOString(),
      });

      return {
        businessId: context.businessId,
        conversationId: context.conversationId,
        messageId: context.messageId,
        reply: context.body,
        providerMessageSid: result.providerMessageSid,
        status: mapTwilioStatusToMessageStatus(result.providerStatus),
      };
    } catch (error) {
      await ctx.runMutation(internal.conversations.webhooks.markOutboundMessageSendFailed, {
        messageId: context.messageId,
        providerUpdatedAt: new Date().toISOString(),
      });
      if (context.appointmentId) {
        await ctx.runMutation(
          internal.notifications.reminders.ensureBookingConfirmationNotification,
          {
            appointmentId: context.appointmentId,
          },
        );
        return {
          businessId: context.businessId,
          conversationId: context.conversationId,
          messageId: context.messageId,
          reply: context.body,
          status: "failed",
        };
      }
      throw error;
    }
  },
});

export const handleTwilioSmsInbound = internalAction({
  args: {
    from: v.string(),
    to: v.string(),
    body: v.string(),
    messageSid: v.optional(v.string()),
    smsSid: v.optional(v.string()),
    optOutType: v.optional(v.string()),
    media: v.optional(
      v.array(
        v.object({
          url: v.string(),
          contentType: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (
    ctx: ActionCtx,
    args: HandleTwilioSmsInboundArgs,
  ): Promise<HandleTwilioSmsInboundResult> => {
    const phoneNumber: Doc<"phone_numbers"> | null = await ctx.runQuery(
      internal.businesses.catalog.resolveBusinessByPhoneNumber,
      { e164: args.to, channel: "sms" },
    );

    if (!phoneNumber) {
      throw new Error("No business is mapped to this phone number.");
    }

    const providerInboundSid = args.messageSid ?? args.smsSid;
    let idempotencyKeyId: Id<"idempotency_keys"> | null = null;

    if (providerInboundSid) {
      const claim: ClaimInboundMessageSidResult = await ctx.runMutation(
        internal.conversations.webhooks.claimInboundMessageSid,
        {
          scope: "twilio_sms_inbound",
          key: providerInboundSid,
        },
      );

      if (!claim.claimed) {
        if (claim.existing.resourceTable === "messages" && claim.existing.resourceId) {
          const resent: SendStoredOutboundMessageResult = await ctx.runAction(
            internal.conversations.webhooks.sendStoredOutboundMessage,
            {
              messageId: asMessageId(claim.existing.resourceId),
            },
          );

          return {
            businessId: resent.businessId,
            conversationId: resent.conversationId,
            reply: resent.reply,
          };
        }

        if (claim.existing.resourceTable === "conversations" && claim.existing.resourceId) {
          const conversation: Doc<"conversations"> | null = await ctx.runQuery(
            internal.conversations.webhooks.getConversationById,
            {
              conversationId: asConversationId(claim.existing.resourceId),
            },
          );
          const latestReply: Doc<"messages"> | null = await ctx.runQuery(
            internal.conversations.webhooks.getLatestOutboundReply,
            {
              conversationId: asConversationId(claim.existing.resourceId),
            },
          );
          if (conversation) {
            return {
              businessId: conversation.businessId,
              conversationId: conversation._id,
              reply: latestReply?.body ?? "Thanks, we already received that message.",
            };
          }
        }
      } else {
        idempotencyKeyId = claim.id;
      }
    }

    const normalizedMedia =
      args.media && args.media.length > 0
        ? await ctx.runAction(internal.integrations.twilioSms.ingestInboundMedia, {
            media: args.media.map((attachment) => ({
              url: attachment.url ?? "",
              ...(attachment.contentType !== undefined
                ? { contentType: attachment.contentType }
                : {}),
            })),
          })
        : undefined;

    const { conversationId, replySuppressed, automationState }: IngestInboundSmsResult = await ctx.runMutation(
      internal.conversations.webhooks.ingestInboundSms,
      {
        businessId: phoneNumber.businessId,
        from: args.from,
        channel: "sms",
        body: args.body,
        ...(providerInboundSid !== undefined ? { providerMessageSid: providerInboundSid } : {}),
        ...(args.optOutType !== undefined ? { optOutType: args.optOutType } : {}),
        ...(idempotencyKeyId !== null ? { idempotencyKeyId } : {}),
        ...(normalizedMedia !== undefined ? { media: normalizedMedia } : {}),
      },
    );

    if (replySuppressed) {
      if (idempotencyKeyId) {
        await ctx.runMutation(internal.conversations.webhooks.linkIdempotencyKey, {
          idempotencyKeyId,
          resourceTable: "conversations",
          resourceId: String(conversationId),
          status:
            automationState === "human_handoff"
              ? "processed_human_handoff"
              : "processed_no_reply",
        });
      }

      return { businessId: phoneNumber.businessId, conversationId, reply: null };
    }

    const prompt = buildInboundSmsPrompt({
      body: args.body,
      ...(normalizedMedia ? { media: normalizedMedia } : {}),
    });
    const messageId: Id<"messages"> = await ctx.runMutation(
      internal.conversations.webhooks.reserveOutboundAiMessage,
      {
        businessId: phoneNumber.businessId,
        conversationId,
        channel: "sms",
        fromPhoneNumber: phoneNumber.e164,
      },
    );

    let reply: string;
    try {
      const rawReply: string = await ctx.runAction(
        internal.ai.agents.runtime.generateSmsReply,
        {
          businessId: phoneNumber.businessId,
          conversationId,
          prompt,
          messageId,
        },
      );
      reply = rawReply.trim() || "I'm sorry, could you rephrase that?";
      const appointmentId: Id<"appointments"> | null = await ctx.runMutation(
        internal.ai.agents.runtime.consumePendingConfirmationAppointmentId,
        {
          conversationId,
        },
      );

      await ctx.runMutation(
        internal.conversations.webhooks.finalizeReservedOutboundMessage,
        {
          messageId,
          body: reply,
          ...(appointmentId !== null ? { appointmentId } : {}),
        },
      );
    } catch (error) {
      await ctx.runMutation(internal.conversations.webhooks.discardReservedOutboundMessage, {
        messageId,
      });
      throw error;
    }

    if (idempotencyKeyId) {
      await ctx.runMutation(internal.conversations.webhooks.linkIdempotencyKey, {
        idempotencyKeyId,
        resourceTable: "messages",
        resourceId: String(messageId),
        status: "reply_generated",
      });
    }

    await ctx.runAction(internal.conversations.webhooks.sendStoredOutboundMessage, {
      messageId,
    });

    if (idempotencyKeyId) {
      await ctx.runMutation(internal.conversations.webhooks.linkIdempotencyKey, {
        idempotencyKeyId,
        resourceTable: "messages",
        resourceId: String(messageId),
        status: "processed",
      });
    }

    return { businessId: phoneNumber.businessId, conversationId, reply };
  },
});
