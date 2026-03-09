import type { FastifyInstance } from "fastify";

import { fetchSnapshotForPhoneNumber } from "../context/fetchSnapshot";
import { handleMediaStreamConnection } from "./mediaStream";
import {
  buildTwilioRequestUrl,
  normalizeFormFields,
  validateTwilioSignature,
} from "./twilioRequest";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * The initial voice scaffold keeps the hot path explicit:
 * load a precomputed snapshot once, cache it in memory, and avoid per-turn backend fetches.
 */
export function registerVoiceRoutes(server: FastifyInstance): void {
  server.post("/twilio/voice/inbound", async (request, reply) => {
    const payload = normalizeFormFields(
      (request.body as Record<string, unknown> | undefined) ?? {},
    );
    const requestUrl = buildTwilioRequestUrl(
      server.runtimeConfig.VOICE_GATEWAY_BASE_URL,
      request.url,
    );
    const isValid = validateTwilioSignature({
      authToken: server.runtimeConfig.TWILIO_AUTH_TOKEN,
      signatureHeader: request.headers["x-twilio-signature"],
      url: requestUrl,
      params: payload,
    });

    if (!isValid) {
      reply.code(403);
      return "Invalid Twilio signature";
    }

    const callSid = payload.CallSid ?? "demo";
    const calledNumber = payload.To ?? "";
    const fromNumber = payload.From ?? "";
    const snapshot = await fetchSnapshotForPhoneNumber(calledNumber);

    server.snapshotCache.set(snapshot.businessId, snapshot);

    const streamUrl = new URL("/media-stream", server.runtimeConfig.VOICE_GATEWAY_BASE_URL);
    streamUrl.protocol = streamUrl.protocol === "https:" ? "wss:" : "ws:";
    const statusCallbackUrl = new URL(
      "/twilio/voice/stream-status",
      server.runtimeConfig.VOICE_GATEWAY_BASE_URL,
    );

    const twiml = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<Response>",
      `<Say voice=\"Polly.Joanna\">${escapeXml(snapshot.greeting)}</Say>`,
      "<Connect>",
      `<Stream url=\"${escapeXml(streamUrl.toString())}\" statusCallback=\"${escapeXml(
        statusCallbackUrl.toString(),
      )}\" statusCallbackMethod=\"POST\" name=\"${escapeXml(
        `voice-${snapshot.businessId}`,
      )}\">`,
      `<Parameter name=\"callSid\" value=\"${escapeXml(callSid)}\" />`,
      `<Parameter name=\"businessId\" value=\"${escapeXml(snapshot.businessId)}\" />`,
      `<Parameter name=\"from\" value=\"${escapeXml(fromNumber)}\" />`,
      `<Parameter name=\"to\" value=\"${escapeXml(calledNumber)}\" />`,
      `<Parameter name=\"snapshotVersion\" value=\"${escapeXml(snapshot.version)}\" />`,
      "</Stream>",
      "</Connect>",
      "</Response>",
    ].join("");

    reply.header("Content-Type", "text/xml");
    return twiml;
  });

  server.post("/twilio/voice/stream-status", async (request, reply) => {
    const payload = normalizeFormFields(
      (request.body as Record<string, unknown> | undefined) ?? {},
    );
    const requestUrl = buildTwilioRequestUrl(
      server.runtimeConfig.VOICE_GATEWAY_BASE_URL,
      request.url,
    );
    const isValid = validateTwilioSignature({
      authToken: server.runtimeConfig.TWILIO_AUTH_TOKEN,
      signatureHeader: request.headers["x-twilio-signature"],
      url: requestUrl,
      params: payload,
    });

    if (!isValid) {
      reply.code(403);
      return "Invalid Twilio signature";
    }

    server.log.info(
      {
        callSid: payload.CallSid,
        streamSid: payload.StreamSid,
        streamEvent: payload.StreamEvent,
        streamError: payload.StreamError,
      },
      "Twilio Media Stream status callback",
    );

    reply.code(204);
    return null;
  });

  server.get("/media-stream", { websocket: true }, (socket, request) => {
    void handleMediaStreamConnection(server, socket, request);
  });
}
