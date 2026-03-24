import { buildVoiceSystemPrompt } from "@ai-receptionist/ai";
import { loadVoiceGatewayEnv } from "@ai-receptionist/config";
import { demoBusinessId, type BusinessContextSnapshot } from "@ai-receptionist/shared";
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
import {
  endLiveCallWithMessage,
  transferLiveCall,
} from "./transferCall";
import {
  buildProviderFailureMessage,
  buildToolFailureRecoveryInstructions,
} from "./failureRecovery";
import {
  buildMediaStreamValidationUrls,
  validateMediaStreamSignature,
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
  event_id?: string;
  delta?: string;
  transcript?: string;
  text?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  item_id?: string;
  previous_item_id?: string | null;
  response_id?: string;
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
    id?: string;
    status?: string;
    conversation_id?: string | null;
    metadata?: Record<string, string | null> | null;
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
  pendingTransferMarkName: string | null;
  transferExecuted: boolean;
  providerRecoveryStarted: boolean;
  finalized: boolean;
  finalDispositionOverride: string | null;
  transcriptSequence: number;
  seenTranscriptKeys: Set<string>;
  inboundAudio: Array<TimedAudioChunk>;
  outboundAudio: Array<TimedAudioChunk>;
  outboundCursorMs: number;
  activeAssistantResponseId: string | null;
  pendingInboundAudio: Array<string>;
  pendingTasks: Set<Promise<unknown>>;
};

type MediaStreamRequestContext = {
  url: string;
  headers: IncomingHttpHeaders;
};

function buildBusinessNowLabel(timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch (error) {
    if (error instanceof RangeError) {
      return null;
    }

    throw error;
  }
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
      name: "getBusinessServices",
      description:
        "List the structured services configured for this business, including duration and short descriptions when available.",
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
      name: "findAvailability",
      description:
        "Find candidate appointment slots for a service on a specific local date, optionally near a preferred hour, before asking the caller to confirm a precise time.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          date: {
            type: "string",
            description: "Local business date in YYYY-MM-DD format.",
          },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
          preferredHour24: { type: "integer" },
          preferredMinute: { type: "integer" },
          limit: { type: "integer" },
        },
        required: ["serviceName", "date"],
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

function estimatePayloadDurationMs(payload: string, sampleRate = 8000): number {
  const sampleCount = Buffer.from(payload, "base64").length;
  return (sampleCount / sampleRate) * 1000;
}

function captureOutboundAudio(
  session: ActiveVoiceSession,
  payload: string,
  responseId?: string,
): void {
  const currentOffsetMs = Date.now() - session.startedAtMs;
  if (responseId && responseId !== session.activeAssistantResponseId) {
    session.activeAssistantResponseId = responseId;
    session.outboundCursorMs = Math.max(session.outboundCursorMs, currentOffsetMs);
  } else if (!session.activeAssistantResponseId) {
    session.outboundCursorMs = Math.max(session.outboundCursorMs, currentOffsetMs);
  }

  session.outboundAudio.push({
    offsetMs: session.outboundCursorMs,
    payload,
  });
  session.outboundCursorMs += estimatePayloadDurationMs(payload);
}

function clearPendingTransferPlaybackWait(
  server: FastifyInstance,
  session: ActiveVoiceSession,
  reason: string,
): void {
  if (!session.pendingTransferMarkName) {
    return;
  }

  server.log.info(
    {
      callSid: session.callSid,
      streamSid: session.streamSid,
      markName: session.pendingTransferMarkName,
      reason,
    },
    "Canceled pending transfer playback wait",
  );
  session.pendingTransferMarkName = null;
}

function cancelAssistantAudio(
  server: FastifyInstance,
  openAiSocket: WebSocket,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
): void {
  postRealtimeEvent(openAiSocket, { type: "response.cancel" });
  if (session.streamSid && twilioSocket.readyState === WebSocket.OPEN) {
    clearPendingTransferPlaybackWait(server, session, "assistant_audio_cleared");
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
      ...(session.callId
        ? {
            actionUrl: getTransferActionUrl(server, session.callId),
          }
        : {}),
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

function getTransferActionUrl(server: FastifyInstance, callId: string): string {
  return new URL(
    `/twilio/voice/transfer-action?callId=${encodeURIComponent(callId)}`,
    server.runtimeConfig.VOICE_GATEWAY_BASE_URL,
  ).toString();
}

function queueTransferAfterPlayback(
  server: FastifyInstance,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
): void {
  if (
    !session.pendingTransferDestination ||
    session.transferExecuted ||
    session.pendingTransferMarkName
  ) {
    return;
  }

  if (!session.streamSid || twilioSocket.readyState !== WebSocket.OPEN) {
    const transferTask = performTransfer(server, session);
    trackTask(session, transferTask);
    return;
  }

  const markName = `transfer-${crypto.randomUUID()}`;
  session.pendingTransferMarkName = markName;
  twilioSocket.send(
    JSON.stringify({
      event: "mark",
      streamSid: session.streamSid,
      mark: {
        name: markName,
      },
    }),
  );
  server.log.info(
    {
      callSid: session.callSid,
      streamSid: session.streamSid,
      markName,
    },
    "Queued transfer to wait for Twilio playback completion",
  );
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
    const finalDisposition = session.finalDispositionOverride ?? disposition;

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
        status: finalDisposition === "transferred" ? "transferred" : "completed",
        endedAt: new Date().toISOString(),
        disposition: finalDisposition,
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

async function recoverFromProviderFailure(
  server: FastifyInstance,
  twilioSocket: WebSocket,
  session: ActiveVoiceSession,
  input: {
    disposition: string;
  },
): Promise<void> {
  if (
    session.finalized ||
    session.providerRecoveryStarted ||
    !session.callSid
  ) {
    return;
  }

  session.providerRecoveryStarted = true;
  session.finalDispositionOverride = input.disposition;

  clearPendingTransferPlaybackWait(server, session, "provider_failure_recovery");
  if (session.streamSid && twilioSocket.readyState === WebSocket.OPEN) {
    twilioSocket.send(
      JSON.stringify({
        event: "clear",
        streamSid: session.streamSid,
      }),
    );
  }

  const transferDestination = session.snapshot?.transferPolicy.transferNumber ?? null;
  const transferAvailable =
    session.snapshot?.transferPolicy.mode !== "never" && Boolean(transferDestination);
  const fallbackMessage = buildProviderFailureMessage({ transferAvailable });

  try {
    if (transferAvailable && transferDestination) {
      session.transferExecuted = true;
      if (session.callId) {
        try {
          await updateVoiceTransferState({
            callId: session.callId,
            transferState: "requested",
          });
        } catch (error) {
          server.log.error(
            {
              callId: session.callId,
              callSid: session.callSid,
              transferState: "requested",
            },
            error instanceof Error
              ? error.message
              : "Failed to persist requested transfer state during provider recovery",
          );
        }
      }

      try {
        await transferLiveCall({
          callSid: session.callSid,
          destination: transferDestination,
          sayMessage: fallbackMessage,
          ...(session.callId ? { actionUrl: getTransferActionUrl(server, session.callId) } : {}),
        });
      } catch (error) {
        if (session.callId) {
          try {
            await updateVoiceTransferState({
              callId: session.callId,
              transferState: "failed",
            });
          } catch (stateError) {
            server.log.error(
              {
                callId: session.callId,
                callSid: session.callSid,
                transferState: "failed",
              },
              stateError instanceof Error
                ? stateError.message
                : "Failed to persist failed transfer state during provider recovery",
            );
          }
        }
        throw error;
      }
      return;
    }

    await endLiveCallWithMessage({
      callSid: session.callSid,
      sayMessage: fallbackMessage,
    });
  } catch (error) {
    server.log.error(
      {
        callSid: session.callSid,
        streamSid: session.streamSid,
        disposition: input.disposition,
      },
      error instanceof Error ? error.message : "Provider recovery failed",
    );

    // Let the recovery task settle before finalization waits on pending tasks.
    queueMicrotask(() => {
      void finalizeCall(server, null, twilioSocket, session, input.disposition);
    });
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
  server.log.info(
    {
      callId: session.callId,
      sequence: session.transcriptSequence,
      speaker: input.speaker,
      text: input.text,
    },
    "Persisting transcript segment",
  );
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
  server: FastifyInstance,
): Promise<void> {
  if (!session.snapshot) {
    throw new Error("Voice session snapshot is not ready.");
  }

  const runtimeConfig = loadVoiceGatewayEnv(process.env);
  const businessNowLabel = buildBusinessNowLabel(session.snapshot.timezone);
  if (!businessNowLabel) {
    server.log.warn(
      { timezone: session.snapshot.timezone, businessId: session.businessId },
      "Skipping business-local time prompt because the configured timezone is invalid",
    );
  }

  postRealtimeEvent(openAiSocket, {
    type: "session.update",
    session: {
      instructions: [
        buildVoiceSystemPrompt(session.snapshot),
        "You are speaking on a live phone call.",
        "Start in the language implied by the configured greeting.",
        "After the greeting, adapt to the caller's language as soon as the caller clearly establishes one.",
        "Answer from the supplied business snapshot whenever possible.",
        "Use tools for authoritative actions like booking, transfer, and message taking.",
        "Do not make up availability, hours, or business policy.",
        ...(businessNowLabel
          ? [
              `The current local business time is ${businessNowLabel} in ${session.snapshot.timezone}.`,
            ]
          : [
              `The business timezone is configured as ${session.snapshot.timezone}. Interpret relative dates and times using that timezone.`,
            ]),
        "If the caller asks what services the business offers, use getBusinessServices instead of guessing or saying the list is unavailable.",
        "For booking, first collect the service, local day/date, and approximate time preference.",
        "If the caller gives a day/date or a rough time like '4' or 'afternoon', use findAvailability before trying to book.",
        "Offer one or a few specific candidate slots from findAvailability and wait for the caller to confirm one exact slot.",
        "Only call bookAppointment after the caller confirms a specific offered time.",
        "If the caller names a service loosely, map it to the closest configured service when there is an obvious match.",
        "Interpret relative dates and times in the business timezone.",
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

  postRealtimeEvent(openAiSocket, {
    type: "response.create",
    response: {
      instructions: [
        `Begin the call by greeting the caller with this exact greeting: "${session.snapshot.greeting}"`,
        "After the greeting, continue in the language implied by that greeting unless the caller clearly prefers another language.",
        "After the greeting, stop speaking and wait for the caller to respond.",
        "Do not add any extra sentence before or after the greeting.",
      ].join(" "),
    },
  });
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
    const transferAvailable =
      session.snapshot?.transferPolicy.mode !== "never" &&
      Boolean(session.snapshot?.transferPolicy.transferNumber);
    postRealtimeEvent(openAiSocket, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: message.callId,
        output: JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown tool error",
          transferAvailable,
        }),
      },
    });
    postRealtimeEvent(openAiSocket, {
      type: "response.create",
      response: {
        instructions: buildToolFailureRecoveryInstructions({
          toolName: message.name,
          transferAvailable,
        }),
      },
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
        captureOutboundAudio(session, payload.delta, payload.response_id);
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
    case "response.audio.done":
    case "response.output_audio.done": {
      return;
    }
    case "response.output_audio_transcript.delta":
    case "response.output_text.delta":
      return;
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
      session.activeAssistantResponseId = null;
      queueTranscriptWriteIfNew(
        server,
        session,
        `assistant-output-transcript:${payload.item_id ?? "unknown"}:${payload.content_index ?? 0}:${payload.transcript ?? ""}`,
        {
          speaker: "assistant",
          text: payload.transcript,
        },
      );
      return;
    }
    case "response.done": {
      if (
        payload.response?.status === "completed" &&
        session.pendingTransferDestination &&
        !session.transferExecuted
      ) {
        queueTransferAfterPlayback(server, twilioSocket, session);
      }
      return;
    }
    case "input_audio_buffer.speech_started": {
      cancelAssistantAudio(server, openAiSocket, twilioSocket, session);
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

      if (payload.event === "mark") {
        if (
          payload.mark?.name &&
          session.pendingTransferMarkName &&
          payload.mark.name === session.pendingTransferMarkName
        ) {
          server.log.info(
            {
              callSid: session.callSid,
              streamSid: session.streamSid,
              markName: payload.mark.name,
            },
            "Twilio confirmed assistant playback before transfer",
          );
          session.pendingTransferMarkName = null;
          const transferTask = performTransfer(server, session);
          trackTask(session, transferTask);
        }
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
      const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
        disposition: "stream_start_failed",
      });
      trackTask(session, recoveryTask);
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
    pendingTransferMarkName: null,
    transferExecuted: false,
    providerRecoveryStarted: false,
    finalized: false,
    finalDispositionOverride: null,
    transcriptSequence: 1,
    seenTranscriptKeys: new Set(),
    inboundAudio: [],
    outboundAudio: [],
    outboundCursorMs: 0,
    activeAssistantResponseId: null,
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

    const hasValidTwilioSignature = validateMediaStreamSignature({
      authToken: runtimeConfig.TWILIO_AUTH_TOKEN,
      signatureHeader: request.headers["x-twilio-signature"],
      baseUrl: runtimeConfig.VOICE_GATEWAY_BASE_URL,
    });

    if (!hasValidTwilioSignature) {
      server.log.warn(
        { validationUrls },
        "Rejected Twilio Media Stream websocket with invalid signature",
      );
      if (typeof twilioSocket.close === "function") {
        twilioSocket.close(1008, "invalid signature");
      }
      return false;
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
      void configureOpenAiSession(openAiSocket as WebSocket, session, server);
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
      const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
        disposition: "openai_socket_error",
      });
      trackTask(session, recoveryTask);
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
      const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
        disposition: "openai_handshake_failed",
      });
      trackTask(session, recoveryTask);
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
        const recoveryTask = recoverFromProviderFailure(server, twilioSocket, session, {
          disposition: "openai_socket_closed",
        });
        trackTask(session, recoveryTask);
      }
    });
  }

}
