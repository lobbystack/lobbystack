import { buildVoiceSystemPrompt } from "@ai-receptionist/ai";
import { loadVoiceGatewayEnv } from "@ai-receptionist/config";
import { demoBusinessId, type BusinessContextSnapshot } from "@ai-receptionist/shared";
import type { IncomingHttpHeaders } from "node:http";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";

import { buildStereoCallRecording, type TimedAudioChunk } from "../audio/wav";
import {
  RuntimeRequestError,
  appendVoiceTranscript,
  completeVoiceCall,
  prepareVoiceTransfer,
  releaseVoiceTransfer,
  startVoiceCall,
  updateVoiceTransferState,
  uploadVoiceRecording,
} from "../convex/runtimeClient";
import { fetchSnapshotForPhoneNumber } from "../context/fetchSnapshot";
import {
  recordMediaStreamDisconnect,
  recordOpenAiRealtimeError,
  recordOpenAiTurnLatency,
  recordSnapshotCacheHit,
  recordSnapshotCacheMiss,
  recordTwilioInvalidSignature,
} from "../observability/posthog";
import {
  captureAiGeneration,
  captureAiSpan,
  captureAiTraceStarted,
  capturePostHogException,
} from "../observability/posthog";
import { executeVoiceTool } from "../realtime/toolExecutor";
import {
  endLiveCallWithMessage,
  transferLiveCall,
} from "./transferCall";
import {
  buildProviderFailureMessage,
  buildToolFailureRecoveryInstructions,
} from "./failureRecovery";
import {
  captureOutboundAudio,
  acknowledgeOutboundPlaybackMark,
  clearPendingOutboundPlayback,
  flushElapsedOutboundPlayback,
  getInterruptedAssistantPlayback,
  queuePendingOutboundPlaybackGroup,
} from "./outboundPlayback";
import {
  buildMediaStreamValidationUrls,
  validateMediaStreamSignature,
} from "./twilioRequest";

type TwilioMediaMessage = {
  event: string;
  sequenceNumber?: string;
  streamSid?: string;
  connected?: {
    protocol?: string;
    version?: string;
  };
  start?: {
    callSid?: string;
    streamSid?: string;
    customParameters?: Record<string, string>;
  };
  media?: {
    payload: string;
    timestamp?: string;
    track?: string;
  };
  mark?: {
    name?: string;
  };
};

type OpenAiRealtimeMessage = {
  type: string;
  event_id?: string;
  delta?: string;
  transcript?: string;
  text?: string;
  usage?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  name?: string;
  call_id?: string;
  arguments?: string;
  item_id?: string;
  previous_item_id?: string | null;
  response_id?: string;
  content_index?: number;
  output_index?: number;
  part?: {
    type?: string;
    transcript?: string;
    text?: string;
  };
  item?: {
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    usage?: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
    content?: Array<{
      type?: string;
      transcript?: string;
      text?: string;
    }>;
  };
  response?: {
    id?: string;
    status?: string;
    conversation_id?: string | null;
    metadata?: Record<string, string | number | boolean | null> | null;
    usage?: Record<string, unknown>;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        transcript?: string;
        text?: string;
      }>;
    }>;
  };
};

type ActiveVoiceSession = {
  businessId: string | null;
  snapshot: BusinessContextSnapshot | null;
  callSid: string | null;
  from: string | null;
  to: string | null;
  gatewaySessionId: string;
  startedAtIso: string;
  startedAtMs: number;
  streamSid: string | null;
  callId: string | null;
  conversationId: string | null;
  openAiReady: boolean;
  pendingTransferDestination: string | null;
  pendingTransferMarkName: string | null;
  transferExecuted: boolean;
  providerRecoveryStarted: boolean;
  finalized: boolean;
  finalDispositionOverride: string | null;
  transcriptSequence: number;
  seenTranscriptKeys: Set<string>;
  inboundAudio: Array<TimedAudioChunk>;
  outboundAudio: Array<TimedAudioChunk>;
  outboundCursorMs: number;
  outboundQueuedCursorMs: number;
  activeAssistantResponseId: string | null;
  activeAssistantItemId: string | null;
  activeAssistantContentIndex: number;
  pendingOutboundAudio: Array<string>;
  pendingOutboundStartMs: number | null;
  pendingOutboundPlaybackGroups: Array<{
    markName: string;
    endOffsetMs: number;
    chunks: Array<TimedAudioChunk>;
    itemId: string | null;
    contentIndex: number;
    itemStartOffsetMs: number;
  }>;
  pendingInboundAudio: Array<string>;
  pendingTasks: Set<Promise<unknown>>;
  aiTraceId: string;
  assistantResponseRequestedAtMs: number | null;
  assistantFirstOutputAtMs: number | null;
  activeCallCounted: boolean;
};

type RealtimeUsageMetrics = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  textInputTokens?: number;
  audioInputTokens?: number;
  cachedInputTokens?: number;
  cachedTextInputTokens?: number;
  cachedAudioInputTokens?: number;
  textOutputTokens?: number;
  audioOutputTokens?: number;
  reasoningTokens?: number;
  totalCostUsd?: number;
};

type RealtimePricingConfig = {
  inputTokenPriceUsd?: number;
  outputTokenPriceUsd?: number;
  textInputTokenPriceUsd?: number;
  audioInputTokenPriceUsd?: number;
  textOutputTokenPriceUsd?: number;
  audioOutputTokenPriceUsd?: number;
  cachedInputTokenPriceUsd?: number;
};

function isTransferQuotaError(error: unknown): boolean {
  return (
    error instanceof RuntimeRequestError &&
    error.code === "outbound_call_attempt_limit_reached"
  );
}

const TRANSFER_QUOTA_REACHED_MESSAGE =
  "This business has reached its transfer limit for this billing period. Please try again later.";

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

function extractRealtimeUsageMetrics(
  response: OpenAiRealtimeMessage["response"] | undefined,
): RealtimeUsageMetrics {
  const usage = asUnknownRecord(response?.usage);
  const metadata = asUnknownRecord(response?.metadata);
  return extractUsageMetrics(usage, metadata);
}

function extractTranscriptionUsageMetrics(
  payload: OpenAiRealtimeMessage,
): RealtimeUsageMetrics {
  const usage = asUnknownRecord(payload.usage ?? payload.item?.usage);
  const metadata = asUnknownRecord(payload.metadata ?? payload.item?.metadata);
  return extractUsageMetrics(usage, metadata);
}

function extractUsageMetrics(
  usage: Record<string, unknown> | undefined,
  metadata: Record<string, unknown> | undefined,
): RealtimeUsageMetrics {
  const inputTokenDetails = asUnknownRecord(
    usage?.input_token_details ?? usage?.inputTokenDetails,
  );
  const outputTokenDetails = asUnknownRecord(
    usage?.output_token_details ?? usage?.outputTokenDetails,
  );
  const cachedTokenDetails = asUnknownRecord(
    inputTokenDetails?.cached_tokens_details ?? inputTokenDetails?.cachedTokensDetails,
  );

  const inputTokens = readNumberValue(usage, ["input_tokens", "inputTokens"]);
  const outputTokens = readNumberValue(usage, ["output_tokens", "outputTokens"]);
  const totalTokens = readNumberValue(usage, ["total_tokens", "totalTokens"]);
  const textInputTokens = readNumberValue(inputTokenDetails, [
    "text_tokens",
    "textTokens",
  ]);
  const audioInputTokens = readNumberValue(inputTokenDetails, [
    "audio_tokens",
    "audioTokens",
  ]);
  const cachedInputTokens = readNumberValue(inputTokenDetails, [
    "cached_tokens",
    "cachedTokens",
    "cache_read_tokens",
    "cacheReadTokens",
  ]);
  const cachedTextInputTokens = readNumberValue(cachedTokenDetails, [
    "text_tokens",
    "textTokens",
  ]);
  const cachedAudioInputTokens = readNumberValue(cachedTokenDetails, [
    "audio_tokens",
    "audioTokens",
  ]);
  const textOutputTokens = readNumberValue(outputTokenDetails, [
    "text_tokens",
    "textTokens",
  ]);
  const audioOutputTokens = readNumberValue(outputTokenDetails, [
    "audio_tokens",
    "audioTokens",
  ]);
  const reasoningTokens = readNumberValue(outputTokenDetails, [
    "reasoning_tokens",
    "reasoningTokens",
  ]);
  const totalCostUsd =
    readNumberValue(usage, ["total_cost_usd", "totalCostUsd"]) ??
    readNumberValue(metadata, ["total_cost_usd", "totalCostUsd"]);

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(textInputTokens !== undefined ? { textInputTokens } : {}),
    ...(audioInputTokens !== undefined ? { audioInputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(cachedTextInputTokens !== undefined ? { cachedTextInputTokens } : {}),
    ...(cachedAudioInputTokens !== undefined ? { cachedAudioInputTokens } : {}),
    ...(textOutputTokens !== undefined ? { textOutputTokens } : {}),
    ...(audioOutputTokens !== undefined ? { audioOutputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
  };
}

function getRealtimePricingConfig(
  env: Pick<
    ReturnType<typeof loadVoiceGatewayEnv>,
    | "OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD"
    | "OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD"
    | "OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD"
    | "OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD"
    | "OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD"
    | "OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD"
    | "OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD"
  >,
): RealtimePricingConfig {
  return {
    ...(env.OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD !== undefined
      ? { inputTokenPriceUsd: env.OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD !== undefined
      ? { outputTokenPriceUsd: env.OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD !== undefined
      ? { textInputTokenPriceUsd: env.OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD !== undefined
      ? { audioInputTokenPriceUsd: env.OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD !== undefined
      ? { textOutputTokenPriceUsd: env.OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD !== undefined
      ? { audioOutputTokenPriceUsd: env.OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD !== undefined
      ? { cachedInputTokenPriceUsd: env.OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD }
      : {}),
  };
}

function getTranscriptionPricingConfig(
  env: Pick<
    ReturnType<typeof loadVoiceGatewayEnv>,
    | "OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD"
    | "OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD"
  >,
): RealtimePricingConfig {
  return {
    ...(env.OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD !== undefined
      ? { inputTokenPriceUsd: env.OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD !== undefined
      ? { textInputTokenPriceUsd: env.OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD !== undefined
      ? { audioInputTokenPriceUsd: env.OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD !== undefined
      ? { outputTokenPriceUsd: env.OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD !== undefined
      ? { textOutputTokenPriceUsd: env.OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD }
      : {}),
    ...(env.OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD !== undefined
      ? { audioOutputTokenPriceUsd: env.OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD }
      : {}),
  };
}

function priceBucket(
  tokenCount: number | undefined,
  tokenPriceUsd: number | undefined,
): number | undefined {
  if (tokenCount === undefined || tokenCount === 0) {
    return 0;
  }

  if (tokenPriceUsd === undefined) {
    return undefined;
  }

  return tokenCount * tokenPriceUsd;
}

export function estimateRealtimeTotalCostUsd(
  metrics: RealtimeUsageMetrics,
  pricing: RealtimePricingConfig,
): number | undefined {
  if (metrics.totalCostUsd !== undefined) {
    return metrics.totalCostUsd;
  }

  const hasDetailedInputBreakdown =
    metrics.textInputTokens !== undefined || metrics.audioInputTokens !== undefined;
  const hasDetailedOutputBreakdown =
    metrics.textOutputTokens !== undefined || metrics.audioOutputTokens !== undefined;
  const hasDetailedCachedBreakdown =
    metrics.cachedInputTokens === undefined ||
    metrics.cachedTextInputTokens !== undefined ||
    metrics.cachedAudioInputTokens !== undefined;

  if (hasDetailedInputBreakdown && !hasDetailedCachedBreakdown) {
    return undefined;
  }

  if ((hasDetailedInputBreakdown && hasDetailedCachedBreakdown) || hasDetailedOutputBreakdown) {
    const cachedTextInputTokens = metrics.cachedTextInputTokens ?? 0;
    const cachedAudioInputTokens = metrics.cachedAudioInputTokens ?? 0;
    const uncachedTextInputTokens =
      metrics.textInputTokens !== undefined
        ? Math.max(0, metrics.textInputTokens - cachedTextInputTokens)
        : undefined;
    const uncachedAudioInputTokens =
      metrics.audioInputTokens !== undefined
        ? Math.max(0, metrics.audioInputTokens - cachedAudioInputTokens)
        : undefined;
    const remainingCachedInputTokens =
      metrics.cachedInputTokens !== undefined
        ? Math.max(
            0,
            metrics.cachedInputTokens -
              cachedTextInputTokens -
              cachedAudioInputTokens,
          )
        : undefined;

    const bucketCosts = [
      priceBucket(
        uncachedTextInputTokens,
        pricing.textInputTokenPriceUsd ?? pricing.inputTokenPriceUsd,
      ),
      priceBucket(
        uncachedAudioInputTokens,
        pricing.audioInputTokenPriceUsd,
      ),
      priceBucket(
        cachedTextInputTokens,
        pricing.cachedInputTokenPriceUsd,
      ),
      priceBucket(
        cachedAudioInputTokens,
        pricing.cachedInputTokenPriceUsd,
      ),
      priceBucket(
        remainingCachedInputTokens,
        pricing.cachedInputTokenPriceUsd,
      ),
      priceBucket(
        metrics.textOutputTokens,
        pricing.textOutputTokenPriceUsd ?? pricing.outputTokenPriceUsd,
      ),
      priceBucket(
        metrics.audioOutputTokens,
        pricing.audioOutputTokenPriceUsd,
      ),
    ];

    return bucketCosts.every((value) => value !== undefined)
      ? bucketCosts.reduce((sum, value) => sum + (value ?? 0), 0)
      : undefined;
  }

  const nonCachedInputTokens =
    metrics.inputTokens !== undefined
      ? Math.max(0, metrics.inputTokens - (metrics.cachedInputTokens ?? 0))
      : undefined;
  const nonCachedInputCostUsd =
    nonCachedInputTokens !== undefined && pricing.inputTokenPriceUsd !== undefined
      ? nonCachedInputTokens * pricing.inputTokenPriceUsd
      : undefined;
  const cachedInputCostUsd =
    metrics.cachedInputTokens !== undefined &&
    pricing.cachedInputTokenPriceUsd !== undefined
      ? metrics.cachedInputTokens * pricing.cachedInputTokenPriceUsd
      : undefined;
  const outputCostUsd =
    metrics.outputTokens !== undefined && pricing.outputTokenPriceUsd !== undefined
      ? metrics.outputTokens * pricing.outputTokenPriceUsd
      : undefined;

  const totalCostUsd =
    (nonCachedInputCostUsd ?? 0) +
    (cachedInputCostUsd ?? 0) +
    (outputCostUsd ?? 0);

  return nonCachedInputCostUsd !== undefined ||
    cachedInputCostUsd !== undefined ||
    outputCostUsd !== undefined
    ? totalCostUsd
    : undefined;
}

export function getRealtimeGenerationOutcome(
  status: string | undefined,
): {
  isError: boolean;
  error?: string;
} {
  if (!status || status === "completed") {
    return {
      isError: false,
    };
  }

  if (status === "cancelled") {
    return {
      isError: false,
      error: status,
    };
  }

  return {
    isError: true,
    error: status,
  };
}

type MediaStreamRequestContext = {
  url: string;
  headers: IncomingHttpHeaders;
};

function buildBusinessNowLabel(timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch (error) {
    if (error instanceof RangeError) {
      return null;
    }

    throw error;
  }
}

function createRealtimeToolDefinitions() {
  return [
    {
      type: "function",
      name: "getBusinessHours",
      description: "Get the authoritative business hours and closure information.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "getBusinessServices",
      description:
        "List the structured services configured for this business, including duration and short descriptions when available.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "searchKnowledge",
      description:
        "Search indexed business knowledge and uploaded documents for a specific question. Falls back to snapshot summary knowledge when indexed retrieval has no matches or is unavailable.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "findAvailability",
      description:
        "Find candidate appointment slots for a service on a specific local date, optionally near a preferred hour, before asking the caller to confirm a precise time.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          date: {
            type: "string",
            description: "Local business date in YYYY-MM-DD format.",
          },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
          preferredHour24: { type: "integer" },
          preferredMinute: { type: "integer" },
          limit: { type: "integer" },
        },
        required: ["serviceName", "date"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "checkAvailability",
      description:
        "Check appointment availability for a named service at an exact ISO datetime before promising a slot.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          startsAt: { type: "string" },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
        },
        required: ["serviceName", "startsAt"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "bookAppointment",
      description:
        "Book an appointment only after availability is confirmed. Use the caller phone by default if no callback number is provided.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          startsAt: { type: "string" },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
          contactName: { type: "string" },
          contactPhone: { type: "string" },
        },
        required: ["serviceName", "startsAt"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "transferCall",
      description:
        "Transfer the live call to a human when transfer policy allows it, someone is available to receive the transfer, and the caller requests or needs a human handoff.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "takeMessage",
      description:
        "Capture a structured callback or follow-up message when a transfer is not possible, no one is available to receive it, or the caller wants a message left for staff.",
      parameters: {
        type: "object",
        properties: {
          callerName: { type: "string" },
          callbackPhone: { type: "string" },
          message: { type: "string" },
          urgency: { type: "string" },
          callbackWindow: { type: "string" },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
  ];
}

function trackTask(session: ActiveVoiceSession, task: Promise<unknown>): void {
  session.pendingTasks.add(task);
  task.finally(() => {
    session.pendingTasks.delete(task);
  });
}

function postRealtimeEvent(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function clearPendingTransferPlaybackWait(
  server: FastifyInstance,
  session: ActiveVoiceSession,
  reason: string,
): void {
  if (!session.pendingTransferMarkName) {
    return;
  }

  server.log.info(
    {
      callSid: session.callSid,
      streamSid: session.streamSid,
      markName: session.pendingTransferMarkName,
      reason,
    },
    "Canceled pending transfer playback wait",
  );
  session.pendingTransferMarkName = null;
}

function cancelAssistantAudio(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
): void {
  const elapsedMs = Date.now() - session.startedAtMs;
  const interruptedPlayback = getInterruptedAssistantPlayback(session, elapsedMs);

  clearPendingOutboundPlayback(session, elapsedMs);

  if (session.streamSid && twilioSocket.readyState === WebSocket.OPEN) {
    clearPendingTransferPlaybackWait(server, session, "assistant_audio_cleared");
    twilioSocket.send(
      JSON.stringify({
        event: "clear",
        streamSid: session.streamSid,
      }),
    );
  }

  if (interruptedPlayback) {
    postRealtimeEvent(openAiSocket, {
      type: "conversation.item.truncate",
      item_id: interruptedPlayback.itemId,
      content_index: interruptedPlayback.contentIndex,
      audio_end_ms: interruptedPlayback.audioEndMs,
    });
  }
}

async function performTransfer(
  server: FastifyInstance,
  session: ActiveVoiceSession,
): Promise<void> {
  if (
    !session.pendingTransferDestination ||
    session.transferExecuted ||
    !session.callSid
  ) {
    return;
  }

  let reservationPrepared = false;
  let transferSubmitted = false;
  try {
    await prepareVoiceTransfer({
      ...(session.callId ? { callId: session.callId } : {}),
      ...(!session.callId ? { twilioCallSid: session.callSid } : {}),
      recordedAt: new Date().toISOString(),
    });
    reservationPrepared = true;
    session.transferExecuted = true;
    await transferLiveCall({
      callSid: session.callSid,
      destination: session.pendingTransferDestination,
      ...(session.callId
        ? {
            actionUrl: getTransferActionUrl(server, session.callId),
          }
        : {}),
    });
    transferSubmitted = true;
    if (session.callId) {
      await updateVoiceTransferState({
        callId: session.callId,
        transferState: "completed",
      });
    }
  } catch (error) {
    server.log.error(error);
    if (session.callId) {
      await updateVoiceTransferState({
        callId: session.callId,
        transferState: "failed",
      });
    }
    if (reservationPrepared && !transferSubmitted) {
      try {
        await releaseVoiceTransfer({
          ...(session.callId ? { callId: session.callId } : {}),
          ...(!session.callId ? { twilioCallSid: session.callSid } : {}),
          recordedAt: new Date().toISOString(),
        });
      } catch (releaseError) {
        server.log.error(
          {
            err: releaseError,
            callId: session.callId,
            callSid: session.callSid,
          },
          "Failed to release reserved transfer usage after handoff submission error",
        );
      }
    }
    if (isTransferQuotaError(error)) {
      await endLiveCallWithMessage({
        callSid: session.callSid,
        sayMessage: TRANSFER_QUOTA_REACHED_MESSAGE,
      });
    }
  }
}

function getTransferActionUrl(server: FastifyInstance, callId: string): string {
  return new URL(
    `/twilio/voice/transfer-action?callId=${encodeURIComponent(callId)}`,
    server.runtimeConfig.VOICE_GATEWAY_BASE_URL,
  ).toString();
}

function queueTransferAfterPlayback(
  server: FastifyInstance,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
): void {
  if (
    !session.pendingTransferDestination ||
    session.transferExecuted ||
    session.pendingTransferMarkName
  ) {
    return;
  }

  if (!session.streamSid || twilioSocket.readyState !== WebSocket.OPEN) {
    const transferTask = performTransfer(server, session);
    trackTask(session, transferTask);
    return;
  }

  const markName = `transfer-${crypto.randomUUID()}`;
  session.pendingTransferMarkName = markName;
  twilioSocket.send(
    JSON.stringify({
      event: "mark",
      streamSid: session.streamSid,
      mark: {
        name: markName,
      },
    }),
  );
  server.log.info(
    {
      callSid: session.callSid,
      streamSid: session.streamSid,
      markName,
    },
    "Queued transfer to wait for Twilio playback completion",
  );
}

async function finalizeCall(
  server: FastifyInstance,
  openAiSocket: WebSocket | null,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
  disposition: string,
): Promise<void> {
  if (session.finalized) {
    return;
  }
  session.finalized = true;
  if (session.activeCallCounted) {
    session.activeCallCounted = false;
  }

  try {
    await Promise.allSettled(Array.from(session.pendingTasks));
    const finalDisposition = session.finalDispositionOverride ?? disposition;
    flushElapsedOutboundPlayback(session, Date.now() - session.startedAtMs);

    if (session.callId) {
      const durationMs = Math.max(0, Date.now() - session.startedAtMs);
      if (session.inboundAudio.length > 0 || session.outboundAudio.length > 0) {
        try {
          const recording = buildStereoCallRecording({
            inboundChunks: session.inboundAudio,
            outboundChunks: session.outboundAudio,
          });
          await uploadVoiceRecording({
            callId: session.callId,
            durationMs,
            audio: recording,
          });
        } catch (error) {
          server.log.error(
            {
              err: error,
              callId: session.callId,
              callSid: session.callSid,
            },
            "Failed to upload voice recording during call finalization",
          );
        }
      }

      await completeVoiceCall({
        callId: session.callId,
        status: finalDisposition === "transferred" ? "transferred" : "completed",
        endedAt: new Date().toISOString(),
        disposition: finalDisposition,
        providerDurationSeconds: Math.max(0, Math.ceil(durationMs / 1000)),
      });
    }
  } catch (error) {
    server.log.error(error);
  } finally {
    if (openAiSocket?.readyState === WebSocket.OPEN) {
      openAiSocket.close();
    }
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  }
}

async function recoverFromProviderFailure(
  server: FastifyInstance,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
  input: {
    disposition: string;
  },
): Promise<void> {
  if (
    session.finalized ||
    session.providerRecoveryStarted ||
    !session.callSid
  ) {
    return;
  }

  session.providerRecoveryStarted = true;
  session.finalDispositionOverride = input.disposition;

  clearPendingTransferPlaybackWait(server, session, "provider_failure_recovery");
  if (session.streamSid && twilioSocket.readyState === WebSocket.OPEN) {
    twilioSocket.send(
      JSON.stringify({
        event: "clear",
        streamSid: session.streamSid,
      }),
    );
  }

  const transferDestination = session.snapshot?.transferPolicy.transferNumber ?? null;
  const transferAvailable =
    session.snapshot?.transferPolicy.mode !== "never" && Boolean(transferDestination);
  const fallbackMessage = buildProviderFailureMessage({ transferAvailable });

  try {
    if (transferAvailable && transferDestination) {
      session.transferExecuted = true;
      if (session.callId) {
        try {
          await updateVoiceTransferState({
            callId: session.callId,
            transferState: "requested",
          });
        } catch (error) {
          server.log.error(
            {
              callId: session.callId,
              callSid: session.callSid,
              transferState: "requested",
            },
            error instanceof Error
              ? error.message
              : "Failed to persist requested transfer state during provider recovery",
          );
        }
      }

      let reservationPrepared = false;
      let transferSubmitted = false;
      try {
        await prepareVoiceTransfer({
          ...(session.callId ? { callId: session.callId } : {}),
          ...(!session.callId ? { twilioCallSid: session.callSid } : {}),
          recordedAt: new Date().toISOString(),
        });
        reservationPrepared = true;
        await transferLiveCall({
          callSid: session.callSid,
          destination: transferDestination,
          sayMessage: fallbackMessage,
          ...(session.callId ? { actionUrl: getTransferActionUrl(server, session.callId) } : {}),
        });
        transferSubmitted = true;
      } catch (error) {
        if (session.callId) {
          try {
            await updateVoiceTransferState({
              callId: session.callId,
              transferState: "failed",
            });
          } catch (stateError) {
            server.log.error(
              {
                callId: session.callId,
                callSid: session.callSid,
                transferState: "failed",
              },
              stateError instanceof Error
                ? stateError.message
                : "Failed to persist failed transfer state during provider recovery",
            );
          }
        }
        if (reservationPrepared && !transferSubmitted) {
          try {
            await releaseVoiceTransfer({
              ...(session.callId ? { callId: session.callId } : {}),
              ...(!session.callId ? { twilioCallSid: session.callSid } : {}),
              recordedAt: new Date().toISOString(),
            });
          } catch (releaseError) {
            server.log.error(
              {
                err: releaseError,
                callId: session.callId,
                callSid: session.callSid,
              },
              "Failed to release transfer usage after provider recovery handoff error",
            );
          }
        }
        if (isTransferQuotaError(error)) {
          await endLiveCallWithMessage({
            callSid: session.callSid,
            sayMessage: TRANSFER_QUOTA_REACHED_MESSAGE,
          });
          return;
        }
        throw error;
      }
      return;
    }

    await endLiveCallWithMessage({
      callSid: session.callSid,
      sayMessage: fallbackMessage,
    });
  } catch (error) {
    server.log.error(
      {
        callSid: session.callSid,
        streamSid: session.streamSid,
        disposition: input.disposition,
      },
      error instanceof Error ? error.message : "Provider recovery failed",
    );
    capturePostHogException(error, {
      ...(session.businessId ? { businessId: session.businessId } : {}),
      properties: {
        operation: "provider_failure_recovery",
        disposition: input.disposition,
        channel: "voice",
        provider: "twilio",
        ...(session.callSid ? { callSid: session.callSid } : {}),
        ...(session.streamSid ? { streamSid: session.streamSid } : {}),
        ...(session.callId ? { callId: session.callId } : {}),
        ...(session.conversationId ? { conversationId: session.conversationId } : {}),
      },
    });

    // Let the recovery task settle before finalization waits on pending tasks.
    queueMicrotask(() => {
      void finalizeCall(server, null, twilioSocket, session, input.disposition);
    });
  }
}

function queueTranscriptWrite(
  server: FastifyInstance,
  session: ActiveVoiceSession,
  input: {
    speaker: string;
    text: string | undefined;
    confidence?: number;
  },
): void {
  if (
    !session.businessId ||
    !session.callId ||
    !input.text ||
    input.text.trim().length === 0
  ) {
    return;
  }

  const transcriptPromise = appendVoiceTranscript({
    businessId: session.businessId,
    callId: session.callId,
    sequence: session.transcriptSequence,
    speaker: input.speaker,
    text: input.text,
    final: true,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
  }).catch((error) => {
    server.log.error(error);
  });
  server.log.info(
    {
      callId: session.callId,
      sequence: session.transcriptSequence,
      speaker: input.speaker,
      text: input.text,
    },
    "Persisting transcript segment",
  );
  session.transcriptSequence += 1;
  trackTask(session, transcriptPromise);
}

function queueTranscriptWriteIfNew(
  server: FastifyInstance,
  session: ActiveVoiceSession,
  dedupeKey: string,
  input: {
    speaker: string;
    text: string | undefined;
    confidence?: number;
  },
): void {
  if (!input.text || input.text.trim().length === 0) {
    return;
  }

  if (session.seenTranscriptKeys.has(dedupeKey)) {
    return;
  }

  session.seenTranscriptKeys.add(dedupeKey);
  queueTranscriptWrite(server, session, input);
}

async function configureOpenAiSession(
  openAiSocket: WebSocket,
  session: ActiveVoiceSession,
  server: FastifyInstance,
): Promise<void> {
  if (!session.snapshot) {
    throw new Error("Voice session snapshot is not ready.");
  }

  const runtimeConfig = loadVoiceGatewayEnv(process.env);
  const businessNowLabel = buildBusinessNowLabel(session.snapshot.timezone);
  if (!businessNowLabel) {
    server.log.warn(
      { timezone: session.snapshot.timezone, businessId: session.businessId },
      "Skipping business-local time prompt because the configured timezone is invalid",
    );
  }

  postRealtimeEvent(openAiSocket, {
    type: "session.update",
    session: {
      instructions: [
        buildVoiceSystemPrompt(session.snapshot),
        "You are speaking on a live phone call.",
        "Start in the language implied by the configured greeting.",
        "After the greeting, adapt to the caller's language as soon as the caller clearly establishes one.",
        "Answer from the supplied business snapshot whenever possible.",
        "Use tools for authoritative actions like booking, transfer, and message taking.",
        "Do not make up availability, hours, or business policy.",
        ...(businessNowLabel
          ? [
              `The current local business time is ${businessNowLabel} in ${session.snapshot.timezone}.`,
            ]
          : [
              `The business timezone is configured as ${session.snapshot.timezone}. Interpret relative dates and times using that timezone.`,
            ]),
        "If the caller asks what services the business offers, use getBusinessServices instead of guessing or saying the list is unavailable.",
        "For booking, first collect the service, local day/date, and approximate time preference.",
        "If the caller gives a day/date or a rough time like '4' or 'afternoon', use findAvailability before trying to book.",
        "Offer one or a few specific candidate slots from findAvailability and wait for the caller to confirm one exact slot.",
        "Only call bookAppointment after the caller confirms a specific offered time.",
        "If the caller names a service loosely, map it to the closest configured service when there is an obvious match.",
        "Interpret relative dates and times in the business timezone.",
      ].join("\n\n"),
      modalities: ["audio", "text"],
      voice: runtimeConfig.OPENAI_REALTIME_VOICE,
      input_audio_format: "g711_ulaw",
      output_audio_format: "g711_ulaw",
      input_audio_transcription: {
        model: runtimeConfig.OPENAI_TRANSCRIPTION_MODEL,
      },
      turn_detection: {
        type: "server_vad",
        create_response: true,
        interrupt_response: true,
      },
      tools: createRealtimeToolDefinitions(),
      tool_choice: "auto",
    },
  });

  session.openAiReady = true;
  if (session.businessId) {
    captureAiTraceStarted({
      businessId: session.businessId,
      traceId: session.aiTraceId,
      ...(session.callId ? { callId: session.callId } : {}),
      ...(session.conversationId ? { conversationId: session.conversationId } : {}),
      model: runtimeConfig.OPENAI_REALTIME_MODEL,
      provider: "openai",
    });
  }
  for (const payload of session.pendingInboundAudio) {
    postRealtimeEvent(openAiSocket, {
      type: "input_audio_buffer.append",
      audio: payload,
    });
  }
  session.pendingInboundAudio = [];

  session.assistantResponseRequestedAtMs = Date.now();
  session.assistantFirstOutputAtMs = null;
  postRealtimeEvent(openAiSocket, {
    type: "response.create",
    response: {
      instructions: [
        `Begin the call by greeting the caller with this exact greeting: "${session.snapshot.greeting}"`,
        "After the greeting, continue in the language implied by that greeting unless the caller clearly prefers another language.",
        "After the greeting, stop speaking and wait for the caller to respond.",
        "Do not add any extra sentence before or after the greeting.",
      ].join(" "),
    },
  });
}

async function initializeCallRecord(
  server: FastifyInstance,
  session: ActiveVoiceSession,
): Promise<void> {
  if (session.businessId === demoBusinessId) {
    server.log.info("Skipping call record initialization for demo fallback snapshot");
    return;
  }

  if (!session.businessId || !session.callSid || !session.from || !session.to) {
    throw new Error("Voice session metadata is incomplete.");
  }

  try {
    const result = await startVoiceCall({
      businessId: session.businessId,
      twilioCallSid: session.callSid,
      gatewaySessionId: session.gatewaySessionId,
      from: session.from,
      to: session.to,
      startedAt: session.startedAtIso,
    });
    session.callId = result.callId;
    session.conversationId = result.conversationId ?? null;
  } catch (error) {
    server.log.error(error);
    capturePostHogException(error, {
      businessId: session.businessId,
      properties: {
        operation: "initialize_call_record",
        channel: "voice",
        provider: "twilio",
        callSid: session.callSid,
        ...(session.gatewaySessionId ? { gatewaySessionId: session.gatewaySessionId } : {}),
      },
    });
  }
}

async function handleToolCall(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  session: ActiveVoiceSession,
  message: {
    name: string;
    callId: string;
    arguments: string;
  },
): Promise<void> {
  const startedAt = Date.now();
  const runtimeConfig = loadVoiceGatewayEnv(process.env);

  try {
    if (!session.snapshot || !session.businessId) {
      throw new Error("Voice session has not been initialized.");
    }

    const result = await executeVoiceTool({
      toolName: message.name,
      rawArguments: message.arguments,
      snapshot: session.snapshot,
      businessId: session.businessId,
      ...(session.callId !== null ? { callId: session.callId } : {}),
      ...(session.conversationId !== null
        ? { conversationId: session.conversationId }
        : {}),
      callerPhone: session.from ?? "unknown",
    });

    if (result.pendingTransferDestination) {
      session.pendingTransferDestination = result.pendingTransferDestination;
    }

    captureAiSpan({
      businessId: session.businessId,
      traceId: session.aiTraceId,
      ...(session.callId ? { callId: session.callId } : {}),
      ...(session.conversationId ? { conversationId: session.conversationId } : {}),
      model: runtimeConfig.OPENAI_REALTIME_MODEL,
      provider: "openai",
      spanName: `tool_call:${message.name}`,
      inputState: {
        toolName: message.name,
      },
      outputState: {
        succeeded: true,
      },
      latencyMs: Date.now() - startedAt,
      properties: {
        toolName: message.name,
        succeeded: true,
      },
    });

    postRealtimeEvent(openAiSocket, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: message.callId,
        output: JSON.stringify(result.result),
      },
    });
    session.assistantResponseRequestedAtMs = Date.now();
    session.assistantFirstOutputAtMs = null;
    postRealtimeEvent(openAiSocket, {
      type: "response.create",
    });
  } catch (error) {
    server.log.error(error);
    if (session.businessId) {
      captureAiSpan({
        businessId: session.businessId,
        traceId: session.aiTraceId,
        ...(session.callId ? { callId: session.callId } : {}),
        ...(session.conversationId ? { conversationId: session.conversationId } : {}),
        model: runtimeConfig.OPENAI_REALTIME_MODEL,
        provider: "openai",
        spanName: `tool_call:${message.name}`,
        inputState: {
          toolName: message.name,
        },
        outputState: {
          succeeded: false,
          error:
            error instanceof Error ? error.message : "Unknown tool error",
        },
        latencyMs: Date.now() - startedAt,
        isError: true,
        error: error instanceof Error ? error.message : "Unknown tool error",
        properties: {
          toolName: message.name,
          succeeded: false,
        },
      });
    }
    const transferAvailable =
      session.snapshot?.transferPolicy.mode !== "never" &&
      Boolean(session.snapshot?.transferPolicy.transferNumber);
    postRealtimeEvent(openAiSocket, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: message.callId,
        output: JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown tool error",
          transferAvailable,
        }),
      },
    });
    session.assistantResponseRequestedAtMs = Date.now();
    session.assistantFirstOutputAtMs = null;
    postRealtimeEvent(openAiSocket, {
      type: "response.create",
      response: {
        instructions: buildToolFailureRecoveryInstructions({
          toolName: message.name,
          transferAvailable,
        }),
      },
    });
  }
}

function handleOpenAiMessage(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
  rawMessage: WebSocket.RawData,
): void {
  const queuePendingPlaybackMark = (): boolean => {
    if (!session.streamSid || twilioSocket.readyState !== WebSocket.OPEN) {
      return false;
    }

    const markName = `audio-response-${crypto.randomUUID()}`;
    const queued = queuePendingOutboundPlaybackGroup(session, markName);
    if (!queued) {
      return false;
    }

    twilioSocket.send(
      JSON.stringify({
        event: "mark",
        streamSid: session.streamSid,
        mark: {
          name: markName,
        },
      }),
    );
    return true;
  };

  const payload = JSON.parse(rawMessage.toString()) as OpenAiRealtimeMessage;

  if (
    payload.type !== "response.audio.delta" &&
    payload.type !== "response.output_audio.delta"
  ) {
    server.log.info({ type: payload.type }, "Received OpenAI Realtime event");
  }

  switch (payload.type) {
    case "response.audio.delta":
    case "response.output_audio.delta": {
      if (
        session.assistantResponseRequestedAtMs !== null &&
        session.assistantFirstOutputAtMs === null
      ) {
        session.assistantFirstOutputAtMs = Date.now();
      }

      if (payload.delta && session.streamSid && twilioSocket.readyState === WebSocket.OPEN) {
        if (
          payload.response_id &&
          session.activeAssistantResponseId &&
          payload.response_id !== session.activeAssistantResponseId &&
          session.pendingOutboundAudio.length > 0
        ) {
          queuePendingPlaybackMark();
        }

        twilioSocket.send(
          JSON.stringify({
            event: "media",
            streamSid: session.streamSid,
            media: {
              payload: payload.delta,
            },
          }),
        );
        captureOutboundAudio(session, {
          elapsedMs: Date.now() - session.startedAtMs,
          payload: payload.delta,
          ...(payload.response_id ? { responseId: payload.response_id } : {}),
          ...(payload.item_id ? { itemId: payload.item_id } : {}),
          ...(payload.content_index !== undefined
            ? { contentIndex: payload.content_index }
            : {}),
        });
      }
      return;
    }
    case "conversation.item.input_audio_transcription.completed": {
      const runtimeConfig = loadVoiceGatewayEnv(process.env);
      const usageMetrics = extractTranscriptionUsageMetrics(payload);
      const totalCostUsd = estimateRealtimeTotalCostUsd(
        usageMetrics,
        getTranscriptionPricingConfig(runtimeConfig),
      );

      if (session.businessId) {
        captureAiGeneration({
          businessId: session.businessId,
          traceId: session.aiTraceId,
          ...(session.callId ? { callId: session.callId } : {}),
          ...(session.conversationId ? { conversationId: session.conversationId } : {}),
          model: runtimeConfig.OPENAI_TRANSCRIPTION_MODEL,
          provider: "openai",
          ...(usageMetrics.inputTokens !== undefined
            ? { inputTokens: usageMetrics.inputTokens }
            : {}),
          ...(usageMetrics.outputTokens !== undefined
            ? { outputTokens: usageMetrics.outputTokens }
            : {}),
          ...(usageMetrics.totalTokens !== undefined
            ? { totalTokens: usageMetrics.totalTokens }
            : {}),
          ...(usageMetrics.textInputTokens !== undefined
            ? { textInputTokens: usageMetrics.textInputTokens }
            : {}),
          ...(usageMetrics.audioInputTokens !== undefined
            ? { audioInputTokens: usageMetrics.audioInputTokens }
            : {}),
          ...(usageMetrics.cachedInputTokens !== undefined
            ? { cachedInputTokens: usageMetrics.cachedInputTokens }
            : {}),
          ...(usageMetrics.cachedTextInputTokens !== undefined
            ? { cachedTextInputTokens: usageMetrics.cachedTextInputTokens }
            : {}),
          ...(usageMetrics.cachedAudioInputTokens !== undefined
            ? { cachedAudioInputTokens: usageMetrics.cachedAudioInputTokens }
            : {}),
          ...(usageMetrics.textOutputTokens !== undefined
            ? { textOutputTokens: usageMetrics.textOutputTokens }
            : {}),
          ...(usageMetrics.audioOutputTokens !== undefined
            ? { audioOutputTokens: usageMetrics.audioOutputTokens }
            : {}),
          ...(usageMetrics.reasoningTokens !== undefined
            ? { reasoningTokens: usageMetrics.reasoningTokens }
            : {}),
          ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
          isStreaming: false,
          properties: {
            generationKind: "input_audio_transcription",
            channel: "voice",
          },
        });
      }

      queueTranscriptWriteIfNew(
        server,
        session,
        `caller-completed:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.transcript ?? ""}`,
        {
          speaker: "caller",
          text: payload.transcript,
        },
      );
      return;
    }
    case "response.audio.done":
    case "response.output_audio.done": {
      queuePendingPlaybackMark();
      return;
    }
    case "response.output_audio_transcript.delta":
    case "response.output_text.delta":
      return;
    case "conversation.item.input_audio_transcription.failed": {
      server.log.warn(
        {
          itemId: payload.item_id,
        },
        "Input audio transcription failed",
      );
      return;
    }
    case "response.audio_transcript.done":
    case "response.output_audio_transcript.done": {
      queueTranscriptWriteIfNew(
        server,
        session,
        `assistant-output-transcript:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.transcript ?? ""}`,
        {
          speaker: "assistant",
          text: payload.transcript,
        },
      );
      return;
    }
    case "response.done": {
      const runtimeConfig = loadVoiceGatewayEnv(process.env);
      const completedAtMs = Date.now();
      const latencyMs =
        session.assistantResponseRequestedAtMs !== null
          ? completedAtMs - session.assistantResponseRequestedAtMs
          : undefined;
      const ttftMs =
        session.assistantResponseRequestedAtMs !== null &&
        session.assistantFirstOutputAtMs !== null
          ? session.assistantFirstOutputAtMs - session.assistantResponseRequestedAtMs
          : undefined;
      const usageMetrics = extractRealtimeUsageMetrics(payload.response);

      if (latencyMs !== undefined) {
        recordOpenAiTurnLatency(latencyMs, {
          ...(session.businessId ? { "ai_receptionist.business_id": session.businessId } : {}),
          ...(session.callId ? { "ai_receptionist.call_id": session.callId } : {}),
          "ai_receptionist.provider": "openai",
          "ai_receptionist.model": runtimeConfig.OPENAI_REALTIME_MODEL,
        });
      }

      const totalCostUsd = estimateRealtimeTotalCostUsd(
        usageMetrics,
        getRealtimePricingConfig(runtimeConfig),
      );
      const generationOutcome = getRealtimeGenerationOutcome(payload.response?.status);

      if (session.businessId) {
        captureAiGeneration({
          businessId: session.businessId,
          traceId: session.aiTraceId,
          ...(session.callId ? { callId: session.callId } : {}),
          ...(session.conversationId ? { conversationId: session.conversationId } : {}),
          model: runtimeConfig.OPENAI_REALTIME_MODEL,
          provider: "openai",
          ...(latencyMs !== undefined ? { latencyMs } : {}),
          ...(ttftMs !== undefined ? { ttftMs } : {}),
          ...(usageMetrics.inputTokens !== undefined
            ? { inputTokens: usageMetrics.inputTokens }
            : {}),
          ...(usageMetrics.outputTokens !== undefined
            ? { outputTokens: usageMetrics.outputTokens }
            : {}),
          ...(usageMetrics.totalTokens !== undefined
            ? { totalTokens: usageMetrics.totalTokens }
            : {}),
          ...(usageMetrics.textInputTokens !== undefined
            ? { textInputTokens: usageMetrics.textInputTokens }
            : {}),
          ...(usageMetrics.audioInputTokens !== undefined
            ? { audioInputTokens: usageMetrics.audioInputTokens }
            : {}),
          ...(usageMetrics.cachedInputTokens !== undefined
            ? { cachedInputTokens: usageMetrics.cachedInputTokens }
            : {}),
          ...(usageMetrics.cachedTextInputTokens !== undefined
            ? { cachedTextInputTokens: usageMetrics.cachedTextInputTokens }
            : {}),
          ...(usageMetrics.cachedAudioInputTokens !== undefined
            ? { cachedAudioInputTokens: usageMetrics.cachedAudioInputTokens }
            : {}),
          ...(usageMetrics.textOutputTokens !== undefined
            ? { textOutputTokens: usageMetrics.textOutputTokens }
            : {}),
          ...(usageMetrics.audioOutputTokens !== undefined
            ? { audioOutputTokens: usageMetrics.audioOutputTokens }
            : {}),
          ...(usageMetrics.reasoningTokens !== undefined
            ? { reasoningTokens: usageMetrics.reasoningTokens }
            : {}),
          ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
          isStreaming: true,
          isError: generationOutcome.isError,
          ...(generationOutcome.error ? { error: generationOutcome.error } : {}),
          transferInvoked: Boolean(session.pendingTransferDestination),
        });
      }
      session.assistantResponseRequestedAtMs = null;
      session.assistantFirstOutputAtMs = null;

      if (
        payload.response?.id &&
        payload.response.id === session.activeAssistantResponseId &&
        session.pendingOutboundAudio.length > 0
      ) {
        queuePendingPlaybackMark();
      }

      if (
        payload.response?.status === "completed" &&
        session.pendingTransferDestination &&
        !session.transferExecuted
      ) {
        queueTransferAfterPlayback(server, twilioSocket, session);
      }
      return;
    }
    case "input_audio_buffer.speech_started": {
      cancelAssistantAudio(server, openAiSocket, twilioSocket, session);
      return;
    }
    case "response.function_call_arguments.done": {
      if (payload.name && payload.call_id && payload.arguments) {
        const task = handleToolCall(server, openAiSocket, session, {
          name: payload.name,
          callId: payload.call_id,
          arguments: payload.arguments,
        });
        trackTask(session, task);
      }
      return;
    }
    case "response.output_item.done": {
      if (
        payload.item?.type === "function_call" &&
        payload.item.name &&
        payload.item.call_id &&
        payload.item.arguments
      ) {
        const task = handleToolCall(server, openAiSocket, session, {
          name: payload.item.name,
          callId: payload.item.call_id,
          arguments: payload.item.arguments,
        });
        trackTask(session, task);
      }
      return;
    }
    default: {
      return;
    }
  }
}

export async function handleMediaStreamConnection(
  server: FastifyInstance,
  twilioSocket: WebSocket,
  request: MediaStreamRequestContext,
): Promise<void> {
  let openAiSocket: WebSocket | null = null;
  let signatureValidated = false;

  twilioSocket.on("message", (rawMessage: WebSocket.RawData) => {
    void (async () => {
      if (!ensureMediaStreamRequestIsAllowed()) {
        return;
      }

      const payload = JSON.parse(rawMessage.toString()) as TwilioMediaMessage;
      server.log.info(
        { event: payload.event, streamSid: payload.streamSid, callSid: payload.start?.callSid },
        "Received Twilio Media Stream event",
      );

      if (payload.event === "connected") {
        return;
      }

      if (payload.event === "start") {
        await startRealtimeSession(payload);
        return;
      }

      if (payload.event === "mark") {
        if (
          payload.mark?.name &&
          session.pendingTransferMarkName &&
          payload.mark.name === session.pendingTransferMarkName
        ) {
          server.log.info(
            {
              callSid: session.callSid,
              streamSid: session.streamSid,
              markName: payload.mark.name,
            },
            "Twilio confirmed assistant playback before transfer",
          );
          session.pendingTransferMarkName = null;
          const transferTask = performTransfer(server, session);
          trackTask(session, transferTask);
          return;
        }
        if (payload.mark?.name) {
          acknowledgeOutboundPlaybackMark(session, payload.mark.name);
        }
        return;
      }

      if (payload.event === "media" && payload.media?.payload) {
        if (payload.media.track && payload.media.track !== "inbound") {
          return;
        }

        session.inboundAudio.push({
          offsetMs: Number(payload.media.timestamp ?? 0),
          payload: payload.media.payload,
        });
        if (openAiSocket?.readyState === WebSocket.OPEN && session.openAiReady) {
          postRealtimeEvent(openAiSocket, {
            type: "input_audio_buffer.append",
            audio: payload.media.payload,
          });
        } else {
          session.pendingInboundAudio.push(payload.media.payload);
        }
        return;
      }

      if (payload.event === "stop") {
        await finalizeCall(server, openAiSocket, twilioSocket, session, "stream_stopped");
      }
    })().catch((error) => {
      server.log.error(error);
      const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
        disposition: "stream_start_failed",
      });
      trackTask(session, recoveryTask);
    });
  });

  twilioSocket.on("close", () => {
    recordMediaStreamDisconnect({
      ...(session.businessId ? { "ai_receptionist.business_id": session.businessId } : {}),
      ...(session.callId ? { "ai_receptionist.call_id": session.callId } : {}),
    });
    server.log.info(
      {
        callSid: session.callSid,
        streamSid: session.streamSid,
      },
      "Twilio Media Stream websocket closed",
    );
    void finalizeCall(server, openAiSocket, twilioSocket, session, "twilio_socket_closed");
  });

  twilioSocket.on("error", (error: Error) => {
    server.log.error(error);
  });

  server.log.info(
    {
      url: request.url,
      host: request.headers.host,
      upgrade: request.headers.upgrade,
      connection: request.headers.connection,
    },
    "Accepted Media Stream websocket route",
  );
  const session: ActiveVoiceSession = {
    businessId: null,
    snapshot: null,
    callSid: null,
    from: null,
    to: null,
    gatewaySessionId: crypto.randomUUID(),
    startedAtIso: new Date().toISOString(),
    startedAtMs: Date.now(),
    streamSid: null,
    callId: null,
    conversationId: null,
    openAiReady: false,
    pendingTransferDestination: null,
    pendingTransferMarkName: null,
    transferExecuted: false,
    providerRecoveryStarted: false,
    finalized: false,
    finalDispositionOverride: null,
    transcriptSequence: 1,
    seenTranscriptKeys: new Set(),
    inboundAudio: [],
    outboundAudio: [],
    outboundCursorMs: 0,
    outboundQueuedCursorMs: 0,
    activeAssistantResponseId: null,
    activeAssistantItemId: null,
    activeAssistantContentIndex: 0,
    pendingOutboundAudio: [],
    pendingOutboundStartMs: null,
    pendingOutboundPlaybackGroups: [],
    pendingInboundAudio: [],
    pendingTasks: new Set(),
    aiTraceId: crypto.randomUUID(),
    assistantResponseRequestedAtMs: null,
    assistantFirstOutputAtMs: null,
    activeCallCounted: false,
  };

  const runtimeConfig = server.runtimeConfig;
  const validationUrls = buildMediaStreamValidationUrls(
    runtimeConfig.VOICE_GATEWAY_BASE_URL,
  );
  function ensureMediaStreamRequestIsAllowed(): boolean {
    if (signatureValidated) {
      return true;
    }

    const hasValidTwilioSignature = validateMediaStreamSignature({
      authToken: runtimeConfig.TWILIO_AUTH_TOKEN,
      signatureHeader: request.headers["x-twilio-signature"],
      baseUrl: runtimeConfig.VOICE_GATEWAY_BASE_URL,
    });

    if (!hasValidTwilioSignature) {
      recordTwilioInvalidSignature({
        "ai_receptionist.path": "/media-stream",
      });
      server.log.warn(
        { validationUrls },
        "Rejected Twilio Media Stream websocket with invalid signature",
      );
      if (typeof twilioSocket.close === "function") {
        twilioSocket.close(1008, "invalid signature");
      }
      return false;
    }

    if (!runtimeConfig.OPENAI_API_KEY) {
      server.log.error("OPENAI_API_KEY is required for live voice calls.");
      if (typeof twilioSocket.close === "function") {
        twilioSocket.close(1011, "missing openai api key");
      }
      return false;
    }

    signatureValidated = true;
    return true;
  }

  async function startRealtimeSession(message: TwilioMediaMessage): Promise<void> {
    if (openAiSocket) {
      return;
    }

    const customParameters = message.start?.customParameters ?? {};
    session.callSid = message.start?.callSid ?? customParameters.callSid ?? "unknown-call";
    session.streamSid = message.start?.streamSid ?? message.streamSid ?? null;
    session.businessId = customParameters.businessId ?? null;
    session.from = customParameters.from ?? null;
    session.to = customParameters.to ?? null;
    session.startedAtIso = new Date().toISOString();
    session.startedAtMs = Date.now();

    let snapshot =
      session.businessId !== null ? server.snapshotCache.get(session.businessId) : null;
    if (!snapshot) {
      recordSnapshotCacheMiss({
        ...(session.businessId ? { "ai_receptionist.business_id": session.businessId } : {}),
      });
      if (!session.to) {
        throw new Error("Twilio stream start did not include the called phone number.");
      }
      snapshot = await fetchSnapshotForPhoneNumber(session.to);
      server.snapshotCache.set(snapshot.businessId, snapshot);
      session.businessId = snapshot.businessId;
    } else {
      recordSnapshotCacheHit({
        "ai_receptionist.business_id": snapshot.businessId,
      });
    }

    session.snapshot = snapshot;
    await initializeCallRecord(server, session);
    if (!session.activeCallCounted) {
      session.activeCallCounted = true;
    }

    openAiSocket = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(runtimeConfig.OPENAI_REALTIME_MODEL)}`,
      {
        headers: {
          Authorization: `Bearer ${runtimeConfig.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      },
    );

    openAiSocket.on("open", () => {
      server.log.info(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          businessId: session.businessId,
          model: runtimeConfig.OPENAI_REALTIME_MODEL,
        },
        "OpenAI Realtime websocket opened",
      );
      void configureOpenAiSession(openAiSocket as WebSocket, session, server);
    });

    openAiSocket.on("message", (rawMessage: WebSocket.RawData) => {
      handleOpenAiMessage(server, openAiSocket as WebSocket, twilioSocket, session, rawMessage);
    });

    openAiSocket.on("error", (error: Error) => {
      recordOpenAiRealtimeError({
        ...(session.businessId ? { "ai_receptionist.business_id": session.businessId } : {}),
        ...(session.callId ? { "ai_receptionist.call_id": session.callId } : {}),
      });
      server.log.error(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          message: error.message,
          stack: error.stack,
        },
        "OpenAI Realtime websocket error",
      );
      const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
        disposition: "openai_socket_error",
      });
      trackTask(session, recoveryTask);
    });

    openAiSocket.on("unexpected-response", (_request, response) => {
      recordOpenAiRealtimeError({
        ...(session.businessId ? { "ai_receptionist.business_id": session.businessId } : {}),
        ...(session.callId ? { "ai_receptionist.call_id": session.callId } : {}),
      });
      server.log.error(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
        },
        "OpenAI Realtime websocket handshake failed",
      );
      const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
        disposition: "openai_handshake_failed",
      });
      trackTask(session, recoveryTask);
    });

    openAiSocket.on("close", (code, reason) => {
      server.log.info(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          code,
          reason: reason.toString(),
        },
        "OpenAI Realtime websocket closed",
      );
      if (!session.finalized) {
        recordOpenAiRealtimeError({
          ...(session.businessId ? { "ai_receptionist.business_id": session.businessId } : {}),
          ...(session.callId ? { "ai_receptionist.call_id": session.callId } : {}),
        });
        const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
          disposition: "openai_socket_closed",
        });
        trackTask(session, recoveryTask);
      }
    });
  }

}
