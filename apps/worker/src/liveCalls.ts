import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createAgentModel, createReceptionistAgent, LiveCallController, type AgentChannel, type CallControl } from "@lobbystack/agent-core";
import { getCachedBusinessSnapshot, type DomainContext } from "@lobbystack/domain";
import OpenAI from "openai";

export const LIVE_ATTACH_PATH = "/internal/live/attach";
const MAX_BODY_BYTES = 16 * 1024;

type AttachRequest = { sessionId: string; businessId: string; channel: AgentChannel; callerPhone?: string };

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
  return { sessionId: body.sessionId, businessId: body.businessId, channel: body.channel, ...(typeof body.callerPhone === "string" ? { callerPhone: body.callerPhone } : {}) };
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

  async function attach(request: AttachRequest): Promise<void> {
    if (!client || !model) throw new Error("OPENAI_API_KEY and a text model are required for live calls.");
    if (active.has(request.sessionId)) return;
    const snapshot = await getCachedBusinessSnapshot(input.domain, { businessId: request.businessId });
    if (!snapshot) throw new Error("The business has no published snapshot.");
    // Phone calls arrive over OpenAI SIP, so the session can refer (transfer)
    // or hang up the call. Browser calls have neither.
    const callControl: CallControl | undefined = request.channel === "voice"
      ? {
          transfer: async (destination) => await client.live.sessions.refer(request.sessionId, { target_uri: `tel:${destination}` }),
          hangup: async () => await client.live.sessions.hangup(request.sessionId),
        }
      : undefined;
    const agent = createReceptionistAgent({
      model,
      context: {
        domain: input.domain,
        snapshot,
        channel: request.channel,
        ...(request.callerPhone ? { callerPhone: request.callerPhone } : {}),
        ...(callControl ? { callControl } : {}),
      },
    });
    const controller = new LiveCallController({
      client,
      sessionId: request.sessionId,
      agent,
      greeting: snapshot.greeting,
      onDelegation: (timing) => console.info(JSON.stringify({ event: "live.delegation", sessionId: request.sessionId, ...timing })),
      onClose: (summary) => {
        active.delete(request.sessionId);
        console.info(JSON.stringify({ event: "live.closed", ...summary, delegations: summary.delegations.length }));
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
    activeCalls: () => active.size,
    closeAll: () => {
      for (const controller of active.values()) controller.close();
    },
  };
}
