import { google } from "@ai-sdk/google";
import {
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelMiddleware,
} from "ai";

import {
  buildPostHogAiGenerationProperties,
  type TelemetryProperties,
} from "../../../packages/telemetry/src/index";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../../_generated/server";
import { captureAiGenerationBestEffort as enqueueAiGenerationBestEffort } from "../../telemetry/ai";
import { enqueuePostHogProviderExceptionBestEffort } from "../../telemetry/posthog";

export const NON_REALTIME_TEXT_PROVIDER = "google";
export const DEFAULT_NON_REALTIME_TEXT_MODEL_ID =
  "gemini-3.1-flash-lite";

const AI_RECEPTIONIST_PROVIDER_OPTION_KEY = "aiReceptionistTelemetry";
const CONVEX_AI_DISTINCT_ID = "system:convex:ai";

type AiRequestTelemetryContext = {
  traceId: string;
  sessionId?: string;
  distinctId?: string;
  groupKey?: string;
  businessId?: Id<"businesses">;
  callId?: Id<"calls">;
  conversationId?: Id<"conversations">;
  messageId?: Id<"messages">;
  properties?: TelemetryProperties;
  mutationRunner?: Pick<ActionCtx | MutationCtx, "runMutation">;
};

function getCaptureUrl(host: string): string {
  return new URL("/i/v0/e/", host).toString();
}

function asUnknownRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumberValue(
  source: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function readTokenCountValue(
  source: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const nested = asUnknownRecord(value);
    if (!nested) {
      continue;
    }

    const nestedValue = readNumberValue(nested, [
      "total",
      "value",
      "count",
      "inputTokens",
      "input_tokens",
      "outputTokens",
      "output_tokens",
      "totalTokens",
      "total_tokens",
      "cacheRead",
      "cache_read",
      "cacheReadTokens",
      "cache_read_tokens",
      "reasoning",
      "reasoningTokens",
      "reasoning_tokens",
    ]);
    if (nestedValue !== undefined) {
      return nestedValue;
    }
  }

  return undefined;
}

function getTelemetryContext(
  input:
    | {
        providerMetadata?: Record<string, unknown> | undefined;
        providerOptions?: Record<string, unknown> | undefined;
      }
    | undefined,
): AiRequestTelemetryContext | undefined {
  const context =
    input?.providerMetadata?.[AI_RECEPTIONIST_PROVIDER_OPTION_KEY] ??
    input?.providerOptions?.[AI_RECEPTIONIST_PROVIDER_OPTION_KEY];
  return asUnknownRecord(context) as AiRequestTelemetryContext | undefined;
}

export function extractGenerationMetrics(
  result: unknown,
): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalCostUsd?: number;
} {
  const source = asUnknownRecord(result);
  const usage =
    asUnknownRecord(source?.usage) ?? asUnknownRecord(source?.totalUsage);
  const providerMetadata = asUnknownRecord(source?.providerMetadata);
  const googleMetadata =
    asUnknownRecord(providerMetadata?.google) ??
    asUnknownRecord(providerMetadata?.["google.generative-ai"]);
  const outputTokenDetails = asUnknownRecord(
    usage?.outputTokenDetails ?? usage?.output_token_details,
  );
  const inputTokenDetails = asUnknownRecord(
    usage?.inputTokenDetails ?? usage?.input_token_details,
  );
  const usageRaw =
    asUnknownRecord(usage?.raw) ??
    asUnknownRecord(googleMetadata?.usageMetadata) ??
    asUnknownRecord(googleMetadata?.usage_metadata);

  const inputTokens =
    readTokenCountValue(usage, ["inputTokens", "input_tokens"]) ??
    readNumberValue(usageRaw, ["promptTokenCount", "prompt_token_count"]);
  const outputTokens =
    readTokenCountValue(usage, ["outputTokens", "output_tokens"]) ??
    readNumberValue(usageRaw, ["candidatesTokenCount", "candidates_token_count"]);
  const totalTokens =
    readNumberValue(usage, ["totalTokens", "total_tokens"]) ??
    readNumberValue(usageRaw, ["totalTokenCount", "total_token_count"]) ??
    (inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);
  const cachedInputTokens =
    readNumberValue(inputTokenDetails, [
      "cacheReadTokens",
      "cache_read_tokens",
      "cachedTokens",
      "cached_tokens",
    ]) ??
    readTokenCountValue(usage, ["cachedInputTokens", "cached_input_tokens"]) ??
    readNumberValue(usageRaw, ["cachedContentTokenCount", "cached_content_token_count"]);
  const reasoningTokens = readNumberValue(outputTokenDetails, [
    "reasoningTokens",
    "reasoning_tokens",
  ]) ?? readTokenCountValue(usage, ["reasoningTokens", "reasoning_tokens"]);
  const totalCostUsd = readNumberValue(googleMetadata, [
    "totalCostUsd",
    "total_cost_usd",
    "costUsd",
    "cost_usd",
  ]);

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
  };
}

async function captureAiGenerationBestEffort(input: {
  context: AiRequestTelemetryContext;
  model: string;
  provider: string;
  latencyMs: number;
  isError?: boolean;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalCostUsd?: number;
}): Promise<void> {
  if (input.context.mutationRunner && input.context.businessId) {
    await enqueueAiGenerationBestEffort(input.context.mutationRunner, {
      businessId: input.context.businessId,
      traceId: input.context.traceId,
      model: input.model,
      provider: input.provider,
      latencyMs: input.latencyMs,
      isStreaming: false,
      ...(input.context.distinctId ? { distinctId: input.context.distinctId } : {}),
      ...(input.context.groupKey ? { groupKey: input.context.groupKey } : {}),
      ...(input.context.callId ? { callId: input.context.callId } : {}),
      ...(input.context.conversationId
        ? { conversationId: input.context.conversationId }
        : {}),
      ...(input.context.messageId ? { messageId: input.context.messageId } : {}),
      ...(input.context.sessionId ? { sessionId: input.context.sessionId } : {}),
      ...(input.isError !== undefined ? { isError: input.isError } : {}),
      ...(input.error ? { error: input.error } : {}),
      ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
      ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
      ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
      ...(input.cachedInputTokens !== undefined
        ? { cachedInputTokens: input.cachedInputTokens }
        : {}),
      ...(input.reasoningTokens !== undefined
        ? { reasoningTokens: input.reasoningTokens }
        : {}),
      ...(input.totalCostUsd !== undefined
        ? { totalCostUsd: input.totalCostUsd }
        : {}),
      ...(input.context.properties ? { properties: input.context.properties } : {}),
    });
    return;
  }

  const posthogKey = process.env.POSTHOG_KEY;
  const posthogHost = process.env.POSTHOG_HOST;
  if (!posthogKey || !posthogHost) {
    return;
  }

  const properties = buildPostHogAiGenerationProperties({
    traceId: input.context.traceId,
    model: input.model,
    provider: input.provider,
    ...(input.context.sessionId ? { sessionId: input.context.sessionId } : {}),
    ...(input.context.callId ? { callId: input.context.callId } : {}),
    ...(input.context.conversationId
      ? { conversationId: input.context.conversationId }
      : {}),
    ...(input.context.messageId ? { messageId: input.context.messageId } : {}),
    latencyMs: input.latencyMs,
    isStreaming: false,
    ...(input.isError !== undefined ? { isError: input.isError } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
    ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
    ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
    ...(input.cachedInputTokens !== undefined
      ? { cachedInputTokens: input.cachedInputTokens }
      : {}),
    ...(input.reasoningTokens !== undefined
      ? { reasoningTokens: input.reasoningTokens }
      : {}),
    ...(input.totalCostUsd !== undefined
      ? { totalCostUsd: input.totalCostUsd }
      : {}),
    ...(input.context.properties ? { properties: input.context.properties } : {}),
  });

  await fetch(getCaptureUrl(posthogHost), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: posthogKey,
      event: "$ai_generation",
      distinct_id:
        input.context.distinctId ??
        (input.context.businessId
          ? `system:business:${input.context.businessId}`
          : CONVEX_AI_DISTINCT_ID),
      properties: {
        ...properties,
        ...(input.context.businessId
          ? { businessId: input.context.businessId }
          : {}),
        ...(input.context.groupKey
          ? {
              $groups: {
                business: input.context.groupKey,
              },
            }
          : {}),
      },
    }),
  }).catch(() => undefined);
}

function createTelemetryMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate, params, model }) => {
      const startedAt = Date.now();
      const telemetryContext = getTelemetryContext({
        providerMetadata: (params as { providerMetadata?: Record<string, unknown> })
          .providerMetadata,
        providerOptions: params.providerOptions,
      });

      try {
        const result = await doGenerate();
        if (telemetryContext) {
          const metrics = extractGenerationMetrics(result);
          await captureAiGenerationBestEffort({
            context: telemetryContext,
            model: model.modelId,
            provider: model.provider,
            latencyMs: Date.now() - startedAt,
            ...metrics,
          });
        }
        return result;
      } catch (error) {
        if (telemetryContext) {
          await captureAiGenerationBestEffort({
            context: telemetryContext,
            model: model.modelId,
            provider: model.provider,
            latencyMs: Date.now() - startedAt,
            isError: true,
            error: error instanceof Error ? error.message : "LLM generation failed",
          });
          if (telemetryContext.mutationRunner) {
            await enqueuePostHogProviderExceptionBestEffort(
              telemetryContext.mutationRunner,
              {
                provider: NON_REALTIME_TEXT_PROVIDER,
                error,
                operation: "non_realtime_text_generation",
                distinctId:
                  telemetryContext.distinctId ??
                  (telemetryContext.businessId
                    ? `system:business:${telemetryContext.businessId}`
                    : CONVEX_AI_DISTINCT_ID),
                ...(telemetryContext.businessId
                  ? { businessId: telemetryContext.businessId }
                  : {}),
                ...(telemetryContext.groupKey
                  ? { groupKey: telemetryContext.groupKey }
                  : {}),
                ...(telemetryContext.callId ? { callId: telemetryContext.callId } : {}),
                ...(telemetryContext.conversationId
                  ? { conversationId: telemetryContext.conversationId }
                  : {}),
                ...(telemetryContext.messageId
                  ? { messageId: telemetryContext.messageId }
                  : {}),
                channel: "sms",
                model: model.modelId,
              },
            );
          }
        }
        throw error;
      }
    },
  };
}

export function getNonRealtimeTextModelId(): string {
  return process.env.GEMINI_TEXT_MODEL ?? DEFAULT_NON_REALTIME_TEXT_MODEL_ID;
}

export function withAiTelemetryContext<
  T extends {
    providerOptions?: Record<string, unknown>;
  },
>(
  input: T,
  context: AiRequestTelemetryContext,
): T {
  return {
    ...input,
    providerOptions: {
      ...(input.providerOptions ?? {}),
      [AI_RECEPTIONIST_PROVIDER_OPTION_KEY]: context,
    },
  };
}

export function createNonRealtimeTextModel(): LanguageModel {
  return wrapLanguageModel({
    model: google(getNonRealtimeTextModelId()),
    middleware: createTelemetryMiddleware(),
  });
}
