import { setTimeout as sleep } from "node:timers/promises";

import OpenAI from "openai";

import { jsonError } from "./api-helpers";

/** `resume` marks a retried webhook delivery's attach to a call that may be under way. */
type WorkerAttachInput = { sessionId: string; businessId: string; callId: string; channel: "voice" | "web_voice"; conversationId?: string; callerPhone?: string; maxDurationMs?: number; intakeOnly?: boolean; resume?: boolean };

// A draining worker answers a new attach with 503. The waits before each retry
// give the deploy's new instance time to become ready.
const ATTACH_RETRY_DELAYS_MS = [250, 750];

let client: OpenAI | undefined;

export function requireLivePrototype(): void {
  if (process.env.LIVE_PROTOTYPE_ENABLED !== "true") throw jsonError("The GPT-Live prototype is off.", 404, "live_prototype_disabled");
}

export function getLiveClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw jsonError("OPENAI_API_KEY is not set.", 503, "openai_unconfigured");
  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    ...(process.env.OPENAI_WEBHOOK_SECRET ? { webhookSecret: process.env.OPENAI_WEBHOOK_SECRET } : {}),
  });
  return client;
}

function workerUrl(): string {
  return process.env.WORKER_INTERNAL_URL ?? `http://127.0.0.1:${process.env.WORKER_PORT ?? 3002}`;
}

async function postToWorker(action: "attach" | "end", body: unknown): Promise<void> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN is not set.");
  // A sleeping staging worker needs a few seconds to wake. Retries share this budget.
  const signal = AbortSignal.timeout(10_000);
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${workerUrl()}/internal/live/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-service-token": token },
      body: JSON.stringify(body),
      signal,
    });
    if (response.status === 503 && action === "attach" && attempt < ATTACH_RETRY_DELAYS_MS.length) {
      await response.body?.cancel();
      // Rejects when the shared budget runs out first.
      await sleep(ATTACH_RETRY_DELAYS_MS[attempt], undefined, { signal });
      continue;
    }
    if (!response.ok) throw new Error(`Worker ${action} failed with status ${response.status}.`);
    return;
  }
}

// OpenAI replays only the last 3 seconds to a late sideband, so the worker must
// attach right after the session exists. This is a direct call, not a queued job.
export async function attachWorkerToLiveSession(input: WorkerAttachInput): Promise<void> {
  await postToWorker("attach", input);
}

/**
 * Ends a browser session with session.close, sent by the worker over a
 * sideband. OpenAI's hangup endpoint is for SIP calls only.
 */
export async function endLiveBrowserSession(sessionId: string): Promise<void> {
  await postToWorker("end", { sessionId });
}
