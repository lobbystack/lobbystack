import type { FastifyInstance } from "fastify";

import { fetchSnapshotForPhoneNumber } from "../context/fetchSnapshot";
import { handleMediaStreamConnection } from "./mediaStream";

/**
 * The initial voice scaffold keeps the hot path explicit:
 * load a precomputed snapshot once, cache it in memory, and avoid per-turn backend fetches.
 */
export function registerVoiceRoutes(server: FastifyInstance): void {
  server.post("/twilio/voice/inbound", async (request, reply) => {
    const payload = (request.body as Record<string, string> | undefined) ?? {};
    const callSid = payload.CallSid ?? "demo";
    const calledNumber = payload.To ?? "";
    const fromNumber = payload.From ?? "";
    const snapshot = await fetchSnapshotForPhoneNumber(calledNumber);

    server.snapshotCache.set(snapshot.businessId, snapshot);

    const streamUrl = new URL("/media-stream", server.runtimeConfig.VOICE_GATEWAY_BASE_URL);
    streamUrl.protocol = streamUrl.protocol === "https:" ? "wss:" : "ws:";
    streamUrl.searchParams.set("callSid", callSid);
    streamUrl.searchParams.set("businessId", snapshot.businessId);
    streamUrl.searchParams.set("from", fromNumber);
    streamUrl.searchParams.set("to", calledNumber);

    const twiml = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<Response>",
      `<Say voice=\"Polly.Joanna\">${snapshot.greeting}</Say>`,
      `<Connect><Stream url=\"${streamUrl.toString()}\" /></Connect>`,
      "</Response>",
    ].join("");

    reply.header("Content-Type", "text/xml");
    return twiml;
  });

  server.get("/media-stream", { websocket: true }, (socket, request) => {
    void handleMediaStreamConnection(server, socket, request);
  });
}
