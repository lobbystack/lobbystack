import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCurrentUser, requireMembership } from "../lib/auth";
import { isContactBlocked } from "../lib/contactBlocking";

async function getCallsForConversation(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<Array<Doc<"calls">>> {
  return await ctx.db
    .query("calls")
    .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
    .collect();
}

function formatOperatorDisplayName(user: Doc<"users"> | null): string | null {
  if (!user) {
    return null;
  }

  return user.displayName ?? user.name ?? user.email ?? null;
}

const CONTACT_DELETE_DEPENDENCIES_ERROR =
  "This contact can't be deleted because it still has linked conversations or appointments.";

export const listContacts = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const now = Date.now();

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_business_id_and_phone", (q) => q.eq("businessId", args.businessId))
      .collect();
    const blockedByUsers = await Promise.all(
      [...new Set(contacts.map((contact) => contact.operatorBlockedByUserId).filter(Boolean))]
        .map((userId) => ctx.db.get(userId!)),
    );
    const blockedByNameMap = new Map(
      blockedByUsers
        .filter((user): user is Doc<"users"> => user !== null)
        .map((user) => [String(user._id), formatOperatorDisplayName(user)]),
    );

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
        const pastAppointmentTimestamps = appointments
          .map((appointment) => Date.parse(appointment.startsAt))
          .filter((timestamp) => timestamp <= now);
        const lastInteractionAt = Math.max(
          contact._creationTime,
          ...pastAppointmentTimestamps,
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
          isBlocked: isContactBlocked(contact),
          blockedAt: contact.operatorBlockedAt ?? null,
          blockedByName: contact.operatorBlockedByUserId
            ? (blockedByNameMap.get(String(contact.operatorBlockedByUserId)) ?? null)
            : null,
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

export const blockContact = mutation({
  args: {
    businessId: v.id("businesses"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx: MutationCtx, args) => {
    await requireMembership(ctx, args.businessId);
    const currentUser = await requireCurrentUser(ctx);

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.businessId !== args.businessId) {
      throw new Error("Contact not found.");
    }

    await ctx.db.patch(contact._id, {
      operatorBlockedAt: new Date().toISOString(),
      operatorBlockedByUserId: currentUser._id,
    });

    return null;
  },
});

export const unblockContact = mutation({
  args: {
    businessId: v.id("businesses"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx: MutationCtx, args) => {
    await requireMembership(ctx, args.businessId);

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.businessId !== args.businessId) {
      throw new Error("Contact not found.");
    }

    await ctx.db.patch(contact._id, {
      operatorBlockedAt: undefined,
      operatorBlockedByUserId: undefined,
    });

    return null;
  },
});

export const deleteContact = mutation({
  args: {
    businessId: v.id("businesses"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx: MutationCtx, args) => {
    await requireMembership(ctx, args.businessId);

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.businessId !== args.businessId) {
      throw new Error("Contact not found.");
    }

    const [linkedConversations, linkedAppointments] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_contact_id", (q) =>
          q.eq("businessId", args.businessId).eq("contactId", contact._id),
        )
        .take(1),
      ctx.db
        .query("appointments")
        .withIndex("by_contact_id_and_starts_at", (q) => q.eq("contactId", contact._id))
        .take(1),
    ]);

    if (linkedConversations.length > 0 || linkedAppointments.length > 0) {
      throw new Error(CONTACT_DELETE_DEPENDENCIES_ERROR);
    }

    await ctx.db.delete(args.contactId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Activity feed item types
// ---------------------------------------------------------------------------

type ActivityItem = {
  kind: "call" | "message" | "appointment";
  timestamp: number;
  callId?: Id<"calls"> | undefined;
  callDurationSeconds?: number | undefined;
  callStatus?: string | undefined;
  callDisposition?: string | undefined;
  messageDirection?: string | undefined;
  messageBody?: string | undefined;
  messageChannel?: string | undefined;
  appointmentId?: Id<"appointments"> | undefined;
  appointmentServiceName?: string | undefined;
  appointmentStaffName?: string | undefined;
  appointmentStartsAt?: string | undefined;
  appointmentStatus?: string | undefined;
};

// ---------------------------------------------------------------------------
// getContactDetail
// ---------------------------------------------------------------------------

export const getContactDetail = query({
  args: {
    businessId: v.id("businesses"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.businessId !== args.businessId) {
      return null;
    }

    // Fetch conversations for this contact
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_business_id_and_contact_id", (q) =>
        q.eq("businessId", args.businessId).eq("contactId", contact._id),
      )
      .collect();

    // Fetch appointments for this contact
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_contact_id_and_starts_at", (q) => q.eq("contactId", contact._id))
      .collect();

    // Fetch calls and messages per conversation
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
    const blockedByUser = contact.operatorBlockedByUserId
      ? await ctx.db.get(contact.operatorBlockedByUserId)
      : null;

    // Resolve service and staff names for appointments
    const serviceIds = [...new Set(appointments.map((a) => a.serviceId))];
    const staffIds = [...new Set(appointments.map((a) => a.staffId))];
    const [services, staffMembers] = await Promise.all([
      Promise.all(serviceIds.map((id) => ctx.db.get(id))),
      Promise.all(staffIds.map((id) => ctx.db.get(id))),
    ]);
    const serviceNameMap = new Map(
      services.filter(Boolean).map((s) => [s!._id, s!.name]),
    );
    const staffNameMap = new Map(
      staffMembers.filter(Boolean).map((s) => [s!._id, s!.name]),
    );

    // Build enriched appointments list
    const enrichedAppointments = appointments.map((appointment) => ({
      id: appointment._id,
      serviceName: serviceNameMap.get(appointment.serviceId) ?? null,
      staffName: staffNameMap.get(appointment.staffId) ?? null,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      timezone: appointment.timezone,
      status: appointment.status,
      sourceChannel: appointment.sourceChannel,
      calendarSyncState: appointment.calendarSyncState,
    }));

    // Build merged activity feed (last 50 items, reverse-chronological)
    const activityItems: ActivityItem[] = [];

    for (const call of allCalls) {
      const durationSeconds =
        call.recordingDurationMs !== undefined
          ? call.recordingDurationMs / 1000
          : call.providerCallDurationSeconds;

      activityItems.push({
        kind: "call",
        timestamp: Date.parse(call.startedAt),
        callId: call._id,
        callDurationSeconds: durationSeconds,
        callStatus: call.status,
        callDisposition: call.disposition ?? undefined,
      });
    }

    for (const message of allMessages) {
      activityItems.push({
        kind: "message",
        timestamp: message._creationTime,
        messageDirection: message.direction,
        messageBody:
          message.body.length > 120
            ? message.body.slice(0, 120) + "…"
            : message.body,
        messageChannel: message.channel,
      });
    }

    for (const appointment of appointments) {
      activityItems.push({
        kind: "appointment",
        timestamp: Date.parse(appointment.startsAt),
        appointmentId: appointment._id,
        appointmentServiceName: serviceNameMap.get(appointment.serviceId) ?? undefined,
        appointmentStaffName: staffNameMap.get(appointment.staffId) ?? undefined,
        appointmentStartsAt: appointment.startsAt,
        appointmentStatus: appointment.status,
      });
    }

    // Sort descending and cap at 50
    activityItems.sort((a, b) => b.timestamp - a.timestamp);
    const activityFeed = activityItems.slice(0, 50);

    return {
      contact: {
        id: contact._id,
        name: contact.name ?? null,
        phone: contact.phone,
        email: contact.email ?? null,
        timezone: contact.timezone ?? null,
        preferredLocale: contact.preferredLocale ?? null,
        isBlocked: isContactBlocked(contact),
        blockedAt: contact.operatorBlockedAt ?? null,
        blockedByName: formatOperatorDisplayName(blockedByUser),
        smsConsentStatus: contact.smsConsentStatus ?? null,
        smsConsentUpdatedAt: contact.smsConsentUpdatedAt ?? null,
        smsConsentSource: contact.smsConsentSource ?? null,
        createdAt: contact._creationTime,
      },
      counts: {
        calls: allCalls.length,
        messages: allMessages.length,
        appointments: appointments.length,
        conversations: conversations.length,
      },
      activityFeed,
      appointments: enrichedAppointments,
    };
  },
});
