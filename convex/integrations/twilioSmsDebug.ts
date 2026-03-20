import { v } from "convex/values";

import { internalQuery, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

async function listSmsConversationsForContact(
  ctx: QueryCtx,
  args: { businessId: Id<"businesses">; contactId: Id<"contacts"> },
): Promise<Array<Doc<"conversations">>> {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_business_id_and_contact_id", (q) =>
      q.eq("businessId", args.businessId).eq("contactId", args.contactId),
    )
    .collect();

  return conversations.filter((conversation) => conversation.channel === "sms");
}

export const getMessageByProviderMessageSid = internalQuery({
  args: {
    businessId: v.id("businesses"),
    providerMessageSid: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"messages"> | null> => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_provider_message_sid", (q) =>
        q.eq("providerMessageSid", args.providerMessageSid),
      )
      .unique();

    if (!message || message.businessId !== args.businessId) {
      return null;
    }

    return message;
  },
});

export const getMessagesByCounterpartyPhone = internalQuery({
  args: {
    businessId: v.id("businesses"),
    phone: v.string(),
  },
  handler: async (ctx, args): Promise<Array<Doc<"messages">>> => {
    const contact = await ctx.db
      .query("contacts")
      .withIndex("by_business_id_and_phone", (q) =>
        q.eq("businessId", args.businessId).eq("phone", args.phone),
      )
      .unique();
    if (!contact) {
      return [];
    }

    const conversations = await listSmsConversationsForContact(ctx, {
      businessId: args.businessId,
      contactId: contact._id,
    });
    const messages = await Promise.all(
      conversations.map((conversation) =>
        ctx.db
          .query("messages")
          .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
          .collect(),
      ),
    );

    return messages.flat().sort((left, right) => left._creationTime - right._creationTime);
  },
});

export const listPhoneNumbersWithWebhookIssues = internalQuery({
  args: {
    businessId: v.id("businesses"),
    staleBefore: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"phone_numbers">>> => {
    const phoneNumbers = await ctx.db
      .query("phone_numbers")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();

    return phoneNumbers.filter((phoneNumber) => {
      if (phoneNumber.smsWebhookStatus === "failed") {
        return true;
      }

      if (!args.staleBefore) {
        return false;
      }

      if (!phoneNumber.smsEnabled || phoneNumber.status !== "active" || !phoneNumber.twilioPhoneSid) {
        return false;
      }

      if (phoneNumber.smsWebhookStatus !== "synced") {
        return true;
      }

      return !phoneNumber.smsWebhookLastSyncedAt || phoneNumber.smsWebhookLastSyncedAt < args.staleBefore;
    });
  },
});
