import { v } from "convex/values";

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";

async function getContact(
  ctx: QueryCtx,
  contactId: Id<"contacts"> | undefined,
): Promise<Doc<"contacts"> | null> {
  if (!contactId) {
    return null;
  }

  return await ctx.db.get(contactId);
}

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

        return {
          id: conversation._id,
          channel: conversation.channel,
          status: conversation.status,
          contactName: contact?.name ?? null,
          contactPhone: contact?.phone ?? null,
          contactEmail: contact?.email ?? null,
          messageCount: messages.length,
          lastMessageBody: latestMessage?.body ?? null,
          lastMessageDirection: latestMessage?.direction ?? null,
          lastMessageAt: latestMessage?._creationTime ?? conversation._creationTime,
        };
      }),
    );

    return summaries.sort((left, right) => right.lastMessageAt - left.lastMessageAt);
  },
});

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

    const [contact, messages] = await Promise.all([
      getContact(ctx, conversation.contactId),
      ctx.db
        .query("messages")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
        .collect(),
    ]);

    return {
      conversation: {
        id: conversation._id,
        channel: conversation.channel,
        status: conversation.status,
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
      messages: messages.map((message) => ({
        id: message._id,
        direction: message.direction,
        body: message.body,
        status: message.status,
        channel: message.channel,
        createdAt: message._creationTime,
      })),
    };
  },
});
