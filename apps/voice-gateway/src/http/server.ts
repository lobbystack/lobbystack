import fastifyFormbody from "@fastify/formbody";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";

import { loadVoiceGatewayEnv } from "@ai-receptionist/config";
import type { BusinessContextSnapshot } from "@ai-receptionist/shared";

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
  server.register(fastifyWebsocket);

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
