import { describe, expect, it, vi } from "vitest";

import { probeConvexSiteReachability } from "./convexReachability";

describe("probeConvexSiteReachability", () => {
  it("treats 404 from /voice/context as reachable", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(
      probeConvexSiteReachability({
        convexSiteUrl: "http://convex-backend:3211",
        internalServiceToken: "token",
        fetchImpl,
      }),
    ).resolves.toEqual({ ok: true, status: 404 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://convex-backend:3211/voice/context",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-internal-service-token": "token",
        }),
      }),
    );
  });

  it("reports auth mismatch as unreachable", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));

    await expect(
      probeConvexSiteReachability({
        convexSiteUrl: "http://convex-backend:3211/",
        internalServiceToken: "token",
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "internal_service_token_mismatch",
      status: 401,
    });
  });

  it("reports network failures as unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    await expect(
      probeConvexSiteReachability({
        convexSiteUrl: "http://127.0.0.1:3211",
        internalServiceToken: "token",
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "connect ECONNREFUSED",
    });
  });
});
