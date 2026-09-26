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
  locale?: "en" | "fr"
  businessSlug: string
  endpoint: string
  widgetId?: string
  onEvent?: (eventName: string, properties?: Record<string, unknown>) => void
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

export const webVoiceStatusLabelFr: Record<WebVoiceWidgetStatus, string> = {
  idle: "Prêt pour votre appel",
  requesting_microphone: "Autorisez l’accès au microphone",
  connecting: "Connexion au réceptionniste IA",
  connected: "En ligne avec le réceptionniste IA",
  ending: "Fin de l’appel",
  ended: "Appel terminé",
  error: "Impossible de démarrer l’appel",
}

function getErrorMessage(error: unknown, locale: "en" | "fr" = "en"): string {
  if (locale === "fr") {
    if (error instanceof DOMException && error.name === "NotAllowedError") return "Autorisez l’accès au microphone dans votre navigateur."
    if (error instanceof DOMException && error.name === "NotFoundError") return "Branchez un microphone pour continuer."
    if (error instanceof DOMException && error.name === "NotReadableError") return "Fermez l’autre application qui utilise le microphone."
    return "Impossible de démarrer l’appel. Réessayez."
  }
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

/**
 * A browser voice call on GPT-Live. The server records the call and keeps the
 * recording; the browser only carries audio and asks OpenAI to close the
 * session when the caller hangs up.
 */
export function useWebVoiceCall({
  locale = "en",
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
  const eventsChannelRef = useRef<RTCDataChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)

  const emit = (eventName: string, properties?: Record<string, unknown>) => {
    onEvent?.(eventName, {
      businessSlug,
      widgetId,
      ...properties,
    })
  }

  const cleanup = (options: { resetState?: boolean } = {}) => {
    const resetState = options.resetState ?? true
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    eventsChannelRef.current = null
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
    if (resetState) {
      setRemoteStream(null)
      setMuted(false)
    }
  }

  // Closing the session ends the call at OpenAI. If the channel never opened,
  // dropping the peer connection ends it too.
  const endRemoteSession = () => {
    const channel = eventsChannelRef.current
    if (channel?.readyState === "open") {
      try {
        channel.send(JSON.stringify({ type: "session.close" }))
      } catch {
        // The peer connection closes next either way.
      }
    }
  }

  useEffect(
    () => () => {
      endRemoteSession()
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
    endRemoteSession()
    cleanup()
    setStatus("ended")
    emit("landing.web_voice_call_ended")
  }

  const startCall = async () => {
    if (isBusy || isCallActive) {
      return
    }

    setErrorMessage(null)
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
      // GPT-Live reads client events from this channel; we only ever send session.close.
      eventsChannelRef.current = peerConnection.createDataChannel("oai-events")

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams
        const remote = stream ?? new MediaStream([event.track])
        if (remoteAudioRef.current) {
          setRemoteStream(remote)
          remoteAudioRef.current.srcObject = remote
          void remoteAudioRef.current.play().catch(() => undefined)
        }
      }

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") {
          setStatus("connected")
          emit("landing.web_voice_call_connected")
        }
        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected"
        ) {
          setStatus("error")
          setErrorMessage(locale === "fr" ? "La connexion vocale a été interrompue." : "The voice connection dropped.")
          emit("landing.web_voice_call_error", {
            connectionState: peerConnection.connectionState,
          })
          endRemoteSession()
          cleanup()
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
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: payload.sdp,
      })
      emit("landing.web_voice_session_created", {
        sessionId: payload.sessionId,
      })
    } catch (error) {
      cleanup()
      setStatus("error")
      setErrorMessage(getErrorMessage(error, locale))
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
