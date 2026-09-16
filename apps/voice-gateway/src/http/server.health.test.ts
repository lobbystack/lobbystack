import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

const probeBackendReachabilityMock = vi.hoisted(() => vi.fn());

vi.mock("../health/backendReachability", () => ({
  probeBackendReachability: probeBackendReachabilityMock,
}));

import { createServer } from "./server";

const internalServiceToken = "test-internal-service-token-at-least-32-characters";

describe("/health/backend", () => {
  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = "self_hosted_standard";
    process.env.NODE_ENV = "production";
    process.env.VOICE_GATEWAY_BASE_URL = "http://127.0.0.1:3001";
    process.env.BACKEND_INTERNAL_URL = "http://admin:3000";
    process.env.INTERNAL_SERVICE_TOKEN = internalServiceToken;
    process.env.INTERNAL_SERVICE_SECRET = "test-internal-service-secret-at-least-32-characters";
    probeBackendReachabilityMock.mockResolvedValue({ ok: true, status: 404 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.VOICE_GATEWAY_BASE_URL;
    delete process.env.BACKEND_INTERNAL_URL;
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.INTERNAL_SERVICE_SECRET;
    delete process.env.LOBBYSTACK_MAINTENANCE_MODE;
  });

  it("returns reachability status for private-network requests", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "GET",
      url: "/health/backend",
      headers: {
        "x-internal-service-token": internalServiceToken,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, status: 404 });
    expect(probeBackendReachabilityMock).toHaveBeenCalledWith({
      backendUrl: "http://admin:3000",
      internalServiceSecret: "test-internal-service-secret-at-least-32-characters",
      serviceId: "lobbystack-voice-gateway",
    });
  });

  it("hides the route from public addresses", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "GET",
      url: "/health/backend",
      remoteAddress: "203.0.113.10",
      headers: {
        "x-internal-service-token": internalServiceToken,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false });
    expect(probeBackendReachabilityMock).not.toHaveBeenCalled();
  });

  it("hides the route when the token is missing", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "GET",
      url: "/health/backend",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false });
    expect(probeBackendReachabilityMock).not.toHaveBeenCalled();
  });

  it("returns 503 without exposing backend diagnostics", async () => {
    probeBackendReachabilityMock.mockResolvedValueOnce({
      ok: false,
      error: `failed for http://admin:3000 using ${internalServiceToken}`,
      status: 401,
    });

    const server = createServer();
    const response = await server.inject({
      method: "GET",
      url: "/health/backend",
      headers: {
        "x-internal-service-token": internalServiceToken,
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      ok: false,
      status: 401,
    });
    expect(JSON.stringify(response.json())).not.toContain("admin:3000");
    expect(JSON.stringify(response.json())).not.toContain(internalServiceToken);
  });
});

describe("voice gateway health", () => {
  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = "self_hosted_standard";
    process.env.NODE_ENV = "production";
    process.env.VOICE_GATEWAY_BASE_URL = "http://127.0.0.1:3001";
    process.env.BACKEND_INTERNAL_URL = "http://admin:3000";
    process.env.INTERNAL_SERVICE_TOKEN = internalServiceToken;
    process.env.INTERNAL_SERVICE_SECRET = "test-internal-service-secret-at-least-32-characters";
    probeBackendReachabilityMock.mockResolvedValue({ ok: true, status: 404 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.VOICE_GATEWAY_BASE_URL;
    delete process.env.BACKEND_INTERNAL_URL;
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.INTERNAL_SERVICE_SECRET;
    delete process.env.LOBBYSTACK_MAINTENANCE_MODE;
  });

  it("is ready when the required backend is reachable", async () => {
    const server = createServer();
    const response = await server.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "lobbystack-voice-gateway" });
    expect(probeBackendReachabilityMock).toHaveBeenCalledOnce();
  });

  it("is not ready when the required backend is unavailable without exposing secrets", async () => {
    probeBackendReachabilityMock.mockResolvedValueOnce({
      ok: false,
      error: `failed for http://admin:3000 using ${internalServiceToken}`,
    });

    const server = createServer();
    const response = await server.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, service: "lobbystack-voice-gateway" });
    expect(response.body).not.toContain("admin:3000");
    expect(response.body).not.toContain(internalServiceToken);
  });

  it("keeps liveness cheap and independent of the backend", async () => {
    const server = createServer();
    const response = await server.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "lobbystack-voice-gateway" });
    expect(probeBackendReachabilityMock).not.toHaveBeenCalled();
  });

  it("isolates all non-liveness HTTP routes during maintenance", async () => {
    process.env.LOBBYSTACK_MAINTENANCE_MODE = "true";
    const server = createServer();

    const [live, ready, voice] = await Promise.all([
      server.inject({ method: "GET", url: "/health/live" }),
      server.inject({ method: "GET", url: "/health/ready" }),
      server.inject({ method: "GET", url: "/twilio/voice/inbound" }),
    ]);

    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
    expect(voice.statusCode).toBe(503);
    expect(probeBackendReachabilityMock).not.toHaveBeenCalled();
  });

  it("rejects media stream upgrades during maintenance", () => {
    process.env.LOBBYSTACK_MAINTENANCE_MODE = "true";
    const server = createServer();
    const socket = { destroy: vi.fn(), write: vi.fn() };

    server.server.emit(
      "upgrade",
      { headers: {}, url: "/media-stream" } as IncomingMessage,
      socket as unknown as Socket,
      Buffer.alloc(0),
    );

    expect(socket.write).toHaveBeenCalledWith("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
    expect(socket.destroy).toHaveBeenCalledOnce();
  });
});
