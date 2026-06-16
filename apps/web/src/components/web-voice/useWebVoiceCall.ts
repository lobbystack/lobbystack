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

type UseWebVoiceCallOptions = {
  businessSlug: string;
  endpoint: string;
  widgetId?: string;
  getStartPayload?: () => Promise<Record<string, string>>;
  onEvent?: (
    eventName: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
};

type WebVoiceRecordingState = {
  audioContext: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAtMs: number;
  localSource: MediaStreamAudioSourceNode;
  remoteSource: MediaStreamAudioSourceNode | null;
};

type WebVoiceRecordingUpload = {
  blob: Blob;
  durationMs: number;
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
    if (error.message === "Not found") {
      return "businessNotFound";
    }
    if (
      error.message === "web_voice_rate_limited" ||
      error.message === "Too many web voice starts. Please try again shortly."
    ) {
      return "rateLimited";
    }
    if (error.message === "The AI receptionist is unavailable right now.") {
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

function currentTimeMs(): number {
  return Date.now();
}

function getRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );
}

function getAudioContextConstructor(): typeof AudioContext | null {
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? win.webkitAudioContext ?? null;
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

export function useWebVoiceCall({
  businessSlug,
  endpoint,
  getStartPayload,
  widgetId,
  onEvent,
}: UseWebVoiceCallOptions) {
  const [status, setStatus] = useState<WebVoiceWidgetStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [errorKey, setErrorKey] = useState<WebVoiceErrorKey | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const recordingRef = useRef<WebVoiceRecordingState | null>(null);
  const connectedRef = useRef(false);
  const startCallAttemptRef = useRef(0);

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

  const stopRecordingWithoutUpload = () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) {
      return;
    }

    recording.recorder.ondataavailable = null;
    recording.recorder.onstop = null;
    if (recording.recorder.state !== "inactive") {
      recording.recorder.stop();
    }
    recording.localSource.disconnect();
    recording.remoteSource?.disconnect();
    void recording.audioContext.close().catch(() => undefined);
  };

  const cleanup = (options: { resetState?: boolean } = {}) => {
    const resetState = options.resetState ?? true;
    invalidatePendingStart();
    stopRecordingWithoutUpload();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    remoteStreamRef.current = null;
    connectedRef.current = false;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (resetState) {
      setRemoteStream(null);
      setMuted(false);
    }
  };

  const startRecording = (localStream: MediaStream) => {
    if (recordingRef.current) {
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      return;
    }

    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      return;
    }

    try {
      const audioContext = new AudioContextConstructor();
      const destination = audioContext.createMediaStreamDestination();
      const localSource = audioContext.createMediaStreamSource(localStream);
      localSource.connect(destination);
      const mimeType = getRecordingMimeType();
      const recorder = new MediaRecorder(
        destination.stream,
        mimeType ? { mimeType } : undefined,
      );
      const recording: WebVoiceRecordingState = {
        audioContext,
        destination,
        recorder,
        chunks: [],
        startedAtMs: currentTimeMs(),
        localSource,
        remoteSource: null,
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recording.chunks.push(event.data);
        }
      };
      recorder.start();
      recordingRef.current = recording;
      if (remoteStreamRef.current) {
        attachRemoteToRecording(remoteStreamRef.current);
      }
      void audioContext.resume().catch(() => undefined);
    } catch {
      // Recording is optional for dashboard test calls.
    }
  };

  const attachRemoteToRecording = (stream: MediaStream) => {
    const recording = recordingRef.current;
    if (!recording || recording.remoteSource) {
      return;
    }

    try {
      const remoteSource =
        recording.audioContext.createMediaStreamSource(stream);
      remoteSource.connect(recording.destination);
      recording.remoteSource = remoteSource;
    } catch {
      // Recording is optional for dashboard test calls.
    }
  };

  const stopRecordingForUpload =
    async (): Promise<WebVoiceRecordingUpload | null> => {
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (!recording) {
        return null;
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        recording.recorder.onstop = () => {
          resolve(
            recording.chunks.length > 0
              ? new Blob(recording.chunks, {
                  type: recording.recorder.mimeType || "audio/webm",
                })
              : null,
          );
        };
        if (recording.recorder.state === "inactive") {
          recording.recorder.onstop?.(new Event("stop"));
          return;
        }
        recording.recorder.stop();
      });

      recording.localSource.disconnect();
      recording.remoteSource?.disconnect();
      void recording.audioContext.close().catch(() => undefined);

      if (!blob || blob.size === 0) {
        return null;
      }

      return {
        blob,
        durationMs: Math.max(0, currentTimeMs() - recording.startedAtMs),
      };
    };

  const uploadRecordingBlob = async (
    sessionId: string,
    recording: WebVoiceRecordingUpload,
  ) => {
    const response = await fetch(
      `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(
        sessionId,
      )}/recording?durationMs=${encodeURIComponent(String(recording.durationMs))}`,
      {
        method: "POST",
        headers: {
          "Content-Type": recording.blob.type || "audio/webm",
        },
        body: recording.blob,
      },
    );
    if (!response.ok) {
      throw new Error("The recording could not be uploaded.");
    }
  };

  const endRemoteSession = async (
    options: { uploadRecording?: boolean; sessionId?: string } = {},
  ) => {
    const shouldUploadRecording = options.uploadRecording ?? true;
    const sessionId = options.sessionId ?? sessionIdRef.current;
    if (options.sessionId === undefined || sessionIdRef.current === options.sessionId) {
      sessionIdRef.current = null;
    }
    if (!sessionId) {
      stopRecordingWithoutUpload();
      return;
    }

    const recording = shouldUploadRecording
      ? await stopRecordingForUpload()
      : (stopRecordingWithoutUpload(), null);

    void fetch(
      `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(sessionId)}/end`,
      {
        method: "POST",
        keepalive: true,
      },
    ).catch(() => undefined);

    if (recording) {
      void uploadRecordingBlob(sessionId, recording).catch(() => undefined);
    }
  };

  useEffect(
    () => () => {
      void endRemoteSession({ uploadRecording: false });
      cleanup({ resetState: false });
    },
    // The cleanup path must use the current refs at unmount, not restart on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const endCall = async () => {
    if (status !== "connected" && status !== "connecting") {
      return;
    }
    invalidatePendingStart();
    setStatus("ending");
    await endRemoteSession();
    cleanup();
    setStatus("ended");
    emit("web.voice.test_call_ended");
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
    await endRemoteSession({ uploadRecording: connectedRef.current });
    cleanup();
    setStatus("idle");
    setErrorKey(null);
    emit("web.voice.test_call_ended");
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
    connectedRef.current = false;
    remoteStreamRef.current = null;
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

      connection.ontrack = (event) => {
        const [stream] = event.streams;
        if (remoteAudioRef.current && stream) {
          remoteStreamRef.current = stream;
          setRemoteStream(stream);
          attachRemoteToRecording(stream);
          remoteAudioRef.current.srcObject = stream;
          void remoteAudioRef.current.play().catch(() => undefined);
        }
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") {
          connectedRef.current = true;
          if (localStreamRef.current) {
            startRecording(localStreamRef.current);
          }
          setStatus("connected");
          emit("web.voice.test_call_connected");
        }
        if (
          connection.connectionState === "failed" ||
          connection.connectionState === "disconnected"
        ) {
          setStatus("error");
          setErrorKey("connectionDropped");
          emit("web.voice.test_call_error", {
            connectionState: connection.connectionState,
          });
          void endRemoteSession({
            uploadRecording: connectedRef.current,
          }).finally(cleanup);
        }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug,
          widgetId,
          visitorId,
          ...(getStartPayload ? await getStartPayload() : {}),
          sdp: offer.sdp,
          pageUrl: window.location.href,
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

      const payload = (await response.json()) as {
        sessionId: string;
        sdp: string;
      };
      if (attemptId !== startCallAttemptRef.current) {
        stopAttemptResources();
        await endRemoteSession({
          uploadRecording: false,
          sessionId: payload.sessionId,
        });
        return;
      }
      sessionIdRef.current = payload.sessionId;
      await connection.setRemoteDescription({
        type: "answer",
        sdp: payload.sdp,
      });
    } catch (error) {
      if (attemptId !== startCallAttemptRef.current) {
        stopAttemptResources();
        return;
      }
      await endRemoteSession({ uploadRecording: false });
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
