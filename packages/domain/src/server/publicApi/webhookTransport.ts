import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";

import { WEBHOOK_TIMEOUT_MS } from "@lobbystack/shared";

import { assertWebhookUrlAllowed, createGuardedLookup, webhookUrlPolicy, type WebhookUrlPolicy } from "./webhookNetwork";

// Standard Webhooks (https://www.standardwebhooks.com): the secret is
// "whsec_" + base64 key bytes, and each attempt is signed as
// base64(HMAC-SHA256(key, `${id}.${timestamp}.${body}`)) under the "v1" scheme.

const SECRET_PREFIX = "whsec_";

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString("base64")}`;
}

function secretKey(secret: string): Buffer {
  if (!secret.startsWith(SECRET_PREFIX)) throw new Error("Webhook secrets start with whsec_.");
  return Buffer.from(secret.slice(SECRET_PREFIX.length), "base64");
}

export function signWebhookPayload(input: { secret: string; id: string; timestamp: number; body: string }): string {
  const signature = createHmac("sha256", secretKey(input.secret)).update(`${input.id}.${input.timestamp}.${input.body}`).digest("base64");
  return `v1,${signature}`;
}

export function webhookHeaders(input: { secret: string; id: string; timestamp: number; body: string }): Record<string, string> {
  return {
    "content-type": "application/json",
    "user-agent": "LobbyStack-Webhooks/1.0",
    "webhook-id": input.id,
    "webhook-timestamp": String(input.timestamp),
    "webhook-signature": signWebhookPayload(input),
  };
}

// Signing secrets must be readable to sign, so they are encrypted rather than
// hashed. Same format as the providers SecretBox: AES-256-GCM, key = SHA-256(ENCRYPTION_KEY).
function encryptionKey(environment: Readonly<Record<string, string | undefined>> = process.env): Buffer {
  const secret = environment.ENCRYPTION_KEY?.trim();
  if (!secret && environment.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY is required to store webhook signing secrets.");
  return createHash("sha256").update(secret || "development-only-webhook-secret-key").digest();
}

export function encryptWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decryptWebhookSecret(value: string): string {
  const encoded = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), encoded.subarray(0, 12));
  decipher.setAuthTag(encoded.subarray(12, 28));
  return Buffer.concat([decipher.update(encoded.subarray(28)), decipher.final()]).toString("utf8");
}

export type WebhookSendResult = { ok: boolean; status: number | null; error: string | null; durationMs: number };

export type WebhookSender = (input: { url: string; secret: string; id: string; body: string }) => Promise<WebhookSendResult>;

/**
 * Posts one signed event. It never follows redirects, refuses private and
 * metadata addresses after DNS resolution, and gives up after 10 seconds.
 * Only a 2xx status counts as delivered.
 */
export function createWebhookSender(options: { policy?: WebhookUrlPolicy; timeoutMs?: number; lookup?: ReturnType<typeof createGuardedLookup>; now?: () => number } = {}): WebhookSender {
  const policy = options.policy ?? webhookUrlPolicy();
  const timeoutMs = options.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
  const lookup = options.lookup ?? createGuardedLookup();
  const now = options.now ?? Date.now;
  return async ({ url, secret, id, body }) => {
    const started = now();
    const finish = (result: Omit<WebhookSendResult, "durationMs">): WebhookSendResult => ({ ...result, durationMs: Math.max(0, now() - started) });
    let target: URL;
    try {
      target = assertWebhookUrlAllowed(url, policy);
    } catch (error) {
      return finish({ ok: false, status: null, error: error instanceof Error ? error.message : "The URL is not allowed." });
    }
    // IP literals skip the DNS lookup below; assertWebhookUrlAllowed already refused blocked ones.
    const headers = { ...webhookHeaders({ secret, id, timestamp: Math.floor(Date.now() / 1000), body }), "content-length": String(Buffer.byteLength(body)) };
    const client = target.protocol === "https:" ? https : http;
    return await new Promise<WebhookSendResult>((resolve) => {
      let settled = false;
      const settle = (result: Omit<WebhookSendResult, "durationMs">) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(finish(result));
      };
      const request = client.request(target, { method: "POST", headers, lookup: lookup as never, agent: false }, (response) => {
        const status = response.statusCode ?? 0;
        // Drain a little of the body so the socket closes cleanly; the content is not stored.
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > 64 * 1024) response.destroy();
        });
        response.on("end", () => settle(status >= 200 && status < 300 ? { ok: true, status, error: null } : { ok: false, status, error: status >= 300 && status < 400 ? `Redirects are not followed (HTTP ${status}).` : `HTTP ${status}` }));
        response.on("error", () => settle(status >= 200 && status < 300 ? { ok: true, status, error: null } : { ok: false, status, error: `HTTP ${status}` }));
        response.on("close", () => settle(status >= 200 && status < 300 ? { ok: true, status, error: null } : { ok: false, status, error: `HTTP ${status}` }));
      });
      const timer = setTimeout(() => {
        request.destroy();
        settle({ ok: false, status: null, error: `Timed out after ${Math.round(timeoutMs / 1000)} seconds.` });
      }, timeoutMs);
      request.on("error", (error) => settle({ ok: false, status: null, error: (error.message || "The request failed.").slice(0, 300) }));
      request.end(body);
    });
  };
}
