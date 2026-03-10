import fastifyFormbody from "@fastify/formbody";
import Fastify from "fastify";
import { WebSocketServer } from "ws";

import { loadVoiceGatewayEnv } from "@ai-receptionist/config";
import type { BusinessContextSnapshot } from "@ai-receptionist/shared";

import { handleMediaStreamConnection } from "../telephony/mediaStream";
import { registerVoiceRoutes } from "../telephony/routes";
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

  const mediaStreamServer = new WebSocketServer({ noServer: true });
  server.server.on("upgrade", (request, socket, head) => {
    const requestUrl = request.url ?? "";
    const pathname = requestUrl.split("?")[0];

    if (pathname !== "/media-stream") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
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

  server.get("/internal/context/:businessId", async (request) => {
    const params = request.params as { businessId: string };
    const snapshot = cache.get(params.businessId);
    return { snapshot };
  });

  registerVoiceRoutes(server);
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
