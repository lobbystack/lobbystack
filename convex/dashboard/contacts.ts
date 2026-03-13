import { v } from "convex/values";

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";

async function getCallsForConversation(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<Array<Doc<"calls">>> {
  return await ctx.db
    .query("calls")
    .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
    .collect();
}

export const listContacts = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_business_id_and_phone", (q) => q.eq("businessId", args.businessId))
      .collect();

    const rows = await Promise.all(
      contacts.map(async (contact) => {
        const [conversations, appointments] = await Promise.all([
          ctx.db
            .query("conversations")
            .withIndex("by_business_id_and_contact_id", (q) =>
              q.eq("businessId", args.businessId).eq("contactId", contact._id),
            )
            .collect(),
          ctx.db
            .query("appointments")
            .withIndex("by_contact_id_and_starts_at", (q) => q.eq("contactId", contact._id))
            .collect(),
        ]);

        const callsByConversation = await Promise.all(
          conversations.map((conversation) => getCallsForConversation(ctx, conversation._id)),
        );
        const messagesByConversation = await Promise.all(
          conversations.map((conversation) =>
            ctx.db
              .query("messages")
              .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
              .collect(),
          ),
        );

        const allCalls = callsByConversation.flat();
        const allMessages = messagesByConversation.flat();
        const lastInteractionAt = Math.max(
          contact._creationTime,
          ...appointments.map((appointment) => Date.parse(appointment.startsAt)),
          ...allCalls.map((call) => Date.parse(call.startedAt)),
          ...allMessages.map((message) => message._creationTime),
        );

        return {
          id: contact._id,
          name: contact.name ?? null,
          phone: contact.phone,
          email: contact.email ?? null,
          timezone: contact.timezone ?? null,
          preferredLocale: contact.preferredLocale ?? null,
          conversationCount: conversations.length,
          messageCount: allMessages.length,
          callCount: allCalls.length,
          appointmentCount: appointments.length,
          lastInteractionAt,
        };
      }),
    );

    return rows.sort((left, right) => right.lastInteractionAt - left.lastInteractionAt);
  },
});
