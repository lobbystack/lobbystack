import { SeverityNumber, type Logger } from "@opentelemetry/api-logs";
import { PostHog } from "posthog-node";

import { loadVoiceGatewayEnv, type VoiceGatewayEnv } from "@lobbystack/config";
import { forceFlushTelemetryLogs, getLogger, redactOtelExceptionText } from "@lobbystack/telemetry/node";
import {
  bucketLatencyMs,
  buildAlertableExceptionTelemetryProperties,
  buildPostHogAiGenerationProperties,
  buildPostHogAiSpanProperties,
  buildPostHogAiTraceProperties,
  buildProviderErrorTelemetryProperties,
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
  getProviderErrorExceptionType,
  isTelemetryEventName,
  PROVIDER_ERROR_PROVIDERS,
  redactAiTraceProperties,
  redactTelemetryProperties,
  validateTelemetryEvent,
  classifyProviderError,
  type ExternalProvider,
  type ProviderErrorClassification,
  type TelemetryProperties,
} from "@lobbystack/telemetry";

type AiTraceCommon = {
  businessId: string;
  telemetryEnabled?: boolean;
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
let operationalLogger: Logger | null = null;
let runtimeEnv: VoiceGatewayEnv | null | undefined;
let fatalHandlersInstalled = false;
const tenantConsent = new Map<string, { enabled: boolean; expiresAt: number }>();

/** Called with authoritative call-start context, not user-supplied call data. */
export function setBusinessTelemetryConsent(businessId: string, enabled: boolean): void {
  const now = Date.now();
  for (const [id, consent] of tenantConsent) {
    if (consent.expiresAt <= now) tenantConsent.delete(id);
  }
  tenantConsent.delete(businessId);
  tenantConsent.set(businessId, { enabled, expiresAt: now + 60 * 60 * 1000 });
  if (tenantConsent.size > 4096) tenantConsent.delete(tenantConsent.keys().next().value!);
}

function allowsExternalTelemetry(businessId?: string, properties?: Record<string, unknown>): boolean {
  const id = businessId ?? (typeof properties?.businessId === "string" ? properties.businessId : undefined);
  if (id) {
    const consent = tenantConsent.get(id);
    if (consent && consent.expiresAt <= Date.now()) tenantConsent.delete(id);
    return consent?.enabled === true && consent.expiresAt > Date.now();
  }
  // Unknown call ownership is not consent. Anonymous process health remains
  // available independently from optional tenant usage/error collection.
  return !properties?.callId && !properties?.conversationId && !properties?.traceId;
}

const VOICE_GATEWAY_DISTINCT_ID = "system:voice-gateway";
const SLOW_TURN_THRESHOLD_MS = 2_500;
const UNSAFE_EXCEPTION_PROPERTY_KEYS = new Set([
  "args",
  "body",
  "input",
  "payload",
  "rawargs",
  "rawrequest",
  "requestbody",
]);

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
    enableExceptionAutocapture: false,
    privacyMode: env.POSTHOG_PRIVACY_MODE,
  });
  return client;
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

  operationalLogger = getLogger("lobbystack.voice-gateway");
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
  if (!allowsExternalTelemetry(input.businessId, input.properties)) return;
  const env = getRuntimeEnv();
  if (env && isTelemetryEventName(event)) {
    const validation = validateTelemetryEvent({
      name: event,
      deploymentMode: env.DEPLOYMENT_MODE,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      properties: input.properties as TelemetryProperties,
    });
    if (!validation.ok) {
      const details = { event, missing: validation.missing, deploymentMode: env.DEPLOYMENT_MODE };
      if (env.DEPLOYMENT_MODE !== "cloud") {
        throw new Error(`Invalid telemetry event ${event}: missing ${validation.missing.join(", ")}`);
      }
      console.error("telemetry.validation_failed", details);
    }
  }
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
  if (!allowsExternalTelemetry(input.businessId, input.properties)) return;
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
  setBusinessTelemetryConsent(input.businessId, input.telemetryEnabled === true);
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
  operationalLogger = null;
  if (client) {
    await client.shutdown();
  }
}

function getErrorExceptionType(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z0-9_.-]{1,80}$/.test(error.name)) {
    return error.name;
  }
  return "ApplicationError";
}

function getSafeExceptionMessage(input: {
  service: string;
  operation: string;
  error: unknown;
}): string {
  return `${input.service} ${input.operation} failed (${getErrorExceptionType(
    input.error,
  )})`;
}

function getBooleanProperty(
  properties: TelemetryProperties | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = properties?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function getStringProperty(
  properties: TelemetryProperties | undefined,
  key: string,
): string | undefined {
  const value = properties?.[key];
  return typeof value === "string" ? value : undefined;
}

function getExceptionLevel(
  properties: TelemetryProperties | undefined,
): "fatal" | "error" | "warning" | "info" {
  const value = getStringProperty(properties, "$exception_level");
  if (value === "fatal" || value === "error" || value === "warning" || value === "info") {
    return value;
  }
  return "error";
}

function getProviderProperty(
  properties: TelemetryProperties | undefined,
): ExternalProvider | undefined {
  const value = getStringProperty(properties, "provider");
  if (value && PROVIDER_ERROR_PROVIDERS.includes(value as ExternalProvider)) {
    return value as ExternalProvider;
  }
  return undefined;
}

function getSafeExceptionProperties(
  properties: TelemetryProperties | undefined,
): TelemetryProperties {
  const safeProperties: TelemetryProperties = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (UNSAFE_EXCEPTION_PROPERTY_KEYS.has(normalizedKey)) {
      continue;
    }
    safeProperties[key] = value;
  }
  return safeProperties;
}

export function capturePostHogException(
  error: unknown,
  input?: {
    businessId?: string;
    distinctId?: string;
    properties?: TelemetryProperties;
  },
): void {
  if (!allowsExternalTelemetry(input?.businessId, input?.properties)) return;
  const activeClient = getClient();
  if (!activeClient) {
    return;
  }

  const env = getRuntimeEnv();
  if (!env) {
    return;
  }

  const safeInputProperties = getSafeExceptionProperties(input?.properties);
  const operation =
    getStringProperty(safeInputProperties, "operation") ?? "voice_gateway_exception";
  const exceptionType = getErrorExceptionType(error);
  const exceptionMessage = getSafeExceptionMessage({
    service: "voice-gateway",
    operation,
    error,
  });
  const provider = getProviderProperty(safeInputProperties);
  const additionalProperties: Record<string, unknown> = {
    ...redactTelemetryProperties({
      ...safeInputProperties,
      ...buildAlertableExceptionTelemetryProperties({
        runtime: "voice-gateway",
        service: "voice-gateway",
        operation,
        alertable: getBooleanProperty(safeInputProperties, "alertable", true),
        expected: getBooleanProperty(safeInputProperties, "expected", false),
        ...(provider ? { provider } : {}),
        exceptionLevel: getExceptionLevel(safeInputProperties),
        exceptionType,
        exceptionMessage,
      }),
      deploymentMode: env.DEPLOYMENT_MODE,
    }),
  };

  if (input?.businessId) {
    additionalProperties.$groups = {
      business: getPostHogBusinessGroupKey(input.businessId),
    };
  }

  const safeError = new Error(exceptionMessage);
  safeError.name = /^[A-Za-z0-9_.-]{1,80}$/.test(exceptionType) ? exceptionType : "Error";
  if (error instanceof Error && error.stack) {
    safeError.stack = [`${safeError.name}: ${safeError.message}`, ...error.stack.split("\n").slice(1, 30).filter((line) => line.trimStart().startsWith("at ")).map(redactOtelExceptionText)].join("\n");
  }
  activeClient.captureException(
    safeError,
    input?.distinctId ??
      (input?.businessId
        ? getPostHogDistinctIdForBusinessSystem(input.businessId)
        : undefined),
    additionalProperties,
  );
}

export async function handleFatalPostHogException(
  reason: unknown,
  kind: "uncaught_exception" | "unhandled_rejection",
  options?: {
    exitProcess?: boolean;
  },
): Promise<void> {
  console.error(reason);

  const error =
    reason instanceof Error
      ? reason
      : new Error(
          typeof reason === "string"
            ? reason
            : `Voice gateway fatal ${kind}`,
        );

  capturePostHogException(error, {
    distinctId: VOICE_GATEWAY_DISTINCT_ID,
    properties: {
      operation: `voice_gateway_${kind}`,
      fatalKind: kind,
      $exception_level: "fatal",
      alertable: true,
      expected: false,
    },
  });

  await Promise.allSettled([shutdownPostHog(), forceFlushTelemetryLogs()]);

  if (options?.exitProcess ?? true) {
    process.exit(1);
  }
}

export function installPostHogFatalHandlers(): void {
  if (fatalHandlersInstalled) {
    return;
  }
  fatalHandlersInstalled = true;

  process.on("uncaughtException", (error) => {
    void handleFatalPostHogException(error, "uncaught_exception");
  });
  process.on("unhandledRejection", (reason) => {
    void handleFatalPostHogException(reason, "unhandled_rejection");
  });
}

function getSafeProviderErrorCode(code: string | undefined): string | undefined {
  const normalized = code?.trim();
  if (!normalized) {
    return undefined;
  }

  return /^[a-z0-9_.:-]{1,80}$/i.test(normalized) ? normalized : undefined;
}

export function buildSafeProviderFailureMessage(
  classification: ProviderErrorClassification,
): string {
  const safeCode = getSafeProviderErrorCode(classification.providerErrorCode);
  return `${classification.provider} provider failure (${classification.kind}${
    safeCode ? `: ${safeCode}` : ""
  })`;
}

export function captureProviderFailureException(input: {
  provider: ExternalProvider;
  error?: unknown;
  code?: string;
  message?: string;
  status?: number;
  businessId?: string;
  distinctId?: string;
  properties?: TelemetryProperties;
}): ProviderErrorClassification {
  const classification = classifyProviderError({
    provider: input.provider,
    error: input.error,
    ...(input.code ? { code: input.code } : {}),
    ...(input.message ? { message: input.message } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
  const exception = new Error(buildSafeProviderFailureMessage(classification));
  exception.name = getProviderErrorExceptionType(classification.kind);

  capturePostHogException(exception, {
    ...(input.businessId ? { businessId: input.businessId } : {}),
    ...(input.distinctId ? { distinctId: input.distinctId } : {}),
    properties: {
      ...buildProviderErrorTelemetryProperties(classification),
      ...input.properties,
    },
  });

  return classification;
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
    generationMs: latencyMs,
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

export function recordTurnFirstAudio(
  ttfaMs: number,
  attributes?: OperationalAttributes,
): void {
  captureOperationalEvent({
    event: "ops.voice.turn_first_audio",
    properties: {
      ttfaMs,
      ttfaBucket: bucketLatencyMs(ttfaMs),
      ...normalizeOperationalAttributes(attributes),
    },
  });
}

export function recordPlaybackInterrupted(attributes?: OperationalAttributes): void {
  captureOperationalEvent({
    event: "ops.voice.playback_interrupted",
    properties: normalizeOperationalAttributes(attributes),
  });
}

export function recordHangupRetriesExhausted(attributes?: OperationalAttributes): void {
  captureOperationalEvent({
    event: "ops.voice.hangup_retries_exhausted",
    properties: normalizeOperationalAttributes(attributes),
  });
}

export function recordTranscriptionFailure(attributes?: OperationalAttributes): void {
  captureOperationalEvent({
    event: "ops.voice.transcription_failed",
    properties: normalizeOperationalAttributes(attributes),
  });
}

export function recordSnapshotCacheEviction(attributes?: OperationalAttributes): void {
  captureOperationalEvent({
    event: "ops.voice.snapshot_cache_evicted",
    properties: normalizeOperationalAttributes(attributes),
  });
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
