"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { isTerminalTwilioCallStatus } from "../lib/voiceCallStatus";
import { getTwilioClient } from "../lib/node/twilioClient";
import { enqueuePostHogProviderExceptionBestEffort } from "../telemetry/posthog";

const CALL_PRICE_RETRY_DELAYS_MS = [
  30_000,
  120_000,
  600_000,
  1_800_000,
] as const;

function parseOptionalFiniteNumber(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePriceUnit(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeProviderCostUsd(
  providerPrice: number | undefined,
  providerPriceUnit: string | undefined,
): number | undefined {
  if (providerPrice === undefined || providerPriceUnit !== "usd") {
    return undefined;
  }

  return Math.abs(providerPrice);
}

export const syncCallPriceFromProvider = internalAction({
  args: {
    twilioCallSid: v.string(),
    providerCallStatus: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attempt = Math.max(0, args.attempt ?? 0);
    if (!isTerminalTwilioCallStatus(args.providerCallStatus)) {
      return { synced: false, scheduledRetry: false, skipped: true };
    }

    try {
      const client = getTwilioClient();
      const call = await client.calls(args.twilioCallSid).fetch();
      const providerPrice = parseOptionalFiniteNumber(call.price);
      const providerPriceUnit = normalizePriceUnit(call.priceUnit);
      const providerCostUsd = normalizeProviderCostUsd(
        providerPrice,
        providerPriceUnit,
      );
      const providerDurationSeconds = parseOptionalFiniteNumber(call.duration);

      await ctx.runMutation(internal.voice.runtime.recordProviderPricing, {
        twilioCallSid: args.twilioCallSid,
        ...(call.dateUpdated
          ? { providerUpdatedAt: call.dateUpdated.toISOString() }
          : {}),
        ...(providerPrice !== undefined ? { providerPrice } : {}),
        ...(providerPriceUnit !== undefined ? { providerPriceUnit } : {}),
        ...(providerCostUsd !== undefined ? { providerCostUsd } : {}),
        ...(providerDurationSeconds !== undefined
          ? { providerDurationSeconds: Math.max(0, Math.trunc(providerDurationSeconds)) }
          : {}),
      });

      if (
        providerCostUsd === undefined &&
        attempt < CALL_PRICE_RETRY_DELAYS_MS.length
      ) {
        const retryDelayMs = CALL_PRICE_RETRY_DELAYS_MS[attempt];
        if (retryDelayMs === undefined) {
          return { synced: false, scheduledRetry: false, skipped: false };
        }
        await ctx.scheduler.runAfter(
          retryDelayMs,
          internal.integrations.twilioVoice.syncCallPriceFromProvider,
          {
            twilioCallSid: args.twilioCallSid,
            providerCallStatus: call.status ?? args.providerCallStatus,
            attempt: attempt + 1,
          },
        );
        return { synced: false, scheduledRetry: true, skipped: false };
      }

      return { synced: providerCostUsd !== undefined, scheduledRetry: false, skipped: false };
    } catch (error) {
      if (attempt < CALL_PRICE_RETRY_DELAYS_MS.length) {
        const retryDelayMs = CALL_PRICE_RETRY_DELAYS_MS[attempt];
        if (retryDelayMs === undefined) {
          return { synced: false, scheduledRetry: false, skipped: false };
        }
        await ctx.scheduler.runAfter(
          retryDelayMs,
          internal.integrations.twilioVoice.syncCallPriceFromProvider,
          {
            twilioCallSid: args.twilioCallSid,
            providerCallStatus: args.providerCallStatus,
            attempt: attempt + 1,
          },
        );
        return { synced: false, scheduledRetry: true, skipped: false };
      }

      console.warn("[twilioVoice] Failed to hydrate provider call price", {
        twilioCallSid: args.twilioCallSid,
        error: error instanceof Error ? error.message : String(error),
      });
      await enqueuePostHogProviderExceptionBestEffort(ctx, {
        provider: "twilio",
        error,
        operation: "twilio_voice_price_sync",
        distinctId: "system:convex:provider:twilio",
        channel: "voice",
        properties: {
          twilioCallSid: args.twilioCallSid,
          providerCallStatus: args.providerCallStatus,
          attemptNumber: attempt + 1,
        },
      });
      return { synced: false, scheduledRetry: false, skipped: false };
    }
  },
});
