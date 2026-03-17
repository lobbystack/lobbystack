import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type ConversationOutcome =
  | {
      kind: "booked";
      serviceName: string | null;
      startsAt: string;
    }
  | {
      kind: "booking_in_progress";
      serviceName: string | null;
      startsAt: string | null;
    }
  | {
      kind: "message_taking";
    }
  | {
      kind: "summary";
      summary: string;
    }
  | {
      kind: "disposition";
      disposition: string;
    }
  | {
      kind: "none";
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

async function getServiceName(
  ctx: QueryCtx,
  serviceId: Doc<"services">["_id"] | undefined,
): Promise<string | null> {
  if (!serviceId) {
    return null;
  }

  const service = await ctx.db.get(serviceId);
  return service?.name ?? null;
}

export async function buildConversationOutcome(
  ctx: QueryCtx,
  input: {
    conversation: Doc<"conversations"> | null;
    fallbackDisposition?: string | null;
  },
): Promise<ConversationOutcome> {
  if (input.conversation) {
    const bookingState = await ctx.db
      .query("conversation_booking_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", input.conversation!._id))
      .unique();

    if (bookingState?.lastConfirmedServiceId && bookingState.lastConfirmedStartsAt) {
      return {
        kind: "booked",
        serviceName: await getServiceName(ctx, bookingState.lastConfirmedServiceId),
        startsAt: bookingState.lastConfirmedStartsAt,
      };
    }

    if (bookingState?.mode === "booking_in_progress") {
      return {
        kind: "booking_in_progress",
        serviceName: await getServiceName(ctx, bookingState.selectedServiceId),
        startsAt: bookingState.pendingStartsAt ?? null,
      };
    }

    if (input.conversation.currentIntent === "message_taking") {
      return { kind: "message_taking" };
    }

    const summary = normalizeSummary(input.conversation.summary);
    if (summary) {
      return {
        kind: "summary",
        summary,
      };
    }
  }

  const fallbackDisposition = input.fallbackDisposition?.trim();
  if (fallbackDisposition) {
    return {
      kind: "disposition",
      disposition: fallbackDisposition,
    };
  }

  return { kind: "none" };
}
