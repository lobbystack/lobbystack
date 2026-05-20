import { createHash } from "node:crypto";

import { buildVoiceSystemPrompt } from "@lobbystack/ai";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import WebSocket from "ws";

import {
  completeVoiceCall,
  fetchWebVoiceContext,
  recordVoiceAiCost,
  RuntimeRequestError,
  startWebVoiceCall,
} from "../convex/runtimeClient";
import { capturePostHogException } from "../observability/posthog";
import { executeVoiceTool } from "../realtime/toolExecutor";
import { createWebRealtimeToolDefinitions } from "../realtime/toolDefinitions";

type WebCallSessionRequest = {
  businessSlug?: string;
  widgetId?: string;
  sdp?: string;
  pageUrl?: string;
  visitorId?: string;
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
  transcript?: string;
  response?: {
    id?: string;
    status?: string;
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

type RealtimeUsageMetrics = NonNullable<OpenAiRealtimeMessage["response"]>["usage"];

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
};

const activeWebCalls = new Map<string, ActiveWebCall>();
const originStartAttempts = new Map<string, Array<number>>();
const WEB_REALTIME_VAD_THRESHOLD = 0.65;
const WEB_REALTIME_VAD_PREFIX_PADDING_MS = 300;
const WEB_REALTIME_VAD_SILENCE_DURATION_MS = 700;
const WEB_POST_GREETING_INPUT_GRACE_MS = 2_000;

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

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function isAllowedOrigin(server: FastifyInstance, origin: string | null): boolean {
  if (!origin) {
    return false;
  }
  const allowedOrigins = getAllowedOrigins(server.runtimeConfig.WEB_CALL_ALLOWED_ORIGINS);
  return allowedOrigins.has(origin) || isLocalhostOrigin(origin);
}

function addCorsHeaders(reply: FastifyReply, origin: string): void {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
  reply.header("Vary", "Origin");
}

function isRateLimited(origin: string, nowMs = Date.now()): boolean {
  const windowMs = 60_000;
  const maxStarts = 12;
  const recent = (originStartAttempts.get(origin) ?? []).filter(
    (timestamp) => nowMs - timestamp < windowMs,
  );
  recent.push(nowMs);
  originStartAttempts.set(origin, recent);
  return recent.length > maxStarts;
}

export function createWebRealtimeTurnDetectionConfig(options: {
  createResponse?: boolean;
  interruptResponse?: boolean;
} = {}): Record<string, unknown> {
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

function normalizeOptionalAbuseKey(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, 256);
}

function getClientIp(request: FastifyRequest): string | undefined {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const forwardedIp = forwardedValue?.split(",")[0]?.trim();
  return forwardedIp || request.ip;
}

function hashAbuseKey(server: FastifyInstance, value: string | undefined): string | undefined {
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
): { error: string } {
  reply.code(error.status);
  return { error: error.message };
}

async function hangupOpenAiRealtimeCall(
  server: FastifyInstance,
  session: ActiveWebCall,
  reason: string,
): Promise<void> {
  if (session.providerCallId.startsWith("webcall_")) {
    server.log.warn(
      {
        callId: session.callId,
        providerCallId: session.providerCallId,
        reason,
      },
      "Skipping OpenAI Realtime hangup because no provider call ID was returned",
    );
    return;
  }

  try {
    const response = await fetch(
      `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(
        session.providerCallId,
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
          callId: session.callId,
          providerCallId: session.providerCallId,
          reason,
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
        callId: session.callId,
        providerCallId: session.providerCallId,
        reason,
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
  await hangupOpenAiRealtimeCall(server, session, disposition);

  try {
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
  } finally {
    session.sidebandSocket?.close(1000, "web call ended");
    activeWebCalls.delete(session.gatewaySessionId);
  }
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

function parseProviderCallId(response: Response, gatewaySessionId: string): string {
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

function postRealtimeEvent(socket: WebSocket, payload: Record<string, unknown>): void {
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

  const textInputTokens = usage.input_token_details?.text_tokens ?? 0;
  const audioInputTokens = usage.input_token_details?.audio_tokens ?? 0;
  const cachedInputTokens = usage.input_token_details?.cached_tokens ?? 0;
  const textOutputTokens = usage.output_token_details?.text_tokens ?? 0;
  const audioOutputTokens = usage.output_token_details?.audio_tokens ?? 0;

  const fallbackInputPrice = server.runtimeConfig.OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD;
  const fallbackOutputPrice = server.runtimeConfig.OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD;
  const textInputPrice =
    server.runtimeConfig.OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD ?? fallbackInputPrice;
  const audioInputPrice =
    server.runtimeConfig.OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD ?? fallbackInputPrice;
  const textOutputPrice =
    server.runtimeConfig.OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD ?? fallbackOutputPrice;
  const audioOutputPrice =
    server.runtimeConfig.OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD ?? fallbackOutputPrice;
  const cachedInputPrice =
    server.runtimeConfig.OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD ?? textInputPrice;

  const pricedBuckets = [
    [textInputTokens, textInputPrice],
    [audioInputTokens, audioInputPrice],
    [cachedInputTokens, cachedInputPrice],
    [textOutputTokens, textOutputPrice],
    [audioOutputTokens, audioOutputPrice],
  ] as const;

  const hasAnyPrice = pricedBuckets.some(([, price]) => price !== undefined);
  if (!hasAnyPrice) {
    return null;
  }

  return pricedBuckets.reduce(
    (total, [tokens, price]) => total + tokens * (price ?? 0),
    0,
  );
}

async function exchangeWebRtcOffer(input: {
  apiKey: string;
  model: string;
  sdp: string;
}): Promise<{ answerSdp: string; providerCallId: string }> {
  const response = await fetch(
    `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(input.model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/sdp",
        Accept: "application/sdp",
      },
      body: input.sdp,
    },
  );

  if (!response.ok) {
    throw new Error(`OpenAI Realtime WebRTC setup failed with ${response.status}.`);
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
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      input.server.runtimeConfig.OPENAI_REALTIME_MODEL,
    )}&call_id=${encodeURIComponent(input.session.providerCallId)}`,
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
          "Use the configured greeting only once at the start of the session. Never repeat it after the opening greeting, even after interruptions, silence, or filler speech.",
          "If the latest audio is silence, background noise, echo of your own previous audio, hold music, TV audio, side conversation, or speech not addressed to you, call waitForUser and do not speak.",
          "Ask for a phone number before booking an appointment, taking a callback message, or discussing existing appointments.",
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
        tools: createWebRealtimeToolDefinitions(),
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
    void handleSidebandMessage(input.server, socket, input.session, rawMessage);
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

  socket.on("close", () => {
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
        });
      }
    }

    if (session.openingGreetingActive) {
      scheduleWebRealtimeTurnDetectionEnable(server, socket, session, "response_done");
    }
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

  const context = await fetchWebVoiceContext({
    businessSlug: session.businessSlug,
  });
  const executed = await executeVoiceTool({
    toolName: toolCall.name,
    rawArguments: toolCall.arguments,
    snapshot: context.snapshot,
    businessId: session.businessId,
    callId: session.callId,
    conversationId: session.conversationId,
    callerPhone: "web",
  });

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
    await finishWebCallSession(server, session, executed.endCall.reason);
    return;
  }

  postRealtimeEvent(socket, { type: "response.create" });
}

export function registerWebCallRoutes(server: FastifyInstance): void {
  const handleCorsPreflight = async (request: FastifyRequest, reply: FastifyReply) => {
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

  server.post("/web-call/sessions", async (request, reply) => {
    const origin = getRequestOrigin(request);
    if (!isAllowedOrigin(server, origin)) {
      reply.code(403);
      return "Forbidden";
    }
    addCorsHeaders(reply, origin!);

    if (isRateLimited(origin!)) {
      reply.code(429);
      return { error: "Too many web call starts. Please try again shortly." };
    }

    if (!server.runtimeConfig.OPENAI_API_KEY) {
      reply.code(503);
      return { error: "Web voice is not configured." };
    }

    const body = (request.body ?? {}) as WebCallSessionRequest;
    const businessSlug = body.businessSlug?.trim() || "";
    if (businessSlug !== "lobbystack") {
      reply.code(403);
      return { error: "Unknown web voice widget." };
    }
    if (!body.sdp?.trim()) {
      reply.code(400);
      return { error: "Missing SDP offer." };
    }

    const gatewaySessionId = crypto.randomUUID();
    const widgetId = normalizeOptionalAbuseKey(body.widgetId);
    const visitorId = normalizeOptionalAbuseKey(body.visitorId);
    const ipHash = hashAbuseKey(server, getClientIp(request));
    let context: Awaited<ReturnType<typeof fetchWebVoiceContext>>;
    try {
      context = await fetchWebVoiceContext({
        businessSlug,
        origin: origin!,
        ...(ipHash !== undefined ? { ipHash } : {}),
        ...(visitorId !== undefined ? { visitorId } : {}),
        ...(widgetId !== undefined ? { widgetId } : {}),
      });
    } catch (error) {
      if (error instanceof RuntimeRequestError && error.status === 429) {
        return replyWithRuntimeRequestError(error, reply);
      }
      throw error;
    }
    const exchange = await exchangeWebRtcOffer({
      apiKey: server.runtimeConfig.OPENAI_API_KEY,
      model: server.runtimeConfig.OPENAI_REALTIME_MODEL,
      sdp: body.sdp,
    });
    const providerCallId =
      exchange.providerCallId.startsWith("webcall_")
        ? `webcall_${gatewaySessionId}`
        : exchange.providerCallId;

    const startedAt = new Date().toISOString();
    const call = await startWebVoiceCall({
      businessSlug,
      providerCallId,
      gatewaySessionId,
      ...(body.pageUrl !== undefined ? { originUrl: body.pageUrl } : {}),
      ...(typeof request.headers["user-agent"] === "string"
        ? { userAgent: request.headers["user-agent"] }
        : {}),
      ...(widgetId !== undefined ? { widgetId } : {}),
      startedAt,
    });

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
  });

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
      reply.code(204);
      return null;
    }

    await finishWebCallSession(server, session, "caller_finished");
    reply.code(204);
    return null;
  });
}
