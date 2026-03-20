import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";

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

function buildPlainSummaryFromMessages(messages: Array<Doc<"messages">>): string | null {
  const nonEmptyBodies = messages
    .map((message) => message.body.trim())
    .filter((body) => body.length > 0);

  if (nonEmptyBodies.length > 0) {
    const inbound = messages
      .filter((message) => message.direction === "inbound")
      .map((message) => message.body.trim())
      .find((body) => body.length > 0);
    const outbound = [...messages]
      .reverse()
      .filter((message) => message.direction === "outbound")
      .map((message) => message.body.trim())
      .find((body) => body.length > 0);

    if (inbound && outbound && inbound !== outbound) {
      return summarizeText(`${inbound} ${outbound}`);
    }

    return summarizeText(inbound ?? outbound ?? nonEmptyBodies[0]!);
  }

  const attachmentCount = messages.reduce((count, message) => count + (message.media?.length ?? 0), 0);
  if (attachmentCount > 0) {
    return attachmentCount === 1 ? "Attachment shared in conversation." : "Attachments shared in conversation.";
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

  const summary = buildPlainSummaryFromMessages(messages);
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
