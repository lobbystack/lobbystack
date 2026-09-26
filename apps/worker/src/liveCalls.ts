import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createAgentModel, createReceptionistAgent, LiveCallController, type AgentChannel, type CallControl, type LiveCallSummary } from "@lobbystack/agent-core";
import { blockLiveCaller, finishLiveCall, getCachedBusinessSnapshot, persistCallRecording, prepareLiveCallTransfer, recordLiveCallTransferResult, saveLiveCallTurn, type BinaryStorageProvider, type DomainContext, type LiveCallEnd } from "@lobbystack/domain";
import OpenAI from "openai";

export const LIVE_ATTACH_PATH = "/internal/live/attach";
const MAX_BODY_BYTES = 16 * 1024;

type AttachRequest = { sessionId: string; businessId: string; channel: AgentChannel; callerPhone?: string; callId?: string };

const SILENCE_TIMEOUT_MS = 75_000;
const MAX_CALL_MS = 30 * 60_000;
// OpenAI finalizes the stored recording shortly after the session closes.
const RECORDING_ATTEMPTS = 12;
const RECORDING_RETRY_MS = 5_000;

function endFromCloseReason(reason: string | undefined): LiveCallEnd {
  switch (reason) {
    case "close_requested": return "caller_finished";
    case "remote_hangup": return "caller_hung_up";
    case "expired": return "session_expired";
    case "content": return "content_blocked";
    default: return "connection_lost";
  }
}

export function isLivePrototypeEnabled(): boolean {
  return process.env.LIVE_PROTOTYPE_ENABLED === "true";
}

function tokenMatches(presented: string | undefined): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected || !presented) return false;
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readBody(request: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseAttachRequest(raw: string): AttachRequest | undefined {
  const body = JSON.parse(raw) as Partial<AttachRequest>;
  if (typeof body.sessionId !== "string" || typeof body.businessId !== "string") return undefined;
  if (body.channel !== "voice" && body.channel !== "web_voice") return undefined;
  if (body.channel === "voice" && typeof body.callId !== "string") return undefined;
  return { sessionId: body.sessionId, businessId: body.businessId, channel: body.channel, ...(typeof body.callerPhone === "string" ? { callerPhone: body.callerPhone } : {}), ...(typeof body.callId === "string" ? { callId: body.callId } : {}) };
}

function reply(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

/**
 * Live call control for the GPT-Live prototype. Next.js creates or accepts the
 * session, then calls this endpoint so the worker holds the sideband for the
 * rest of the call.
 */
export function createLiveCallHandler(input: { domain: DomainContext }) {
  const active = new Map<string, LiveCallController>();
  const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }) : undefined;
  const model = createAgentModel();
  let storage: BinaryStorageProvider | undefined;

  // Copies OpenAI's stored stereo recording into our storage so it follows the
  // plan's retention like every other call recording.
  async function saveRecording(request: AttachRequest & { callId: string }, durationMs: number): Promise<void> {
    if (!client || !storage) return;
    for (let attempt = 1; attempt <= RECORDING_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, RECORDING_RETRY_MS));
      try {
        const response = await client.live.sessions.downloadRecording(request.sessionId);
        const body = new Uint8Array(await response.arrayBuffer());
        await persistCallRecording(input.domain, { businessId: request.businessId, callId: request.callId, durationMs, contentType: "audio/wav", body }, storage);
        return;
      } catch (error) {
        const status = typeof error === "object" && error !== null && "status" in error ? (error as { status?: number }).status : undefined;
        // 404/409 mean it isn't ready yet; anything else won't get better.
        if (status !== 404 && status !== 409) {
          console.error(`[live] ${request.sessionId} recording unavailable`, error instanceof Error ? error.message : error);
          return;
        }
      }
    }
    console.error(`[live] ${request.sessionId} recording never became available`);
  }

  async function attach(request: AttachRequest): Promise<void> {
    if (!client || !model) throw new Error("OPENAI_API_KEY and a text model are required for live calls.");
    if (active.has(request.sessionId)) return;
    const snapshot = await getCachedBusinessSnapshot(input.domain, { businessId: request.businessId });
    if (!snapshot) throw new Error("The business has no published snapshot.");
    const phoneCall = request.channel === "voice" && request.callId ? { ...request, callId: request.callId } : undefined;
    let end: LiveCallEnd | undefined;

    // Phone calls arrive over OpenAI SIP, so the session can refer (transfer)
    // or hang up the call. Browser calls have neither.
    const callControl: CallControl | undefined = phoneCall
      ? {
          transfer: async (destination) => {
            if (!(await prepareLiveCallTransfer(input.domain, { businessId: phoneCall.businessId, callId: phoneCall.callId }))) return false;
            try {
              await client.live.sessions.refer(phoneCall.sessionId, { target_uri: `tel:${destination}` });
              end = "transferred";
              await recordLiveCallTransferResult(input.domain, { businessId: phoneCall.businessId, callId: phoneCall.callId, ok: true });
              return true;
            } catch (error) {
              console.error(`[live] ${phoneCall.sessionId} transfer failed`, error instanceof Error ? error.message : error);
              await recordLiveCallTransferResult(input.domain, { businessId: phoneCall.businessId, callId: phoneCall.callId, ok: false });
              return false;
            }
          },
          hangup: async (reason) => {
            end = reason;
            if (reason === "abuse") await blockLiveCaller(input.domain, { businessId: phoneCall.businessId, callId: phoneCall.callId });
            await client.live.sessions.hangup(phoneCall.sessionId);
          },
        }
      : undefined;
    const agent = createReceptionistAgent({
      model,
      context: {
        domain: input.domain,
        snapshot,
        channel: request.channel,
        ...(request.callerPhone ? { callerPhone: request.callerPhone } : {}),
        ...(phoneCall ? { callId: phoneCall.callId } : {}),
        ...(callControl ? { callControl } : {}),
      },
    });

    const finishPhoneCall = async (summary: LiveCallSummary) => {
      if (!phoneCall) return;
      const seconds = summary.billedSeconds ?? summary.durationMs / 1000;
      await finishLiveCall(input.domain, { businessId: phoneCall.businessId, callId: phoneCall.callId, seconds, end: end ?? endFromCloseReason(summary.closeReason) });
      void saveRecording(phoneCall, seconds * 1000);
    };

    const controller = new LiveCallController({
      client,
      sessionId: request.sessionId,
      agent,
      greeting: snapshot.greeting,
      ...(phoneCall ? {
        silenceTimeoutMs: SILENCE_TIMEOUT_MS,
        maxDurationMs: MAX_CALL_MS,
        onTurn: (turn) => void saveLiveCallTurn(input.domain, { businessId: phoneCall.businessId, callId: phoneCall.callId, ...turn })
          .catch((error: unknown) => console.error(`[live] ${phoneCall.sessionId} transcript save failed`, error instanceof Error ? error.message : error)),
        onTimeout: (reason) => {
          end = reason;
          void client.live.sessions.hangup(phoneCall.sessionId).catch(() => controller.close());
        },
      } : {}),
      onDelegation: (timing) => console.info(JSON.stringify({ event: "live.delegation", sessionId: request.sessionId, agentMs: timing.agentMs, totalMs: timing.totalMs, tools: timing.tools, failed: timing.failed })),
      onClose: (summary) => {
        active.delete(request.sessionId);
        console.info(JSON.stringify({ event: "live.closed", sessionId: summary.sessionId, durationMs: summary.durationMs, billedSeconds: summary.billedSeconds, closeReason: summary.closeReason, end, delegations: summary.delegations.length }));
        void finishPhoneCall(summary).catch((error: unknown) => console.error(`[live] ${request.sessionId} finish failed`, error instanceof Error ? error.message : error));
      },
    });
    active.set(request.sessionId, controller);
    controller.start();
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== LIVE_ATTACH_PATH || !isLivePrototypeEnabled()) return false;
    if (request.method !== "POST") {
      reply(response, 405, { error: "Method not allowed." });
      return true;
    }
    if (!tokenMatches(request.headers["x-internal-service-token"] as string | undefined)) {
      reply(response, 401, { error: "Unauthorized." });
      return true;
    }
    try {
      const body = parseAttachRequest(await readBody(request));
      if (!body) {
        reply(response, 400, { error: "sessionId, businessId and channel are required." });
        return true;
      }
      await attach(body);
      reply(response, 202, { ok: true });
    } catch (error) {
      console.error("[live] attach failed", error instanceof Error ? error.message : error);
      reply(response, 500, { error: "Attach failed." });
    }
    return true;
  }

  return {
    handle,
    setStorage: (provider: BinaryStorageProvider) => { storage = provider; },
    activeCalls: () => active.size,
    closeAll: () => {
      for (const controller of active.values()) controller.close();
    },
  };
}
