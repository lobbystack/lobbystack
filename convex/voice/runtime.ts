import {
  getTerminalTwilioCallReconciliationFields,
  isTerminalTwilioCallStatus,
} from "../lib/voiceCallStatus";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";
import { buildConversationOutcome } from "../dashboard/outcomes";
import { getOpenConversationForContact } from "../lib/indexedQueries";
import { buildCallRecordingDownloadUrl } from "../lib/messageAttachmentUrls";
import { ATTACHMENT_DOWNLOAD_TOKEN_TTL_MS } from "../lib/messageAttachments";
import { getServiceNameCandidates } from "../lib/serviceNames";
import { normalizeRuntimeLocale, type RuntimeLocale } from "../lib/runtimeLocale";
import {
  ensureSessionForStoredMessage,
  ensureVoiceSessionForCall,
  finalizeVoiceSessionForCall,
} from "../conversations/sessions";

type BusinessIdArgs = { businessId: Id<"businesses"> };
type ServicesForBusinessArgs = BusinessIdArgs;
type StaffAssignmentsForServiceArgs = {
  businessId: Id<"businesses">;
  serviceId: Id<"services">;
};
type StartCallArgs = {
  businessId: Id<"businesses">;
  twilioCallSid: string;
  gatewaySessionId?: string;
  from: string;
  to: string;
  startedAt: string;
};
type StartCallResult = {
  callId: Id<"calls">;
  conversationId: Id<"conversations">;
  contactId: Id<"contacts">;
};
type AppendTranscriptArgs = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
  sequence: number;
  speaker: string;
  text: string;
  final: boolean;
  confidence?: number;
};
type SetTransferStateArgs = {
  callId: Id<"calls">;
  transferState: string;
};
type TakeMessageForVoiceArgs = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
  conversationId?: Id<"conversations">;
  callerName?: string;
  callbackPhone?: string;
  message: string;
  urgency?: string;
  callbackWindow?: string;
};
type AttachCallRecordingArgs = {
  callId: Id<"calls">;
  recordingStorageId: Id<"_storage">;
  recordingContentType: string;
  recordingByteLength: number;
  recordingDurationMs?: number;
};
type CompleteCallArgs = {
  callId: Id<"calls">;
  status: string;
  endedAt: string;
  disposition?: string;
};
type ReconcileTwilioCallStatusArgs = {
  twilioCallSid: string;
  callStatus: string;
  sequenceNumber?: number;
  callbackSource?: string;
  providerUpdatedAt: string;
  providerDurationSeconds?: number;
};
type ReconcileTwilioCallStatusResult =
  | { ignored: true; reason: "unknown_call" | "missing_sequence" | "stale_sequence" }
  | { ignored: false; callId: Id<"calls"> };
type CheckAvailabilityForVoiceArgs = {
  businessId: Id<"businesses">;
  serviceName: string;
  startsAt: string;
  timezone: string;
  preferredStaffId?: Id<"staff">;
};
type CheckAvailabilityForVoiceResult = {
  serviceId: Id<"services">;
  serviceName: string;
  setupIssue: string | null;
  availability: Array<{
    staffId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
  }>;
};
type FindAvailabilityForVoiceArgs = {
  businessId: Id<"businesses">;
  serviceName: string;
  date: string;
  timezone: string;
  preferredStaffId?: Id<"staff">;
  preferredHour24?: number;
  preferredMinute?: number;
  limit?: number;
};
type FindAvailabilityForVoiceResult = {
  serviceId: Id<"services">;
  serviceName: string;
  timezone: string;
  date: string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    displayTime: string;
  }>;
  setupIssue: string | null;
  summary: string;
};
type BookAppointmentForVoiceArgs = {
  businessId: Id<"businesses">;
  serviceName: string;
  startsAt: string;
  timezone: string;
  preferredStaffId?: Id<"staff">;
  conversationId?: Id<"conversations">;
  contactName?: string;
  contactPhone: string;
};
type BookAppointmentForVoiceResult = {
  appointmentId: Id<"appointments">;
  contactId: Id<"contacts">;
  serviceId: Id<"services">;
  serviceName: string;
};

function createCallRecordingNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
type ListRecentCallsArgs = {
  businessId: Id<"businesses">;
  limit?: number;
  selectedCallId?: Id<"calls">;
};
type GetCallTranscriptArgs = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
};
type GetCallForDashboardArgs = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
};
type GetVoiceFollowUpTaskForDashboardArgs = {
  businessId: Id<"businesses">;
  inboxItemId: Id<"inbox_items">;
};
type CompleteVoiceFollowUpTaskArgs = {
  businessId: Id<"businesses">;
  inboxItemId: Id<"inbox_items">;
};

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function tokenizeComparable(value: string): Array<string> {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreServiceMatch(service: Doc<"services">, serviceName: string): number {
  const comparable = normalizeComparable(serviceName);
  const slugComparable = normalizeComparable(service.slug);
  const nameCandidates = getServiceNameCandidates(service).map((candidate) =>
    normalizeComparable(candidate),
  );

  if (nameCandidates.includes(comparable) || slugComparable === comparable) {
    return 100;
  }

  if (
    nameCandidates.some(
      (candidate) => candidate.includes(comparable) || comparable.includes(candidate),
    )
  ) {
    return 80;
  }

  if (slugComparable.includes(comparable) || comparable.includes(slugComparable)) {
    return 75;
  }

  const queryTokens = tokenizeComparable(serviceName);
  const serviceTokens = new Set([
    ...nameCandidates.flatMap((candidate) => tokenizeComparable(candidate)),
    ...tokenizeComparable(service.slug),
  ]);
  const overlap = queryTokens.filter((token) => serviceTokens.has(token)).length;
  if (overlap > 0) {
    return overlap * 10;
  }

  return 0;
}

function dedupeVoiceFollowUpItems(
  items: Array<Doc<"inbox_items">>,
): Map<string, Doc<"inbox_items">> {
  const deduped = new Map<string, Doc<"inbox_items">>();

  for (const item of items) {
    const key = item.relatedId ?? String(item._id);
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return deduped;
}

async function hydrateDashboardCallRow(
  ctx: QueryCtx,
  call: Doc<"calls">,
  voiceFollowUpByCallId: Map<string, Doc<"inbox_items">>,
) {
  const followUpTask = voiceFollowUpByCallId.get(String(call._id)) ?? null;
  const [conversation, transcriptPreview] = await Promise.all([
    call.conversationId ? ctx.db.get(call.conversationId) : Promise.resolve(null),
    ctx.db
      .query("transcripts")
      .withIndex("by_call_id_and_sequence", (q) => q.eq("callId", call._id))
      .order("desc")
      .take(1),
  ]);
  const contact = conversation?.contactId ? await ctx.db.get(conversation.contactId) : null;
  const outcome = await buildConversationOutcome(ctx, {
    conversation,
    fallbackDisposition: call.disposition ?? null,
  });
  const recordingToken = (
    await ctx.db
      .query("call_recording_download_tokens")
      .withIndex("by_call_id", (q) => q.eq("callId", call._id))
      .take(1)
  )[0] ?? null;
  const hasActiveRecordingToken =
    recordingToken !== null && Date.parse(recordingToken.expiresAt) >= Date.now();

  return {
    ...call,
    recordingUrl: call.recordingStorageId
      ? hasActiveRecordingToken
        ? buildCallRecordingDownloadUrl(recordingToken.nonce)
        : await ctx.storage.getUrl(call.recordingStorageId)
      : null,
    transcriptReady: transcriptPreview.length > 0,
    transcriptPreview: transcriptPreview[0]?.text ?? null,
    contactName: contact?.name ?? null,
    contactPhone: contact?.phone ?? null,
    followUpTask: followUpTask
      ? {
          id: followUpTask._id,
          title: followUpTask.title,
          body: followUpTask.body,
          createdAt: new Date(followUpTask._creationTime).toISOString(),
        }
      : null,
    outcome,
  };
}

async function resolveServiceDocument(
  ctx: Pick<ActionCtx, "runQuery">,
  businessId: Id<"businesses">,
  serviceName: string,
): Promise<Doc<"services"> | null> {
  const services: Array<Doc<"services">> = await ctx.runQuery(
    internal.voice.runtime.getActiveServicesForBusiness,
    { businessId },
  );
  const ranked = services
    .map((service) => ({
      service,
      score: scoreServiceMatch(service, serviceName),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.service ?? null;
}

async function getVoiceCustomerLocale(
  ctx: Pick<ActionCtx, "runQuery">,
  businessId: Id<"businesses">,
): Promise<RuntimeLocale> {
  const business = await ctx.runQuery(internal.voice.runtime.getBusinessDefaultLocale, {
    businessId,
  });
  return business;
}

async function resolveVoiceCustomerFacingServiceName(
  ctx: ActionCtx,
  input: {
    serviceId: Id<"services">;
    fallbackName: string;
    locale: RuntimeLocale;
  },
): Promise<string> {
  try {
    return await ctx.runAction(internal.services.localizedNames.ensureLocalizedServiceName, {
      serviceId: input.serviceId,
      locale: input.locale,
    });
  } catch {
    return input.fallbackName;
  }
}

export const getActiveServicesForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (
    ctx: QueryCtx,
    args: ServicesForBusinessArgs,
  ): Promise<Array<Doc<"services">>> => {
    return await ctx.db
      .query("services")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();
  },
});

export const getBusinessDefaultLocale = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<RuntimeLocale> => {
    const business = await ctx.db.get(args.businessId);
    return normalizeRuntimeLocale(business?.defaultLocale) ?? "en";
  },
});

export const getActiveStaffAssignmentsForService = internalQuery({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.id("services"),
  },
  handler: async (
    ctx: QueryCtx,
    args: StaffAssignmentsForServiceArgs,
  ): Promise<{ activeStaffCount: number; assignmentCount: number }> => {
    const [staff, assignments] = await Promise.all([
      ctx.db
        .query("staff")
        .withIndex("by_business_id_and_active", (q) =>
          q.eq("businessId", args.businessId).eq("active", true),
        )
        .collect(),
      ctx.db
        .query("staff_service_assignments")
        .withIndex("by_service_id_and_staff_id", (q) => q.eq("serviceId", args.serviceId))
        .collect(),
    ]);

    const activeStaffIds = new Set(staff.map((member) => String(member._id)));
    const eligibleAssignments = assignments.filter(
      (assignment) =>
        assignment.businessId === args.businessId &&
        activeStaffIds.has(String(assignment.staffId)),
    );

    return {
      activeStaffCount: activeStaffIds.size,
      assignmentCount:
        eligibleAssignments.length > 0
          ? eligibleAssignments.length
          : activeStaffIds.size > 0
            ? 1
            : 0,
    };
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
  handler: async (ctx: MutationCtx, args: StartCallArgs): Promise<StartCallResult> => {
    let contact: Doc<"contacts"> | null = await ctx.db
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

    const openConversation: Doc<"conversations"> | null = await getOpenConversationForContact(
      ctx,
      {
        businessId: args.businessId,
        contactId: contact._id,
        channel: "voice",
      },
    );

    const conversationId =
      openConversation?._id ??
      (await ctx.db.insert("conversations", {
        businessId: args.businessId,
        contactId: contact._id,
        channel: "voice",
        status: "open",
      }));

    const existingCall: Doc<"calls"> | null = await ctx.db
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
      await ensureVoiceSessionForCall(ctx, {
        businessId: args.businessId,
        conversationId,
        callId: existingCall._id,
        startedAt: Date.parse(args.startedAt),
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

    await ensureVoiceSessionForCall(ctx, {
      businessId: args.businessId,
      conversationId,
      callId,
      startedAt: Date.parse(args.startedAt),
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
  handler: async (ctx: MutationCtx, args: AppendTranscriptArgs): Promise<Id<"transcripts">> => {
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
  handler: async (ctx: MutationCtx, args: SetTransferStateArgs) => {
    await ctx.db.patch(args.callId, {
      transferState: args.transferState,
    });
    return null;
  },
});

// @ts-ignore Deep type instantiation from Convex mutation builder.
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
  handler: async (
    ctx: MutationCtx,
    args: TakeMessageForVoiceArgs,
  ): Promise<{ inboxItemId: Id<"inbox_items"> }> => {
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
      const messageId = await ctx.db.insert("messages", {
        businessId: args.businessId,
        conversationId: args.conversationId,
        direction: "inbound",
        channel: "voice",
        body: args.message,
        status: "captured",
        aiGenerated: false,
      });
      await ensureSessionForStoredMessage(ctx, {
        businessId: args.businessId,
        conversationId: args.conversationId,
        channel: "voice",
        messageId,
        callId: args.callId,
      });
      await ctx.db.patch(args.conversationId, {
        currentIntent: "message_taking",
        summary: body,
      });
    }

    return { inboxItemId };
  },
});

// @ts-ignore Deep type instantiation from Convex mutation builder.
export const attachCallRecording = internalMutation({
  args: {
    callId: v.id("calls"),
    recordingStorageId: v.id("_storage"),
    recordingContentType: v.string(),
    recordingByteLength: v.number(),
    recordingDurationMs: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: AttachCallRecordingArgs) => {
    const call = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found.");
    }

    const existingTokens = await ctx.db
      .query("call_recording_download_tokens")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .collect();
    for (const token of existingTokens) {
      await ctx.db.delete(token._id);
    }

    await ctx.db.patch(args.callId, {
      recordingStorageId: args.recordingStorageId,
      recordingContentType: args.recordingContentType,
      recordingByteLength: args.recordingByteLength,
      ...(args.recordingDurationMs !== undefined
        ? { recordingDurationMs: args.recordingDurationMs }
        : {}),
    });

    await ctx.db.insert("call_recording_download_tokens", {
      businessId: call.businessId,
      callId: args.callId,
      storageId: args.recordingStorageId,
      fileName: `call-recording-${String(args.callId)}.wav`,
      contentType: args.recordingContentType,
      nonce: createCallRecordingNonce(),
      expiresAt: new Date(Date.now() + ATTACHMENT_DOWNLOAD_TOKEN_TTL_MS).toISOString(),
    });

    return null;
  },
});

export const getCallRecordingDownloadToken = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("call_recording_download_tokens")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.token))
      .unique();
  },
});

// @ts-ignore Deep type instantiation from Convex mutation builder.
export const completeCall = internalMutation({
  args: {
    callId: v.id("calls"),
    status: v.string(),
    endedAt: v.string(),
    disposition: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: CompleteCallArgs) => {
    const call: Doc<"calls"> | null = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found.");
    }

    const disposition =
      args.disposition === "stream_stopped" &&
      call.disposition !== undefined &&
      call.disposition !== "stream_stopped"
        ? call.disposition
        : args.disposition;

    await ctx.db.patch(args.callId, {
      status: args.status,
      endedAt: args.endedAt,
      ...(disposition !== undefined ? { disposition } : {}),
    });

    if (call.conversationId) {
      await ctx.db.patch(call.conversationId, {
        status: "closed",
      });
    }

    await finalizeVoiceSessionForCall(ctx, {
      callId: args.callId,
      endedAt: Date.parse(args.endedAt),
    });

    return null;
  },
});

// @ts-ignore Deep type instantiation from Convex mutation builder.
export const reconcileTwilioCallStatus = internalMutation({
  args: {
    twilioCallSid: v.string(),
    callStatus: v.string(),
    sequenceNumber: v.optional(v.number()),
    callbackSource: v.optional(v.string()),
    providerUpdatedAt: v.string(),
    providerDurationSeconds: v.optional(v.number()),
  },
  handler: async (
    ctx: MutationCtx,
    args: ReconcileTwilioCallStatusArgs,
  ): Promise<ReconcileTwilioCallStatusResult> => {
    const call: Doc<"calls"> | null = await ctx.db
      .query("calls")
      .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .unique();

    if (!call) {
      return { ignored: true, reason: "unknown_call" } as const;
    }

    if (
      call.providerCallStatusSequence !== undefined &&
      args.sequenceNumber === undefined
    ) {
      return { ignored: true, reason: "missing_sequence" } as const;
    }

    if (
      call.providerCallStatusSequence !== undefined &&
      args.sequenceNumber !== undefined &&
      args.sequenceNumber <= call.providerCallStatusSequence
    ) {
      return { ignored: true, reason: "stale_sequence" } as const;
    }

    const patch: Record<string, unknown> = {
      providerCallStatus: args.callStatus,
      providerUpdatedAt: args.providerUpdatedAt,
      ...(args.sequenceNumber !== undefined
        ? { providerCallStatusSequence: args.sequenceNumber }
        : {}),
      ...(args.callbackSource !== undefined
        ? { providerCallStatusSource: args.callbackSource }
        : {}),
      ...(args.providerDurationSeconds !== undefined
        ? { providerCallDurationSeconds: args.providerDurationSeconds }
        : {}),
    };

    if (isTerminalTwilioCallStatus(args.callStatus)) {
      Object.assign(
        patch,
        getTerminalTwilioCallReconciliationFields(call, {
          callStatus: args.callStatus,
          providerUpdatedAt: args.providerUpdatedAt,
        }),
      );
    }

    await ctx.db.patch(call._id, patch);

    if (isTerminalTwilioCallStatus(args.callStatus) && call.conversationId) {
      const conversation = await ctx.db.get(call.conversationId);
      if (conversation && conversation.status !== "closed") {
        await ctx.db.patch(call.conversationId, {
          status: "closed",
        });
      }
    }

    if (isTerminalTwilioCallStatus(args.callStatus)) {
      await finalizeVoiceSessionForCall(ctx, {
        callId: call._id,
        endedAt: Date.parse(args.providerUpdatedAt),
      });
    }

    return { ignored: false, callId: call._id } as const;
  },
});

// @ts-ignore Deep type instantiation from Convex action builder.
export const checkAvailabilityForVoice = internalAction({
  args: {
    businessId: v.id("businesses"),
    serviceName: v.string(),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
  },
  handler: async (
    ctx: ActionCtx,
    args: CheckAvailabilityForVoiceArgs,
  ): Promise<CheckAvailabilityForVoiceResult> => {
    await ctx.runMutation(internal.businesses.catalog.ensureDefaultStaffForBusiness, {
      businessId: args.businessId,
    });
    const service = await resolveServiceDocument(ctx, args.businessId, args.serviceName);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found for this business.");
    }
    const locale = await getVoiceCustomerLocale(ctx, args.businessId);
    const localizedServiceName = await resolveVoiceCustomerFacingServiceName(ctx, {
      serviceId: service._id,
      fallbackName: service.name,
      locale,
    });

    const setup: { activeStaffCount: number; assignmentCount: number } = await ctx.runQuery(
      internal.voice.runtime.getActiveStaffAssignmentsForService,
      {
        businessId: args.businessId,
        serviceId: service._id,
      },
    );
    if (setup.assignmentCount === 0) {
      return {
        serviceId: service._id,
        serviceName: localizedServiceName,
        availability: [],
        setupIssue:
          setup.activeStaffCount === 0 ? "no_active_staff" : "no_staff_assigned",
      };
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
      serviceName: localizedServiceName,
      availability,
      setupIssue: null,
    };
  },
});

// @ts-ignore Deep type instantiation from Convex action builder.
export const findAvailabilityForVoice = internalAction({
  args: {
    businessId: v.id("businesses"),
    serviceName: v.string(),
    date: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
    preferredHour24: v.optional(v.number()),
    preferredMinute: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx: ActionCtx,
    args: FindAvailabilityForVoiceArgs,
  ): Promise<FindAvailabilityForVoiceResult> => {
    await ctx.runMutation(internal.businesses.catalog.ensureDefaultStaffForBusiness, {
      businessId: args.businessId,
    });
    const service = await resolveServiceDocument(ctx, args.businessId, args.serviceName);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found for this business.");
    }
    const locale = await getVoiceCustomerLocale(ctx, args.businessId);
    const localizedServiceName = await resolveVoiceCustomerFacingServiceName(ctx, {
      serviceId: service._id,
      fallbackName: service.name,
      locale,
    });

    const setup: { activeStaffCount: number; assignmentCount: number } = await ctx.runQuery(
      internal.voice.runtime.getActiveStaffAssignmentsForService,
      {
        businessId: args.businessId,
        serviceId: service._id,
      },
    );
    if (setup.assignmentCount === 0) {
      const setupIssue =
        setup.activeStaffCount === 0 ? "no_active_staff" : "no_staff_assigned";
      return {
        serviceId: service._id,
        serviceName: localizedServiceName,
        timezone: args.timezone,
        date: args.date,
        slots: [],
        setupIssue,
        summary:
          setupIssue === "no_active_staff"
            ? `${localizedServiceName} cannot be booked yet because booking is not configured for this business yet.`
            : `${localizedServiceName} cannot be booked yet because booking is not configured for this service yet.`,
      };
    }

    const slots: Array<{
      startsAt: string;
      endsAt: string;
      displayTime: string;
    }> = await ctx.runQuery(internal.appointments.booking.findAvailabilityForBusiness, {
      businessId: args.businessId,
      serviceId: service._id,
      date: args.date,
      timezone: args.timezone,
      ...(args.preferredStaffId !== undefined
        ? { preferredStaffId: args.preferredStaffId }
        : {}),
      ...(args.preferredHour24 !== undefined
        ? { preferredHour24: args.preferredHour24 }
        : {}),
      ...(args.preferredMinute !== undefined
        ? { preferredMinute: args.preferredMinute }
        : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    });

    return {
      serviceId: service._id,
      serviceName: localizedServiceName,
      timezone: args.timezone,
      date: args.date,
      slots,
      setupIssue: null,
      summary:
        slots.length === 0
          ? `No availability found for ${localizedServiceName} on ${args.date}.`
          : `Available ${localizedServiceName} slots on ${args.date}: ${slots
              .map((slot) => slot.displayTime)
              .join(", ")}.`,
    };
  },
});

// @ts-ignore Deep type instantiation from Convex action builder.
export const bookAppointmentForVoice = internalAction({
  args: {
    businessId: v.id("businesses"),
    serviceName: v.string(),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
    conversationId: v.optional(v.id("conversations")),
    contactName: v.optional(v.string()),
    contactPhone: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args: BookAppointmentForVoiceArgs,
  ): Promise<BookAppointmentForVoiceResult> => {
    await ctx.runMutation(internal.businesses.catalog.ensureDefaultStaffForBusiness, {
      businessId: args.businessId,
    });
    const service = await resolveServiceDocument(ctx, args.businessId, args.serviceName);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found for this business.");
    }
    const locale = await getVoiceCustomerLocale(ctx, args.businessId);
    const localizedServiceName = await resolveVoiceCustomerFacingServiceName(ctx, {
      serviceId: service._id,
      fallbackName: service.name,
      locale,
    });

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

    if (args.conversationId) {
      await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
        businessId: args.businessId,
        conversationId: args.conversationId,
        mode: "booked",
        selectedServiceId: service._id,
        lastConfirmedAppointmentId: result.appointmentId,
        lastConfirmedServiceId: service._id,
        lastConfirmedStartsAt: args.startsAt,
        lastOfferedStartsAt: [],
        pendingConfirmationAppointmentId: result.appointmentId,
      });
    }

    return {
      ...result,
      serviceId: service._id,
      serviceName: localizedServiceName,
    };
  },
});

// @ts-ignore Deep type instantiation from Convex query builder.
export const listRecentCalls = query({
  args: {
    businessId: v.id("businesses"),
    limit: v.optional(v.number()),
    selectedCallId: v.optional(v.id("calls")),
  },
  handler: async (ctx: QueryCtx, args: ListRecentCallsArgs) => {
    await requireMembership(ctx, args.businessId);
    const [recentCalls, selectedCall, openVoiceFollowUpItems]: [
      Array<Doc<"calls">>,
      Doc<"calls"> | null,
      Array<Doc<"inbox_items">>,
    ] = await Promise.all([
      ctx.db
        .query("calls")
        .withIndex("by_business_id_and_started_at", (q) => q.eq("businessId", args.businessId))
        .order("desc")
        .take(args.limit ?? 20),
      args.selectedCallId ? ctx.db.get(args.selectedCallId) : Promise.resolve(null),
      ctx.db
        .query("inbox_items")
        .withIndex("by_business_id_and_kind_and_status", (q) =>
          q.eq("businessId", args.businessId).eq("kind", "voice_message").eq("status", "open"),
        )
        .collect(),
    ]);

    const calls = recentCalls.slice();
    if (
      selectedCall &&
      selectedCall.businessId === args.businessId &&
      !calls.some((call) => call._id === selectedCall._id)
    ) {
      calls.push(selectedCall);
      calls.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
    }

    const voiceFollowUpByCallId = dedupeVoiceFollowUpItems(
      openVoiceFollowUpItems.slice().sort((left, right) => right._creationTime - left._creationTime),
    );

    return await Promise.all(
      calls.map((call) => hydrateDashboardCallRow(ctx, call, voiceFollowUpByCallId)),
    );
  },
});

export const getCallForDashboard = query({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
  },
  handler: async (ctx: QueryCtx, args: GetCallForDashboardArgs) => {
    await requireMembership(ctx, args.businessId);

    const [call, openVoiceFollowUpItems]: [Doc<"calls"> | null, Array<Doc<"inbox_items">>] =
      await Promise.all([
        ctx.db.get(args.callId),
        ctx.db
          .query("inbox_items")
          .withIndex("by_business_id_and_kind_and_status", (q) =>
            q.eq("businessId", args.businessId).eq("kind", "voice_message").eq("status", "open"),
          )
          .collect(),
      ]);

    if (!call || call.businessId !== args.businessId) {
      return null;
    }

    const voiceFollowUpByCallId = dedupeVoiceFollowUpItems(
      openVoiceFollowUpItems.slice().sort((left, right) => right._creationTime - left._creationTime),
    );

    return await hydrateDashboardCallRow(ctx, call, voiceFollowUpByCallId);
  },
});

export const getVoiceFollowUpTaskForDashboard = query({
  args: {
    businessId: v.id("businesses"),
    inboxItemId: v.id("inbox_items"),
  },
  handler: async (ctx: QueryCtx, args: GetVoiceFollowUpTaskForDashboardArgs) => {
    await requireMembership(ctx, args.businessId);

    const inboxItem = await ctx.db.get(args.inboxItemId);
    if (
      !inboxItem ||
      inboxItem.businessId !== args.businessId ||
      inboxItem.kind !== "voice_message" ||
      inboxItem.status !== "open"
    ) {
      return null;
    }

    return {
      id: inboxItem._id,
      title: inboxItem.title,
      body: inboxItem.body,
      createdAt: new Date(inboxItem._creationTime).toISOString(),
      callId: inboxItem.relatedId ? (inboxItem.relatedId as Id<"calls">) : null,
    };
  },
});

export const completeVoiceFollowUpTask = mutation({
  args: {
    businessId: v.id("businesses"),
    inboxItemId: v.id("inbox_items"),
  },
  handler: async (ctx: MutationCtx, args: CompleteVoiceFollowUpTaskArgs) => {
    await requireMembership(ctx, args.businessId);

    const inboxItem = await ctx.db.get(args.inboxItemId);
    if (!inboxItem || inboxItem.businessId !== args.businessId) {
      throw new Error("Follow-up task not found.");
    }

    if (inboxItem.kind !== "voice_message") {
      throw new Error("Only voice follow-up tasks can be completed here.");
    }

    if (inboxItem.status === "done") {
      return null;
    }

    if (!inboxItem.relatedId) {
      await ctx.db.patch(args.inboxItemId, {
        status: "done",
      });
      return null;
    }

    const relatedItems = await ctx.db
      .query("inbox_items")
      .withIndex("by_business_id_and_kind_and_status", (q) =>
        q.eq("businessId", args.businessId).eq("kind", "voice_message").eq("status", "open"),
      )
      .collect();

    const duplicateFollowUps = relatedItems.filter((item) => item.relatedId === inboxItem.relatedId);
    await Promise.all(
      duplicateFollowUps.map((item) =>
        ctx.db.patch(item._id, {
          status: "done",
        }),
      ),
    );

    return null;
  },
});

export const getCallTranscript = query({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
  },
  handler: async (ctx: QueryCtx, args: GetCallTranscriptArgs) => {
    await requireMembership(ctx, args.businessId);
    const call: Doc<"calls"> | null = await ctx.db.get(args.callId);
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
