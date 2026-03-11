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

function asConversationId(value: string): Id<"conversations"> {
  return value as Id<"conversations">;
}

type ConversationIdArgs = { conversationId: Id<"conversations"> };
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
};
type StoreOutboundMessageArgs = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  channel: string;
  body: string;
};
type HandleTwilioSmsInboundArgs = {
  from: string;
  to: string;
  body: string;
  messageSid?: string;
};
type HandleTwilioSmsInboundResult = {
  businessId: Id<"businesses">;
  conversationId: Id<"conversations">;
  reply: string;
};

export const getLatestOutboundReply = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (
    ctx: QueryCtx,
    args: ConversationIdArgs,
  ): Promise<Doc<"messages"> | null> => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    return messages
      .filter((message) => message.direction === "outbound")
      .sort((left, right) => right._creationTime - left._creationTime)[0] ?? null;
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

export const findIdempotencyKey = internalQuery({
  args: {
    scope: v.string(),
    key: v.string(),
  },
  handler: async (ctx: QueryCtx, args: ClaimInboundMessageSidArgs) => {
    return await ctx.db
      .query("idempotency_keys")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", args.key))
      .unique();
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

export const storeInboundMessage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    contactId: v.id("contacts"),
    channel: v.string(),
    body: v.string(),
    providerMessageSid: v.optional(v.string()),
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
      }));

    await ctx.db.insert("messages", {
      businessId: args.businessId,
      conversationId,
      direction: "inbound",
      channel: args.channel,
      ...(args.providerMessageSid !== undefined
        ? { providerMessageSid: args.providerMessageSid }
        : {}),
      body: args.body,
      status: "received",
      aiGenerated: false,
    });

    return { conversationId };
  },
});

export const storeOutboundMessage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    channel: v.string(),
    body: v.string(),
  },
  handler: async (ctx: MutationCtx, args: StoreOutboundMessageArgs): Promise<Id<"messages">> => {
    return await ctx.db.insert("messages", {
      businessId: args.businessId,
      conversationId: args.conversationId,
      direction: "outbound",
      channel: args.channel,
      body: args.body,
      status: "queued",
      aiGenerated: true,
    });
  },
});

export const handleTwilioSmsInbound = internalAction({
  args: {
    from: v.string(),
    to: v.string(),
    body: v.string(),
    messageSid: v.optional(v.string()),
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

    if (args.messageSid) {
      const claim: ClaimInboundMessageSidResult = await ctx.runMutation(
        internal.conversations.webhooks.claimInboundMessageSid,
        {
          scope: "twilio_sms_inbound",
          key: args.messageSid,
        },
      );

      if (!claim.claimed) {
        if (
          claim.existing.resourceTable === "conversations" &&
          claim.existing.resourceId
        ) {
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
      }
    }

    const contactId: Id<"contacts"> = await ctx.runMutation(
      internal.conversations.webhooks.getOrCreateContact,
      {
        businessId: phoneNumber.businessId,
        phone: args.from,
      },
    );

    const { conversationId }: { conversationId: Id<"conversations"> } = await ctx.runMutation(
      internal.conversations.webhooks.storeInboundMessage,
      {
        businessId: phoneNumber.businessId,
        contactId,
        channel: "sms",
        body: args.body,
        providerMessageSid: args.messageSid,
      },
    );

    const reply: string = await ctx.runAction(internal.ai.agents.runtime.generateSmsReply, {
      businessId: phoneNumber.businessId,
      conversationId,
      prompt: args.body,
    });

    await ctx.runMutation(internal.conversations.webhooks.storeOutboundMessage, {
      businessId: phoneNumber.businessId,
      conversationId,
      channel: "sms",
      body: reply,
    });

    if (args.messageSid) {
      const existing = await ctx.runQuery(
        internal.conversations.webhooks.findIdempotencyKey,
        {
          scope: "twilio_sms_inbound",
          key: args.messageSid,
        },
      );

      if (existing) {
        await ctx.runMutation(internal.conversations.webhooks.linkIdempotencyKey, {
          idempotencyKeyId: existing._id,
          resourceTable: "conversations",
          resourceId: String(conversationId),
          status: "processed",
        });
      }
    }

    return { businessId: phoneNumber.businessId, conversationId, reply };
  },
});
