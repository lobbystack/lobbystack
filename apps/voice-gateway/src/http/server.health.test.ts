import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      internalServiceToken,
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

  it("returns 503 without exposing the configured backend URL", async () => {
    probeBackendReachabilityMock.mockResolvedValueOnce({
      ok: false,
      error: "internal_service_token_mismatch",
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
      error: "internal_service_token_mismatch",
      status: 401,
    });
    expect(JSON.stringify(response.json())).not.toContain("admin:3000");
  });
});
