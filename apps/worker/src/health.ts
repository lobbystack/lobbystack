import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type WorkerHealthState = {
  ready: boolean;
  redis: boolean;
  database: boolean;
  storage: boolean;
  activeJobs: number;
};

export type ExtraRouteHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

export function startHealthServer(port: number, state: WorkerHealthState, extraRoutes?: ExtraRouteHandler): Server {
  const server = createServer(async (request, response) => {
    if (extraRoutes && await extraRoutes(request, response)) return;
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path === "/health/live") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (path === "/health/ready") {
      const ok = state.ready && state.redis && state.database && state.storage;
      response.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok, ...state }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  // "::" accepts IPv4 too; Railway private networking reaches the worker over IPv6.
  server.listen(port, "::");
  return server;
}
