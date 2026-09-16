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
    const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false, connectionName: `lobbystack:sse:${businessId}` });
    const channel = `${process.env.REDIS_PREFIX ?? "lobbystack"}:realtime:${businessId}`;
    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const close = async () => {
          if (heartbeat) clearInterval(heartbeat);
          subscriber.removeAllListeners("message");
          await subscriber.unsubscribe(channel).catch(() => undefined);
          await subscriber.quit().catch(() => undefined);
          try { controller.close(); } catch { /* client disconnected */ }
        };
        request.signal.addEventListener("abort", () => { void close(); }, { once: true });
        subscriber.on("message", (_receivedChannel, rawMessage) => {
          const event = parseRealtimeMessage(rawMessage, businessId);
          if (!event) {
            return;
          }
          controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        });
        await subscriber.subscribe(channel);
        controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ businessId })}\n\n`));
        heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keepalive\n\n")), 15_000);
        heartbeat.unref?.();
      },
      cancel() {
        if (heartbeat) clearInterval(heartbeat);
        void subscriber.quit();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
  } catch (error) {
    return asApiResponse(error);
  }
}
