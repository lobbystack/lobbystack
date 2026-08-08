import { createHash, timingSafeEqual } from "node:crypto";

import { signedRequestHeadersSchema } from "@lobbystack/contracts";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export type InternalAuthResult =
  | { ok: true; serviceId: string }
  | { ok: false; status: number; error: string };

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256Hex(secret: string, value: string): string {
  return createHash("sha256")
    .update(`${secret}:${value}`)
    .digest("hex");
}

export function verifyInternalRequest(input: {
  method: string;
  path: string;
  body: string;
  headers: Headers;
  secret?: string;
}): InternalAuthResult {
  const secret = input.secret ?? process.env.INTERNAL_SERVICE_TOKEN;
  if (!secret) {
    return { ok: false, status: 500, error: "Internal auth is not configured" };
  }

  const simpleToken = input.headers.get("x-internal-service-token");
  if (simpleToken && simpleToken === secret) {
    return { ok: true, serviceId: "voice-gateway" };
  }

  const headerValues = {
    "x-lobbystack-service-id": input.headers.get("x-lobbystack-service-id") ?? "",
    "x-lobbystack-timestamp": input.headers.get("x-lobbystack-timestamp") ?? "",
    "x-lobbystack-nonce": input.headers.get("x-lobbystack-nonce") ?? "",
    "x-lobbystack-body-sha256": input.headers.get("x-lobbystack-body-sha256") ?? "",
    "x-lobbystack-signature": input.headers.get("x-lobbystack-signature") ?? "",
  };

  const parsed = signedRequestHeadersSchema.safeParse(headerValues);
  if (!parsed.success) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const timestamp = Number(parsed.data["x-lobbystack-timestamp"]);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) {
    return { ok: false, status: 401, error: "Request expired" };
  }

  const bodyHash = sha256Hex(input.body);
  if (bodyHash !== parsed.data["x-lobbystack-body-sha256"].toLowerCase()) {
    return { ok: false, status: 401, error: "Invalid body hash" };
  }

  const canonical = [
    input.method.toUpperCase(),
    input.path,
    parsed.data["x-lobbystack-timestamp"],
    parsed.data["x-lobbystack-nonce"],
    parsed.data["x-lobbystack-body-sha256"],
  ].join("\n");

  const expected = hmacSha256Hex(secret, canonical);
  const provided = parsed.data["x-lobbystack-signature"].toLowerCase();

  try {
    const valid = timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    if (!valid) {
      return { ok: false, status: 401, error: "Invalid signature" };
    }
  } catch {
    return { ok: false, status: 401, error: "Invalid signature" };
  }

  return { ok: true, serviceId: parsed.data["x-lobbystack-service-id"] };
}

export async function readRequestBody(request: Request): Promise<string> {
  const buffer = await request.arrayBuffer();
  return Buffer.from(buffer).toString("utf8");
}
