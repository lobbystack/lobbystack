import { describe, expect, it, vi } from "vitest";

import { probeBackendReachability } from "./backendReachability";

describe("probeBackendReachability", () => {
  it("accepts the signed readiness marker", async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      ok: true,
      service: "lobbystack-voice",
      readiness: "ready",
    }));

    await expect(
      probeBackendReachability({
        backendUrl: "http://admin:3000",
        internalServiceSecret: "secret",
        serviceId: "voice",
        fetchImpl,
      }),
    ).resolves.toEqual({ ok: true, status: 200 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://admin:3000/voice/ready",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-service-id": "voice",
          "x-service-signature": expect.any(String),
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          "x-internal-service-token": expect.anything(),
        }),
      }),
    );
  });

  it("reports auth mismatch as unreachable", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));

    await expect(
      probeBackendReachability({
        backendUrl: "http://admin:3000/",
        internalServiceSecret: "secret",
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "internal_service_token_mismatch",
      status: 401,
    });
  });

  it("rejects a 404 or an unexpected success response", async () => {
    const notFound = vi.fn(async () => new Response(null, { status: 404 }));
    const wrongUpstream = vi.fn(async () => Response.json({ ok: true }));

    await expect(
      probeBackendReachability({
        backendUrl: "http://admin:3000",
        internalServiceSecret: "secret",
        fetchImpl: notFound,
      }),
    ).resolves.toEqual({ ok: false, error: "unexpected_status", status: 404 });

    await expect(
      probeBackendReachability({
        backendUrl: "http://admin:3000",
        internalServiceSecret: "secret",
        fetchImpl: wrongUpstream,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_readiness_response", status: 200 });
  });

  it("reports network failures without exposing diagnostics", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED http://admin:3000?token=secret");
    });

    const result = await probeBackendReachability({
      backendUrl: "http://127.0.0.1:3000",
      internalServiceSecret: "secret",
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      error: "backend_unreachable",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("uses the supplied timeout", async () => {
    let requestInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestInit = init;
      return Response.json({
        ok: true,
        service: "lobbystack-voice",
        readiness: "ready",
      });
    };

    await expect(
      probeBackendReachability({
        backendUrl: "http://127.0.0.1:3000",
        internalServiceSecret: "secret",
        timeoutMs: 25,
        fetchImpl,
      }),
    ).resolves.toEqual({ ok: true, status: 200 });

    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });
});
