import { buildVoiceSystemPrompt } from "@ai-receptionist/ai";
import { loadVoiceGatewayEnv } from "@ai-receptionist/config";
import type { BusinessContextSnapshot } from "@ai-receptionist/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
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

type MediaStreamQuery = {
  callSid?: string;
  businessId?: string;
  from?: string;
  to?: string;
};

type TwilioMediaMessage = {
  event: string;
  sequenceNumber?: string;
  streamSid?: string;
  start?: {
    callSid?: string;
    streamSid?: string;
  };
  media?: {
    payload: string;
    timestamp?: string;
  };
};

type OpenAiRealtimeMessage = {
  type: string;
  delta?: string;
  transcript?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  item?: {
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
  };
};

type ActiveVoiceSession = {
  businessId: string;
  snapshot: BusinessContextSnapshot;
  callSid: string;
  from: string;
  to: string;
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
  inboundAudio: Array<TimedAudioChunk>;
  outboundAudio: Array<TimedAudioChunk>;
  pendingInboundAudio: Array<string>;
  pendingTasks: Set<Promise<unknown>>;
};

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
  if (!session.pendingTransferDestination || session.transferExecuted) {
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
  openAiSocket: WebSocket,
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
    if (openAiSocket.readyState === WebSocket.OPEN) {
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
  if (!session.callId || !input.text || input.text.trim().length === 0) {
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

async function configureOpenAiSession(
  openAiSocket: WebSocket,
  session: ActiveVoiceSession,
): Promise<void> {
  const runtimeConfig = loadVoiceGatewayEnv(process.env);
  postRealtimeEvent(openAiSocket, {
    type: "session.update",
    session: {
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
    const result = await executeVoiceTool({
      toolName: message.name,
      rawArguments: message.arguments,
      snapshot: session.snapshot,
      businessId: session.businessId,
      ...(session.callId !== null ? { callId: session.callId } : {}),
      ...(session.conversationId !== null
        ? { conversationId: session.conversationId }
        : {}),
      callerPhone: session.from,
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

  switch (payload.type) {
    case "response.audio.delta": {
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
      queueTranscriptWrite(server, session, {
        speaker: "caller",
        text: payload.transcript,
      });
      return;
    }
    case "response.audio_transcript.done": {
      queueTranscriptWrite(server, session, {
        speaker: "assistant",
        text: payload.transcript,
      });
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
    default: {
      return;
    }
  }
}

export async function handleMediaStreamConnection(
  server: FastifyInstance,
  twilioSocket: WebSocket,
  request: FastifyRequest,
): Promise<void> {
  const query = (request.query as MediaStreamQuery | undefined) ?? {};
  const callSid = query.callSid ?? "unknown-call";
  const to = query.to ?? "";
  const from = query.from ?? "";

  let snapshot =
    query.businessId !== undefined ? server.snapshotCache.get(query.businessId) : null;
  if (!snapshot) {
    snapshot = await fetchSnapshotForPhoneNumber(to);
    server.snapshotCache.set(snapshot.businessId, snapshot);
  }

  const session: ActiveVoiceSession = {
    businessId: snapshot.businessId,
    snapshot,
    callSid,
    from,
    to,
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
    inboundAudio: [],
    outboundAudio: [],
    pendingInboundAudio: [],
    pendingTasks: new Set(),
  };

  const runtimeConfig = server.runtimeConfig;
  if (!runtimeConfig.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for live voice calls.");
  }

  const openAiSocket = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(runtimeConfig.OPENAI_REALTIME_MODEL)}`,
    {
      headers: {
        Authorization: `Bearer ${runtimeConfig.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    },
  );

  const startCallTask = initializeCallRecord(server, session);
  trackTask(session, startCallTask);

  twilioSocket.on("message", (rawMessage: WebSocket.RawData) => {
    const payload = JSON.parse(rawMessage.toString()) as TwilioMediaMessage;

    if (payload.event === "start") {
      session.streamSid = payload.start?.streamSid ?? payload.streamSid ?? null;
      return;
    }

    if (payload.event === "media" && payload.media?.payload) {
      session.inboundAudio.push({
        offsetMs: Number(payload.media.timestamp ?? 0),
        payload: payload.media.payload,
      });
      if (openAiSocket.readyState === WebSocket.OPEN && session.openAiReady) {
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
      void finalizeCall(server, openAiSocket, twilioSocket, session, "stream_stopped");
    }
  });

  openAiSocket.on("open", () => {
    void configureOpenAiSession(openAiSocket, session);
  });

  openAiSocket.on("message", (rawMessage: WebSocket.RawData) => {
    handleOpenAiMessage(server, openAiSocket, twilioSocket, session, rawMessage);
  });

  openAiSocket.on("error", (error: Error) => {
    server.log.error(error);
  });

  twilioSocket.on("close", () => {
    void finalizeCall(server, openAiSocket, twilioSocket, session, "twilio_socket_closed");
  });

  twilioSocket.on("error", (error: Error) => {
    server.log.error(error);
  });

  openAiSocket.on("close", () => {
    if (!session.finalized) {
      void finalizeCall(server, openAiSocket, twilioSocket, session, "openai_socket_closed");
    }
  });
}
