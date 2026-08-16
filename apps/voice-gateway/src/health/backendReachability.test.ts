import { describe, expect, it, vi } from "vitest";

import { probeBackendReachability } from "./backendReachability";

describe("probeBackendReachability", () => {
  it("treats 404 from /voice/context as reachable", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(
      probeBackendReachability({
        backendUrl: "http://admin:3000",
        internalServiceToken: "token",
        fetchImpl,
      }),
    ).resolves.toEqual({ ok: true, status: 404 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://admin:3000/voice/context",
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
      probeBackendReachability({
        backendUrl: "http://admin:3000/",
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
      probeBackendReachability({
        backendUrl: "http://127.0.0.1:3000",
        internalServiceToken: "token",
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "connect ECONNREFUSED",
    });
  });
});
