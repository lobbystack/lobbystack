import { createHash, createHmac, randomUUID } from "node:crypto";

import { injectTraceContext } from "@lobbystack/telemetry/node";

export type SignedRequestBody = string | Uint8Array;

function bodyHash(body: SignedRequestBody): string {
  return createHash("sha256").update(body).digest("hex");
}

export function signedBackendHeaders(input: { serviceId: string; secret: string; body: SignedRequestBody; timestamp?: number; nonce?: string }): Record<string, string> {
  const timestamp = String(input.timestamp ?? Date.now());
  const nonce = input.nonce ?? randomUUID();
  const hash = bodyHash(input.body);
  const signature = createHmac("sha256", input.secret).update(`${input.serviceId}.${timestamp}.${nonce}.${hash}`).digest("hex");
  return injectTraceContext({
    "content-type": "application/json",
    "x-service-id": input.serviceId,
    "x-service-timestamp": timestamp,
    "x-service-nonce": nonce,
    "x-body-sha256": hash,
    "x-service-signature": signature,
  });
}

export function signedBackendBinaryHeaders(input: { serviceId: string; secret: string; body: Uint8Array; contentType: string; timestamp?: number; nonce?: string }): Record<string, string> {
  return { ...signedBackendHeaders(input), "content-type": input.contentType };
}
