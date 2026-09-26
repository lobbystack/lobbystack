import OpenAI from "openai";

import { jsonError } from "./api-helpers";

type WorkerAttachInput = { sessionId: string; businessId: string; channel: "voice" | "web_voice"; callerPhone?: string };

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

// OpenAI replays only the last 3 seconds to a late sideband, so the worker must
// attach right after the session exists. This is a direct call, not a queued job.
export async function attachWorkerToLiveSession(input: WorkerAttachInput): Promise<void> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN is not set.");
  const response = await fetch(`${workerUrl()}/internal/live/attach`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-service-token": token },
    body: JSON.stringify(input),
    // A sleeping staging worker needs a few seconds to wake.
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Worker attach failed with status ${response.status}.`);
}
