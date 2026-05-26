import { useEffect, useRef, useState } from "react"

export type WebVoiceWidgetStatus =
  | "idle"
  | "requesting_microphone"
  | "connecting"
  | "connected"
  | "ending"
  | "ended"
  | "error"

type UseWebVoiceCallOptions = {
  businessSlug: string
  endpoint: string
  widgetId?: string
  onEvent?: (eventName: string, properties?: Record<string, unknown>) => void
}

type WebVoiceRecordingState = {
  audioContext: AudioContext
  destination: MediaStreamAudioDestinationNode
  recorder: MediaRecorder
  chunks: Blob[]
  startedAtMs: number
  localSource: MediaStreamAudioSourceNode
  remoteSource: MediaStreamAudioSourceNode | null
}

type WebVoiceRecordingUpload = {
  blob: Blob
  durationMs: number
}

export const webVoiceStatusLabel: Record<WebVoiceWidgetStatus, string> = {
  idle: "Ready when you are",
  requesting_microphone: "Asking for microphone access",
  connecting: "Connecting to the AI receptionist",
  connected: "Live with the AI receptionist",
  ending: "Ending the call",
  ended: "Call ended",
  error: "Could not start the call",
}

function getErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was blocked."
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found on this device."
  }
  if (error instanceof DOMException && error.name === "NotReadableError") {
    return "The microphone is already in use by another app."
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The voice gateway took too long to respond."
  }
  if (error instanceof TypeError && error.message === "Load failed") {
    return "The voice gateway is not reachable from this page."
  }
  if (error instanceof Error) {
    return error.message
  }
  return "Something went wrong while starting the call."
}

function currentTimeMs(): number {
  return Date.now()
}

function getRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
  return candidates.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate)
  )
}

function getAudioContextConstructor(): typeof AudioContext | null {
  const win = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? win.webkitAudioContext ?? null
}

function getVisitorId(): string | undefined {
  try {
    const key = "lobbystack.webVoiceVisitorId"
    const existing = window.localStorage.getItem(key)
    if (existing) {
      return existing
    }

    const next = crypto.randomUUID()
    window.localStorage.setItem(key, next)
    return next
  } catch {
    return undefined
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

export function useWebVoiceCall({
  businessSlug,
  endpoint,
  widgetId,
  onEvent,
}: UseWebVoiceCallOptions) {
  const [status, setStatus] = useState<WebVoiceWidgetStatus>("idle")
  const [muted, setMuted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const recordingRef = useRef<WebVoiceRecordingState | null>(null)
  const connectedRef = useRef(false)

  const emit = (eventName: string, properties?: Record<string, unknown>) => {
    onEvent?.(eventName, {
      businessSlug,
      widgetId,
      ...properties,
    })
  }

  const stopRecordingWithoutUpload = () => {
    const recording = recordingRef.current
    recordingRef.current = null
    if (!recording) {
      return
    }

    recording.recorder.ondataavailable = null
    recording.recorder.onstop = null
    if (recording.recorder.state !== "inactive") {
      recording.recorder.stop()
    }
    recording.localSource.disconnect()
    recording.remoteSource?.disconnect()
    void recording.audioContext.close().catch(() => undefined)
  }

  const cleanup = (options: { resetState?: boolean } = {}) => {
    const resetState = options.resetState ?? true
    stopRecordingWithoutUpload()
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    remoteStreamRef.current = null
    connectedRef.current = false
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
    if (resetState) {
      setRemoteStream(null)
      setMuted(false)
    }
  }

  const startRecording = (localStream: MediaStream) => {
    if (recordingRef.current) {
      return
    }

    if (typeof MediaRecorder === "undefined") {
      emit("landing.web_voice_recording_unavailable", {
        reason: "media_recorder_unavailable",
      })
      return
    }

    const AudioContextConstructor = getAudioContextConstructor()
    if (!AudioContextConstructor) {
      emit("landing.web_voice_recording_unavailable", {
        reason: "audio_context_unavailable",
      })
      return
    }

    try {
      const audioContext = new AudioContextConstructor()
      const destination = audioContext.createMediaStreamDestination()
      const localSource = audioContext.createMediaStreamSource(localStream)
      localSource.connect(destination)
      const mimeType = getRecordingMimeType()
      const recorder = new MediaRecorder(
        destination.stream,
        mimeType ? { mimeType } : undefined
      )
      const recording: WebVoiceRecordingState = {
        audioContext,
        destination,
        recorder,
        chunks: [],
        startedAtMs: currentTimeMs(),
        localSource,
        remoteSource: null,
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recording.chunks.push(event.data)
        }
      }
      recorder.start()
      recordingRef.current = recording
      if (remoteStreamRef.current) {
        attachRemoteToRecording(remoteStreamRef.current)
      }
      void audioContext.resume().catch(() => undefined)
    } catch (error) {
      emit("landing.web_voice_recording_unavailable", {
        reason: getErrorMessage(error),
      })
    }
  }

  const attachRemoteToRecording = (stream: MediaStream) => {
    const recording = recordingRef.current
    if (!recording || recording.remoteSource) {
      return
    }

    try {
      const remoteSource =
        recording.audioContext.createMediaStreamSource(stream)
      remoteSource.connect(recording.destination)
      recording.remoteSource = remoteSource
    } catch (error) {
      emit("landing.web_voice_recording_unavailable", {
        reason: getErrorMessage(error),
      })
    }
  }

  const stopRecordingForUpload =
    async (): Promise<WebVoiceRecordingUpload | null> => {
      const recording = recordingRef.current
      recordingRef.current = null
      if (!recording) {
        return null
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        recording.recorder.onstop = () => {
          resolve(
            recording.chunks.length > 0
              ? new Blob(recording.chunks, {
                  type: recording.recorder.mimeType || "audio/webm",
                })
              : null
          )
        }
        if (recording.recorder.state === "inactive") {
          recording.recorder.onstop?.(new Event("stop"))
          return
        }
        recording.recorder.stop()
      })

      recording.localSource.disconnect()
      recording.remoteSource?.disconnect()
      void recording.audioContext.close().catch(() => undefined)

      if (!blob || blob.size === 0) {
        return null
      }

      return {
        blob,
        durationMs: Math.max(0, currentTimeMs() - recording.startedAtMs),
      }
    }

  const uploadRecordingBlob = async (
    sessionId: string,
    recording: WebVoiceRecordingUpload
  ) => {
    const response = await fetch(
      `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(
        sessionId
      )}/recording?durationMs=${encodeURIComponent(String(recording.durationMs))}`,
      {
        method: "POST",
        headers: {
          "Content-Type": recording.blob.type || "audio/webm",
        },
        body: recording.blob,
      }
    )
    if (!response.ok) {
      throw new Error("The recording could not be uploaded.")
    }
    emit("landing.web_voice_recording_uploaded", {
      sessionId,
      durationMs: recording.durationMs,
      byteLength: recording.blob.size,
      contentType: recording.blob.type || "audio/webm",
    })
  }

  const endRemoteSession = async (
    options: { uploadRecording?: boolean } = {}
  ) => {
    const shouldUploadRecording = options.uploadRecording ?? true
    const sessionId = sessionIdRef.current
    sessionIdRef.current = null
    if (!sessionId) {
      stopRecordingWithoutUpload()
      return
    }

    const recording = shouldUploadRecording
      ? await stopRecordingForUpload()
      : (stopRecordingWithoutUpload(), null)

    void fetch(
      `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(sessionId)}/end`,
      {
        method: "POST",
        keepalive: true,
      }
    ).catch(() => undefined)

    if (recording) {
      void uploadRecordingBlob(sessionId, recording).catch((error: unknown) => {
        emit("landing.web_voice_recording_upload_error", {
          sessionId,
          reason: getErrorMessage(error),
        })
      })
    }
  }

  useEffect(
    () => () => {
      void endRemoteSession({ uploadRecording: false })
      cleanup({ resetState: false })
    },
    // The cleanup path must use the current refs at unmount, not restart on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const endCall = async () => {
    if (status !== "connected" && status !== "connecting") {
      return
    }
    setStatus("ending")
    await endRemoteSession()
    cleanup()
    setStatus("ended")
    emit("landing.web_voice_call_ended")
  }

  const startCall = async () => {
    if (isBusy || isCallActive) {
      return
    }

    setErrorMessage(null)
    connectedRef.current = false
    remoteStreamRef.current = null
    setStatus("requesting_microphone")
    emit("landing.web_voice_call_started")

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone calls.")
      }
      if (typeof RTCPeerConnection === "undefined") {
        throw new Error("This browser does not support live voice calls.")
      }

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      localStreamRef.current = localStream
      setStatus("connecting")
      const visitorId = getVisitorId()

      const peerConnection = new RTCPeerConnection()
      peerConnectionRef.current = peerConnection
      localStream
        .getAudioTracks()
        .forEach((track) => peerConnection.addTrack(track, localStream))

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams
        if (remoteAudioRef.current && stream) {
          remoteStreamRef.current = stream
          setRemoteStream(stream)
          attachRemoteToRecording(stream)
          remoteAudioRef.current.srcObject = stream
          void remoteAudioRef.current.play().catch(() => undefined)
        }
      }

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") {
          connectedRef.current = true
          if (localStreamRef.current) {
            startRecording(localStreamRef.current)
          }
          setStatus("connected")
          emit("landing.web_voice_call_connected")
        }
        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected"
        ) {
          setStatus("error")
          setErrorMessage("The voice connection dropped.")
          emit("landing.web_voice_call_error", {
            connectionState: peerConnection.connectionState,
          })
          void endRemoteSession({
            uploadRecording: connectedRef.current,
          }).finally(cleanup)
        }
      }

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
      })
      await peerConnection.setLocalDescription(offer)

      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug,
          widgetId,
          visitorId,
          sdp: offer.sdp,
          pageUrl: window.location.href,
        }),
      })

      if (!response.ok) {
        const detail = await response
          .json()
          .then((body: unknown) =>
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : null
          )
          .catch(() => null)
        throw new Error(
          detail ?? "The AI receptionist is unavailable right now."
        )
      }

      const payload = (await response.json()) as {
        sessionId: string
        sdp: string
      }
      sessionIdRef.current = payload.sessionId
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: payload.sdp,
      })
      emit("landing.web_voice_session_created", {
        sessionId: payload.sessionId,
      })
    } catch (error) {
      await endRemoteSession({ uploadRecording: false })
      cleanup()
      setStatus("error")
      setErrorMessage(getErrorMessage(error))
      emit("landing.web_voice_call_error", {
        reason: getErrorMessage(error),
      })
    }
  }

  const toggleMute = () => {
    const nextMuted = !muted
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted
    })
    setMuted(nextMuted)
    emit("landing.web_voice_call_mute_toggled", { muted: nextMuted })
  }

  const isCallActive = status === "connecting" || status === "connected"
  const isBusy = status === "requesting_microphone" || status === "connecting"

  return {
    status,
    muted,
    errorMessage,
    remoteAudioRef,
    remoteStream,
    startCall,
    endCall,
    toggleMute,
    isCallActive,
    isBusy,
  }
}
