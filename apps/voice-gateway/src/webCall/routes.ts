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
};

const activeWebCalls = new Map<string, ActiveWebCall>();
const originStartAttempts = new Map<string, Array<number>>();

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

async function finishWebCallSession(
  session: ActiveWebCall,
  disposition: string,
): Promise<void> {
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
  session.sidebandSocket?.close(1000, "web call ended");
  activeWebCalls.delete(session.gatewaySessionId);
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
          "Ask for a phone number before booking an appointment, taking a callback message, or discussing existing appointments.",
          "Do not attempt phone transfer from the website widget.",
          "End the session with endCall when the visitor is clearly finished, abusive, spammy, or repeatedly silent.",
        ].join("\n\n"),
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: {
              model: input.server.runtimeConfig.OPENAI_TRANSCRIPTION_MODEL,
            },
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
    activeWebCalls.delete(input.session.gatewaySessionId);
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

  if (payload.type === "response.done" && payload.response?.usage) {
    const costUsd = priceUsage(server, payload.response.usage);
    if (costUsd === null) {
      return;
    }
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

  if (executed.endCall) {
    await finishWebCallSession(session, executed.endCall.reason);
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
    };
    const sidebandSocket = createSidebandSocket({
      server,
      session,
      snapshot: context.snapshot,
    });
    session.sidebandSocket = sidebandSocket;
    activeWebCalls.set(gatewaySessionId, session);

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

    await finishWebCallSession(session, "caller_finished");
    reply.code(204);
    return null;
  });
}
