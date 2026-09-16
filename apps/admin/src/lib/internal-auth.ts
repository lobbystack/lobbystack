import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import Redis from "ioredis";
import { assertProductionSecrets } from "@lobbystack/config";

const seenNonces = new Map<string, number>();
let replayStore: Redis | undefined;

export function hashRequestBody(body: string | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function buildInternalHeaders(input: { serviceId: string; body: string; timestamp?: number; nonce?: string }): Record<string, string> {
  const timestamp = String(input.timestamp ?? Date.now());
  const nonce = input.nonce ?? randomUUID();
  const bodyHash = hashRequestBody(input.body);
  const signature = createHmac("sha256", process.env.INTERNAL_SERVICE_SECRET ?? process.env.INTERNAL_SERVICE_TOKEN ?? "").update(`${input.serviceId}.${timestamp}.${nonce}.${bodyHash}`).digest("hex");
  return { "x-service-id": input.serviceId, "x-service-timestamp": timestamp, "x-service-nonce": nonce, "x-body-sha256": bodyHash, "x-service-signature": signature };
}

export function verifyInternalRequest(input: { serviceId: string; timestamp: string | null; nonce: string | null; bodyHash: string | null; signature: string | null; body: string | Uint8Array; maxAgeMs?: number }): boolean {
  try {
    assertProductionSecrets(process.env, ["INTERNAL_SERVICE_SECRET"]);
  } catch {
    return false;
  }
  if (!input.timestamp || !input.nonce || !input.bodyHash || !input.signature) {
    return false;
  }
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > (input.maxAgeMs ?? 30_000)) {
    return false;
  }
  const expectedServiceId = process.env.INTERNAL_SERVICE_ID ?? "lobbystack-voice-gateway";
  if (input.serviceId !== expectedServiceId) {
    return false;
  }
  const secret = process.env.INTERNAL_SERVICE_SECRET ?? process.env.INTERNAL_SERVICE_TOKEN;
  if (!secret) {
    return false;
  }
  const expectedBodyHash = hashRequestBody(input.body);
  const expected = createHmac("sha256", secret).update(`${input.serviceId}.${input.timestamp}.${input.nonce}.${expectedBodyHash}`).digest("hex");
  if (input.bodyHash !== expectedBodyHash || expected.length !== input.signature.length) {
    return false;
  }
  const expectedBytes = Buffer.from(expected, "hex");
  const receivedBytes = Buffer.from(input.signature, "hex");
  if (expectedBytes.length !== receivedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, receivedBytes);
}

export type InternalNonceClaim = "claimed" | "replayed" | "unavailable";

function claimLocalNonce(serviceId: string, nonce: string, expiresAt: number): InternalNonceClaim {
  const now = Date.now();
  for (const [key, value] of seenNonces) {
    if (value <= now) {
      seenNonces.delete(key);
    }
  }
  const key = `${serviceId}:${nonce}`;
  if (seenNonces.has(key)) {
    return "replayed";
  }
  if (seenNonces.size >= 10_000) {
    const oldest = seenNonces.keys().next().value;
    if (oldest) {
      seenNonces.delete(oldest);
    }
  }
  seenNonces.set(key, expiresAt);
  return "claimed";
}

function getReplayStore(): Redis | undefined {
  const url = process.env.REDIS_URL;
  if (!url) {
    return undefined;
  }
  if (!replayStore) {
    replayStore = new Redis(url, {
      connectionName: `${process.env.REDIS_PREFIX ?? "lobbystack"}:internal-replay`,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    replayStore.on("error", () => undefined);
  }
  return replayStore;
}

async function waitForReplayStore(store: Redis): Promise<void> {
  if (store.status === "ready") return;
  if (store.status === "wait") {
    await store.connect();
    return;
  }
  const ready = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      store.off("ready", onReady);
      store.off("error", onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    store.once("ready", onReady);
    store.once("error", onError);
  });
  await ready;
}

export async function claimInternalRequestNonce(input: { serviceId: string; nonce: string; maxAgeMs?: number }): Promise<InternalNonceClaim> {
  const maxAgeMs = input.maxAgeMs ?? 30_000;
  const expiresAt = Date.now() + maxAgeMs;
  const store = getReplayStore();
  if (!store) {
    return process.env.NODE_ENV === "production"
      ? "unavailable"
      : claimLocalNonce(input.serviceId, input.nonce, expiresAt);
  }
  try {
    await waitForReplayStore(store);
    const result = await store.set(
      `${process.env.REDIS_PREFIX ?? "lobbystack"}:internal-replay:${input.serviceId}:${input.nonce}`,
      "1",
      "PX",
      maxAgeMs,
      "NX",
    );
    return result === "OK" ? "claimed" : "replayed";
  } catch {
    return "unavailable";
  }
}
