import { buildVoiceSystemPrompt } from "@lobbystack/ai";
import { loadVoiceGatewayEnv } from "@lobbystack/config";
import { demoBusinessId, type BusinessContextSnapshot } from "@lobbystack/shared";
import type { ProviderErrorClassification } from "@lobbystack/telemetry";
import type { IncomingHttpHeaders } from "node:http";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";

import { buildStereoCallRecording, type TimedAudioChunk } from "../audio/wav";
import {
  RuntimeRequestError,
  appendVoiceTranscript,
  completeVoiceCall,
  prepareVoiceTransfer,
  recordVoiceAiCost,
  releaseVoiceTransfer,
  startVoiceCall,
  systemBlockContactForVoiceCall,
  updateVoiceTransferState,
  uploadVoiceRecording,
} from "../convex/runtimeClient";
import { fetchSnapshotForPhoneNumber } from "../context/fetchSnapshot";
import {
  recordMediaStreamDisconnect,
  recordAiDirectedCallEnd,
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
  captureProviderFailureException,
} from "../observability/posthog";
import {
  HOLD_EXPIRY_GRACE_MS,
  MAX_CUMULATIVE_HOLD_SECONDS,
  NORMAL_IDLE_TIMEOUT_MS,
  createCallInactivityState,
  getCallInactivityAction,
  getDispositionForEndCall,
  grantCallHold,
  markAssistantResponseDone,
  markCallerActivity,
  markHoldExpiryCheckInSent,
  markRealtimeIdleTimeout,
  shouldSystemBlockForEndCall,
  type CallInactivityState,
  type EndCallRequest,
} from "../realtime/callControl";
import { executeVoiceTool } from "../realtime/toolExecutor";
import {
  endLiveCallSilently,
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
  error?: {
    type?: string;
    code?: string;
    message?: string;
    param?: string | null;
    event_id?: string;
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
  pendingImplicitEndCall: EndCallRequest | null;
  pendingImplicitHangupMarkName: string | null;
  transferExecuted: boolean;
  providerRecoveryStarted: boolean;
  finalized: boolean;
  finalDispositionOverride: string | null;
  transcriptSequence: number;
  seenTranscriptKeys: Set<string>;
  handledToolCallIds: Set<string>;
  recentCallerTranscripts: Array<string>;
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
  inactivity: CallInactivityState;
  inactivityTimer: ReturnType<typeof setTimeout> | null;
  terminalHangupInProgress: boolean;
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

export function markRealtimeToolCallHandled(
  session: { handledToolCallIds: Set<string> },
  callId: string,
): boolean {
  if (session.handledToolCallIds.has(callId)) {
    return false;
  }

  session.handledToolCallIds.add(callId);
  return true;
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
      name: "lookupAppointmentForChange",
      description:
        "Check whether the current caller phone has future confirmed appointments before cancelling or rescheduling. This does not reveal appointment facts.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "verifyAppointmentForChange",
      description:
        "Verify the caller's name and an appointment fact before any cancellation or reschedule attempt. If the lookup did not return an appointmentId, omit it and let the backend match the fact.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          action: { type: "string", enum: ["cancel", "reschedule"] },
          callerName: { type: "string" },
          appointmentStartsAt: {
            type: "string",
            description:
              "The existing appointment start time as provided by the caller.",
          },
          serviceName: {
            type: "string",
            description:
              "The existing appointment service name as provided by the caller.",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "sendAppointmentChangeOtp",
      description:
        "Send the required one-time code after verifyAppointmentForChange says OTP is required.",
      parameters: {
        type: "object",
        properties: {
          verificationId: { type: "string" },
        },
        required: ["verificationId"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "verifyAppointmentChangeOtp",
      description:
        "Check a caller-provided one-time code for an appointment change verification session.",
      parameters: {
        type: "object",
        properties: {
          verificationId: { type: "string" },
          code: { type: "string" },
        },
        required: ["verificationId", "code"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "cancelAppointment",
      description:
        "Cancel an appointment only after verification succeeds and the caller gives explicit final confirmation.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          verificationId: { type: "string" },
          finalConfirmation: {
            type: "boolean",
            description:
              "True only when the caller explicitly confirms they want this appointment cancelled now.",
          },
        },
        required: ["appointmentId", "finalConfirmation"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "rescheduleAppointment",
      description:
        "Reschedule an appointment only after verification succeeds, availability is checked by the backend, and the caller gives explicit final confirmation.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          startsAt: {
            type: "string",
            description: "The new exact ISO appointment start datetime.",
          },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
          verificationId: { type: "string" },
          finalConfirmation: {
            type: "boolean",
            description:
              "True only when the caller explicitly confirms they want this appointment moved to the exact new time now.",
          },
        },
        required: ["appointmentId", "startsAt", "finalConfirmation"],
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
    {
      type: "function",
      name: "setCallHold",
      description:
        "Grant intentional waiting time only when the caller asks you to hold or clearly needs a short pause. The gateway may cap the requested duration.",
      parameters: {
        type: "object",
        properties: {
          durationSeconds: {
            type: "integer",
            description: "Requested hold duration in seconds.",
          },
          reason: { type: "string" },
        },
        required: ["durationSeconds", "reason"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "endCall",
      description:
        "End the live call after a final message for explicit caller closing cues, severe abuse, repeated abusive behavior after one warning, clear spam or sales solicitation after one redirect, or silence timeout.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["caller_finished", "abuse", "silence_timeout", "spam"],
          },
          message: {
            type: "string",
            description: "Brief final message to say before hanging up.",
          },
          severity: {
            type: "string",
            enum: ["borderline", "severe"],
          },
        },
        required: ["reason", "message"],
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

function updateRealtimeIdleTimeout(socket: WebSocket, idleTimeoutMs: number): void {
  postRealtimeEvent(socket, {
    type: "session.update",
    session: {
      turn_detection: {
        type: "server_vad",
        create_response: true,
        interrupt_response: true,
        idle_timeout_ms: idleTimeoutMs,
      },
    },
  });
}

function clearInactivityTimer(session: ActiveVoiceSession): void {
  if (session.inactivityTimer !== null) {
    clearTimeout(session.inactivityTimer);
    session.inactivityTimer = null;
  }
}

async function initiateTerminalHangup(
  server: FastifyInstance,
  openAiSocket: WebSocket | null,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
  input: EndCallRequest,
  options: {
    finalMessagePlayback?: "twilio" | "silent";
  } = {},
): Promise<void> {
  if (session.finalized || session.terminalHangupInProgress) {
    return;
  }

  session.terminalHangupInProgress = true;
  session.finalDispositionOverride = getDispositionForEndCall(input.reason);
  clearInactivityTimer(session);
  clearPendingTransferPlaybackWait(server, session, "terminal_hangup");
  clearPendingImplicitHangupPlaybackWait(server, session, "terminal_hangup");
  session.pendingImplicitEndCall = null;

  let autoBlocked = false;
  if (shouldSystemBlockForEndCall(input.reason) && session.callId) {
    try {
      const result = await systemBlockContactForVoiceCall({
        callId: session.callId,
        blockedAt: new Date().toISOString(),
      });
      autoBlocked = result.blocked;
    } catch (error) {
      server.log.error(
        {
          err: error,
          callId: session.callId,
          callSid: session.callSid,
        },
        "Failed to auto-block abusive caller",
      );
    }
  }

  recordAiDirectedCallEnd({
    ...(session.businessId ? { "lobbystack.business_id": session.businessId } : {}),
    ...(session.callId ? { "lobbystack.call_id": session.callId } : {}),
    reason: input.reason,
    ...(input.severity ? { severity: input.severity } : {}),
    holdSecondsUsed: session.inactivity.holdSecondsUsed,
    autoBlocked,
  });

  if (!session.callSid) {
    await finalizeCall(
      server,
      openAiSocket,
      twilioSocket,
      session,
      getDispositionForEndCall(input.reason),
    );
    return;
  }

  try {
    if (options.finalMessagePlayback === "silent") {
      await endLiveCallSilently({
        callSid: session.callSid,
      });
    } else {
      await endLiveCallWithMessage({
        callSid: session.callSid,
        sayMessage: input.message,
      });
    }
  } catch (error) {
    session.terminalHangupInProgress = false;
    session.finalDispositionOverride = null;
    throw error;
  }
}

export function shouldUseAssistantFinalMessageForEndCall(
  input: Pick<EndCallRequest, "reason">,
): boolean {
  if (input.reason === "caller_finished" || input.reason === "silence_timeout") {
    return true;
  }

  return false;
}

function scheduleInactivityTimer(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
): void {
  clearInactivityTimer(session);

  if (session.finalized || session.terminalHangupInProgress) {
    return;
  }

  const action = getCallInactivityAction(session.inactivity, Date.now());
  if (action.kind !== "none" || action.nextCheckInMs === undefined) {
    return;
  }

  session.inactivityTimer = setTimeout(() => {
    session.inactivityTimer = null;
    const task = runInactivityAction(server, openAiSocket, twilioSocket, session);
    trackTask(session, task);
  }, Math.max(0, action.nextCheckInMs));
}

async function runInactivityAction(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
): Promise<void> {
  if (session.finalized || session.terminalHangupInProgress) {
    return;
  }

  const nowMs = Date.now();
  const action = getCallInactivityAction(session.inactivity, nowMs);
  if (action.kind === "hold_expired_check_in") {
    session.inactivity = markHoldExpiryCheckInSent(session.inactivity, nowMs);
    updateRealtimeIdleTimeout(openAiSocket, NORMAL_IDLE_TIMEOUT_MS);
    postRealtimeEvent(openAiSocket, {
      type: "response.create",
      response: {
        instructions:
          "The caller asked you to hold and the hold time has expired. Briefly ask if they are still there, then stop and wait.",
      },
    });
    scheduleInactivityTimer(server, openAiSocket, twilioSocket, session);
    return;
  }

  if (action.kind === "silence_timeout") {
    await initiateTerminalHangup(server, openAiSocket, twilioSocket, session, {
      reason: "silence_timeout",
      message: "I'm going to end the call for now. Please call back when you're ready.",
    });
    return;
  }

  scheduleInactivityTimer(server, openAiSocket, twilioSocket, session);
}

function resetInactivityForCallerActivity(
  openAiSocket: WebSocket,
  session: ActiveVoiceSession,
): void {
  session.inactivity = markCallerActivity(session.inactivity);
  clearInactivityTimer(session);
  updateRealtimeIdleTimeout(openAiSocket, NORMAL_IDLE_TIMEOUT_MS);
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

function clearPendingImplicitHangupPlaybackWait(
  server: FastifyInstance,
  session: ActiveVoiceSession,
  reason: string,
): void {
  if (!session.pendingImplicitHangupMarkName) {
    return;
  }

  server.log.info(
    {
      callSid: session.callSid,
      streamSid: session.streamSid,
      markName: session.pendingImplicitHangupMarkName,
      reason,
    },
    "Canceled pending implicit hangup playback wait",
  );
  session.pendingImplicitHangupMarkName = null;
}

function runImplicitTerminalHangup(
  server: FastifyInstance,
  openAiSocket: WebSocket | null,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
): void {
  if (!session.pendingImplicitEndCall || session.finalized || session.terminalHangupInProgress) {
    return;
  }

  const request = session.pendingImplicitEndCall;
  session.pendingImplicitEndCall = null;
  session.pendingImplicitHangupMarkName = null;
  const task = initiateTerminalHangup(server, openAiSocket, twilioSocket, session, request, {
    finalMessagePlayback: "silent",
  });
  trackTask(session, task);
}

function requestAssistantFinalMessageBeforeHangup(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  session: ActiveVoiceSession,
  input: EndCallRequest,
): void {
  if (session.finalized || session.terminalHangupInProgress) {
    return;
  }

  session.pendingImplicitEndCall = input;
  session.assistantResponseRequestedAtMs = Date.now();
  session.assistantFirstOutputAtMs = null;
  server.log.info(
    {
      callId: session.callId,
      callSid: session.callSid,
      streamSid: session.streamSid,
      reason: input.reason,
    },
    "Requesting assistant final message before terminal hangup",
  );
  postRealtimeEvent(openAiSocket, {
    type: "response.create",
    response: {
      instructions: [
        `Say this exact final message: ${JSON.stringify(input.message)}.`,
        "Then stop speaking. The call will end automatically after your audio finishes.",
        "Do not call any tools and do not add anything else.",
      ].join(" "),
      tool_choice: "none",
    },
  });
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
    clearPendingImplicitHangupPlaybackWait(server, session, "assistant_audio_cleared");
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

  runImplicitTerminalHangup(server, openAiSocket, twilioSocket, session);
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
  clearInactivityTimer(session);
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
    session.terminalHangupInProgress ||
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
    captureProviderFailureException({
      provider: "twilio",
      error,
      ...(session.businessId ? { businessId: session.businessId } : {}),
      properties: {
        operation: "provider_failure_recovery",
        disposition: input.disposition,
        channel: "voice",
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

const RECENT_CALLER_TRANSCRIPT_LIMIT = 6;

const FINAL_HANGUP_PHRASES = [
  "i am ending this call",
  "i am ending the call",
  "i'm ending this call",
  "i'm ending the call",
  "i will end this call now",
  "i will end the call now",
  "i'll end this call now",
  "i'll end the call now",
  "i'll be ending this call now",
  "i'll be ending the call now",
  "i have to end this call now",
  "i have to end the call now",
  "i need to end this call now",
  "i need to end the call now",
  "this call is ending now",
  "i am hanging up now",
  "i'm hanging up now",
  "i will hang up now",
  "i'll hang up now",
  "je mets fin a cet appel",
  "je mets fin a l'appel",
  "je met fin a cet appel",
  "je met fin a l'appel",
  "je vais mettre fin a cet appel maintenant",
  "je vais mettre fin a l'appel maintenant",
  "je vais raccrocher maintenant",
  "je raccroche maintenant",
];

const ABUSE_CALLER_HINTS = [
  "asshole",
  "bitch",
  "cave",
  "connard",
  "criss",
  "fuck",
  "gros cave",
  "hostie",
  "idiot",
  "mental retard",
  "osti",
  "retard",
  "shit",
  "stupid",
  "tabarnak",
  "tabarnaque",
  "va donc chier",
  "attarde",
];

const SPAM_CALLER_HINTS = [
  "buy",
  "extended warranty",
  "limited time offer",
  "marketing agency",
  "robocall",
  "sales pitch",
  "scam",
  "sell",
  "solicitation",
  "special offer",
  "warranty",
];

function normalizeVoicePolicyText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAnyPhrase(value: string, phrases: Array<string>): boolean {
  return phrases.some((phrase) => value.includes(phrase));
}

function rememberRecentCallerTranscript(
  session: ActiveVoiceSession,
  transcript: string | undefined,
): void {
  const normalizedTranscript = transcript?.trim();
  if (!normalizedTranscript) {
    return;
  }

  session.recentCallerTranscripts.push(normalizedTranscript);
  if (session.recentCallerTranscripts.length > RECENT_CALLER_TRANSCRIPT_LIMIT) {
    session.recentCallerTranscripts.splice(
      0,
      session.recentCallerTranscripts.length - RECENT_CALLER_TRANSCRIPT_LIMIT,
    );
  }
}

export function getImplicitEndCallForAssistantTranscript(input: {
  assistantText: string | undefined;
  recentCallerTexts: Array<string>;
}): EndCallRequest | null {
  const assistantText = input.assistantText?.trim();
  if (!assistantText) {
    return null;
  }

  const normalizedAssistantText = normalizeVoicePolicyText(assistantText);
  if (!containsAnyPhrase(normalizedAssistantText, FINAL_HANGUP_PHRASES)) {
    return null;
  }

  const normalizedCallerText = normalizeVoicePolicyText(
    input.recentCallerTexts.join(" "),
  );
  const message =
    assistantText.length > 240 ? `${assistantText.slice(0, 237)}...` : assistantText;

  if (containsAnyPhrase(normalizedCallerText, ABUSE_CALLER_HINTS)) {
    return {
      reason: "abuse",
      severity: "severe",
      message,
    };
  }

  if (containsAnyPhrase(normalizedCallerText, SPAM_CALLER_HINTS)) {
    return {
      reason: "spam",
      message,
    };
  }

  return {
    reason: "caller_finished",
    message,
  };
}

function queueImplicitEndCallFromAssistantTranscript(
  server: FastifyInstance,
  session: ActiveVoiceSession,
  transcript: string | undefined,
): void {
  if (
    session.pendingImplicitEndCall ||
    session.finalized ||
    session.terminalHangupInProgress
  ) {
    return;
  }

  const endCall = getImplicitEndCallForAssistantTranscript({
    assistantText: transcript,
    recentCallerTexts: session.recentCallerTranscripts,
  });
  if (!endCall) {
    return;
  }

  session.pendingImplicitEndCall = endCall;
  server.log.info(
    {
      callId: session.callId,
      callSid: session.callSid,
      streamSid: session.streamSid,
      reason: endCall.reason,
      severity: endCall.severity,
    },
    "Queued implicit terminal hangup from assistant transcript",
  );
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
        "Use tools for authoritative actions like booking, appointment changes, transfer, and message taking.",
        "Use setCallHold when the caller explicitly asks you to hold, says they need a moment, or clearly needs a short pause. Do not grant holds unless the caller indicates they need one.",
        "Use endCall only when the caller gives an explicit closing cue such as bye, that's all, thanks/no more questions, for severe abuse, for repeated abusive behavior after one warning, for clear spam/scam/robocall/irrelevant solicitation, or when directed by silence-timeout handling.",
        "When the platform indicates normal caller silence, ask once: Are you still there? Then wait for the caller.",
        "For borderline abusive, manipulative, or exploitative behavior, give one brief boundary warning. For severe abuse, threats, harassment, repeated policy bypass attempts, or obvious attempts to waste system time, end the call.",
        "For uncertain or off-topic callers, redirect once toward the business purpose before deciding they are spam.",
        "Use endCall with reason spam only for clear robocalls, scam or phishing attempts, irrelevant sales pitches, repeated non-business solicitation after one redirect, or obvious scripted attempts to waste system time. Say a brief neutral goodbye before hanging up.",
        "When a caller continues a sales pitch or irrelevant solicitation after you redirect them once, do not keep negotiating, answering follow-up sales objections, or ask if they have business-related questions again. Call endCall with reason spam and a short neutral message.",
        "If you say or imply that you are ending the call for spam, solicitation, abuse, caller finished, or silence timeout, you must actually call endCall in that same response. Never merely say goodbye, take care, or I will end the call and then wait for the caller.",
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
        "For cancellation or rescheduling requests, use lookupAppointmentForChange first. If appointments exist, ask the caller for the name on the appointment and either the existing appointment time or service; do not claim to know those facts from lookup.",
        "Before cancelling or rescheduling, use verifyAppointmentForChange with the caller's name and an appointment fact they provided, such as the existing time or service.",
        "If verifyAppointmentForChange says OTP is required, send the code and verify it before attempting the change.",
        "Only call cancelAppointment or rescheduleAppointment after the caller gives explicit final confirmation for the exact appointment and action. Never claim the change succeeded unless that final tool result has ok true.",
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
        idle_timeout_ms: NORMAL_IDLE_TIMEOUT_MS,
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
  twilioSocket: WebSocket,
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
      holdBudget: {
        remainingHoldSeconds: Math.max(
          0,
          MAX_CUMULATIVE_HOLD_SECONDS - session.inactivity.holdSecondsUsed,
        ),
      },
    });

    if (result.pendingTransferDestination) {
      session.pendingTransferDestination = result.pendingTransferDestination;
    }

    let toolOutput = result.result;
    if (result.hold) {
      const grant = grantCallHold(session.inactivity, {
        requestedDurationSeconds: result.hold.requestedDurationSeconds,
        reason: result.hold.reason,
        nowMs: Date.now(),
      });
      session.inactivity = grant.state;
      toolOutput = grant.result;

      if (grant.result.ok) {
        updateRealtimeIdleTimeout(
          openAiSocket,
          grant.result.grantedDurationSeconds * 1000 + HOLD_EXPIRY_GRACE_MS,
        );
        scheduleInactivityTimer(server, openAiSocket, twilioSocket, session);
      }
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
        output: JSON.stringify(toolOutput),
      },
    });

    if (result.endCall) {
      if (shouldUseAssistantFinalMessageForEndCall(result.endCall)) {
        requestAssistantFinalMessageBeforeHangup(
          server,
          openAiSocket,
          session,
          result.endCall,
        );
        return;
      }

      await initiateTerminalHangup(
        server,
        openAiSocket,
        twilioSocket,
        session,
        result.endCall,
        { finalMessagePlayback: "silent" },
      );
      return;
    }

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

function getProviderClassificationAttributes(
  classification: ProviderErrorClassification,
): Record<string, string | number> {
  return {
    providerErrorKind: classification.kind,
    ...(classification.providerErrorCode
      ? { providerErrorCode: classification.providerErrorCode }
      : {}),
    ...(classification.providerErrorMessage
      ? { providerErrorMessage: classification.providerErrorMessage }
      : {}),
    ...(classification.providerErrorStatus !== undefined
      ? { providerErrorStatus: classification.providerErrorStatus }
      : {}),
  };
}

function handleOpenAiMessage(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
  rawMessage: WebSocket.RawData,
): void {
  const queuePendingPlaybackMark = (): string | null => {
    if (!session.streamSid || twilioSocket.readyState !== WebSocket.OPEN) {
      return null;
    }

    const markName = `audio-response-${crypto.randomUUID()}`;
    const queued = queuePendingOutboundPlaybackGroup(session, markName);
    if (!queued) {
      return null;
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
    return markName;
  };

  const completeImplicitEndCallAfterPlayback = (queuedMarkName: string | null): void => {
    if (
      !session.pendingImplicitEndCall ||
      session.pendingImplicitHangupMarkName ||
      session.finalized ||
      session.terminalHangupInProgress
    ) {
      return;
    }

    const markName =
      queuedMarkName ??
      session.pendingOutboundPlaybackGroups[
        session.pendingOutboundPlaybackGroups.length - 1
      ]?.markName ??
      null;

    if (markName) {
      session.pendingImplicitHangupMarkName = markName;
      server.log.info(
        {
          callId: session.callId,
          callSid: session.callSid,
          streamSid: session.streamSid,
          markName,
          reason: session.pendingImplicitEndCall.reason,
        },
        "Waiting for assistant playback before implicit terminal hangup",
      );
      return;
    }

    runImplicitTerminalHangup(server, openAiSocket, twilioSocket, session);
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
      if (session.businessId && session.callId && totalCostUsd !== undefined) {
        const recordCostTask = recordVoiceAiCost({
          businessId: session.businessId,
          callId: session.callId,
          occurredAt: new Date().toISOString(),
          eventKey: `voice_ai:transcription:${session.callId}:${payload.item_id ?? payload.event_id ?? "unknown"}`,
          costUsd: totalCostUsd,
          provider: "openai",
          model: runtimeConfig.OPENAI_TRANSCRIPTION_MODEL,
          operation: "voice.input_audio_transcription",
          ...(session.conversationId ? { conversationId: session.conversationId } : {}),
        }).catch((error: unknown) => {
          server.log.error(
            {
              err: error,
              businessId: session.businessId,
              callId: session.callId,
            },
            "Failed to persist voice transcription AI cost",
          );
        });
        trackTask(session, recordCostTask);
      }

      resetInactivityForCallerActivity(openAiSocket, session);
      rememberRecentCallerTranscript(session, payload.transcript);
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
      const markName = queuePendingPlaybackMark();
      completeImplicitEndCallAfterPlayback(markName);
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
      queueImplicitEndCallFromAssistantTranscript(server, session, payload.transcript);
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
          ...(session.businessId ? { "lobbystack.business_id": session.businessId } : {}),
          ...(session.callId ? { "lobbystack.call_id": session.callId } : {}),
          "lobbystack.provider": "openai",
          "lobbystack.model": runtimeConfig.OPENAI_REALTIME_MODEL,
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
      if (
        session.businessId &&
        session.callId &&
        totalCostUsd !== undefined &&
        payload.response?.id
      ) {
        const recordCostTask = recordVoiceAiCost({
          businessId: session.businessId,
          callId: session.callId,
          occurredAt: new Date().toISOString(),
          eventKey: `voice_ai:response:${session.callId}:${payload.response.id}`,
          costUsd: totalCostUsd,
          provider: "openai",
          model: runtimeConfig.OPENAI_REALTIME_MODEL,
          operation: "voice.response_generation",
          ...(session.conversationId ? { conversationId: session.conversationId } : {}),
        }).catch((error: unknown) => {
          server.log.error(
            {
              err: error,
              businessId: session.businessId,
              callId: session.callId,
            },
            "Failed to persist voice response AI cost",
          );
        });
        trackTask(session, recordCostTask);
      }
      session.assistantResponseRequestedAtMs = null;
      session.assistantFirstOutputAtMs = null;

      if (
        payload.response?.id &&
        payload.response.id === session.activeAssistantResponseId &&
        session.pendingOutboundAudio.length > 0
      ) {
        const markName = queuePendingPlaybackMark();
        completeImplicitEndCallAfterPlayback(markName);
      } else {
        completeImplicitEndCallAfterPlayback(null);
      }

      if (
        payload.response?.status === "completed" &&
        session.pendingTransferDestination &&
        !session.transferExecuted
      ) {
        queueTransferAfterPlayback(server, twilioSocket, session);
      }
      if (
        payload.response?.status === "completed" &&
        !session.pendingTransferDestination
      ) {
        session.inactivity = markAssistantResponseDone(session.inactivity, completedAtMs);
        scheduleInactivityTimer(server, openAiSocket, twilioSocket, session);
      }
      return;
    }
    case "input_audio_buffer.speech_started": {
      resetInactivityForCallerActivity(openAiSocket, session);
      cancelAssistantAudio(server, openAiSocket, twilioSocket, session);
      return;
    }
    case "input_audio_buffer.timeout_triggered": {
      session.inactivity = markRealtimeIdleTimeout(session.inactivity, Date.now());
      scheduleInactivityTimer(server, openAiSocket, twilioSocket, session);
      return;
    }
    case "response.function_call_arguments.done": {
      if (payload.name && payload.call_id && payload.arguments) {
        if (!markRealtimeToolCallHandled(session, payload.call_id)) {
          server.log.debug(
            {
              callSid: session.callSid,
              streamSid: session.streamSid,
              toolName: payload.name,
              toolCallId: payload.call_id,
              realtimeEventType: payload.type,
            },
            "Ignoring duplicate OpenAI Realtime tool call event",
          );
          return;
        }
        const task = handleToolCall(server, openAiSocket, twilioSocket, session, {
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
        if (!markRealtimeToolCallHandled(session, payload.item.call_id)) {
          server.log.debug(
            {
              callSid: session.callSid,
              streamSid: session.streamSid,
              toolName: payload.item.name,
              toolCallId: payload.item.call_id,
              realtimeEventType: payload.type,
            },
            "Ignoring duplicate OpenAI Realtime tool call event",
          );
          return;
        }
        const task = handleToolCall(server, openAiSocket, twilioSocket, session, {
          name: payload.item.name,
          callId: payload.item.call_id,
          arguments: payload.item.arguments,
        });
        trackTask(session, task);
      }
      return;
    }
    case "error": {
      const runtimeConfig = loadVoiceGatewayEnv(process.env);
      const providerError = payload.error ?? payload;
      const classification = captureProviderFailureException({
        provider: "openai",
        error: providerError,
        ...(payload.error?.code ? { code: payload.error.code } : {}),
        ...(payload.error?.message ? { message: payload.error.message } : {}),
        ...(session.businessId ? { businessId: session.businessId } : {}),
        properties: {
          operation: "openai_realtime_server_error",
          channel: "voice",
          model: runtimeConfig.OPENAI_REALTIME_MODEL,
          ...(session.callSid ? { callSid: session.callSid } : {}),
          ...(session.streamSid ? { streamSid: session.streamSid } : {}),
          ...(session.callId ? { callId: session.callId } : {}),
          ...(session.conversationId ? { conversationId: session.conversationId } : {}),
          ...(payload.event_id ? { providerEventId: payload.event_id } : {}),
        },
      });
      recordOpenAiRealtimeError({
        ...(session.businessId ? { "lobbystack.business_id": session.businessId } : {}),
        ...(session.callId ? { "lobbystack.call_id": session.callId } : {}),
        "lobbystack.provider": "openai",
        "lobbystack.model": runtimeConfig.OPENAI_REALTIME_MODEL,
        ...getProviderClassificationAttributes(classification),
      });
      server.log.error(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          providerErrorKind: classification.kind,
          providerErrorCode: classification.providerErrorCode,
          providerErrorStatus: classification.providerErrorStatus,
        },
        classification.providerErrorMessage ?? "OpenAI Realtime server error",
      );
      const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
        disposition: "openai_realtime_error",
      });
      trackTask(session, recoveryTask);
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
        if (
          payload.mark?.name &&
          session.pendingImplicitHangupMarkName &&
          payload.mark.name === session.pendingImplicitHangupMarkName
        ) {
          server.log.info(
            {
              callSid: session.callSid,
              streamSid: session.streamSid,
              markName: payload.mark.name,
              reason: session.pendingImplicitEndCall?.reason,
            },
            "Twilio confirmed assistant playback before implicit terminal hangup",
          );
          acknowledgeOutboundPlaybackMark(session, payload.mark.name);
          runImplicitTerminalHangup(server, openAiSocket, twilioSocket, session);
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
      ...(session.businessId ? { "lobbystack.business_id": session.businessId } : {}),
      ...(session.callId ? { "lobbystack.call_id": session.callId } : {}),
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
    pendingImplicitEndCall: null,
    pendingImplicitHangupMarkName: null,
    transferExecuted: false,
    providerRecoveryStarted: false,
    finalized: false,
    finalDispositionOverride: null,
    transcriptSequence: 1,
    seenTranscriptKeys: new Set(),
    handledToolCallIds: new Set(),
    recentCallerTranscripts: [],
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
    inactivity: createCallInactivityState(),
    inactivityTimer: null,
    terminalHangupInProgress: false,
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
        "lobbystack.path": "/media-stream",
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
        ...(session.businessId ? { "lobbystack.business_id": session.businessId } : {}),
      });
      if (!session.to) {
        throw new Error("Twilio stream start did not include the called phone number.");
      }
      snapshot = await fetchSnapshotForPhoneNumber(session.to);
      server.snapshotCache.set(snapshot.businessId, snapshot);
      session.businessId = snapshot.businessId;
    } else {
      recordSnapshotCacheHit({
        "lobbystack.business_id": snapshot.businessId,
      });
    }

    session.snapshot = snapshot;
    await initializeCallRecord(server, session);
    if (!session.activeCallCounted) {
      session.activeCallCounted = true;
    }

    const captureOpenAiRealtimeConnectionFailure = (input: {
      error?: unknown;
      operation: string;
      code?: string;
      message?: string;
      status?: number;
    }): ProviderErrorClassification => {
      const classification = captureProviderFailureException({
        provider: "openai",
        error: input.error,
        ...(input.code ? { code: input.code } : {}),
        ...(input.message ? { message: input.message } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(session.businessId ? { businessId: session.businessId } : {}),
        properties: {
          operation: input.operation,
          channel: "voice",
          model: runtimeConfig.OPENAI_REALTIME_MODEL,
          ...(session.callSid ? { callSid: session.callSid } : {}),
          ...(session.streamSid ? { streamSid: session.streamSid } : {}),
          ...(session.callId ? { callId: session.callId } : {}),
          ...(session.conversationId ? { conversationId: session.conversationId } : {}),
        },
      });
      recordOpenAiRealtimeError({
        ...(session.businessId ? { "lobbystack.business_id": session.businessId } : {}),
        ...(session.callId ? { "lobbystack.call_id": session.callId } : {}),
        "lobbystack.provider": "openai",
        "lobbystack.model": runtimeConfig.OPENAI_REALTIME_MODEL,
        operation: input.operation,
        ...getProviderClassificationAttributes(classification),
      });
      return classification;
    };

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
      const classification = captureOpenAiRealtimeConnectionFailure({
        error,
        operation: "openai_realtime_socket_error",
      });
      server.log.error(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          message: error.message,
          stack: error.stack,
          providerErrorKind: classification.kind,
          providerErrorCode: classification.providerErrorCode,
        },
        "OpenAI Realtime websocket error",
      );
      const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
        disposition: "openai_socket_error",
      });
      trackTask(session, recoveryTask);
    });

    openAiSocket.on("unexpected-response", (_request, response) => {
      const classification = captureOpenAiRealtimeConnectionFailure({
        error: {
          status: response.statusCode,
          message: response.statusMessage,
        },
        operation: "openai_realtime_handshake_failed",
        ...(response.statusCode !== undefined ? { status: response.statusCode } : {}),
        ...(response.statusMessage ? { message: response.statusMessage } : {}),
      });
      server.log.error(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
          providerErrorKind: classification.kind,
          providerErrorCode: classification.providerErrorCode,
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
      if (!session.finalized && !session.terminalHangupInProgress) {
        captureOpenAiRealtimeConnectionFailure({
          error: {
            code: `websocket_close_${code}`,
            message: reason.toString() || "OpenAI Realtime websocket closed.",
          },
          operation: "openai_realtime_socket_closed",
          code: `websocket_close_${code}`,
          message: reason.toString() || "OpenAI Realtime websocket closed.",
        });
        const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
          disposition: "openai_socket_closed",
        });
        trackTask(session, recoveryTask);
      }
    });
  }

}
