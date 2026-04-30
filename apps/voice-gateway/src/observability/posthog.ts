import { logs, SeverityNumber, type Logger } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { PostHog } from "posthog-node";

import { loadVoiceGatewayEnv, type VoiceGatewayEnv } from "@lobbystack/config";
import {
  bucketLatencyMs,
  buildPostHogAiGenerationProperties,
  buildPostHogAiSpanProperties,
  buildPostHogAiTraceProperties,
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
  redactAiTraceProperties,
  redactTelemetryProperties,
  type TelemetryProperties,
} from "@lobbystack/telemetry";

type AiTraceCommon = {
  businessId: string;
  traceId: string;
  callId?: string;
  conversationId?: string;
  model: string;
  provider: string;
};

type AiState = TelemetryProperties;

type OperationalAttributes = Record<string, string | number | boolean | undefined>;
type LogLevel = "debug" | "info" | "warn" | "error";

let client: PostHog | null | undefined;
let loggerProvider: LoggerProvider | null = null;
let operationalLogger: Logger | null = null;
let runtimeEnv: VoiceGatewayEnv | null | undefined;

const VOICE_GATEWAY_DISTINCT_ID = "system:voice-gateway";
const SLOW_TURN_THRESHOLD_MS = 2_500;

function getRuntimeEnv(): VoiceGatewayEnv | null {
  if (runtimeEnv !== undefined) {
    return runtimeEnv;
  }

  try {
    runtimeEnv = loadVoiceGatewayEnv(process.env);
  } catch {
    runtimeEnv = null;
  }

  return runtimeEnv;
}

function getClient(): PostHog | null {
  if (client !== undefined) {
    return client;
  }

  const env = getRuntimeEnv();
  if (!env) {
    client = null;
    return client;
  }

  if (!env.POSTHOG_KEY || !env.POSTHOG_HOST) {
    client = null;
    return client;
  }

  client = new PostHog(env.POSTHOG_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
    privacyMode: env.POSTHOG_PRIVACY_MODE,
  });
  return client;
}

function buildLogsUrl(host: string): string {
  return new URL("/i/v1/logs", host).toString();
}

function getOperationalLogger(): Logger | null {
  if (operationalLogger !== null) {
    return operationalLogger;
  }

  const env = getRuntimeEnv();
  if (!env) {
    return null;
  }

  if (!env.POSTHOG_KEY || !env.POSTHOG_HOST) {
    return null;
  }

  loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      "service.name": "lobbystack-voice-gateway",
      "service.namespace": "lobbystack",
      "deployment.environment": env.DEPLOYMENT_MODE,
    }),
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: buildLogsUrl(env.POSTHOG_HOST),
          headers: {
            Authorization: `Bearer ${env.POSTHOG_KEY}`,
          },
        }),
      ),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
  operationalLogger = logs.getLogger("lobbystack.voice-gateway");
  return operationalLogger;
}

function buildBaseProperties(input: AiTraceCommon): Record<string, unknown> {
  return {
    ...buildPostHogAiTraceProperties({
      traceId: input.traceId,
      model: input.model,
      provider: input.provider,
      ...(input.conversationId ?? input.callId
        ? { sessionId: input.conversationId ?? input.callId }
        : {}),
      ...(input.callId ? { callId: input.callId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    }),
    $groups: {
      business: getPostHogBusinessGroupKey(input.businessId),
    },
  };
}

function capture(
  event: string,
  input: {
    distinctId: string;
    businessId?: string;
    properties: Record<string, unknown>;
  },
): void {
  const activeClient = getClient();
  if (!activeClient) {
    return;
  }

  activeClient.capture({
    distinctId: input.distinctId,
    event,
    properties: input.properties,
  });
}

function getSeverity(level: LogLevel): {
  severityNumber: SeverityNumber;
  severityText: string;
} {
  switch (level) {
    case "debug":
      return {
        severityNumber: SeverityNumber.DEBUG,
        severityText: "DEBUG",
      };
    case "warn":
      return {
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
      };
    case "error":
      return {
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
      };
    case "info":
    default:
      return {
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
      };
  }
}

function normalizeOperationalAttributes(
  attributes?: OperationalAttributes,
): TelemetryProperties {
  if (!attributes) {
    return {};
  }

  const normalized: TelemetryProperties = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }

    switch (key) {
      case "lobbystack.business_id":
        normalized.businessId = String(value);
        break;
      case "lobbystack.call_id":
        normalized.callId = String(value);
        break;
      case "lobbystack.conversation_id":
        normalized.conversationId = String(value);
        break;
      case "lobbystack.provider":
        normalized.provider = String(value);
        break;
      case "lobbystack.model":
        normalized.model = String(value);
        break;
      case "lobbystack.tool_name":
        normalized.toolName = String(value);
        break;
      case "lobbystack.convex_path":
        normalized.convexPath = String(value);
        break;
      case "http.status_code":
        normalized.httpStatusCode = Number(value);
        break;
      default:
        normalized[key] = value;
        break;
    }
  }

  return normalized;
}

function coerceLogAttributes(
  properties: TelemetryProperties,
): Record<string, string | number | boolean> {
  const redacted = redactTelemetryProperties(properties);
  const attributes: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(redacted)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      attributes[key] = value;
      continue;
    }

    attributes[key] = JSON.stringify(value);
  }

  return attributes;
}

function captureOperationalEvent(input: {
  event: string;
  properties?: TelemetryProperties;
  businessId?: string;
  distinctId?: string;
}): void {
  const env = getRuntimeEnv();
  if (!env) {
    return;
  }

  const properties = redactTelemetryProperties({
    ...input.properties,
    deploymentMode: env.DEPLOYMENT_MODE,
    runtime: "voice-gateway",
  });
  const businessId =
    input.businessId ??
    (typeof properties.businessId === "string" ? properties.businessId : undefined);

  capture(input.event, {
    distinctId:
      input.distinctId ??
      (businessId
        ? getPostHogDistinctIdForBusinessSystem(businessId)
        : VOICE_GATEWAY_DISTINCT_ID),
    ...(businessId ? { businessId } : {}),
    properties: {
      ...properties,
      ...(businessId
        ? {
            $groups: {
              business: getPostHogBusinessGroupKey(businessId),
            },
          }
        : {}),
    },
  });
}

export function emitOperationalLog(input: {
  level: LogLevel;
  message: string;
  properties?: TelemetryProperties;
  businessId?: string;
}): void {
  const logger = getOperationalLogger();
  if (!logger) {
    return;
  }

  const env = getRuntimeEnv();
  if (!env) {
    return;
  }

  const attributes = coerceLogAttributes({
    ...input.properties,
    ...(input.businessId ? { businessId: input.businessId } : {}),
    deploymentMode: env.DEPLOYMENT_MODE,
    runtime: "voice-gateway",
  });
  const severity = getSeverity(input.level);

  logger.emit({
    severityNumber: severity.severityNumber,
    severityText: severity.severityText,
    body: input.message,
    attributes,
    timestamp: Date.now(),
  });
}

export async function startPostHogObservability(): Promise<void> {
  getClient();
  getOperationalLogger();
}

export function captureAiTraceStarted(input: AiTraceCommon): void {
  capture("$ai_trace", {
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    businessId: input.businessId,
    properties: {
      ...buildBaseProperties(input),
      $ai_input_state: {
        phase: "session_initialized",
        channel: "voice",
        provider: input.provider,
      } satisfies AiState,
      $ai_output_state: {
        phase: "awaiting_first_response",
      } satisfies AiState,
    },
  });
}

export function captureAiGeneration(
  input: AiTraceCommon & {
    latencyMs?: number;
    ttftMs?: number;
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
    isStreaming?: boolean;
    isError?: boolean;
    error?: string;
    toolNames?: string[];
    transferInvoked?: boolean;
    bookingAttempted?: boolean;
    bookingSucceeded?: boolean;
    fallbackReason?: string;
    properties?: TelemetryProperties;
  },
): void {
  capture("$ai_generation", {
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    businessId: input.businessId,
    properties: {
      ...buildBaseProperties(input),
      ...buildPostHogAiGenerationProperties({
        traceId: input.traceId,
        model: input.model,
        provider: input.provider,
        ...(input.conversationId ?? input.callId
          ? { sessionId: input.conversationId ?? input.callId }
          : {}),
        ...(input.callId ? { callId: input.callId } : {}),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
        ...(input.ttftMs !== undefined ? { ttftMs: input.ttftMs } : {}),
        ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
        ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
        ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
        ...(input.textInputTokens !== undefined
          ? { textInputTokens: input.textInputTokens }
          : {}),
        ...(input.audioInputTokens !== undefined
          ? { audioInputTokens: input.audioInputTokens }
          : {}),
        ...(input.cachedInputTokens !== undefined
          ? { cachedInputTokens: input.cachedInputTokens }
          : {}),
        ...(input.cachedTextInputTokens !== undefined
          ? { cachedTextInputTokens: input.cachedTextInputTokens }
          : {}),
        ...(input.cachedAudioInputTokens !== undefined
          ? { cachedAudioInputTokens: input.cachedAudioInputTokens }
          : {}),
        ...(input.textOutputTokens !== undefined
          ? { textOutputTokens: input.textOutputTokens }
          : {}),
        ...(input.audioOutputTokens !== undefined
          ? { audioOutputTokens: input.audioOutputTokens }
          : {}),
        ...(input.reasoningTokens !== undefined
          ? { reasoningTokens: input.reasoningTokens }
          : {}),
        ...(input.totalCostUsd !== undefined
          ? { totalCostUsd: input.totalCostUsd }
          : {}),
        ...(input.isStreaming !== undefined ? { isStreaming: input.isStreaming } : {}),
        ...(input.isError !== undefined ? { isError: input.isError } : {}),
        ...(input.error ? { error: input.error } : {}),
        ...(input.toolNames?.length ? { toolNames: input.toolNames } : {}),
      }),
      ...(input.transferInvoked !== undefined
        ? { transferInvoked: input.transferInvoked }
        : {}),
      ...(input.bookingAttempted !== undefined
        ? { bookingAttempted: input.bookingAttempted }
        : {}),
      ...(input.bookingSucceeded !== undefined
        ? { bookingSucceeded: input.bookingSucceeded }
        : {}),
      ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
      ...redactAiTraceProperties(input.properties ?? {}),
    },
  });
}

export function captureAiSpan(
  input: AiTraceCommon & {
    spanName: string;
    inputState?: AiState;
    outputState?: AiState;
    latencyMs?: number;
    isError?: boolean;
    error?: string;
    properties?: TelemetryProperties;
  },
): void {
  capture("$ai_span", {
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    businessId: input.businessId,
    properties: {
      ...buildBaseProperties(input),
      ...buildPostHogAiSpanProperties({
        traceId: input.traceId,
        model: input.model,
        provider: input.provider,
        ...(input.conversationId ?? input.callId
          ? { sessionId: input.conversationId ?? input.callId }
          : {}),
        ...(input.callId ? { callId: input.callId } : {}),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        spanName: input.spanName,
        ...(input.inputState ? { inputState: input.inputState } : {}),
        ...(input.outputState ? { outputState: input.outputState } : {}),
        ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
        ...(input.isError !== undefined ? { isError: input.isError } : {}),
        ...(input.error ? { error: input.error } : {}),
        ...(input.properties ? { properties: input.properties } : {}),
      }),
    },
  });
}

export async function shutdownPostHog(): Promise<void> {
  if (loggerProvider) {
    const activeProvider = loggerProvider;
    loggerProvider = null;
    operationalLogger = null;
    await activeProvider.shutdown();
  }
  if (client) {
    await client.shutdown();
  }
}

export function capturePostHogException(
  error: unknown,
  input?: {
    businessId?: string;
    distinctId?: string;
    properties?: TelemetryProperties;
  },
): void {
  const activeClient = getClient();
  if (!activeClient) {
    return;
  }

  const env = getRuntimeEnv();
  if (!env) {
    return;
  }

  const additionalProperties: Record<string, unknown> = {
    ...redactTelemetryProperties({
      ...input?.properties,
      deploymentMode: env.DEPLOYMENT_MODE,
      runtime: "voice-gateway",
    }),
  };

  if (input?.businessId) {
    additionalProperties.$groups = {
      business: getPostHogBusinessGroupKey(input.businessId),
    };
  }

  activeClient.captureException(
    error,
    input?.distinctId ??
      (input?.businessId
        ? getPostHogDistinctIdForBusinessSystem(input.businessId)
        : undefined),
    additionalProperties,
  );
}

export function recordTwilioInvalidSignature(
  attributes?: OperationalAttributes,
): void {
  const properties = normalizeOperationalAttributes(attributes);
  captureOperationalEvent({
    event: "ops.voice.invalid_signature",
    properties: {
      provider: "twilio",
      ...properties,
    },
  });
  emitOperationalLog({
    level: "warn",
    message: "Rejected Twilio request with invalid signature",
    properties: {
      provider: "twilio",
      ...properties,
    },
  });
}

export function recordMediaStreamDisconnect(
  attributes?: OperationalAttributes,
): void {
  const properties = normalizeOperationalAttributes(attributes);
  captureOperationalEvent({
    event: "ops.voice.media_disconnect",
    properties: {
      provider: "twilio",
      ...properties,
    },
  });
  emitOperationalLog({
    level: "warn",
    message: "Twilio media stream websocket disconnected",
    properties: {
      provider: "twilio",
      ...properties,
    },
  });
}

export function recordSnapshotCacheHit(attributes?: OperationalAttributes): void {
  captureOperationalEvent({
    event: "ops.voice.snapshot_cache_hit",
    properties: normalizeOperationalAttributes(attributes),
  });
}

export function recordSnapshotCacheMiss(attributes?: OperationalAttributes): void {
  captureOperationalEvent({
    event: "ops.voice.snapshot_cache_miss",
    properties: normalizeOperationalAttributes(attributes),
  });
}

export function recordOpenAiRealtimeError(
  attributes?: OperationalAttributes,
): void {
  const properties = normalizeOperationalAttributes(attributes);
  captureOperationalEvent({
    event: "ops.voice.openai_realtime_error",
    properties: {
      provider: "openai",
      ...properties,
    },
  });
  emitOperationalLog({
    level: "error",
    message: "OpenAI Realtime runtime error",
    properties: {
      provider: "openai",
      ...properties,
    },
  });
}

export function recordOpenAiTurnLatency(
  latencyMs: number,
  attributes?: OperationalAttributes,
): void {
  const properties = normalizeOperationalAttributes(attributes);
  const nextProperties = {
    provider: "openai",
    latencyMs,
    latencyBucket: bucketLatencyMs(latencyMs),
    thresholdMs: SLOW_TURN_THRESHOLD_MS,
    ...properties,
  } satisfies TelemetryProperties;

  captureOperationalEvent({
    event: "ops.voice.turn_completed",
    properties: nextProperties,
  });

  if (latencyMs >= SLOW_TURN_THRESHOLD_MS) {
    captureOperationalEvent({
      event: "ops.voice.turn_slow",
      properties: nextProperties,
    });
    emitOperationalLog({
      level: "warn",
      message: "OpenAI assistant turn exceeded slow-turn threshold",
      properties: nextProperties,
    });
  }
}

export function recordToolExecutionLatency(
  latencyMs: number,
  attributes?: OperationalAttributes,
): void {
  captureOperationalEvent({
    event: "ops.voice.tool_completed",
    properties: {
      provider: "openai",
      latencyMs,
      latencyBucket: bucketLatencyMs(latencyMs),
      ...normalizeOperationalAttributes(attributes),
    },
  });
}

export function recordToolExecutionFailure(
  attributes?: OperationalAttributes,
): void {
  const properties = normalizeOperationalAttributes(attributes);
  captureOperationalEvent({
    event: "ops.voice.tool_failed",
    properties: {
      provider: "openai",
      ...properties,
    },
  });
  emitOperationalLog({
    level: "error",
    message: "Voice tool execution failed",
    properties: {
      provider: "openai",
      ...properties,
    },
  });
}

export function recordAiDirectedCallEnd(
  attributes?: OperationalAttributes & {
    reason?: string;
    severity?: string;
    holdSecondsUsed?: number;
    autoBlocked?: boolean;
  },
): void {
  captureOperationalEvent({
    event: "ops.voice.call_ended_by_ai",
    properties: {
      provider: "openai",
      ...normalizeOperationalAttributes(attributes),
    },
  });
}

export function recordRecordingUploadFailure(
  attributes?: OperationalAttributes,
): void {
  const properties = normalizeOperationalAttributes(attributes);
  captureOperationalEvent({
    event: "ops.voice.recording_upload_failed",
    properties,
  });
  emitOperationalLog({
    level: "error",
    message: "Voice recording upload failed",
    properties,
  });
}

export function recordVoiceHeartbeat(
  properties?: TelemetryProperties,
): void {
  captureOperationalEvent({
    event: "ops.voice.heartbeat",
    distinctId: VOICE_GATEWAY_DISTINCT_ID,
    ...(properties ? { properties } : {}),
  });
  emitOperationalLog({
    level: "info",
    message: "Voice gateway heartbeat",
    ...(properties ? { properties } : {}),
  });
}
