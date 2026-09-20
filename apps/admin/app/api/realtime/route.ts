import Redis from "ioredis";

import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";
import { parseRealtimeMessage } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const businessId = new URL(request.url).searchParams.get("businessId");
    if (!businessId) {
      return new Response("businessId is required", { status: 400 });
    }
    await withOperatorTransaction(request, async () => undefined);
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return new Response("Realtime is not configured", { status: 503 });
    }
    const channel = `${process.env.REDIS_PREFIX ?? "lobbystack"}:realtime:${businessId}`;
    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let cleanup: (closeController?: boolean) => Promise<void> = async () => undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const subscriber = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          connectionName: `lobbystack:sse:${businessId}`,
        });
        let closed = false;
        const onAbort = () => { void cleanup(); };
        cleanup = async (closeController = true) => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          request.signal.removeEventListener("abort", onAbort);
          subscriber.removeAllListeners("message");
          subscriber.disconnect(false);
          if (closeController) {
            try { controller.close(); } catch { /* client disconnected */ }
          }
        };
        request.signal.addEventListener("abort", onAbort, { once: true });
        if (request.signal.aborted) {
          await cleanup();
          return;
        }
        subscriber.on("message", (_receivedChannel, rawMessage) => {
          const event = parseRealtimeMessage(rawMessage, businessId);
          if (!event) {
            return;
          }
          controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        });
        try {
          await subscriber.connect();
          if (closed) return;
          await subscriber.subscribe(channel);
          if (closed) return;
          controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ businessId })}\n\n`));
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": keepalive\n\n"));
            } catch {
              void cleanup(false);
            }
          }, 15_000);
          heartbeat.unref?.();
        } catch (error) {
          if (!closed) {
            await cleanup(false);
            controller.error(error);
          }
        }
      },
      cancel() {
        return cleanup(false);
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
  } catch (error) {
    return asApiResponse(error);
  }
}
