import {
  isTelemetryExportEnabledInConvex,
  redactTelemetryProperties,
  type TelemetryProperties,
} from "./shared";
import { v } from "convex/values";
import {
  isTelemetryEventName,
  validateTelemetryEvent,
} from "../../packages/telemetry/src/index";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";

type TelemetryContext = {
  conversationId?: string;
  callId?: string;
  messageId?: string;
  appointmentId?: string;
  channel?: string;
  provider?: string;
  model?: string;
};

type EnqueuePostHogEventInput = TelemetryContext & {
  eventName: string;
  distinctId: string;
  businessId?: Id<"businesses">;
  groupKey?: string;
  properties?: TelemetryProperties;
};

type SerializedOutboxEvent = {
  eventName: string;
  distinctId: string;
  businessId?: Id<"businesses">;
  groupKey?: string;
  payloadJson: string;
};

type FlushResult = {
  attempted: number;
  delivered: number;
  retried: number;
  skipped: boolean;
};

const TELEMETRY_DESTINATION = "posthog";
const MAX_BATCH_SIZE = 25;
const CLAIM_LEASE_MS = 60_000;
const CLAIMED_STATUS = "processing";

function buildCaptureUrl(host: string): string {
  return new URL("/i/v0/e/", host).toString();
}

function getRetryDelayMs(attemptCount: number): number {
  return Math.min(5 * 60_000, Math.max(5_000, 2 ** attemptCount * 1_000));
}

function isPostHogExportEnabled(): boolean {
  return (
    isTelemetryExportEnabledInConvex() &&
    Boolean(process.env.POSTHOG_KEY) &&
    Boolean(process.env.POSTHOG_HOST)
  );
}

export function serializePostHogEvent(
  input: EnqueuePostHogEventInput,
): SerializedOutboxEvent {
  const properties = redactTelemetryProperties(input.properties ?? {});
  const deploymentMode = process.env.DEPLOYMENT_MODE ?? "development";
  const occurredAt = new Date().toISOString();

  if (isTelemetryEventName(input.eventName)) {
    const validation = validateTelemetryEvent({
      name: input.eventName,
      deploymentMode,
      ...(input.businessId !== undefined ? { businessId: String(input.businessId) } : {}),
      ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
      ...(input.callId !== undefined ? { callId: input.callId } : {}),
      ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
      ...(input.appointmentId !== undefined ? { appointmentId: input.appointmentId } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      properties,
    });

    if (!validation.ok && deploymentMode !== "cloud") {
      console.warn(
        `[telemetry] Missing required properties for ${input.eventName}: ${validation.missing.join(", ")}`,
      );
    }
  }

  return {
    eventName: input.eventName,
    distinctId: input.distinctId,
    ...(input.businessId !== undefined ? { businessId: input.businessId } : {}),
    ...(input.groupKey !== undefined ? { groupKey: input.groupKey } : {}),
    payloadJson: JSON.stringify({
      occurredAt,
      properties,
      ...(input.businessId !== undefined ? { businessId: String(input.businessId) } : {}),
      ...(input.conversationId !== undefined
        ? { conversationId: input.conversationId }
        : {}),
      ...(input.callId !== undefined ? { callId: input.callId } : {}),
      ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
      ...(input.appointmentId !== undefined
        ? { appointmentId: input.appointmentId }
        : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      deploymentMode,
    }),
  };
}

export async function enqueuePostHogOutboxRecord(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  input: SerializedOutboxEvent,
) {
  if (!isPostHogExportEnabled()) {
    return null;
  }

  const outboxId = await ctx.db.insert("telemetry_outbox", {
    destination: TELEMETRY_DESTINATION,
    status: "pending",
    availableAt: new Date().toISOString(),
    attemptCount: 0,
    eventName: input.eventName,
    distinctId: input.distinctId,
    ...(input.businessId !== undefined ? { businessId: input.businessId } : {}),
    ...(input.groupKey !== undefined ? { groupKey: input.groupKey } : {}),
    payloadJson: input.payloadJson,
  });

  await ctx.scheduler.runAfter(0, internal.telemetry.posthog.flushDueEvents, {});
  return outboxId;
}

export const enqueueEvent = internalMutation({
  args: {
    eventName: v.string(),
    distinctId: v.string(),
    businessId: v.optional(v.id("businesses")),
    groupKey: v.optional(v.string()),
    payloadJson: v.string(),
  },
  handler: async (ctx, args) => {
    return await enqueuePostHogOutboxRecord(ctx, args);
  },
});

export const claimDueEvents = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowIso = new Date().toISOString();
    const leaseUntilIso = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
    const limit = Math.max(1, Math.min(args.limit ?? MAX_BATCH_SIZE, MAX_BATCH_SIZE));
    const claimRowsForStatus = async (status: string, remaining: number) => {
      if (remaining <= 0) {
        return [];
      }

      const rows = await ctx.db
        .query("telemetry_outbox")
        .withIndex("by_status_and_available_at", (q) =>
          q.eq("status", status).lte("availableAt", nowIso),
        )
        .take(remaining);

      const claimedRows = [];
      for (const row of rows) {
        if (row.destination !== TELEMETRY_DESTINATION) {
          continue;
        }
        await ctx.db.patch(row._id, {
          status: CLAIMED_STATUS,
          availableAt: leaseUntilIso,
        });
        claimedRows.push(row);
      }
      return claimedRows;
    };

    const claimedPendingRows = await claimRowsForStatus("pending", limit);
    const claimedExpiredRows = await claimRowsForStatus(
      CLAIMED_STATUS,
      limit - claimedPendingRows.length,
    );

    return [...claimedPendingRows, ...claimedExpiredRows];
  },
});

export const markEventDelivered = internalMutation({
  args: {
    outboxId: v.id("telemetry_outbox"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.outboxId, {
      status: "delivered",
    });
    return null;
  },
});

export const markEventForRetry = internalMutation({
  args: {
    outboxId: v.id("telemetry_outbox"),
    errorMessage: v.string(),
    attemptCount: v.number(),
  },
  handler: async (ctx, args) => {
    const nextAttemptCount = args.attemptCount + 1;
    await ctx.db.patch(args.outboxId, {
      status: "pending",
      attemptCount: nextAttemptCount,
      availableAt: new Date(Date.now() + getRetryDelayMs(nextAttemptCount)).toISOString(),
      lastError: args.errorMessage,
    });
    return null;
  },
});

export const flushDueEvents = internalAction({
  args: {},
  handler: async (ctx): Promise<FlushResult> => {
    if (!isPostHogExportEnabled()) {
      return {
        attempted: 0,
        delivered: 0,
        retried: 0,
        skipped: true,
      };
    }

    const posthogKey = process.env.POSTHOG_KEY;
    const posthogHost = process.env.POSTHOG_HOST;
    if (!posthogKey || !posthogHost) {
      return {
        attempted: 0,
        delivered: 0,
        retried: 0,
        skipped: true,
      };
    }

    const dueEvents = await ctx.runMutation(internal.telemetry.posthog.claimDueEvents, {
      limit: MAX_BATCH_SIZE,
    });

    let delivered = 0;
    let retried = 0;

    for (const event of dueEvents) {
      try {
        const payload = JSON.parse(event.payloadJson) as {
          occurredAt?: string;
          deploymentMode?: string;
          businessId?: string;
          conversationId?: string;
          callId?: string;
          messageId?: string;
          appointmentId?: string;
          channel?: string;
          provider?: string;
          model?: string;
          properties?: TelemetryProperties;
        };

        const response = await fetch(buildCaptureUrl(posthogHost), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: posthogKey,
            event: event.eventName,
            distinct_id: event.distinctId,
            ...(payload.occurredAt !== undefined
              ? { timestamp: payload.occurredAt }
              : {}),
            properties: {
              ...payload.properties,
              ...(payload.deploymentMode !== undefined
                ? { deploymentMode: payload.deploymentMode }
                : {}),
              ...(payload.businessId !== undefined ? { businessId: payload.businessId } : {}),
              ...(payload.conversationId !== undefined
                ? { conversationId: payload.conversationId }
                : {}),
              ...(payload.callId !== undefined ? { callId: payload.callId } : {}),
              ...(payload.messageId !== undefined ? { messageId: payload.messageId } : {}),
              ...(payload.appointmentId !== undefined
                ? { appointmentId: payload.appointmentId }
                : {}),
              ...(payload.channel !== undefined ? { channel: payload.channel } : {}),
              ...(payload.provider !== undefined ? { provider: payload.provider } : {}),
              ...(payload.model !== undefined ? { model: payload.model } : {}),
              ...(event.groupKey !== undefined
                ? {
                    $groups: {
                      business: event.groupKey,
                    },
                  }
                : {}),
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`PostHog capture failed with status ${response.status}.`);
        }

        await ctx.runMutation(internal.telemetry.posthog.markEventDelivered, {
          outboxId: event._id,
        });
        delivered += 1;
      } catch (error) {
        await ctx.runMutation(internal.telemetry.posthog.markEventForRetry, {
          outboxId: event._id,
          errorMessage: error instanceof Error ? error.message : "Unknown PostHog delivery error.",
          attemptCount: event.attemptCount,
        });
        retried += 1;
      }
    }

    if (dueEvents.length === MAX_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.telemetry.posthog.flushDueEvents, {});
    }

    return {
      attempted: dueEvents.length,
      delivered,
      retried,
      skipped: false,
    };
  },
});
