import { createServer, type Server } from "node:http";

export type WorkerHealthState = {
  ready: boolean;
  redis: boolean;
  database: boolean;
  storage: boolean;
  activeJobs: number;
};

export function startHealthServer(port: number, state: WorkerHealthState): Server {
  const server = createServer((request, response) => {
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
  server.listen(port, "0.0.0.0");
  return server;
}
