import { NextResponse } from "next/server";

import type { RealtimeEvent } from "@lobbystack/contracts";
import { findWidgetConversationId } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";

import { asApiResponse, jsonError } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { listenToBusinessRealtime, realtimeConfigured } from "@/lib/realtime-hub";
import { resolveWidgetSessionAccess } from "@/lib/widget-access";
import { requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A stream ends after this long and the widget opens a new one, so it never outlives its session by much.
const STREAM_LIFETIME_MS = 10 * 60_000;
// Past this many open streams in one process, chats fall back to their slower history check.
const MAX_OPEN_STREAMS = 1_000;
let openStreams = 0;

/** What the widget needs to hear about: a team member's reply, or the chat changing hands. */
function widgetEvent(event: RealtimeEvent, conversationId: string): "message" | "conversation" | null {
  // The visitor's own messages and the AI's replies already reach the widget through its chat request.
  if (event.type === "message.upserted" && event.payload.conversationId === conversationId && event.payload.direction === "outbound" && event.payload.aiGenerated === false) return "message";
  if (event.type === "conversation.updated" && event.entityId === conversationId) return "conversation";
  return null;
}

/**
 * Tells an open website chat when a team member writes or takes it over, so
 * the widget reloads its history at once. Events carry no message text.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const access = await resolveWidgetSessionAccess(request);
    if (!access.ok) return access.response;
    const { session } = access;
    const visitorId = session.visitorId ?? "";
    if (!isUuid(visitorId)) return jsonError("The widget session has no visitor.", 400, "widget_visitor_required");
    const ipHash = requestIpHash(request);
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, visitorId, ...(ipHash ? { ipHash } : {}), operation: "stream" });
    if (!rate.allowed) return NextResponse.json({ error: "Rate limit reached.", code: rate.code }, { status: rate.status });
    if (!realtimeConfigured() || openStreams >= MAX_OPEN_STREAMS) return jsonError("Live chat updates are unavailable.", 503, "widget_stream_unavailable");
    const conversationId = await findWidgetConversationId(createWorkerDomainContext(), { businessId: session.businessId, widgetVisitorId: visitorId });
    if (!conversationId) return jsonError("This visitor has no open chat.", 404, "widget_conversation_not_found");

    const encoder = new TextEncoder();
    let stop: () => void = () => undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        openStreams += 1;
        let closed = false;
        let unlisten: (() => void) | undefined;
        const finish = (closeController: boolean) => {
          if (closed) return;
          closed = true;
          openStreams -= 1;
          clearInterval(heartbeat);
          clearTimeout(lifetime);
          request.signal.removeEventListener("abort", onAbort);
          unlisten?.();
          if (closeController) {
            try { controller.close(); } catch { /* the visitor left */ }
          }
        };
        const send = (text: string) => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(text)); } catch { finish(false); }
        };
        const onAbort = () => finish(true);
        stop = () => finish(false);
        const heartbeat = setInterval(() => send(": keepalive\n\n"), 15_000);
        heartbeat.unref?.();
        const lifetime = setTimeout(() => finish(true), STREAM_LIFETIME_MS);
        lifetime.unref?.();
        request.signal.addEventListener("abort", onAbort, { once: true });
        if (request.signal.aborted) return finish(true);
        try {
          const listening = await listenToBusinessRealtime(session.businessId, {
            event: (event) => {
              const kind = widgetEvent(event, conversationId);
              if (kind) send(`event: ${kind}\ndata: {}\n\n`);
            },
            // Redis dropped and events may be lost: the widget reconnects and reloads its history.
            reset: () => finish(true),
          });
          if (closed) return listening();
          unlisten = listening;
        } catch {
          return finish(true);
        }
        send("event: ready\ndata: {}\n\n");
      },
      cancel() {
        stop();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
  } catch (error) {
    return asApiResponse(error);
  }
}
