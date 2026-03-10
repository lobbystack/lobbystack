// @ts-nocheck
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

async function resolveServiceDocument(
  ctx: Parameters<typeof internalQuery>[0]["handler"] extends never ? never : {
    runQuery: <T>(
      reference: typeof internal.voice.runtime.getActiveServicesForBusiness,
      args: { businessId: Id<"businesses"> },
    ) => Promise<T>;
  },
  businessId: Id<"businesses">,
  serviceName: string,
): Promise<Doc<"services"> | null> {
  const services: Array<Doc<"services">> = await ctx.runQuery(
    internal.voice.runtime.getActiveServicesForBusiness,
    { businessId },
  );
  const comparable = normalizeComparable(serviceName);

  return (
    services.find((service) => normalizeComparable(service.name) === comparable) ??
    services.find((service) => normalizeComparable(service.slug) === comparable) ??
    services.find((service) => normalizeComparable(service.name).includes(comparable)) ??
    null
  );
}

export const getActiveServicesForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("services")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();
  },
});

export const startCall = internalMutation({
  args: {
    businessId: v.id("businesses"),
    twilioCallSid: v.string(),
    gatewaySessionId: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    startedAt: v.string(),
  },
  handler: async (ctx, args) => {
    let contact = await ctx.db
      .query("contacts")
      .withIndex("by_business_id_and_phone", (q) =>
        q.eq("businessId", args.businessId).eq("phone", args.from),
      )
      .unique();

    if (!contact) {
      const contactId = await ctx.db.insert("contacts", {
        businessId: args.businessId,
        phone: args.from,
      });
      contact = await ctx.db.get(contactId);
    }

    if (!contact) {
      throw new Error("Failed to initialize contact for call.");
    }

    const existingConversation = await ctx.db
      .query("conversations")
      .withIndex("by_business_id_and_contact_id", (q) =>
        q.eq("businessId", args.businessId).eq("contactId", contact._id),
      )
      .collect();

    const openConversation =
      existingConversation.find(
        (conversation) => conversation.channel === "voice" && conversation.status === "open",
      ) ?? null;

    const conversationId =
      openConversation?._id ??
      (await ctx.db.insert("conversations", {
        businessId: args.businessId,
        contactId: contact._id,
        channel: "voice",
        status: "open",
      }));

    const existingCall = await ctx.db
      .query("calls")
      .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .unique();

    if (existingCall) {
      await ctx.db.patch(existingCall._id, {
        conversationId,
        status: "in_progress",
        ...(args.gatewaySessionId !== undefined
          ? { gatewaySessionId: args.gatewaySessionId }
          : {}),
      });
      return {
        callId: existingCall._id,
        conversationId,
        contactId: contact._id,
      };
    }

    const callId = await ctx.db.insert("calls", {
      businessId: args.businessId,
      conversationId,
      twilioCallSid: args.twilioCallSid,
      ...(args.gatewaySessionId !== undefined
        ? { gatewaySessionId: args.gatewaySessionId }
        : {}),
      status: "in_progress",
      startedAt: args.startedAt,
    });

    return {
      callId,
      conversationId,
      contactId: contact._id,
    };
  },
});

export const appendTranscriptSegment = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    sequence: v.number(),
    speaker: v.string(),
    text: v.string(),
    final: v.boolean(),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transcripts")
      .withIndex("by_call_id_and_sequence", (q) =>
        q.eq("callId", args.callId).eq("sequence", args.sequence),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        speaker: args.speaker,
        text: args.text,
        final: args.final,
        ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("transcripts", {
      businessId: args.businessId,
      callId: args.callId,
      sequence: args.sequence,
      speaker: args.speaker,
      text: args.text,
      final: args.final,
      ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
    });
  },
});

export const setTransferState = internalMutation({
  args: {
    callId: v.id("calls"),
    transferState: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      transferState: args.transferState,
    });
    return null;
  },
});

export const takeMessageForVoice = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    conversationId: v.optional(v.id("conversations")),
    callerName: v.optional(v.string()),
    callbackPhone: v.optional(v.string()),
    message: v.string(),
    urgency: v.optional(v.string()),
    callbackWindow: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const title = args.callerName
      ? `Voice message from ${args.callerName}`
      : `Voice message from ${args.callbackPhone ?? "unknown caller"}`;
    const body = [
      args.callbackPhone ? `Callback: ${args.callbackPhone}` : null,
      args.urgency ? `Urgency: ${args.urgency}` : null,
      args.callbackWindow ? `Preferred callback: ${args.callbackWindow}` : null,
      "",
      args.message,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    const inboxItemId = await ctx.db.insert("inbox_items", {
      businessId: args.businessId,
      kind: "voice_message",
      title,
      body,
      relatedId: String(args.callId),
      status: "open",
    });

    if (args.conversationId) {
      await ctx.db.insert("messages", {
        businessId: args.businessId,
        conversationId: args.conversationId,
        direction: "inbound",
        channel: "voice",
        body: args.message,
        status: "captured",
        aiGenerated: false,
      });
      await ctx.db.patch(args.conversationId, {
        currentIntent: "message_taking",
        summary: body,
      });
    }

    return { inboxItemId };
  },
});

export const attachCallRecording = internalMutation({
  args: {
    callId: v.id("calls"),
    recordingStorageId: v.id("_storage"),
    recordingContentType: v.string(),
    recordingByteLength: v.number(),
    recordingDurationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      recordingStorageId: args.recordingStorageId,
      recordingContentType: args.recordingContentType,
      recordingByteLength: args.recordingByteLength,
      ...(args.recordingDurationMs !== undefined
        ? { recordingDurationMs: args.recordingDurationMs }
        : {}),
    });
    return null;
  },
});

export const completeCall = internalMutation({
  args: {
    callId: v.id("calls"),
    status: v.string(),
    endedAt: v.string(),
    disposition: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found.");
    }

    await ctx.db.patch(args.callId, {
      status: args.status,
      endedAt: args.endedAt,
      ...(args.disposition !== undefined ? { disposition: args.disposition } : {}),
    });

    if (call.conversationId) {
      await ctx.db.patch(call.conversationId, {
        status: "closed",
      });
    }

    return null;
  },
});

export const checkAvailabilityForVoice = internalAction({
  args: {
    businessId: v.id("businesses"),
    serviceName: v.string(),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
  },
  handler: async (ctx, args) => {
    const service = await resolveServiceDocument(ctx, args.businessId, args.serviceName);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found for this business.");
    }

    const availability: Array<{
      staffId: string;
      serviceId: string;
      startsAt: string;
      endsAt: string;
    }> = await ctx.runQuery(internal.appointments.booking.checkAvailabilityForBusiness, {
      businessId: args.businessId,
      serviceId: service._id,
      startsAt: args.startsAt,
      timezone: args.timezone,
      ...(args.preferredStaffId !== undefined
        ? { preferredStaffId: args.preferredStaffId }
        : {}),
    });

    return {
      serviceId: service._id,
      serviceName: service.name,
      availability,
    };
  },
});

export const bookAppointmentForVoice = internalAction({
  args: {
    businessId: v.id("businesses"),
    serviceName: v.string(),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
    contactName: v.optional(v.string()),
    contactPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const service = await resolveServiceDocument(ctx, args.businessId, args.serviceName);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found for this business.");
    }

    const result = await ctx.runMutation(
      internal.appointments.booking.bookAppointmentForBusiness,
      {
        businessId: args.businessId,
        serviceId: service._id,
        startsAt: args.startsAt,
        timezone: args.timezone,
        ...(args.preferredStaffId !== undefined
          ? { preferredStaffId: args.preferredStaffId }
          : {}),
        ...(args.contactName !== undefined ? { contactName: args.contactName } : {}),
        contactPhone: args.contactPhone,
        sourceChannel: "voice",
      },
    );

    return {
      ...result,
      serviceId: service._id,
      serviceName: service.name,
    };
  },
});

export const listRecentCalls = query({
  args: {
    businessId: v.id("businesses"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_business_id_and_started_at", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .take(args.limit ?? 20);

    return await Promise.all(
      calls.map(async (call) => {
        const transcriptPreview = await ctx.db
          .query("transcripts")
          .withIndex("by_call_id_and_sequence", (q) => q.eq("callId", call._id))
          .take(1);

        return {
          ...call,
          recordingUrl: call.recordingStorageId
            ? await ctx.storage.getUrl(call.recordingStorageId)
            : null,
          transcriptReady: transcriptPreview.length > 0,
        };
      }),
    );
  },
});

export const getCallTranscript = query({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const call = await ctx.db.get(args.callId);
    if (!call || call.businessId !== args.businessId) {
      throw new Error("Call not found.");
    }

    return await ctx.db
      .query("transcripts")
      .withIndex("by_call_id_and_sequence", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();
  },
});
