import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probeConvexSiteReachabilityMock = vi.hoisted(() => vi.fn());

vi.mock("../health/convexReachability", () => ({
  probeConvexSiteReachability: probeConvexSiteReachabilityMock,
}));

import { createServer } from "./server";

describe("/health/convex", () => {
  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = "self_hosted_standard";
    process.env.NODE_ENV = "production";
    process.env.VOICE_GATEWAY_BASE_URL = "http://127.0.0.1:3001";
    process.env.CONVEX_SITE_URL = "http://convex-backend:3211";
    process.env.INTERNAL_SERVICE_TOKEN = "test-service-token";
    probeConvexSiteReachabilityMock.mockResolvedValue({ ok: true, status: 404 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.VOICE_GATEWAY_BASE_URL;
    delete process.env.CONVEX_SITE_URL;
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it("returns reachability status for private-network requests", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "GET",
      url: "/health/convex",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, status: 404 });
    expect(probeConvexSiteReachabilityMock).toHaveBeenCalledWith({
      convexSiteUrl: "http://convex-backend:3211",
      internalServiceToken: "test-service-token",
    });
  });

  it("hides the route from public addresses", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "GET",
      url: "/health/convex",
      remoteAddress: "203.0.113.10",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false });
    expect(probeConvexSiteReachabilityMock).not.toHaveBeenCalled();
  });

  it("returns 503 without exposing the configured Convex site URL", async () => {
    probeConvexSiteReachabilityMock.mockResolvedValueOnce({
      ok: false,
      error: "internal_service_token_mismatch",
      status: 401,
    });

    const server = createServer();
    const response = await server.inject({
      method: "GET",
      url: "/health/convex",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      ok: false,
      error: "internal_service_token_mismatch",
      status: 401,
    });
    expect(JSON.stringify(response.json())).not.toContain("convex-backend");
  });
});
