import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { buildConversationOutcome } from "../dashboard/outcomes";

export const SMS_SESSION_INACTIVITY_MS = 60 * 60 * 1000;

export type PersistedConversationSessionSummary =
  | {
      kind: "booked";
      serviceName?: string;
      startsAt: string;
    }
  | {
      kind: "booking_in_progress";
      serviceName?: string;
      startsAt?: string;
    }
  | {
      kind: "message_taking";
      summary?: string;
    }
  | {
      kind: "summary";
      summary: string;
    }
  | {
      kind: "disposition";
      disposition: string;
    };

function buildPersistedSummaryFromOutcome(input: {
  outcome: Awaited<ReturnType<typeof buildConversationOutcome>>;
  legacySummary: string | null;
}): PersistedConversationSessionSummary | null {
  switch (input.outcome.kind) {
    case "booked":
      return {
        kind: "booked",
        ...(input.outcome.serviceName ? { serviceName: input.outcome.serviceName } : {}),
        startsAt: input.outcome.startsAt,
      };
    case "booking_in_progress":
      return {
        kind: "booking_in_progress",
        ...(input.outcome.serviceName ? { serviceName: input.outcome.serviceName } : {}),
        ...(input.outcome.startsAt ? { startsAt: input.outcome.startsAt } : {}),
      };
    case "message_taking":
      return {
        kind: "message_taking",
        ...(input.legacySummary ? { summary: input.legacySummary } : {}),
      };
    case "summary":
      return {
        kind: "summary",
        summary: input.outcome.summary,
      };
    case "disposition":
      return {
        kind: "disposition",
        disposition: input.outcome.disposition,
      };
    default:
      return null;
  }
}

function normalizeSummary(summary: string | null | undefined): string | null {
  const trimmed = summary?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^Business .* conversation$/u.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function summarizeText(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getSummaryLocale(locale: string | null | undefined): "en" | "fr" {
  return locale?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function hasQuestionSignals(text: string): boolean {
  return /\?/u.test(text) || /^(who|what|when|where|why|how|can|could|do|does|is|are|bonjour|salut|quand|quoi|comment|puis-je|est-ce que)/iu.test(text);
}

function hasAppointmentSignals(text: string): boolean {
  return /appointment|booking|book|schedule|reschedule|consultation|rendez-vous|réserver|reservation|date|heure|time/iu.test(
    text,
  );
}

function buildPlainSummaryFromMessages(
  messages: Array<Doc<"messages">>,
  locale: string | null | undefined,
): string | null {
  const summaryLocale = getSummaryLocale(locale);
  const inboundBodies = messages
    .filter((message) => message.direction === "inbound")
    .map((message) => message.body.trim())
    .filter((body) => body.length > 0);
  const outboundBodies = messages
    .filter((message) => message.direction === "outbound")
    .map((message) => message.body.trim())
    .filter((body) => body.length > 0);
  const allBodies = [...inboundBodies, ...outboundBodies];

  if (allBodies.length > 0) {
    const joinedInbound = inboundBodies.join(" ");
    const questionCount = inboundBodies.filter((body) => hasQuestionSignals(body)).length;
    const hasAppointmentTopic = hasAppointmentSignals(joinedInbound);

    if (hasAppointmentTopic) {
      if (questionCount > 1) {
        return summaryLocale === "fr"
          ? "Le client a posé des questions de suivi au sujet d'un rendez-vous par SMS."
          : "Customer asked follow-up questions about an appointment by SMS.";
      }

      return summaryLocale === "fr"
        ? "Le client a posé une question au sujet d'un rendez-vous par SMS."
        : "Customer asked about an appointment by SMS.";
    }

    if (questionCount > 1 || (questionCount > 0 && inboundBodies.length > 1)) {
      return summaryLocale === "fr"
        ? "Le client a posé des questions de suivi par SMS."
        : "Customer asked follow-up questions by SMS.";
    }

    if (questionCount > 0) {
      return summaryLocale === "fr"
        ? "Le client a posé une question par SMS."
        : "Customer asked a question by SMS.";
    }

    if (inboundBodies.length > 0 && outboundBodies.length > 0) {
      return summaryLocale === "fr"
        ? "Le client a eu un échange par SMS."
        : "Customer had an SMS exchange.";
    }

    if (inboundBodies.length > 0) {
      if (inboundBodies.length === 1 && inboundBodies[0]!.length <= 12) {
        return summaryLocale === "fr"
          ? "Le client a envoyé un bref suivi par SMS."
          : "Customer sent a brief SMS follow-up.";
      }

      return summaryLocale === "fr"
        ? "Le client a envoyé un message par SMS."
        : "Customer sent an SMS message.";
    }

    if (outboundBodies.length > 0) {
      return summaryLocale === "fr"
        ? "Une mise à jour a été envoyée par SMS."
        : "An SMS update was sent.";
    }
  }

  const attachments = messages.flatMap((message) => message.media ?? []);
  if (attachments.length > 0) {
    const imageCount = attachments.filter((attachment) =>
      (attachment.contentType ?? "").startsWith("image/"),
    ).length;
    const documentCount = attachments.length - imageCount;

    if (imageCount > 0 && documentCount === 0) {
      return imageCount === 1
        ? summaryLocale === "fr"
          ? "Le client a partagé une photo par SMS."
          : "Customer shared a photo by SMS."
        : summaryLocale === "fr"
          ? "Le client a partagé des photos par SMS."
          : "Customer shared photos by SMS.";
    }

    if (documentCount > 0 && imageCount === 0) {
      return documentCount === 1
        ? summaryLocale === "fr"
          ? "Le client a partagé un document par SMS."
          : "Customer shared a document by SMS."
        : summaryLocale === "fr"
          ? "Le client a partagé des documents par SMS."
          : "Customer shared documents by SMS.";
    }

    return summaryLocale === "fr"
      ? "Le client a partagé des pièces jointes par SMS."
      : "Customer shared attachments by SMS.";
  }

  return null;
}

async function getConversationSessionMessages(
  ctx: QueryCtx | MutationCtx,
  conversationSessionId: Id<"conversation_sessions">,
): Promise<Array<Doc<"messages">>> {
  return await ctx.db
    .query("messages")
    .withIndex("by_conversation_session_id", (q) =>
      q.eq("conversationSessionId", conversationSessionId),
    )
    .collect();
}

async function getServiceName(
  ctx: QueryCtx | MutationCtx,
  serviceId: Doc<"services">["_id"] | undefined,
): Promise<string | null> {
  if (!serviceId) {
    return null;
  }

  const service = await ctx.db.get(serviceId);
  return service?.name ?? null;
}

async function backfillLegacyConversationSession(
  ctx: MutationCtx,
  input: {
    businessId: Id<"businesses">;
    conversationId: Id<"conversations">;
    channel: string;
    excludeMessageId: Id<"messages">;
  },
): Promise<void> {
  const legacyMessages = (
    await ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", input.conversationId))
      .collect()
  ).filter(
    (message) =>
      message._id !== input.excludeMessageId && message.conversationSessionId === undefined,
  );

  if (legacyMessages.length === 0) {
    return;
  }

  const conversation = await ctx.db.get(input.conversationId);
  if (!conversation) {
    return;
  }

  const outcome = await buildConversationOutcome(ctx, {
    conversation,
  });
  const summary = buildPersistedSummaryFromOutcome({
    outcome,
    legacySummary: normalizeSummary(conversation.summary),
  });
  const startedAt = legacyMessages[0]!._creationTime;
  const closedAt = legacyMessages[legacyMessages.length - 1]!._creationTime;
  const sessionId = await ctx.db.insert("conversation_sessions", {
    businessId: input.businessId,
    conversationId: input.conversationId,
    channel: input.channel,
    status: "closed",
    startedAt,
    lastMessageAt: closedAt,
    closedAt,
    summaryGeneratedAt: Date.now(),
    ...(summary ? { summaryKind: summary.kind, summary } : {}),
  });

  for (const message of legacyMessages) {
    await ctx.db.patch(message._id, {
      conversationSessionId: sessionId,
    });
  }
}

async function buildSessionSummary(
  ctx: MutationCtx,
  session: Doc<"conversation_sessions">,
): Promise<PersistedConversationSessionSummary | null> {
  const [conversation, bookingState, call, messages] = await Promise.all([
    ctx.db.get(session.conversationId),
    ctx.db
      .query("conversation_booking_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", session.conversationId))
      .unique(),
    session.callId ? ctx.db.get(session.callId) : Promise.resolve(null),
    getConversationSessionMessages(ctx, session._id),
  ]);

  if (!conversation) {
    return null;
  }

  const sessionStartedAtIso = new Date(session.startedAt).toISOString();
  const sessionClosedAtIso = new Date(session.closedAt ?? session.lastMessageAt).toISOString();
  const bookingStateUpdatedAt = bookingState?.updatedAt;
  const bookingStateBelongsToSession =
    bookingStateUpdatedAt !== undefined &&
    bookingStateUpdatedAt >= sessionStartedAtIso &&
    bookingStateUpdatedAt <= sessionClosedAtIso;

  if (
    bookingStateBelongsToSession &&
    bookingState?.lastConfirmedServiceId &&
    bookingState.lastConfirmedStartsAt
  ) {
    const serviceName = await getServiceName(ctx, bookingState.lastConfirmedServiceId);
    return {
      kind: "booked",
      ...(serviceName ? { serviceName } : {}),
      startsAt: bookingState.lastConfirmedStartsAt,
    };
  }

  if (bookingStateBelongsToSession && bookingState?.mode === "booking_in_progress") {
    const serviceName = await getServiceName(ctx, bookingState.selectedServiceId);
    return {
      kind: "booking_in_progress",
      ...(serviceName ? { serviceName } : {}),
      ...(bookingState.pendingStartsAt ? { startsAt: bookingState.pendingStartsAt } : {}),
    };
  }

  const normalizedConversationSummary = normalizeSummary(conversation.summary);
  if (session.channel === "voice" && conversation.currentIntent === "message_taking") {
    return {
      kind: "message_taking",
      ...(normalizedConversationSummary ? { summary: normalizedConversationSummary } : {}),
    };
  }

  if (call?.disposition) {
    return {
      kind: "disposition",
      disposition: call.disposition,
    };
  }

  if (normalizedConversationSummary && session.channel === "voice") {
    return {
      kind: "summary",
      summary: normalizedConversationSummary,
    };
  }

  const summary = buildPlainSummaryFromMessages(messages, conversation.locale);
  if (summary) {
    return {
      kind: "summary",
      summary,
    };
  }

  if (session.channel === "voice") {
    return {
      kind: "summary",
      summary: "Voice interaction completed.",
    };
  }

  return null;
}

async function closeSessionWithSummary(
  ctx: MutationCtx,
  session: Doc<"conversation_sessions">,
  closedAt: number,
): Promise<void> {
  const summary = await buildSessionSummary(ctx, {
    ...session,
    status: "closed",
    closedAt,
  });

  await ctx.db.patch(session._id, {
    status: "closed",
    closedAt,
    summaryGeneratedAt: Date.now(),
    ...(summary ? { summaryKind: summary.kind, summary } : {}),
  });
}

async function getActiveConversationSession(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
): Promise<Doc<"conversation_sessions"> | null> {
  const sessions = await ctx.db
    .query("conversation_sessions")
    .withIndex("by_conversation_id_and_status", (q) =>
      q.eq("conversationId", conversationId).eq("status", "active"),
    )
    .collect();

  return sessions.sort((left, right) => right.startedAt - left.startedAt)[0] ?? null;
}

export async function ensureSessionForStoredMessage(
  ctx: MutationCtx,
  input: {
    businessId: Id<"businesses">;
    conversationId: Id<"conversations">;
    channel: string;
    messageId: Id<"messages">;
    callId?: Id<"calls">;
  },
): Promise<Id<"conversation_sessions">> {
  const message = await ctx.db.get(input.messageId);
  if (!message) {
    throw new Error("Message not found.");
  }

  const messageTimestamp = message._creationTime;

  if (input.channel === "voice") {
    if (!input.callId) {
      throw new Error("Voice messages must belong to a call session.");
    }

    const existingVoiceSession = await ctx.db
      .query("conversation_sessions")
      .withIndex("by_call_id", (q) => q.eq("callId", input.callId))
      .unique();

    const sessionId =
      existingVoiceSession?._id ??
      (await ctx.db.insert("conversation_sessions", {
        businessId: input.businessId,
        conversationId: input.conversationId,
        channel: input.channel,
        callId: input.callId,
        status: "active",
        startedAt: messageTimestamp,
        lastMessageAt: messageTimestamp,
      }));

    const session = existingVoiceSession ?? (await ctx.db.get(sessionId));
    if (!session) {
      throw new Error("Voice session not found.");
    }

    await ctx.db.patch(session._id, {
      lastMessageAt: Math.max(session.lastMessageAt, messageTimestamp),
    });
    await ctx.db.patch(message._id, {
      conversationSessionId: session._id,
    });
    return session._id;
  }

  await backfillLegacyConversationSession(ctx, {
    businessId: input.businessId,
    conversationId: input.conversationId,
    channel: input.channel,
    excludeMessageId: input.messageId,
  });

  const activeSession = await getActiveConversationSession(ctx, input.conversationId);
  if (
    activeSession &&
    messageTimestamp - activeSession.lastMessageAt <= SMS_SESSION_INACTIVITY_MS
  ) {
    await ctx.db.patch(activeSession._id, {
      lastMessageAt: messageTimestamp,
    });
    await ctx.db.patch(message._id, {
      conversationSessionId: activeSession._id,
    });
    await ctx.scheduler.runAfter(
      SMS_SESSION_INACTIVITY_MS,
      internal.conversations.sessions.finalizeSmsSessionAfterInactivity,
      {
        sessionId: activeSession._id,
        expectedLastMessageAt: messageTimestamp,
      },
    );
    return activeSession._id;
  }

  if (activeSession && !activeSession.summaryGeneratedAt) {
    await closeSessionWithSummary(ctx, activeSession, activeSession.lastMessageAt);
  }

  const sessionId = await ctx.db.insert("conversation_sessions", {
    businessId: input.businessId,
    conversationId: input.conversationId,
    channel: input.channel,
    status: "active",
    startedAt: messageTimestamp,
    lastMessageAt: messageTimestamp,
  });
  await ctx.db.patch(message._id, {
    conversationSessionId: sessionId,
  });
  await ctx.scheduler.runAfter(
    SMS_SESSION_INACTIVITY_MS,
    internal.conversations.sessions.finalizeSmsSessionAfterInactivity,
    {
      sessionId,
      expectedLastMessageAt: messageTimestamp,
    },
  );
  return sessionId;
}

export async function ensureVoiceSessionForCall(
  ctx: MutationCtx,
  input: {
    businessId: Id<"businesses">;
    conversationId: Id<"conversations">;
    callId: Id<"calls">;
    startedAt: number;
  },
): Promise<Id<"conversation_sessions">> {
  const existing = await ctx.db
    .query("conversation_sessions")
    .withIndex("by_call_id", (q) => q.eq("callId", input.callId))
    .unique();
  if (existing) {
    return existing._id;
  }

  const startedAt = Number.isFinite(input.startedAt) ? input.startedAt : Date.now();

  return await ctx.db.insert("conversation_sessions", {
    businessId: input.businessId,
    conversationId: input.conversationId,
    channel: "voice",
    callId: input.callId,
    status: "active",
    startedAt,
    lastMessageAt: startedAt,
  });
}

export async function finalizeVoiceSessionForCall(
  ctx: MutationCtx,
  input: {
    callId: Id<"calls">;
    endedAt: number;
  },
): Promise<void> {
  const session = await ctx.db
    .query("conversation_sessions")
    .withIndex("by_call_id", (q) => q.eq("callId", input.callId))
    .unique();
  if (!session || session.summaryGeneratedAt) {
    return;
  }

  const endedAt = Number.isFinite(input.endedAt) ? input.endedAt : Date.now();
  await closeSessionWithSummary(ctx, session, Math.max(session.lastMessageAt, endedAt));
}

export const listConversationSessions = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("conversation_sessions")
      .withIndex("by_conversation_id_and_started_at", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
  },
});

export const finalizeSmsSessionAfterInactivity = internalMutation({
  args: {
    sessionId: v.id("conversation_sessions"),
    expectedLastMessageAt: v.number(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.channel !== "sms" || session.summaryGeneratedAt) {
      return null;
    }

    if (session.lastMessageAt !== args.expectedLastMessageAt) {
      return null;
    }

    await closeSessionWithSummary(ctx, session, session.lastMessageAt);
    return null;
  },
});
