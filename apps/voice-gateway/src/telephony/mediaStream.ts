import { buildVoiceSystemPrompt } from "@ai-receptionist/ai";
import { loadVoiceGatewayEnv } from "@ai-receptionist/config";
import type { BusinessContextSnapshot } from "@ai-receptionist/shared";
import { demoBusinessId } from "@ai-receptionist/testing";
import type { IncomingHttpHeaders } from "node:http";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";

import { buildStereoCallRecording, type TimedAudioChunk } from "../audio/wav";
import {
  appendVoiceTranscript,
  completeVoiceCall,
  startVoiceCall,
  updateVoiceTransferState,
  uploadVoiceRecording,
} from "../convex/runtimeClient";
import { fetchSnapshotForPhoneNumber } from "../context/fetchSnapshot";
import { executeVoiceTool } from "../realtime/toolExecutor";
import { transferLiveCall } from "./transferCall";
import {
  validateTwilioSignature,
} from "./twilioRequest";

type TwilioMediaMessage = {
  event: string;
  sequenceNumber?: string;
  streamSid?: string;
  connected?: {
    protocol?: string;
    version?: string;
  };
  start?: {
    callSid?: string;
    streamSid?: string;
    customParameters?: Record<string, string>;
  };
  media?: {
    payload: string;
    timestamp?: string;
    track?: string;
  };
  mark?: {
    name?: string;
  };
};

type OpenAiRealtimeMessage = {
  type: string;
  delta?: string;
  transcript?: string;
  text?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  item_id?: string;
  content_index?: number;
  output_index?: number;
  part?: {
    type?: string;
    transcript?: string;
    text?: string;
  };
  item?: {
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    content?: Array<{
      type?: string;
      transcript?: string;
      text?: string;
    }>;
  };
  response?: {
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        transcript?: string;
        text?: string;
      }>;
    }>;
  };
};

type ActiveVoiceSession = {
  businessId: string | null;
  snapshot: BusinessContextSnapshot | null;
  callSid: string | null;
  from: string | null;
  to: string | null;
  gatewaySessionId: string;
  startedAtIso: string;
  startedAtMs: number;
  streamSid: string | null;
  callId: string | null;
  conversationId: string | null;
  openAiReady: boolean;
  pendingTransferDestination: string | null;
  transferExecuted: boolean;
  finalized: boolean;
  transcriptSequence: number;
  seenTranscriptKeys: Set<string>;
  inboundAudio: Array<TimedAudioChunk>;
  outboundAudio: Array<TimedAudioChunk>;
  pendingInboundAudio: Array<string>;
  pendingTasks: Set<Promise<unknown>>;
};

type MediaStreamRequestContext = {
  url: string;
  headers: IncomingHttpHeaders;
};

function buildMediaStreamValidationUrls(baseUrl: string): string[] {
  const httpsUrl = new URL("/media-stream", baseUrl);
  const websocketUrl = new URL(httpsUrl.toString());
  websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";
  return [websocketUrl.toString(), httpsUrl.toString()];
}

function createRealtimeToolDefinitions() {
  return [
    {
      type: "function",
      name: "getBusinessHours",
      description: "Get the authoritative business hours and closure information.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "searchKnowledge",
      description:
        "Search the receptionist snapshot knowledge, including FAQs and the document digest, for a specific question.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "checkAvailability",
      description:
        "Check appointment availability for a named service at an exact ISO datetime before promising a slot.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          startsAt: { type: "string" },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
        },
        required: ["serviceName", "startsAt"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "bookAppointment",
      description:
        "Book an appointment only after availability is confirmed. Use the caller phone by default if no callback number is provided.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          startsAt: { type: "string" },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
          contactName: { type: "string" },
          contactPhone: { type: "string" },
        },
        required: ["serviceName", "startsAt"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "transferCall",
      description:
        "Transfer the live call to a human when transfer policy allows it and the caller requests or needs a human handoff.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "takeMessage",
      description:
        "Capture a structured callback message when a transfer is not possible or the caller wants a message left for staff.",
      parameters: {
        type: "object",
        properties: {
          callerName: { type: "string" },
          callbackPhone: { type: "string" },
          message: { type: "string" },
          urgency: { type: "string" },
          callbackWindow: { type: "string" },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
  ];
}

function trackTask(session: ActiveVoiceSession, task: Promise<unknown>): void {
  session.pendingTasks.add(task);
  task.finally(() => {
    session.pendingTasks.delete(task);
  });
}

function postRealtimeEvent(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function captureOutboundAudio(session: ActiveVoiceSession, payload: string): void {
  session.outboundAudio.push({
    offsetMs: Date.now() - session.startedAtMs,
    payload,
  });
}

function cancelAssistantAudio(
  openAiSocket: WebSocket,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
): void {
  postRealtimeEvent(openAiSocket, { type: "response.cancel" });
  if (session.streamSid && twilioSocket.readyState === WebSocket.OPEN) {
    twilioSocket.send(
      JSON.stringify({
        event: "clear",
        streamSid: session.streamSid,
      }),
    );
  }
}

async function performTransfer(
  server: FastifyInstance,
  session: ActiveVoiceSession,
): Promise<void> {
  if (!session.pendingTransferDestination || session.transferExecuted || !session.callSid) {
    return;
  }

  session.transferExecuted = true;
  try {
    await transferLiveCall({
      callSid: session.callSid,
      destination: session.pendingTransferDestination,
    });
    if (session.callId) {
      await updateVoiceTransferState({
        callId: session.callId,
        transferState: "completed",
      });
    }
  } catch (error) {
    server.log.error(error);
    if (session.callId) {
      await updateVoiceTransferState({
        callId: session.callId,
        transferState: "failed",
      });
    }
  }
}

async function finalizeCall(
  server: FastifyInstance,
  openAiSocket: WebSocket | null,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
  disposition: string,
): Promise<void> {
  if (session.finalized) {
    return;
  }
  session.finalized = true;

  try {
    await Promise.allSettled(Array.from(session.pendingTasks));

    if (session.callId) {
      const durationMs = Math.max(0, Date.now() - session.startedAtMs);
      if (session.inboundAudio.length > 0 || session.outboundAudio.length > 0) {
        const recording = buildStereoCallRecording({
          inboundChunks: session.inboundAudio,
          outboundChunks: session.outboundAudio,
        });
        await uploadVoiceRecording({
          callId: session.callId,
          durationMs,
          audio: recording,
        });
      }

      await completeVoiceCall({
        callId: session.callId,
        status: disposition === "transferred" ? "transferred" : "completed",
        endedAt: new Date().toISOString(),
        disposition,
      });
    }
  } catch (error) {
    server.log.error(error);
  } finally {
    if (openAiSocket?.readyState === WebSocket.OPEN) {
      openAiSocket.close();
    }
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  }
}

function queueTranscriptWrite(
  server: FastifyInstance,
  session: ActiveVoiceSession,
  input: {
    speaker: string;
    text: string | undefined;
    confidence?: number;
  },
): void {
  if (
    !session.businessId ||
    !session.callId ||
    !input.text ||
    input.text.trim().length === 0
  ) {
    return;
  }

  const transcriptPromise = appendVoiceTranscript({
    businessId: session.businessId,
    callId: session.callId,
    sequence: session.transcriptSequence,
    speaker: input.speaker,
    text: input.text,
    final: true,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
  }).catch((error) => {
    server.log.error(error);
  });
  session.transcriptSequence += 1;
  trackTask(session, transcriptPromise);
}

function queueTranscriptWriteIfNew(
  server: FastifyInstance,
  session: ActiveVoiceSession,
  dedupeKey: string,
  input: {
    speaker: string;
    text: string | undefined;
    confidence?: number;
  },
): void {
  if (!input.text || input.text.trim().length === 0) {
    return;
  }

  if (session.seenTranscriptKeys.has(dedupeKey)) {
    return;
  }

  session.seenTranscriptKeys.add(dedupeKey);
  queueTranscriptWrite(server, session, input);
}

async function configureOpenAiSession(
  openAiSocket: WebSocket,
  session: ActiveVoiceSession,
): Promise<void> {
  if (!session.snapshot) {
    throw new Error("Voice session snapshot is not ready.");
  }

  const runtimeConfig = loadVoiceGatewayEnv(process.env);
  postRealtimeEvent(openAiSocket, {
    type: "session.update",
    session: {
      model: runtimeConfig.OPENAI_REALTIME_MODEL,
      instructions: [
        buildVoiceSystemPrompt(session.snapshot),
        "You are speaking on a live phone call.",
        "Answer from the supplied business snapshot whenever possible.",
        "Use tools for authoritative actions like booking, transfer, and message taking.",
        "Do not make up availability, hours, or business policy.",
      ].join("\n\n"),
      modalities: ["audio", "text"],
      voice: runtimeConfig.OPENAI_REALTIME_VOICE,
      input_audio_format: "g711_ulaw",
      output_audio_format: "g711_ulaw",
      input_audio_transcription: {
        model: runtimeConfig.OPENAI_TRANSCRIPTION_MODEL,
      },
      turn_detection: {
        type: "server_vad",
        create_response: true,
        interrupt_response: true,
      },
      tools: createRealtimeToolDefinitions(),
      tool_choice: "auto",
    },
  });

  session.openAiReady = true;
  for (const payload of session.pendingInboundAudio) {
    postRealtimeEvent(openAiSocket, {
      type: "input_audio_buffer.append",
      audio: payload,
    });
  }
  session.pendingInboundAudio = [];
}

async function initializeCallRecord(
  server: FastifyInstance,
  session: ActiveVoiceSession,
): Promise<void> {
  if (session.businessId === demoBusinessId) {
    server.log.info("Skipping call record initialization for demo fallback snapshot");
    return;
  }

  if (!session.businessId || !session.callSid || !session.from || !session.to) {
    throw new Error("Voice session metadata is incomplete.");
  }

  try {
    const result = await startVoiceCall({
      businessId: session.businessId,
      twilioCallSid: session.callSid,
      gatewaySessionId: session.gatewaySessionId,
      from: session.from,
      to: session.to,
      startedAt: session.startedAtIso,
    });
    session.callId = result.callId;
    session.conversationId = result.conversationId ?? null;
  } catch (error) {
    server.log.error(error);
  }
}

async function handleToolCall(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  session: ActiveVoiceSession,
  message: {
    name: string;
    callId: string;
    arguments: string;
  },
): Promise<void> {
  try {
    if (!session.snapshot || !session.businessId) {
      throw new Error("Voice session has not been initialized.");
    }

    const result = await executeVoiceTool({
      toolName: message.name,
      rawArguments: message.arguments,
      snapshot: session.snapshot,
      businessId: session.businessId,
      ...(session.callId !== null ? { callId: session.callId } : {}),
      ...(session.conversationId !== null
        ? { conversationId: session.conversationId }
        : {}),
      callerPhone: session.from ?? "unknown",
    });

    if (result.pendingTransferDestination) {
      session.pendingTransferDestination = result.pendingTransferDestination;
    }

    postRealtimeEvent(openAiSocket, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: message.callId,
        output: JSON.stringify(result.result),
      },
    });
    postRealtimeEvent(openAiSocket, {
      type: "response.create",
    });
  } catch (error) {
    server.log.error(error);
    postRealtimeEvent(openAiSocket, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: message.callId,
        output: JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown tool error",
        }),
      },
    });
    postRealtimeEvent(openAiSocket, {
      type: "response.create",
    });
  }
}

function handleOpenAiMessage(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
  rawMessage: WebSocket.RawData,
): void {
  const payload = JSON.parse(rawMessage.toString()) as OpenAiRealtimeMessage;

  if (
    payload.type !== "response.audio.delta" &&
    payload.type !== "response.output_audio.delta"
  ) {
    server.log.info({ type: payload.type }, "Received OpenAI Realtime event");
  }

  switch (payload.type) {
    case "response.audio.delta":
    case "response.output_audio.delta": {
      if (payload.delta && session.streamSid && twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(
          JSON.stringify({
            event: "media",
            streamSid: session.streamSid,
            media: {
              payload: payload.delta,
            },
          }),
        );
        captureOutboundAudio(session, payload.delta);
      }
      return;
    }
    case "conversation.item.input_audio_transcription.completed": {
      queueTranscriptWriteIfNew(
        server,
        session,
        `caller-completed:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.transcript ?? ""}`,
        {
        speaker: "caller",
        text: payload.transcript,
      },
      );
      return;
    }
    case "conversation.item.input_audio_transcription.segment": {
      queueTranscriptWriteIfNew(
        server,
        session,
        `caller-segment:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.text ?? ""}`,
        {
          speaker: "caller",
          text: payload.text,
        },
      );
      return;
    }
    case "conversation.item.input_audio_transcription.failed": {
      server.log.warn(
        {
          itemId: payload.item_id,
        },
        "Input audio transcription failed",
      );
      return;
    }
    case "response.audio_transcript.done":
    case "response.output_audio_transcript.done": {
      queueTranscriptWriteIfNew(
        server,
        session,
        `assistant-output-transcript:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.transcript ?? ""}`,
        {
          speaker: "assistant",
          text: payload.transcript,
        },
      );
      if (session.pendingTransferDestination && !session.transferExecuted) {
        const transferTask = performTransfer(server, session);
        trackTask(session, transferTask);
      }
      return;
    }
    case "response.content_part.done": {
      if (payload.part?.type === "audio" && payload.part.transcript) {
        queueTranscriptWriteIfNew(
          server,
          session,
          `assistant-content-part:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.part.transcript}`,
          {
            speaker: "assistant",
            text: payload.part.transcript,
          },
        );
      }
      if (session.pendingTransferDestination && !session.transferExecuted) {
        const transferTask = performTransfer(server, session);
        trackTask(session, transferTask);
      }
      return;
    }
    case "input_audio_buffer.speech_started": {
      cancelAssistantAudio(openAiSocket, twilioSocket, session);
      return;
    }
    case "response.function_call_arguments.done": {
      if (payload.name && payload.call_id && payload.arguments) {
        const task = handleToolCall(server, openAiSocket, session, {
          name: payload.name,
          callId: payload.call_id,
          arguments: payload.arguments,
        });
        trackTask(session, task);
      }
      return;
    }
    case "response.output_item.done": {
      if (payload.item?.type === "message" && payload.item.content) {
        for (const contentPart of payload.item.content) {
          if (contentPart.type === "audio" && contentPart.transcript) {
            queueTranscriptWriteIfNew(
              server,
              session,
              `assistant-output-item:${payload.item_id ?? "unknown"}:${contentPart.transcript}`,
              {
                speaker: "assistant",
                text: contentPart.transcript,
              },
            );
          }
        }
      }
      if (
        payload.item?.type === "function_call" &&
        payload.item.name &&
        payload.item.call_id &&
        payload.item.arguments
      ) {
        const task = handleToolCall(server, openAiSocket, session, {
          name: payload.item.name,
          callId: payload.item.call_id,
          arguments: payload.item.arguments,
        });
        trackTask(session, task);
      }
      return;
    }
    case "response.done": {
      for (const outputItem of payload.response?.output ?? []) {
        for (const contentPart of outputItem.content ?? []) {
          if (contentPart.type === "audio" && contentPart.transcript) {
            queueTranscriptWriteIfNew(
              server,
              session,
              `assistant-response-done:${payload.output_index ?? 0}:${contentPart.transcript}`,
              {
                speaker: "assistant",
                text: contentPart.transcript,
              },
            );
          }
        }
      }
      return;
    }
    default: {
      return;
    }
  }
}

export async function handleMediaStreamConnection(
  server: FastifyInstance,
  twilioSocket: WebSocket,
  request: MediaStreamRequestContext,
): Promise<void> {
  let openAiSocket: WebSocket | null = null;
  let signatureValidated = false;

  twilioSocket.on("message", (rawMessage: WebSocket.RawData) => {
    void (async () => {
      if (!ensureMediaStreamRequestIsAllowed()) {
        return;
      }

      const payload = JSON.parse(rawMessage.toString()) as TwilioMediaMessage;
      server.log.info(
        { event: payload.event, streamSid: payload.streamSid, callSid: payload.start?.callSid },
        "Received Twilio Media Stream event",
      );

      if (payload.event === "connected") {
        return;
      }

      if (payload.event === "start") {
        await startRealtimeSession(payload);
        return;
      }

      if (payload.event === "media" && payload.media?.payload) {
        if (payload.media.track && payload.media.track !== "inbound") {
          return;
        }

        session.inboundAudio.push({
          offsetMs: Number(payload.media.timestamp ?? 0),
          payload: payload.media.payload,
        });
        if (openAiSocket?.readyState === WebSocket.OPEN && session.openAiReady) {
          postRealtimeEvent(openAiSocket, {
            type: "input_audio_buffer.append",
            audio: payload.media.payload,
          });
        } else {
          session.pendingInboundAudio.push(payload.media.payload);
        }
        return;
      }

      if (payload.event === "stop") {
        await finalizeCall(server, openAiSocket, twilioSocket, session, "stream_stopped");
      }
    })().catch((error) => {
      server.log.error(error);
      void finalizeCall(server, openAiSocket, twilioSocket, session, "stream_start_failed");
    });
  });

  twilioSocket.on("close", () => {
    server.log.info(
      {
        callSid: session.callSid,
        streamSid: session.streamSid,
      },
      "Twilio Media Stream websocket closed",
    );
    void finalizeCall(server, openAiSocket, twilioSocket, session, "twilio_socket_closed");
  });

  twilioSocket.on("error", (error: Error) => {
    server.log.error(error);
  });

  server.log.info(
    {
      url: request.url,
      host: request.headers.host,
      upgrade: request.headers.upgrade,
      connection: request.headers.connection,
    },
    "Accepted Media Stream websocket route",
  );
  const session: ActiveVoiceSession = {
    businessId: null,
    snapshot: null,
    callSid: null,
    from: null,
    to: null,
    gatewaySessionId: crypto.randomUUID(),
    startedAtIso: new Date().toISOString(),
    startedAtMs: Date.now(),
    streamSid: null,
    callId: null,
    conversationId: null,
    openAiReady: false,
    pendingTransferDestination: null,
    transferExecuted: false,
    finalized: false,
    transcriptSequence: 1,
    seenTranscriptKeys: new Set(),
    inboundAudio: [],
    outboundAudio: [],
    pendingInboundAudio: [],
    pendingTasks: new Set(),
  };

  const runtimeConfig = server.runtimeConfig;
  const validationUrls = buildMediaStreamValidationUrls(
    runtimeConfig.VOICE_GATEWAY_BASE_URL,
  );
  function ensureMediaStreamRequestIsAllowed(): boolean {
    if (signatureValidated) {
      return true;
    }

    const hasValidTwilioSignature = validationUrls.some((candidateUrl) =>
      validateTwilioSignature({
        authToken: runtimeConfig.TWILIO_AUTH_TOKEN,
        signatureHeader: request.headers["x-twilio-signature"],
        url: candidateUrl,
      }),
    );

    if (!hasValidTwilioSignature) {
      if (runtimeConfig.DEPLOYMENT_MODE === "development") {
        server.log.warn(
          { validationUrls },
          "Skipping Twilio Media Stream signature enforcement in development mode",
        );
      } else {
        server.log.warn(
          { validationUrls },
          "Rejected Twilio Media Stream websocket with invalid signature",
        );
        if (typeof twilioSocket.close === "function") {
          twilioSocket.close(1008, "invalid signature");
        }
        return false;
      }
    }

    if (!runtimeConfig.OPENAI_API_KEY) {
      server.log.error("OPENAI_API_KEY is required for live voice calls.");
      if (typeof twilioSocket.close === "function") {
        twilioSocket.close(1011, "missing openai api key");
      }
      return false;
    }

    signatureValidated = true;
    return true;
  }

  async function startRealtimeSession(message: TwilioMediaMessage): Promise<void> {
    if (openAiSocket) {
      return;
    }

    const customParameters = message.start?.customParameters ?? {};
    session.callSid = message.start?.callSid ?? customParameters.callSid ?? "unknown-call";
    session.streamSid = message.start?.streamSid ?? message.streamSid ?? null;
    session.businessId = customParameters.businessId ?? null;
    session.from = customParameters.from ?? null;
    session.to = customParameters.to ?? null;
    session.startedAtIso = new Date().toISOString();
    session.startedAtMs = Date.now();

    let snapshot =
      session.businessId !== null ? server.snapshotCache.get(session.businessId) : null;
    if (!snapshot) {
      if (!session.to) {
        throw new Error("Twilio stream start did not include the called phone number.");
      }
      snapshot = await fetchSnapshotForPhoneNumber(session.to);
      server.snapshotCache.set(snapshot.businessId, snapshot);
      session.businessId = snapshot.businessId;
    }

    session.snapshot = snapshot;
    await initializeCallRecord(server, session);

    openAiSocket = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(runtimeConfig.OPENAI_REALTIME_MODEL)}`,
      {
        headers: {
          Authorization: `Bearer ${runtimeConfig.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      },
    );

    openAiSocket.on("open", () => {
      server.log.info(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          businessId: session.businessId,
          model: runtimeConfig.OPENAI_REALTIME_MODEL,
        },
        "OpenAI Realtime websocket opened",
      );
      void configureOpenAiSession(openAiSocket as WebSocket, session);
    });

    openAiSocket.on("message", (rawMessage: WebSocket.RawData) => {
      handleOpenAiMessage(server, openAiSocket as WebSocket, twilioSocket, session, rawMessage);
    });

    openAiSocket.on("error", (error: Error) => {
      server.log.error(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          message: error.message,
          stack: error.stack,
        },
        "OpenAI Realtime websocket error",
      );
    });

    openAiSocket.on("unexpected-response", (_request, response) => {
      server.log.error(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
        },
        "OpenAI Realtime websocket handshake failed",
      );
    });

    openAiSocket.on("close", (code, reason) => {
      server.log.info(
        {
          callSid: session.callSid,
          streamSid: session.streamSid,
          code,
          reason: reason.toString(),
        },
        "OpenAI Realtime websocket closed",
      );
      if (!session.finalized) {
        void finalizeCall(server, openAiSocket, twilioSocket, session, "openai_socket_closed");
      }
    });
  }

}
