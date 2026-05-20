import fastifyFormbody from "@fastify/formbody";
import Fastify from "fastify";
import { WebSocketServer } from "ws";

import { loadVoiceGatewayEnv } from "@lobbystack/config";
import type { BusinessContextSnapshot } from "@lobbystack/shared";

import { handleMediaStreamConnection } from "../telephony/mediaStream";
import { registerVoiceRoutes } from "../telephony/routes";
import { registerWebCallRoutes } from "../webCall/routes";
import { validateMediaStreamSignature } from "../telephony/twilioRequest";
import {
  capturePostHogException,
  recordTwilioInvalidSignature,
} from "../observability/posthog";
import { createSnapshotCache } from "../sessions/snapshotCache";

export function createServer(): ReturnType<typeof Fastify> {
  const server = Fastify({
    logger: true,
  });

  const env = loadVoiceGatewayEnv(process.env);
  const cache = createSnapshotCache();

  server.decorate("snapshotCache", cache);
  server.decorate("runtimeConfig", env);

  server.register(fastifyFormbody);
  server.addHook("onError", async (request, _reply, error) => {
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

  server.get("/health", async () => {
    return { ok: true };
  });

  registerVoiceRoutes(server);
  registerWebCallRoutes(server);
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
