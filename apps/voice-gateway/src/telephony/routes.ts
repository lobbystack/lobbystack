import type { FastifyInstance } from "fastify";

import { demoBusinessId } from "@ai-receptionist/testing";

import { fetchSnapshotForPhoneNumber } from "../context/fetchSnapshot";
import {
  completeVoiceCall,
  startVoiceCall,
  reconcileVoiceCallStatus,
  updateVoiceTransferState,
} from "../convex/runtimeClient";
import {
  isTerminalTwilioCallStatus,
  normalizeTwilioCallStatusPayload,
} from "./callStatus";
import {
  buildTwilioRequestUrl,
  normalizeFormFields,
  validateTwilioSignature,
} from "./twilioRequest";
import { mapDialCallStatusToTransferOutcome } from "./transferOutcome";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

async function initializeInboundCallRecord(
  server: FastifyInstance,
  payload: Record<string, string>,
  businessId: string,
): Promise<void> {
  const callSid = payload.CallSid?.trim();
  const from = payload.From?.trim();
  const to = payload.To?.trim();

  if (businessId === demoBusinessId || !callSid || !from || !to) {
    return;
  }

  try {
    await startVoiceCall({
      businessId,
      twilioCallSid: callSid,
      from,
      to,
      startedAt: new Date().toISOString(),
    });
  } catch (error) {
    server.log.error(
      {
        err: error,
        callSid,
        businessId,
      },
      "Failed to initialize inbound call record",
    );
  }
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
    await initializeInboundCallRecord(server, payload, snapshot.businessId);

    const streamUrl = new URL("/media-stream", server.runtimeConfig.VOICE_GATEWAY_BASE_URL);
    streamUrl.protocol = streamUrl.protocol === "https:" ? "wss:" : "ws:";
    const statusCallbackUrl = new URL(
      "/twilio/voice/stream-status",
      server.runtimeConfig.VOICE_GATEWAY_BASE_URL,
    );

    const twiml = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<Response>",
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

  server.post("/twilio/voice/call-status", async (request, reply) => {
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

    const normalized = normalizeTwilioCallStatusPayload(payload);
    server.log.info(
      {
        callSid: normalized?.callSid,
        callStatus: normalized?.callStatus,
        sequenceNumber: normalized?.sequenceNumber,
        callbackSource: normalized?.callbackSource,
        timestamp: normalized?.timestamp,
        durationSeconds: normalized?.durationSeconds,
      },
      "Twilio call status callback",
    );

    if (!normalized) {
      reply.code(204);
      return null;
    }

    const providerUpdatedAt = (() => {
      if (!normalized.timestamp) {
        return new Date().toISOString();
      }

      const parsed = new Date(normalized.timestamp);
      return Number.isNaN(parsed.getTime())
        ? new Date().toISOString()
        : parsed.toISOString();
    })();

    const result = await reconcileVoiceCallStatus({
      twilioCallSid: normalized.callSid,
      callStatus: normalized.callStatus,
      providerUpdatedAt,
      ...(normalized.sequenceNumber !== undefined
        ? { sequenceNumber: normalized.sequenceNumber }
        : {}),
      ...(normalized.callbackSource !== undefined
        ? { callbackSource: normalized.callbackSource }
        : {}),
      ...(normalized.durationSeconds !== undefined
        ? { providerDurationSeconds: normalized.durationSeconds }
        : {}),
    });

    if (result.ignored && result.reason === "unknown_call") {
      server.log.warn(
        {
          callSid: normalized.callSid,
          callStatus: normalized.callStatus,
        },
        "Twilio call status callback arrived before call record initialization",
      );
      reply.header("Retry-After", "1");
      reply.code(503);
      return "Call record not ready";
    }

    server.log.info(
      {
        callSid: normalized.callSid,
        callStatus: normalized.callStatus,
        terminal: isTerminalTwilioCallStatus(normalized.callStatus),
        reconcileResult: result,
      },
      "Reconciled Twilio call status callback",
    );

    reply.code(204);
    return null;
  });

  server.post("/twilio/voice/transfer-action", async (request, reply) => {
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

    const url = new URL(requestUrl);
    const callId = url.searchParams.get("callId");
    if (!callId) {
      reply.code(400);
      return "Missing callId";
    }

    const outcome = mapDialCallStatusToTransferOutcome(payload.DialCallStatus);
    server.log.info(
      {
        callId,
        callSid: payload.CallSid,
        dialCallSid: payload.DialCallSid,
        dialCallStatus: payload.DialCallStatus,
        dialCallDuration: payload.DialCallDuration,
        outcome,
      },
      "Twilio transfer action callback",
    );

    await updateVoiceTransferState({
      callId,
      transferState: outcome.transferState,
    });
    await completeVoiceCall({
      callId,
      status: outcome.callStatus,
      disposition: outcome.disposition,
      endedAt: new Date().toISOString(),
    });

    reply.header("Content-Type", "text/xml");
    return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>';
  });

  server.get("/media-stream", async (request, reply) => {
    server.log.warn(
      {
        headers: request.headers,
      },
      "Received non-upgrade request for media stream endpoint",
    );

    reply.code(426);
    return "Upgrade Required";
  });
}
