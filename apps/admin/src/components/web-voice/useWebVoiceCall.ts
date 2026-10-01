import { useEffect, useRef, useState } from "react";

import type { TelemetryEventName } from "@lobbystack/telemetry";

export type WebVoiceWidgetStatus =
  | "idle"
  | "requesting_microphone"
  | "connecting"
  | "connected"
  | "ending"
  | "ended"
  | "error";

/** Browser calls start here; the server records the call and connects it to GPT-Live. */
export const LIVE_WEB_CALL_ENDPOINT = "/api/voice/live/session";

type UseWebVoiceCallOptions = {
  businessSlug: string;
  /** Defaults to this app's session endpoint. */
  endpoint?: string;
  widgetId?: string;
  getStartPayload?: () => Promise<Record<string, string>>;
  /** Extra request headers, such as the widget's session token. */
  getHeaders?: () => Record<string, string>;
  onEvent?: (
    eventName: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
};

export type WebVoiceErrorKey =
  | "microphoneBlocked"
  | "microphoneNotFound"
  | "microphoneInUse"
  | "gatewayTimeout"
  | "gatewayUnreachable"
  | "connectionDropped"
  | "browserNoMicrophone"
  | "browserNoWebRtc"
  | "businessNotFound"
  | "rateLimited"
  | "unavailable"
  | "generic";

export function getWebVoiceErrorKey(error: unknown): WebVoiceErrorKey {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "microphoneBlocked";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "microphoneNotFound";
  }
  if (error instanceof DOMException && error.name === "NotReadableError") {
    return "microphoneInUse";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "gatewayTimeout";
  }
  if (error instanceof TypeError && error.message === "Load failed") {
    return "gatewayUnreachable";
  }
  if (error instanceof Error) {
    if (error.message === "The voice connection dropped.") {
      return "connectionDropped";
    }
    if (error.message === "This browser does not support microphone calls.") {
      return "browserNoMicrophone";
    }
    if (error.message === "This browser does not support live voice calls.") {
      return "browserNoWebRtc";
    }
    if (error.message === "not_found") {
      return "businessNotFound";
    }
    if (error.message === "web_voice_rate_limited") {
      return "rateLimited";
    }
    if (error.message === "voice_limit_reached" || error.message === "voice_unavailable" || error.message === "The AI receptionist is unavailable right now.") {
      return "unavailable";
    }
  }
  return "generic";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong while starting the call.";
}

function getVisitorId(): string | undefined {
  try {
    const key = "lobbystack.webVoiceVisitorId";
    const existing = window.localStorage.getItem(key);
    if (existing) {
      return existing;
    }

    const next = crypto.randomUUID();
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return undefined;
  }
}

type StartedSession = { sessionId: string; endToken: string };

/** Who ended a call that ended normally. */
export type WebVoiceEndedBy = "caller" | "agent";

// How long a "disconnected" peer connection may take to recover before we
// count the call as dropped.
export const DISCONNECT_GRACE_MS = 5_000;

/**
 * Returns the close reason when a data channel message is GPT-Live's
 * session.closed event. Only the event type and reason are read: this channel
 * also carries the conversation transcript, which must never leave the call.
 */
export function readSessionClosedReason(data: unknown): string | undefined {
  if (typeof data !== "string" || !data.includes("session.closed")) return undefined;
  try {
    const event = JSON.parse(data) as { type?: unknown; reason?: unknown } | null;
    if (event?.type !== "session.closed") return undefined;
    return typeof event.reason === "string" ? event.reason : "unknown";
  } catch {
    return undefined;
  }
}

// Asks the server to end a session whose audio channel never opened. The end
// route sits next to the start endpoint, and only accepts the start response's token.
function requestSessionEnd(endpoint: string, session: StartedSession): void {
  const url = new URL(endpoint, window.location.href);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/end`;
  url.search = "";
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
    keepalive: true,
  }).catch(() => undefined);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * A browser voice call on GPT-Live. The server records the call, answers
 * the agent's requests and keeps the recording; the browser only carries
 * audio, asks OpenAI to close the session when the caller hangs up, and
 * watches for the session closing when the receptionist hangs up.
 */
export function useWebVoiceCall({
  businessSlug,
  endpoint = LIVE_WEB_CALL_ENDPOINT,
  getStartPayload,
  getHeaders,
  widgetId,
  onEvent,
}: UseWebVoiceCallOptions) {
  const [status, setStatus] = useState<WebVoiceWidgetStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [errorKey, setErrorKey] = useState<WebVoiceErrorKey | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const eventsChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<StartedSession | null>(null);
  const startCallAttemptRef = useRef(0);
  const disconnectTimerRef = useRef<number | undefined>(undefined);

  const invalidatePendingStart = () => {
    startCallAttemptRef.current += 1;
  };

  const emit = (
    eventName: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => {
    onEvent?.(eventName, {
      businessSlug,
      widgetId,
      ...properties,
    });
  };

  // Closing the session ends the call and its billing at OpenAI. Before the
  // channel opens, the server ends it instead.
  const endRemoteSession = () => {
    const channel = eventsChannelRef.current;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (channel?.readyState === "open") {
      try {
        channel.send(JSON.stringify({ type: "session.close" }));
        return;
      } catch {
        // Fall back to the server below.
      }
    }
    if (session) requestSessionEnd(endpoint, session);
  };

  const cleanup = (options: { resetState?: boolean } = {}) => {
    const resetState = options.resetState ?? true;
    invalidatePendingStart();
    window.clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = undefined;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    eventsChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (resetState) {
      setRemoteStream(null);
      setMuted(false);
    }
  };

  useEffect(
    () => () => {
      endRemoteSession();
      cleanup({ resetState: false });
    },
    // The cleanup path must use the current refs at unmount, not restart on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const endCall = async () => {
    if (status !== "connected" && status !== "connecting" && status !== "requesting_microphone") {
      return;
    }
    invalidatePendingStart();
    setStatus("ending");
    endRemoteSession();
    cleanup();
    setStatus("ended");
    emit("web.voice.test_call_ended", { endedBy: "caller" satisfies WebVoiceEndedBy });
  };

  const forceEndCall = async () => {
    if (status === "idle" || status === "ended" || status === "error") {
      cleanup();
      setStatus("idle");
      setErrorKey(null);
      return;
    }

    if (status === "ending") {
      // endCall is already tearing the call down; avoid duplicate telemetry.
      return;
    }

    invalidatePendingStart();
    setStatus("ending");
    endRemoteSession();
    cleanup();
    setStatus("idle");
    setErrorKey(null);
    emit("web.voice.test_call_ended", { endedBy: "caller" satisfies WebVoiceEndedBy });
  };

  const startCall = async () => {
    if (isBusy || isCallActive) {
      return;
    }

    const attemptId = ++startCallAttemptRef.current;
    let localStream: MediaStream | null = null;
    let peerConnection: RTCPeerConnection | null = null;

    const stopAttemptResources = () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        if (localStreamRef.current === localStream) {
          localStreamRef.current = null;
        }
        localStream = null;
      }
      if (peerConnection) {
        peerConnection.close();
        if (peerConnectionRef.current === peerConnection) {
          peerConnectionRef.current = null;
        }
        peerConnection = null;
      }
    };

    setErrorKey(null);
    setStatus("requesting_microphone");
    emit("web.voice.test_call_started");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone calls.");
      }
      if (typeof RTCPeerConnection === "undefined") {
        throw new Error("This browser does not support live voice calls.");
      }

      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = localStream;
      const stream = localStream;
      if (!stream) {
        throw new Error("This browser does not support microphone calls.");
      }
      if (attemptId !== startCallAttemptRef.current) {
        stopAttemptResources();
        return;
      }
      setStatus("connecting");
      const visitorId = getVisitorId();

      const connection = new RTCPeerConnection();
      peerConnection = connection;
      peerConnectionRef.current = connection;
      stream.getAudioTracks().forEach((track) => connection.addTrack(track, stream));
      // GPT-Live reads client events from this channel; we only ever send
      // session.close, and only read session.closed.
      const eventsChannel = connection.createDataChannel("oai-events");
      eventsChannelRef.current = eventsChannel;
      // Ignore events from a call this hook has already torn down.
      const isCurrentCall = () => peerConnectionRef.current === connection;

      const dropCall = (properties: Record<string, unknown>) => {
        setStatus("error");
        setErrorKey("connectionDropped");
        emit("web.voice.test_call_error", properties);
        endRemoteSession();
        cleanup();
      };

      // The receptionist can end the call itself: its endCall tool, the
      // silence timeout or the plan's time limit make the worker close the
      // GPT-Live session. The browser then only sees its peer go away, which
      // looks like a dropped connection. OpenAI sends the terminal
      // session.closed event, with its reason, on this channel before it
      // closes the transport (buildBrowserSessionConfig allows it), so that
      // event is how we tell a hang-up from a failure. It needs no extra
      // request and works the same for the dashboard and the website widget.
      // Asking the admin API how the call ended would need a new public
      // endpoint that finds a call by session across workspaces, and would
      // race the worker saving the call. Without session.closed, a lost
      // connection still shows as an error.
      eventsChannel.onmessage = (event: MessageEvent) => {
        if (!isCurrentCall()) return;
        const reason = readSessionClosedReason(event.data);
        if (reason === undefined) return;
        // The session is already closed at OpenAI, so there is nothing to end.
        sessionRef.current = null;
        if (reason === "connection_lost") {
          dropCall({ closeReason: reason });
          return;
        }
        cleanup();
        setStatus("ended");
        emit("web.voice.test_call_ended", { endedBy: "agent" satisfies WebVoiceEndedBy });
      };

      connection.ontrack = (event) => {
        const [stream] = event.streams;
        const remote = stream ?? new MediaStream([event.track]);
        if (remoteAudioRef.current) {
          setRemoteStream(remote);
          remoteAudioRef.current.srcObject = remote;
          void remoteAudioRef.current.play().catch(() => undefined);
        }
      };

      // "disconnected" often recovers on its own after a network blip, so it
      // only starts a grace period. "failed", or no recovery in time, is a
      // dropped call. A session.closed that arrives meanwhile ends it normally.
      connection.onconnectionstatechange = () => {
        if (!isCurrentCall()) return;
        const state = connection.connectionState;
        if (state === "connected") {
          if (disconnectTimerRef.current !== undefined) {
            window.clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = undefined;
            return;
          }
          setStatus("connected");
          emit("web.voice.test_call_connected");
          return;
        }
        if (state === "disconnected") {
          if (disconnectTimerRef.current !== undefined) return;
          disconnectTimerRef.current = window.setTimeout(() => {
            disconnectTimerRef.current = undefined;
            if (isCurrentCall()) dropCall({ connectionState: "disconnected" });
          }, DISCONNECT_GRACE_MS);
          return;
        }
        if (state === "failed") dropCall({ connectionState: state });
      };

      const offer = await connection.createOffer({
        offerToReceiveAudio: true,
      });
      await connection.setLocalDescription(offer);

      if (attemptId !== startCallAttemptRef.current) {
        stopAttemptResources();
        return;
      }

      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getHeaders ? getHeaders() : {}) },
        body: JSON.stringify({
          businessSlug,
          widgetId,
          visitorId,
          ...(getStartPayload ? await getStartPayload() : {}),
          sdp: offer.sdp,
          pageUrl: `${window.location.origin}${window.location.pathname}`,
        }),
      });

      if (!response.ok) {
        const detail = await response
          .json()
          .then((body: unknown) => {
            if (typeof body !== "object" || body === null) {
              return null;
            }
            if ("code" in body && typeof body.code === "string") {
              return body.code;
            }
            if ("error" in body && typeof body.error === "string") {
              return body.error;
            }
            return null;
          })
          .catch(() => null);
        throw new Error(
          detail ?? "The AI receptionist is unavailable right now.",
        );
      }

      const payload = (await response.json()) as StartedSession & { sdp: string };
      const session = { sessionId: payload.sessionId, endToken: payload.endToken };
      if (attemptId !== startCallAttemptRef.current) {
        stopAttemptResources();
        // The caller gave up while connecting, but the server already started
        // the session; end it so it doesn't run and bill until the silence timeout.
        requestSessionEnd(endpoint, session);
        return;
      }
      sessionRef.current = session;
      await connection.setRemoteDescription({
        type: "answer",
        sdp: payload.sdp,
      });
    } catch (error) {
      if (attemptId !== startCallAttemptRef.current) {
        stopAttemptResources();
        return;
      }
      // The server may already have started a session, for example when the
      // browser rejects OpenAI's answer; end it rather than leave it billing.
      endRemoteSession();
      cleanup();
      setStatus("error");
      setErrorKey(getWebVoiceErrorKey(error));
      emit("web.voice.test_call_error", {
        reason: getErrorMessage(error),
      });
    }
  };

  const isCallActive = status === "connecting" || status === "connected";
  const isBusy = status === "requesting_microphone" || status === "connecting";

  return {
    status,
    muted,
    errorKey,
    remoteAudioRef,
    remoteStream,
    startCall,
    endCall,
    forceEndCall,
    isCallActive,
    isBusy,
  };
}
