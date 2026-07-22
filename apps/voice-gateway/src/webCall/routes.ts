import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { buildVoiceSystemPrompt } from "@lobbystack/ai";
import { WEB_CALL_STALE_GRACE_MS } from "@lobbystack/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import WebSocket from "ws";

import {
  appendVoiceTranscript,
  completeVoiceCall,
  fetchWebCallRecordingTarget,
  fetchWebVoiceContext,
  recordVoiceAiCost,
  RuntimeRequestError,
  startWebVoiceCall,
  uploadVoiceRecording,
} from "../convex/runtimeClient";
import { capturePostHogException } from "../observability/posthog";
import type { EndCallRequest } from "../realtime/callControl";
import { executeVoiceTool } from "../realtime/toolExecutor";
import { createWebRealtimeToolDefinitions } from "../realtime/toolDefinitions";

type WebCallSessionRequest = {
  businessSlug: string;
  dashboardTestCallProof?: string;
  widgetId?: string;
  sdp: string;
  pageUrl?: string;
  visitorId?: string;
  prospectDemoToken?: string;
};

type OpenAiRealtimeMessage = {
  type?: string;
  event_id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  item?: {
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
  };
  item_id?: string;
  content_index?: number;
  transcript?: string;
  response?: {
    id?: string;
    status?: string;
    metadata?: Record<string, string | number | boolean | null> | null;
    usage?: {
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      input_token_details?: {
        cached_tokens?: number;
        text_tokens?: number;
        audio_tokens?: number;
      };
      output_token_details?: {
        text_tokens?: number;
        audio_tokens?: number;
      };
    };
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type RealtimeUsageMetrics = NonNullable<
  OpenAiRealtimeMessage["response"]
>["usage"];

type ActiveWebCall = {
  gatewaySessionId: string;
  businessSlug: string;
  businessId: string;
  callId: string;
  conversationId: string;
  providerCallId: string;
  startedAtMs: number;
  handledToolCallIds: Set<string>;
  sidebandSocket: WebSocket | null;
  maxDurationTimer: ReturnType<typeof setTimeout> | null;
  finalized: boolean;
  openingGreetingActive: boolean;
  openingGreetingTurnDetectionTimer: ReturnType<typeof setTimeout> | null;
  seenTranscriptKeys: Set<string>;
  transcriptSequence: number;
  pendingAssistantTranscriptFlushTimer: ReturnType<typeof setTimeout> | null;
  pendingAssistantTranscripts: Array<{
    dedupeKey: string;
    text: string | undefined;
  }>;
  pendingEndCall: EndCallRequest | null;
  pendingEndCallFallbackTimer: ReturnType<typeof setTimeout> | null;
  sessionMode?: "prospect_demo";
  prospectDemoToken?: string;
  dashboardTestCallToken?: string;
};

type CompletedWebCall = {
  callId: string;
  startedAtMs: number;
  completedAtMs?: number;
};

class OpenAiWebRtcSetupError extends Error {
  status: number;
  responseBody: string;

  constructor(input: { status: number; responseBody: string }) {
    super(`OpenAI Realtime WebRTC setup failed with ${input.status}.`);
    this.name = "OpenAiWebRtcSetupError";
    this.status = input.status;
    this.responseBody = input.responseBody;
  }
}

const activeWebCalls = new Map<string, ActiveWebCall>();
const completedWebCalls = new Map<string, CompletedWebCall>();
const WEB_REALTIME_VAD_THRESHOLD = 0.65;
const WEB_REALTIME_VAD_PREFIX_PADDING_MS = 300;
const WEB_REALTIME_VAD_SILENCE_DURATION_MS = 700;
const WEB_POST_GREETING_INPUT_GRACE_MS = 2_000;
const WEB_COMPLETED_SESSION_UPLOAD_GRACE_MS = 10 * 60_000;
const WEB_ASSISTANT_TRANSCRIPT_REORDER_GRACE_MS = 1_500;
const WEB_RECORDING_BYTES_PER_SECOND_LIMIT = 64 * 1024;
const WEB_FINAL_MESSAGE_HANGUP_FALLBACK_MS = 8_000;
const WEB_FINAL_MESSAGE_MIN_PLAYBACK_GRACE_MS = 1_500;
const WEB_FINAL_MESSAGE_MAX_PLAYBACK_GRACE_MS = 8_000;
const WEB_FINAL_MESSAGE_METADATA_PURPOSE = "web_final_message";
const WEB_CALL_SESSION_START_RATE_LIMIT_MAX = 100;
const WEB_CALL_SESSION_START_RATE_LIMIT_WINDOW = "1 minute";
const DASHBOARD_TEST_CALL_WIDGET_ID = "lobbystack-dashboard-test-call";
const DASHBOARD_TEST_CALL_PROOF_PREFIX = "dashboard-test-call";
const PROSPECT_DEMO_INTAKE_TOOL_NAMES = new Set([
  "waitForUser",
  "getBusinessHours",
  "getBusinessServices",
  "searchKnowledge",
  "takeMessage",
  "endCall",
]);
export function resetWebCallRouteStateForTests(): void {
  for (const session of activeWebCalls.values()) {
    clearWebOpeningGreetingTimer(session);
    clearWebMaxDurationTimer(session);
    clearWebEndCallFallbackTimer(session);
    if (session.pendingAssistantTranscriptFlushTimer !== null) {
      clearTimeout(session.pendingAssistantTranscriptFlushTimer);
    }
  }
  activeWebCalls.clear();
  completedWebCalls.clear();
}

function getAllowedOrigins(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function getRequestOrigin(request: FastifyRequest): string | null {
  const origin = request.headers.origin;
  return typeof origin === "string" && origin ? origin : null;
}

function getStringProperty(
  body: Record<string, unknown>,
  key: string,
): string | undefined | null {
  const value = body[key];
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : null;
}

function parseWebCallSessionRequest(
  body: unknown,
): { ok: true; data: WebCallSessionRequest } | { ok: false; message: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Invalid web call request." };
  }

  const input = body as Record<string, unknown>;
  const rawBusinessSlug = getStringProperty(input, "businessSlug");
  const rawSdp = getStringProperty(input, "sdp");
  const rawPageUrl = getStringProperty(input, "pageUrl");
  const rawVisitorId = getStringProperty(input, "visitorId");
  const rawWidgetId = getStringProperty(input, "widgetId");
  const rawDashboardTestCallProof = getStringProperty(
    input,
    "dashboardTestCallProof",
  );
  const rawProspectDemoToken = getStringProperty(input, "prospectDemoToken");

  if (rawBusinessSlug === null) {
    return { ok: false, message: "Invalid business slug." };
  }
  if (rawSdp === null) {
    return { ok: false, message: "Invalid SDP offer." };
  }
  if (
    rawPageUrl === null ||
    rawVisitorId === null ||
    rawWidgetId === null ||
    rawDashboardTestCallProof === null ||
    rawProspectDemoToken === null
  ) {
    return { ok: false, message: "Invalid web call request." };
  }

  const businessSlug = rawBusinessSlug?.trim() ?? "";
  if (!businessSlug) {
    return { ok: false, message: "Missing business slug." };
  }

  const sdp = rawSdp ?? "";
  if (!sdp.trim()) {
    return { ok: false, message: "Missing SDP offer." };
  }

  const pageUrl = rawPageUrl?.trim();
  const visitorId = rawVisitorId?.trim();
  const widgetId = rawWidgetId?.trim();
  const dashboardTestCallProof = rawDashboardTestCallProof?.trim();
  const prospectDemoToken = rawProspectDemoToken?.trim();

  return {
    ok: true,
    data: {
      businessSlug,
      sdp,
      ...(dashboardTestCallProof ? { dashboardTestCallProof } : {}),
      ...(pageUrl ? { pageUrl } : {}),
      ...(visitorId ? { visitorId } : {}),
      ...(widgetId ? { widgetId } : {}),
      ...(prospectDemoToken ? { prospectDemoToken } : {}),
    },
  };
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function verifyDashboardTestCallProof(input: {
  businessSlug: string;
  proof?: string | undefined;
  token?: string | undefined;
}): boolean {
  const token = input.token?.trim();
  if (!token || !input.proof) {
    return false;
  }

  const parts = input.proof.split("|");
  if (parts.length !== 5) {
    return false;
  }

  const [prefix, businessSlug, rawExpiresAt, nonce, signature] = parts;
  if (
    prefix !== DASHBOARD_TEST_CALL_PROOF_PREFIX ||
    businessSlug !== input.businessSlug ||
    rawExpiresAt === undefined ||
    !nonce ||
    signature === undefined ||
    !/^[0-9a-f]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expiresAt = Number(rawExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const payload = parts.slice(0, 4).join("|");
  const expected = createHmac("sha256", token).update(payload).digest("hex");
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function isAllowedOrigin(
  server: FastifyInstance,
  origin: string | null,
): boolean {
  if (!origin) {
    return false;
  }
  const allowedOrigins = getAllowedOrigins(
    server.runtimeConfig.WEB_CALL_ALLOWED_ORIGINS,
  );
  return (
    allowedOrigins.has(origin) ||
    (server.runtimeConfig.DEPLOYMENT_MODE === "development" &&
      isLocalhostOrigin(origin))
  );
}

function getWebRecordingBodyLimit(maxDurationMs: number): number {
  const maxDurationSeconds = Math.ceil(maxDurationMs / 1_000);
  return Math.max(
    5 * 1024 * 1024,
    maxDurationSeconds * WEB_RECORDING_BYTES_PER_SECOND_LIMIT,
  );
}

function getWebRecordingDurationMs(
  webCall: CompletedWebCall,
  reportedDurationMs: unknown,
  maxDurationMs: number,
): number {
  const elapsedDurationMs = Math.max(
    0,
    Math.min(
      (webCall.completedAtMs ?? Date.now()) - webCall.startedAtMs,
      maxDurationMs,
    ),
  );
  const parsedDurationMs = Number(reportedDurationMs);
  if (!Number.isFinite(parsedDurationMs) || parsedDurationMs <= 0) {
    return elapsedDurationMs;
  }

  return Math.min(parsedDurationMs, elapsedDurationMs);
}

function getWebCallDurationSeconds(
  startedAtMs: number,
  endedAtMs: number,
  maxDurationMs: number,
): number {
  return Math.max(
    0,
    Math.ceil(Math.min(endedAtMs - startedAtMs, maxDurationMs) / 1_000),
  );
}

function addCorsHeaders(reply: FastifyReply, origin: string): void {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
  reply.header("Access-Control-Max-Age", "600");
  reply.header("Vary", "Origin");
}

async function readRequestBodyBuffer(request: FastifyRequest): Promise<Buffer> {
  if (Buffer.isBuffer(request.body)) {
    return request.body;
  }
  if (request.body instanceof ArrayBuffer) {
    return Buffer.from(request.body);
  }
  if (typeof request.body === "string") {
    return Buffer.from(request.body);
  }

  const chunks: Array<Buffer> = [];
  for await (const chunk of request.raw) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function rememberCompletedWebCall(session: ActiveWebCall): void {
  completedWebCalls.set(session.gatewaySessionId, {
    callId: session.callId,
    startedAtMs: session.startedAtMs,
    completedAtMs: Date.now(),
  });
  setTimeout(() => {
    const completed = completedWebCalls.get(session.gatewaySessionId);
    if (completed?.callId === session.callId) {
      completedWebCalls.delete(session.gatewaySessionId);
    }
  }, WEB_COMPLETED_SESSION_UPLOAD_GRACE_MS).unref();
}

function isActiveWebRecordingUploadAllowed(
  startedAtMs: number,
  maxDurationMs: number,
): boolean {
  return (
    Number.isFinite(startedAtMs) &&
    Date.now() - startedAtMs <= maxDurationMs + WEB_CALL_STALE_GRACE_MS
  );
}

function getWebFinalMessagePlaybackGraceMs(message: string): number {
  const wordCount = message.trim().split(/\s+/u).filter(Boolean).length;
  const estimatedSpeechMs = Math.ceil((wordCount / 2.5) * 1_000);
  return Math.min(
    WEB_FINAL_MESSAGE_MAX_PLAYBACK_GRACE_MS,
    Math.max(WEB_FINAL_MESSAGE_MIN_PLAYBACK_GRACE_MS, estimatedSpeechMs),
  );
}

function getWebCallForRecording(
  sessionId: string,
  maxDurationMs: number,
): CompletedWebCall | null {
  const active = activeWebCalls.get(sessionId);
  if (active) {
    if (!isActiveWebRecordingUploadAllowed(active.startedAtMs, maxDurationMs)) {
      return null;
    }
    return {
      callId: active.callId,
      startedAtMs: active.startedAtMs,
    };
  }

  const completed = completedWebCalls.get(sessionId);
  if (!completed) {
    return null;
  }

  if (
    completed.completedAtMs !== undefined &&
    Date.now() - completed.completedAtMs > WEB_COMPLETED_SESSION_UPLOAD_GRACE_MS
  ) {
    completedWebCalls.delete(sessionId);
    return null;
  }

  return completed;
}

async function resolveWebCallForRecording(
  sessionId: string,
  maxDurationMs: number,
): Promise<CompletedWebCall | null> {
  const local = getWebCallForRecording(sessionId, maxDurationMs);
  if (local) {
    return local;
  }

  const durable = await fetchWebCallRecordingTarget({
    gatewaySessionId: sessionId,
  });
  if (!durable) {
    return null;
  }

  const startedAtMs = Date.parse(durable.startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  const completedAtMs =
    durable.endedAt !== undefined ? Date.parse(durable.endedAt) : undefined;
  if (completedAtMs !== undefined) {
    if (!Number.isFinite(completedAtMs)) {
      return null;
    }
    if (Date.now() - completedAtMs > WEB_COMPLETED_SESSION_UPLOAD_GRACE_MS) {
      return null;
    }
  } else {
    if (durable.status !== "in_progress" && durable.status !== "open") {
      return null;
    }
    if (
      !isActiveWebRecordingUploadAllowed(
        startedAtMs,
        durable.webCallMaxDurationMs ?? maxDurationMs,
      )
    ) {
      return null;
    }
  }

  return {
    callId: durable.callId,
    startedAtMs,
    ...(completedAtMs !== undefined ? { completedAtMs } : {}),
  };
}

async function finishDurableWebCallSession(
  server: FastifyInstance,
  sessionId: string,
  disposition: string,
): Promise<void> {
  const durable = await fetchWebCallRecordingTarget({
    gatewaySessionId: sessionId,
  });
  if (!durable || durable.endedAt !== undefined) {
    return;
  }

  if (durable.status !== "in_progress" && durable.status !== "open") {
    return;
  }

  const startedAtMs = Date.parse(durable.startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return;
  }

  const endedAtMs = Date.now();
  if (durable.providerCallId !== undefined) {
    await hangupOpenAiRealtimeProviderCall(server, {
      callId: durable.callId,
      providerCallId: durable.providerCallId,
      reason: disposition,
    });
  }

  await completeVoiceCall({
    callId: durable.callId,
    status: "completed",
    disposition,
    endedAt: new Date(endedAtMs).toISOString(),
    providerDurationSeconds: getWebCallDurationSeconds(
      startedAtMs,
      endedAtMs,
      durable.webCallMaxDurationMs ??
        server.runtimeConfig.WEB_CALL_MAX_DURATION_MS,
    ),
  });
}

async function persistWebTranscriptIfNew(
  server: FastifyInstance,
  session: ActiveWebCall,
  dedupeKey: string,
  input: {
    speaker: string;
    text: string | undefined;
  },
): Promise<void> {
  const text = input.text?.trim();
  if (!text || session.seenTranscriptKeys.has(dedupeKey)) {
    return;
  }

  session.seenTranscriptKeys.add(dedupeKey);
  const sequence = session.transcriptSequence;
  session.transcriptSequence += 1;

  await appendVoiceTranscript({
    businessId: session.businessId,
    callId: session.callId,
    sequence,
    speaker: input.speaker,
    text,
    final: true,
  }).catch((error: unknown) => {
    server.log.error(
      {
        err: error,
        businessId: session.businessId,
        callId: session.callId,
        sequence,
        speaker: input.speaker,
      },
      "Failed to persist web voice transcript segment",
    );
  });
}

async function flushPendingWebAssistantTranscripts(
  server: FastifyInstance,
  session: ActiveWebCall,
): Promise<void> {
  if (session.pendingAssistantTranscriptFlushTimer !== null) {
    clearTimeout(session.pendingAssistantTranscriptFlushTimer);
    session.pendingAssistantTranscriptFlushTimer = null;
  }

  const pending = session.pendingAssistantTranscripts.splice(0);
  for (const transcript of pending) {
    await persistWebTranscriptIfNew(server, session, transcript.dedupeKey, {
      speaker: "assistant",
      text: transcript.text,
    });
  }
}

function queueWebAssistantTranscript(
  server: FastifyInstance,
  session: ActiveWebCall,
  dedupeKey: string,
  text: string | undefined,
): void {
  if (!text?.trim() || session.seenTranscriptKeys.has(dedupeKey)) {
    return;
  }

  session.pendingAssistantTranscripts.push({ dedupeKey, text });
  if (session.pendingAssistantTranscriptFlushTimer !== null) {
    return;
  }

  session.pendingAssistantTranscriptFlushTimer = setTimeout(() => {
    session.pendingAssistantTranscriptFlushTimer = null;
    void flushPendingWebAssistantTranscripts(server, session).catch(
      (error: unknown) => {
        server.log.error(
          {
            err: error,
            callId: session.callId,
            providerCallId: session.providerCallId,
          },
          "Failed to flush pending web voice assistant transcripts",
        );
      },
    );
  }, WEB_ASSISTANT_TRANSCRIPT_REORDER_GRACE_MS);
}

export function createWebRealtimeTurnDetectionConfig(
  options: {
    createResponse?: boolean;
    interruptResponse?: boolean;
  } = {},
): Record<string, unknown> {
  return {
    type: "server_vad",
    threshold: WEB_REALTIME_VAD_THRESHOLD,
    prefix_padding_ms: WEB_REALTIME_VAD_PREFIX_PADDING_MS,
    silence_duration_ms: WEB_REALTIME_VAD_SILENCE_DURATION_MS,
    create_response: options.createResponse ?? true,
    interrupt_response: options.interruptResponse ?? true,
  };
}

function enableWebRealtimeTurnDetection(
  server: FastifyInstance,
  socket: WebSocket,
  session: ActiveWebCall,
  reason: string,
): void {
  if (!session.openingGreetingActive || session.finalized) {
    return;
  }

  if (session.openingGreetingTurnDetectionTimer !== null) {
    clearTimeout(session.openingGreetingTurnDetectionTimer);
    session.openingGreetingTurnDetectionTimer = null;
  }
  session.openingGreetingActive = false;
  postRealtimeEvent(socket, { type: "input_audio_buffer.clear" });
  postRealtimeEvent(socket, {
    type: "session.update",
    session: {
      type: "realtime",
      audio: {
        input: {
          turn_detection: createWebRealtimeTurnDetectionConfig(),
        },
      },
    },
  });
  server.log.info(
    {
      callId: session.callId,
      providerCallId: session.providerCallId,
      reason,
    },
    "Enabled web voice turn detection after opening greeting",
  );
}

function scheduleWebRealtimeTurnDetectionEnable(
  server: FastifyInstance,
  socket: WebSocket,
  session: ActiveWebCall,
  reason: string,
): void {
  if (
    !session.openingGreetingActive ||
    session.finalized ||
    session.openingGreetingTurnDetectionTimer !== null
  ) {
    return;
  }

  postRealtimeEvent(socket, { type: "input_audio_buffer.clear" });
  session.openingGreetingTurnDetectionTimer = setTimeout(() => {
    session.openingGreetingTurnDetectionTimer = null;
    enableWebRealtimeTurnDetection(server, socket, session, reason);
  }, WEB_POST_GREETING_INPUT_GRACE_MS);

  server.log.info(
    {
      callId: session.callId,
      providerCallId: session.providerCallId,
      reason,
      graceMs: WEB_POST_GREETING_INPUT_GRACE_MS,
    },
    "Waiting briefly before enabling web voice turn detection after opening greeting",
  );
}

function clearWebOpeningGreetingTimer(session: ActiveWebCall): void {
  if (session.openingGreetingTurnDetectionTimer !== null) {
    clearTimeout(session.openingGreetingTurnDetectionTimer);
    session.openingGreetingTurnDetectionTimer = null;
  }
}

function clearWebMaxDurationTimer(session: ActiveWebCall): void {
  if (session.maxDurationTimer !== null) {
    clearTimeout(session.maxDurationTimer);
    session.maxDurationTimer = null;
  }
}

function clearWebEndCallFallbackTimer(session: ActiveWebCall): void {
  if (session.pendingEndCallFallbackTimer !== null) {
    clearTimeout(session.pendingEndCallFallbackTimer);
    session.pendingEndCallFallbackTimer = null;
  }
}

function normalizeOptionalAbuseKey(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, 256);
}

function getClientIp(request: FastifyRequest): string | undefined {
  return request.ip;
}

function hashAbuseKey(
  server: FastifyInstance,
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  return createHash("sha256")
    .update(`${server.runtimeConfig.INTERNAL_SERVICE_TOKEN}:${value}`)
    .digest("hex");
}

function replyWithRuntimeRequestError(
  error: RuntimeRequestError,
  reply: FastifyReply,
): { code?: string; error: string } {
  reply.code(error.status);
  return {
    ...(error.code !== undefined ? { code: error.code } : {}),
    error: error.message,
  };
}

async function hangupOpenAiRealtimeCall(
  server: FastifyInstance,
  session: ActiveWebCall,
  reason: string,
): Promise<void> {
  await hangupOpenAiRealtimeProviderCall(server, {
    callId: session.callId,
    providerCallId: session.providerCallId,
    reason,
  });
}

async function hangupOpenAiRealtimeProviderCall(
  server: FastifyInstance,
  input: {
    callId?: string;
    providerCallId: string;
    reason: string;
  },
): Promise<void> {
  if (input.providerCallId.startsWith("webcall_")) {
    server.log.warn(
      {
        callId: input.callId,
        providerCallId: input.providerCallId,
        reason: input.reason,
      },
      "Skipping OpenAI Realtime hangup because no provider call ID was returned",
    );
    return;
  }

  try {
    const response = await fetch(
      `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(
        input.providerCallId,
      )}/hangup`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${server.runtimeConfig.OPENAI_API_KEY}`,
        },
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      server.log.warn(
        {
          callId: input.callId,
          providerCallId: input.providerCallId,
          reason: input.reason,
          status: response.status,
          body: body.slice(0, 500),
        },
        "OpenAI Realtime web call hangup failed",
      );
    }
  } catch (error) {
    server.log.error(
      {
        err: error,
        callId: input.callId,
        providerCallId: input.providerCallId,
        reason: input.reason,
      },
      "Failed to hang up OpenAI Realtime web call",
    );
  }
}

async function finishWebCallSession(
  server: FastifyInstance,
  session: ActiveWebCall,
  disposition: string,
): Promise<void> {
  if (session.finalized) {
    return;
  }

  session.finalized = true;
  clearWebOpeningGreetingTimer(session);
  clearWebMaxDurationTimer(session);
  clearWebEndCallFallbackTimer(session);
  try {
    await flushPendingWebAssistantTranscripts(server, session);
    await hangupOpenAiRealtimeCall(server, session, disposition);
    await completeVoiceCall({
      callId: session.callId,
      status: "completed",
      disposition,
      endedAt: new Date().toISOString(),
      providerDurationSeconds: Math.max(
        0,
        Math.ceil((Date.now() - session.startedAtMs) / 1000),
      ),
    });
  } catch (error) {
    session.finalized = false;
    throw error;
  }

  rememberCompletedWebCall(session);
  session.sidebandSocket?.close(1000, "web call ended");
  activeWebCalls.delete(session.gatewaySessionId);
}

function requestWebFinalMessageBeforeHangup(
  server: FastifyInstance,
  socket: WebSocket,
  session: ActiveWebCall,
  endCall: EndCallRequest,
): void {
  if (session.finalized || session.pendingEndCall !== null) {
    return;
  }

  session.pendingEndCall = endCall;
  postRealtimeEvent(socket, {
    type: "response.create",
    response: {
      metadata: {
        lobbystack_purpose: WEB_FINAL_MESSAGE_METADATA_PURPOSE,
      },
      instructions: [
        `Say this exact final message: ${JSON.stringify(endCall.message)}.`,
        "Then stop speaking. The session will end automatically after your audio finishes.",
        "Do not call any tools and do not add anything else.",
      ].join(" "),
      tool_choice: "none",
    },
  });

  session.pendingEndCallFallbackTimer = setTimeout(() => {
    session.pendingEndCallFallbackTimer = null;
    void finishWebCallSession(server, session, endCall.reason).catch(
      (error: unknown) => {
        server.log.error(
          {
            err: error,
            callId: session.callId,
            providerCallId: session.providerCallId,
            reason: endCall.reason,
          },
          "Failed to finalize web voice session after final-message fallback",
        );
      },
    );
  }, WEB_FINAL_MESSAGE_HANGUP_FALLBACK_MS);
  session.pendingEndCallFallbackTimer.unref?.();
}

function scheduleWebMaxDurationTimer(
  server: FastifyInstance,
  session: ActiveWebCall,
): void {
  clearWebMaxDurationTimer(session);
  session.maxDurationTimer = setTimeout(() => {
    session.maxDurationTimer = null;
    void finishWebCallSession(server, session, "duration_limit").catch(
      (error: unknown) => {
        server.log.error(
          {
            err: error,
            callId: session.callId,
            providerCallId: session.providerCallId,
          },
          "Failed to enforce web voice max duration",
        );
      },
    );
  }, server.runtimeConfig.WEB_CALL_MAX_DURATION_MS);
}

function parseProviderCallId(
  response: Response,
  gatewaySessionId: string,
): string {
  const headerCandidates = [
    response.headers.get("openai-call-id"),
    response.headers.get("openai-realtime-call-id"),
    response.headers.get("x-openai-call-id"),
  ].filter((value): value is string => Boolean(value));

  if (headerCandidates[0]) {
    return headerCandidates[0];
  }

  const location = response.headers.get("location");
  if (location) {
    const lastSegment = location.split("/").filter(Boolean).at(-1);
    if (lastSegment) {
      return lastSegment;
    }
  }

  return `webcall_${gatewaySessionId}`;
}

function postRealtimeEvent(
  socket: WebSocket,
  payload: Record<string, unknown>,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function priceUsage(
  server: FastifyInstance,
  usage: RealtimeUsageMetrics | undefined,
): number | null {
  if (!usage) {
    return null;
  }

  const fallbackInputPrice =
    server.runtimeConfig.OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD;
  const fallbackOutputPrice =
    server.runtimeConfig.OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD;
  const textInputTokens = usage.input_token_details?.text_tokens;
  const audioInputTokens = usage.input_token_details?.audio_tokens;
  const cachedInputTokens = usage.input_token_details?.cached_tokens ?? 0;
  const textOutputTokens = usage.output_token_details?.text_tokens;
  const audioOutputTokens = usage.output_token_details?.audio_tokens;
  const textInputPrice =
    server.runtimeConfig.OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD ??
    fallbackInputPrice;
  const audioInputPrice =
    server.runtimeConfig.OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD;
  const textOutputPrice =
    server.runtimeConfig.OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD ??
    fallbackOutputPrice;
  const audioOutputPrice =
    server.runtimeConfig.OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD;
  const cachedInputPrice =
    server.runtimeConfig.OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD;

  const hasDetailedInput =
    textInputTokens !== undefined || audioInputTokens !== undefined;
  if (hasDetailedInput && cachedInputTokens > 0) {
    return null;
  }

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const uncachedInputTokens =
    inputTokens !== undefined
      ? Math.max(0, inputTokens - cachedInputTokens)
      : undefined;
  const pricedBuckets: Array<
    readonly [number | undefined, number | undefined]
  > = hasDetailedInput
    ? [
        [textInputTokens, textInputPrice],
        [audioInputTokens, audioInputPrice],
        [textOutputTokens, textOutputPrice],
        [audioOutputTokens, audioOutputPrice],
      ]
    : [
        [uncachedInputTokens, fallbackInputPrice],
        [cachedInputTokens || undefined, cachedInputPrice],
        [outputTokens, fallbackOutputPrice],
      ];

  const hasAnyPricedTokens = pricedBuckets.some(
    ([tokens, price]) => tokens !== undefined && price !== undefined,
  );
  if (!hasAnyPricedTokens) {
    return null;
  }

  return pricedBuckets.reduce(
    (total, [tokens, price]) => total + (tokens ?? 0) * (price ?? 0),
    0,
  );
}

async function exchangeWebRtcOffer(input: {
  apiKey: string;
  model: string;
  sdp: string;
}): Promise<{ answerSdp: string; providerCallId: string }> {
  const formData = new FormData();
  formData.set("sdp", input.sdp);
  formData.set(
    "session",
    JSON.stringify({
      type: "realtime",
      model: input.model,
      audio: {
        output: {
          voice: "marin",
        },
      },
    }),
  );

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new OpenAiWebRtcSetupError({
      status: response.status,
      responseBody: await response.text().catch(() => ""),
    });
  }

  return {
    answerSdp: await response.text(),
    providerCallId: parseProviderCallId(response, crypto.randomUUID()),
  };
}

function createSidebandSocket(input: {
  server: FastifyInstance;
  session: ActiveWebCall;
  snapshot: Awaited<ReturnType<typeof fetchWebVoiceContext>>["snapshot"];
}): WebSocket {
  const socket = new WebSocket(
    `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(
      input.session.providerCallId,
    )}`,
    {
      headers: {
        Authorization: `Bearer ${input.server.runtimeConfig.OPENAI_API_KEY}`,
      },
    },
  );

  socket.on("open", () => {
    postRealtimeEvent(socket, {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: [
          buildVoiceSystemPrompt(input.snapshot),
          "You are speaking through a website voice widget, not a phone call.",
          "Represent LobbyStack and answer questions about the business from the supplied snapshot and tools.",
          "For LobbyStack feature, workflow, policy, limitation, pricing, usage, billing, integration, plan, and documentation questions, call searchKnowledge before answering unless the exact answer is already present in the current conversation or structured snapshot.",
          "Use the configured greeting only once at the start of the session. Never repeat it after the opening greeting, even after interruptions, silence, or filler speech.",
          "If the latest audio is silence, background noise, echo of your own previous audio, hold music, TV audio, side conversation, or speech not addressed to you, call waitForUser and do not speak.",
          ...(input.session.sessionMode === "prospect_demo"
            ? [
                "This is a LobbyStack prospect demo. Answer from public business knowledge and collect a sample service or quote request with takeMessage.",
                "Do not book appointments, check or promise availability, transfer calls, or promise outbound SMS or email.",
              ]
            : [
                "Ask for a phone number before booking an appointment, taking a callback message, or discussing existing appointments.",
              ]),
          "Do not attempt phone transfer from the website widget.",
          "End the session with endCall when the visitor is clearly finished, abusive, spammy, or repeatedly silent.",
        ].join("\n\n"),
        output_modalities: ["audio"],
        audio: {
          input: {
            noise_reduction: { type: "far_field" },
            transcription: {
              model: input.server.runtimeConfig.OPENAI_TRANSCRIPTION_MODEL,
            },
            turn_detection: createWebRealtimeTurnDetectionConfig({
              createResponse: false,
              interruptResponse: false,
            }),
          },
          output: {
            voice: input.server.runtimeConfig.OPENAI_REALTIME_VOICE,
          },
        },
        tools: createWebRealtimeToolDefinitions(
          input.session.sessionMode === "prospect_demo"
            ? { sessionMode: "prospect_demo" }
            : undefined,
        ),
        tool_choice: "auto",
      },
    });

    postRealtimeEvent(socket, {
      type: "response.create",
      response: {
        instructions: [
          `Begin by greeting the visitor with this exact greeting: "${input.snapshot.greeting}"`,
          "Then stop speaking and wait for the visitor.",
          "Do not repeat this greeting later in the session.",
        ].join(" "),
      },
    });
  });

  socket.on("message", (rawMessage) => {
    void handleSidebandMessage(
      input.server,
      socket,
      input.session,
      rawMessage,
    ).catch((error: unknown) => {
      input.server.log.error(
        {
          err: error,
          callId: input.session.callId,
          providerCallId: input.session.providerCallId,
        },
        "Failed to handle OpenAI Realtime web call sideband message",
      );
      capturePostHogException(error, {
        businessId: input.session.businessId,
        properties: {
          operation: "web_call_sideband_message",
          channel: "web_voice",
          provider: "openai",
          callId: input.session.callId,
        },
      });
    });
  });

  socket.on("error", (error) => {
    capturePostHogException(error, {
      businessId: input.session.businessId,
      properties: {
        operation: "web_call_sideband_socket_error",
        channel: "web_voice",
        provider: "openai",
        callId: input.session.callId,
      },
    });
  });

  socket.on("close", (code, reason) => {
    input.server.log.info(
      {
        callId: input.session.callId,
        providerCallId: input.session.providerCallId,
        code,
        reason: Buffer.isBuffer(reason)
          ? reason.toString()
          : String(reason ?? ""),
      },
      "OpenAI Realtime web call sideband websocket closed",
    );
    clearWebOpeningGreetingTimer(input.session);
    void finishWebCallSession(
      input.server,
      input.session,
      "provider_socket_closed",
    ).catch((error: unknown) => {
      input.server.log.error(
        {
          err: error,
          callId: input.session.callId,
          providerCallId: input.session.providerCallId,
        },
        "Failed to finalize web voice session after sideband close",
      );
    });
  });

  return socket;
}

async function handleSidebandMessage(
  server: FastifyInstance,
  socket: WebSocket,
  session: ActiveWebCall,
  rawMessage: WebSocket.RawData,
): Promise<void> {
  const payload = JSON.parse(rawMessage.toString()) as OpenAiRealtimeMessage;

  if (
    payload.type === "response.function_call_arguments.done" &&
    payload.name &&
    payload.call_id &&
    payload.arguments
  ) {
    await handleToolCall(server, socket, session, {
      name: payload.name,
      callId: payload.call_id,
      arguments: payload.arguments,
    });
    return;
  }

  if (
    payload.type === "response.output_item.done" &&
    payload.item?.type === "function_call" &&
    payload.item.name &&
    payload.item.call_id &&
    payload.item.arguments
  ) {
    await handleToolCall(server, socket, session, {
      name: payload.item.name,
      callId: payload.item.call_id,
      arguments: payload.item.arguments,
    });
    return;
  }

  if (payload.type === "response.done") {
    if (payload.response?.usage) {
      const costUsd = priceUsage(server, payload.response.usage);
      if (costUsd !== null) {
        await recordVoiceAiCost({
          businessId: session.businessId,
          callId: session.callId,
          conversationId: session.conversationId,
          occurredAt: new Date().toISOString(),
          eventKey: `web_voice_ai:response:${session.callId}:${payload.response.id ?? payload.event_id ?? crypto.randomUUID()}`,
          costUsd,
          provider: "openai",
          model: server.runtimeConfig.OPENAI_REALTIME_MODEL,
          operation: "web_voice.response_generation",
        }).catch((error: unknown) => {
          server.log.error(
            {
              err: error,
              businessId: session.businessId,
              callId: session.callId,
            },
            "Failed to persist web voice response AI cost",
          );
        });
      }
    }

    if (
      session.pendingEndCall &&
      payload.response?.metadata?.lobbystack_purpose ===
        WEB_FINAL_MESSAGE_METADATA_PURPOSE
    ) {
      const endCall = session.pendingEndCall;
      clearWebEndCallFallbackTimer(session);
      session.pendingEndCallFallbackTimer = setTimeout(() => {
        session.pendingEndCall = null;
        session.pendingEndCallFallbackTimer = null;
        void finishWebCallSession(server, session, endCall.reason).catch(
          (error: unknown) => {
            server.log.error(
              {
                err: error,
                callId: session.callId,
                providerCallId: session.providerCallId,
                reason: endCall.reason,
              },
              "Failed to finalize web voice session after final-message playback grace",
            );
          },
        );
      }, getWebFinalMessagePlaybackGraceMs(endCall.message));
      session.pendingEndCallFallbackTimer.unref?.();
      return;
    }

    if (session.openingGreetingActive) {
      scheduleWebRealtimeTurnDetectionEnable(
        server,
        socket,
        session,
        "response_done",
      );
    }
    return;
  }

  if (
    payload.type === "conversation.item.input_audio_transcription.completed"
  ) {
    await persistWebTranscriptIfNew(
      server,
      session,
      `caller-completed:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.transcript ?? ""}`,
      {
        speaker: "caller",
        text: payload.transcript,
      },
    );
    await flushPendingWebAssistantTranscripts(server, session);
    return;
  }

  if (
    payload.type === "response.audio_transcript.done" ||
    payload.type === "response.output_audio_transcript.done"
  ) {
    const dedupeKey = `assistant-output-transcript:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.transcript ?? ""}`;
    if (session.openingGreetingActive) {
      await persistWebTranscriptIfNew(server, session, dedupeKey, {
        speaker: "assistant",
        text: payload.transcript,
      });
      return;
    }

    queueWebAssistantTranscript(server, session, dedupeKey, payload.transcript);
    return;
  }

  if (payload.type === "conversation.item.input_audio_transcription.failed") {
    server.log.warn(
      {
        callId: session.callId,
        providerCallId: session.providerCallId,
        itemId: payload.item_id,
        code: payload.error?.code,
        message: payload.error?.message,
      },
      "OpenAI Realtime web call input audio transcription failed",
    );
    return;
  }

  if (payload.type === "input_audio_buffer.speech_started") {
    if (session.openingGreetingActive) {
      server.log.info(
        {
          callId: session.callId,
          providerCallId: session.providerCallId,
        },
        "Ignored web voice speech detection during opening greeting",
      );
      return;
    }
    return;
  }

  if (payload.type === "error") {
    server.log.warn(
      {
        callId: session.callId,
        providerCallId: session.providerCallId,
        code: payload.error?.code,
        message: payload.error?.message,
      },
      "OpenAI Realtime web call sideband error",
    );
  }
}

async function handleToolCall(
  server: FastifyInstance,
  socket: WebSocket,
  session: ActiveWebCall,
  toolCall: { name: string; callId: string; arguments: string },
): Promise<void> {
  if (session.handledToolCallIds.has(toolCall.callId)) {
    return;
  }
  session.handledToolCallIds.add(toolCall.callId);

  if (
    session.sessionMode === "prospect_demo" &&
    !PROSPECT_DEMO_INTAKE_TOOL_NAMES.has(toolCall.name)
  ) {
    postRealtimeEvent(socket, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: toolCall.callId,
        output: JSON.stringify({
          ok: false,
          error:
            "This demo can answer questions and collect a sample request, but cannot book, transfer, or send messages.",
        }),
      },
    });
    postRealtimeEvent(socket, { type: "response.create" });
    return;
  }

  let executed: Awaited<ReturnType<typeof executeVoiceTool>>;
  try {
    const context = await fetchWebVoiceContext({
      businessSlug: session.businessSlug,
      ...(session.prospectDemoToken !== undefined
        ? { prospectDemoToken: session.prospectDemoToken }
        : {}),
      ...(session.dashboardTestCallToken !== undefined
        ? { dashboardTestCallToken: session.dashboardTestCallToken }
        : {}),
    });
    executed = await executeVoiceTool({
      toolName: toolCall.name,
      rawArguments: toolCall.arguments,
      snapshot: context.snapshot,
      businessId: session.businessId,
      callId: session.callId,
      conversationId: session.conversationId,
      callerPhone: "web",
      channel: "web_voice",
    });
  } catch (error) {
    server.log.error(
      {
        err: error,
        callId: session.callId,
        providerCallId: session.providerCallId,
        toolName: toolCall.name,
      },
      "Failed to execute web voice tool call",
    );
    postRealtimeEvent(socket, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: toolCall.callId,
        output: JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown tool error",
        }),
      },
    });
    postRealtimeEvent(socket, { type: "response.create" });
    return;
  }

  postRealtimeEvent(socket, {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: toolCall.callId,
      output: JSON.stringify(executed.result),
    },
  });

  if (executed.suppressResponse) {
    postRealtimeEvent(socket, { type: "input_audio_buffer.clear" });
    return;
  }

  if (executed.endCall) {
    requestWebFinalMessageBeforeHangup(
      server,
      socket,
      session,
      executed.endCall,
    );
    return;
  }

  postRealtimeEvent(socket, { type: "response.create" });
}

export function registerWebCallRoutes(server: FastifyInstance): void {
  const webRecordingBodyLimit = getWebRecordingBodyLimit(
    server.runtimeConfig.WEB_CALL_MAX_DURATION_MS,
  );

  server.addContentTypeParser(
    /^audio\/.*/,
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );
  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  const handleCorsPreflight = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const origin = getRequestOrigin(request);
    if (!isAllowedOrigin(server, origin)) {
      reply.code(403);
      return "Forbidden";
    }
    addCorsHeaders(reply, origin!);
    return "";
  };

  server.options("/web-call/sessions", handleCorsPreflight);
  server.options("/web-call/sessions/:sessionId/end", handleCorsPreflight);
  server.options(
    "/web-call/sessions/:sessionId/recording",
    handleCorsPreflight,
  );

  server.post(
    "/web-call/sessions",
    {
      config: {
        rateLimit: {
          max: WEB_CALL_SESSION_START_RATE_LIMIT_MAX,
          timeWindow: WEB_CALL_SESSION_START_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
      const origin = getRequestOrigin(request);
      if (!isAllowedOrigin(server, origin)) {
        reply.code(403);
        return "Forbidden";
      }
      addCorsHeaders(reply, origin!);

      if (!server.runtimeConfig.OPENAI_API_KEY) {
        reply.code(503);
        return { error: "Web voice is not configured." };
      }

      const parsedBody = parseWebCallSessionRequest(request.body ?? {});
      if (!parsedBody.ok) {
        reply.code(400);
        return { error: parsedBody.message };
      }
      const body = parsedBody.data;
      const businessSlug = body.businessSlug;

      const gatewaySessionId = crypto.randomUUID();
      const widgetId = normalizeOptionalAbuseKey(body.widgetId);
      const visitorId = normalizeOptionalAbuseKey(body.visitorId);
      const ipHash = hashAbuseKey(server, getClientIp(request));
      const dashboardTestCallToken =
        widgetId === DASHBOARD_TEST_CALL_WIDGET_ID &&
        verifyDashboardTestCallProof({
          businessSlug,
          proof: body.dashboardTestCallProof,
          token: server.runtimeConfig.DASHBOARD_TEST_CALL_TOKEN,
        })
          ? server.runtimeConfig.DASHBOARD_TEST_CALL_TOKEN?.trim()
          : undefined;
      let context: Awaited<ReturnType<typeof fetchWebVoiceContext>>;
      try {
        context = await fetchWebVoiceContext({
          businessSlug,
          origin: origin!,
          ...(dashboardTestCallToken !== undefined
            ? { dashboardTestCallToken }
            : {}),
          ...(ipHash !== undefined ? { ipHash } : {}),
          ...(visitorId !== undefined ? { visitorId } : {}),
          ...(widgetId !== undefined ? { widgetId } : {}),
          ...(body.prospectDemoToken !== undefined
            ? { prospectDemoToken: body.prospectDemoToken }
            : {}),
        });
      } catch (error) {
        if (error instanceof RuntimeRequestError) {
          server.log.warn(
            {
              businessSlug,
              code: error.code,
              origin,
              status: error.status,
            },
            "Web call context lookup failed",
          );
          return replyWithRuntimeRequestError(error, reply);
        }
        throw error;
      }
      let exchange: Awaited<ReturnType<typeof exchangeWebRtcOffer>>;
      try {
        exchange = await exchangeWebRtcOffer({
          apiKey: server.runtimeConfig.OPENAI_API_KEY,
          model: server.runtimeConfig.OPENAI_REALTIME_MODEL,
          sdp: body.sdp,
        });
      } catch (error) {
        if (error instanceof OpenAiWebRtcSetupError) {
          server.log.error(
            {
              err: error,
              status: error.status,
              responseBody: error.responseBody.slice(0, 1_000),
              businessSlug,
            },
            "OpenAI Realtime WebRTC setup failed for web call",
          );
        }
        throw error;
      }
      const providerCallId = exchange.providerCallId.startsWith("webcall_")
        ? `webcall_${gatewaySessionId}`
        : exchange.providerCallId;

      const startedAt = new Date().toISOString();
      let call: Awaited<ReturnType<typeof startWebVoiceCall>>;
      try {
        call = await startWebVoiceCall({
          businessSlug,
          providerCallId,
          gatewaySessionId,
          ...(body.pageUrl !== undefined ? { originUrl: body.pageUrl } : {}),
          ...(typeof request.headers["user-agent"] === "string"
            ? { userAgent: request.headers["user-agent"] }
            : {}),
          ...(widgetId !== undefined ? { widgetId } : {}),
          maxDurationMs: server.runtimeConfig.WEB_CALL_MAX_DURATION_MS,
          startedAt,
          ...(body.prospectDemoToken !== undefined
            ? { prospectDemoToken: body.prospectDemoToken }
            : {}),
          ...(dashboardTestCallToken !== undefined
            ? { dashboardTestCallToken }
            : {}),
        });
      } catch (error) {
        await hangupOpenAiRealtimeProviderCall(server, {
          providerCallId,
          reason: "convex_start_failed",
        });
        if (error instanceof RuntimeRequestError) {
          return replyWithRuntimeRequestError(error, reply);
        }
        throw error;
      }

      const session: ActiveWebCall = {
        gatewaySessionId,
        businessSlug,
        businessId: call.businessId,
        callId: call.callId,
        conversationId: call.conversationId,
        providerCallId,
        startedAtMs: Date.parse(startedAt),
        handledToolCallIds: new Set(),
        sidebandSocket: null,
        maxDurationTimer: null,
        finalized: false,
        openingGreetingActive: true,
        openingGreetingTurnDetectionTimer: null,
        seenTranscriptKeys: new Set(),
        transcriptSequence: 1,
        pendingAssistantTranscriptFlushTimer: null,
        pendingAssistantTranscripts: [],
        pendingEndCall: null,
        pendingEndCallFallbackTimer: null,
        ...(context.sessionMode === "prospect_demo"
          ? { sessionMode: "prospect_demo" as const }
          : {}),
        ...(body.prospectDemoToken !== undefined
          ? { prospectDemoToken: body.prospectDemoToken }
          : {}),
        ...(dashboardTestCallToken !== undefined
          ? { dashboardTestCallToken }
          : {}),
      };
      const sidebandSocket = createSidebandSocket({
        server,
        session,
        snapshot: context.snapshot,
      });
      session.sidebandSocket = sidebandSocket;
      activeWebCalls.set(gatewaySessionId, session);
      scheduleWebMaxDurationTimer(server, session);

      return {
        sessionId: gatewaySessionId,
        sdp: exchange.answerSdp,
      };
    },
  );

  server.post<{
    Params: { sessionId: string };
  }>("/web-call/sessions/:sessionId/end", async (request, reply) => {
    const origin = getRequestOrigin(request);
    if (!isAllowedOrigin(server, origin)) {
      reply.code(403);
      return "Forbidden";
    }
    addCorsHeaders(reply, origin!);

    const session = activeWebCalls.get(request.params.sessionId);
    if (!session) {
      await finishDurableWebCallSession(
        server,
        request.params.sessionId,
        "caller_finished",
      );
      reply.code(204);
      return null;
    }

    await finishWebCallSession(server, session, "caller_finished");
    reply.code(204);
    return null;
  });

  server.post<{
    Params: { sessionId: string };
    Querystring: { durationMs?: string };
  }>(
    "/web-call/sessions/:sessionId/recording",
    { bodyLimit: webRecordingBodyLimit },
    async (request, reply) => {
      const origin = getRequestOrigin(request);
      if (!isAllowedOrigin(server, origin)) {
        reply.code(403);
        return "Forbidden";
      }
      addCorsHeaders(reply, origin!);

      const webCall = await resolveWebCallForRecording(
        request.params.sessionId,
        server.runtimeConfig.WEB_CALL_MAX_DURATION_MS,
      );
      if (!webCall) {
        reply.code(404);
        return { error: "Unknown web voice session." };
      }

      const audio = await readRequestBodyBuffer(request);
      if (audio.length === 0) {
        reply.code(400);
        return { error: "Missing recording audio." };
      }

      const durationMs = getWebRecordingDurationMs(
        webCall,
        request.query.durationMs,
        server.runtimeConfig.WEB_CALL_MAX_DURATION_MS,
      );
      const contentTypeHeader = request.headers["content-type"];
      const contentType = Array.isArray(contentTypeHeader)
        ? contentTypeHeader[0]
        : contentTypeHeader;

      await uploadVoiceRecording({
        callId: webCall.callId,
        durationMs,
        audio,
        ...(contentType ? { contentType } : {}),
      });

      reply.code(204);
      return null;
    },
  );
}
