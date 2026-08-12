import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

const { injectTraceContext } = vi.hoisted(() => ({
  injectTraceContext: vi.fn((headers: Record<string, string>) => ({
    ...headers,
    traceparent: "00-00000000000000000000000000000001-0000000000000001-01",
    tracestate: "lobbystack=test",
  })),
}));

vi.mock("@lobbystack/telemetry/node", () => ({ injectTraceContext }));

import { signedBackendBinaryHeaders, signedBackendHeaders } from "./request";

describe("signed backend request headers", () => {
  it("preserves the HMAC contract and injects active W3C trace context", () => {
    const body = JSON.stringify({ callId: "call-1" });
    const headers = signedBackendHeaders({ serviceId: "voice", secret: "secret", body, timestamp: 123, nonce: "nonce" });
    const hash = createHash("sha256").update(body).digest("hex");

    expect(headers).toMatchObject({
      "content-type": "application/json",
      "x-service-id": "voice",
      "x-service-timestamp": "123",
      "x-service-nonce": "nonce",
      "x-body-sha256": hash,
      "x-service-signature": createHmac("sha256", "secret").update(`voice.123.nonce.${hash}`).digest("hex"),
      traceparent: "00-00000000000000000000000000000001-0000000000000001-01",
      tracestate: "lobbystack=test",
    });
    expect(injectTraceContext).toHaveBeenCalledOnce();
  });

  it("keeps the binary content type while propagating trace context", () => {
    const headers = signedBackendBinaryHeaders({ serviceId: "voice", secret: "secret", body: new Uint8Array([1, 2]), contentType: "audio/wav" });
    expect(headers["content-type"]).toBe("audio/wav");
    expect(headers.traceparent).toBeDefined();
  });
});
