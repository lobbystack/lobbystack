import fastifyFormbody from "@fastify/formbody";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { context, SpanKind, SpanStatusCode, trace, type Span } from "@opentelemetry/api";

import { loadVoiceGatewayEnv } from "@lobbystack/config";
import type { BusinessContextSnapshot } from "@lobbystack/shared";
import { extractTraceContext, getTracer, recordException } from "@lobbystack/telemetry/node";

import { handleMediaStreamConnection } from "../telephony/mediaStream";
import { registerVoiceRoutes } from "../telephony/routes";
import { registerWebCallRoutes } from "../webCall/routes";
import { probeBackendReachability } from "../health/backendReachability";
import { isPrivateNetworkAddress } from "../health/internalRequest";
import { validateMediaStreamSignature } from "../telephony/twilioRequest";
import {
  capturePostHogException,
  recordTwilioInvalidSignature,
} from "../observability/posthog";
import { createSnapshotCache } from "../sessions/snapshotCache";

export function createServer(): ReturnType<typeof Fastify> {
  const env = loadVoiceGatewayEnv(process.env);
  const server = Fastify({
    logger: true,
    trustProxy: env.VOICE_GATEWAY_TRUST_PROXY,
  });

  const cache = createSnapshotCache();
  const requestSpans = new WeakMap<object, Span>();

  server.decorate("snapshotCache", cache);
  server.decorate("runtimeConfig", env);

  server.register(fastifyFormbody);
  server.register(fastifyRateLimit, {
    global: false,
  });
  server.addHook("onRequest", (request, _reply, done) => {
    const parent = extractTraceContext(Object.fromEntries(Object.entries(request.headers).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : Array.isArray(value) && value[0] ? [[key, value[0]]] : [])));
    const span = getTracer("lobbystack-voice-gateway").startSpan(`http.${request.method.toLowerCase()}`, {
      kind: SpanKind.SERVER,
      attributes: {
        "http.request.method": request.method,
        "url.path": request.url.split("?")[0] ?? "/",
      },
    }, parent);
    requestSpans.set(request, span);
    context.with(trace.setSpan(parent, span), done);
  });
  server.addHook("onResponse", async (request, reply) => {
    const span = requestSpans.get(request);
    if (!span) return;
    span.setAttribute("http.response.status_code", reply.statusCode);
    if (reply.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    requestSpans.delete(request);
  });
  server.addHook("onError", async (request, _reply, error) => {
    const span = requestSpans.get(request);
    if (span) recordException(error, { "http.request.method": request.method, "url.path": request.url.split("?")[0] ?? "/" }, span);
    capturePostHogException(error, {
      properties: {
        operation: "fastify_request",
        method: request.method,
        path: request.routeOptions.url ?? request.url,
        statusCode:
          typeof (error as { statusCode?: unknown }).statusCode === "number"
            ? ((error as { statusCode?: number }).statusCode ?? 500)
            : 500,
      },
    });
  });

  const mediaStreamServer = new WebSocketServer({ noServer: true });
  server.server.on("upgrade", (request, socket, head) => {
    const requestUrl = request.url ?? "";
    const pathname = requestUrl.split("?")[0];

    if (pathname !== "/media-stream") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const hasValidTwilioSignature = validateMediaStreamSignature({
      authToken: env.TWILIO_AUTH_TOKEN,
      signatureHeader: request.headers["x-twilio-signature"],
      baseUrl: env.VOICE_GATEWAY_BASE_URL,
      path: pathname,
    });
    if (!hasValidTwilioSignature) {
      recordTwilioInvalidSignature({
        "lobbystack.path": pathname,
      });
      server.log.warn(
        {
          path: pathname,
          host: request.headers.host,
        },
        "Rejected Twilio Media Stream upgrade with invalid signature",
      );
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!env.OPENAI_API_KEY) {
      server.log.error("OPENAI_API_KEY is required for live voice calls.");
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    mediaStreamServer.handleUpgrade(request, socket, head, (ws) => {
      void handleMediaStreamConnection(server, ws, {
        url: requestUrl,
        headers: request.headers,
      });
    });
  });

  const healthResponse = async () => ({ ok: true, service: "lobbystack-voice-gateway" });
  server.get("/health", healthResponse);
  server.get("/health/live", healthResponse);
  server.get("/health/ready", healthResponse);

  server.get("/health/backend", async (request, reply) => {
    const peerAddress = request.socket.remoteAddress;
    if (!isPrivateNetworkAddress(peerAddress ?? request.ip)) {
      return reply.status(404).send({ ok: false });
    }

    const internalTokenHeader = request.headers["x-internal-service-token"];
    const internalToken =
      typeof internalTokenHeader === "string"
        ? internalTokenHeader
        : Array.isArray(internalTokenHeader)
          ? internalTokenHeader[0]
          : undefined;
    if (!internalToken || internalToken !== env.INTERNAL_SERVICE_TOKEN) {
      return reply.status(404).send({ ok: false });
    }

    const result = await probeBackendReachability({
      backendUrl: env.BACKEND_INTERNAL_URL,
      internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    });

    if (!result.ok) {
      return reply.status(503).send({
        ok: false,
        error: result.error,
        status: result.status,
      });
    }

    return {
      ok: true,
      status: result.status,
    };
  });

  server.after((error) => {
    if (error) {
      throw error;
    }
    registerVoiceRoutes(server);
    registerWebCallRoutes(server);
  });
  return server;
}

declare module "fastify" {
  interface FastifyInstance {
    snapshotCache: {
      get: (businessId: string) => BusinessContextSnapshot | null;
      set: (businessId: string, snapshot: BusinessContextSnapshot) => void;
    };
    runtimeConfig: ReturnType<typeof loadVoiceGatewayEnv>;
  }
}
