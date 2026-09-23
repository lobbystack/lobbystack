import { Mic, MicOff, Phone, PhoneOff, Waves } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  useWebVoiceCall,
  webVoiceStatusLabel,
  webVoiceStatusLabelFr,
} from "@/components/web-voice/useWebVoiceCall"

type WebVoiceWidgetProps = {
  locale?: "en" | "fr"
  businessSlug: string
  endpoint: string
  widgetId?: string
  className?: string
  onEvent?: (eventName: string, properties?: Record<string, unknown>) => void
}

export function WebVoiceWidget({
  locale = "en",
  businessSlug,
  endpoint,
  widgetId,
  className,
  onEvent,
}: WebVoiceWidgetProps) {
  const {
    status,
    muted,
    errorMessage,
    remoteAudioRef,
    startCall,
    endCall,
    toggleMute,
    isCallActive,
    isBusy,
  } = useWebVoiceCall({
    locale,
    businessSlug,
    endpoint,
    widgetId,
    onEvent,
  })

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-xl rounded-3xl border bg-card p-4 text-left shadow-sm md:p-5",
        className
      )}
    >
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full",
                status === "connected"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              <Waves className="size-4" aria-hidden="true" />
            </span>
            {locale === "fr" ? "Parlez à LobbyStack" : "Talk to LobbyStack"}
          </div>
          <p
            className="mt-2 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {errorMessage ?? (locale === "fr" ? webVoiceStatusLabelFr : webVoiceStatusLabel)[status]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status === "connecting" ? (
            <Button type="button" variant="secondary" disabled>
              {locale === "fr" ? "Connexion…" : "Connecting…"}
            </Button>
          ) : isCallActive ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={toggleMute}
                aria-label={locale === "fr" ? (muted ? "Activer le microphone" : "Couper le microphone") : (muted ? "Unmute microphone" : "Mute microphone")}
              >
                {muted ? (
                  <MicOff className="size-4" aria-hidden="true" />
                ) : (
                  <Mic className="size-4" aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="destructive"
                onClick={endCall}
                className="cursor-pointer"
                aria-label={locale === "fr" ? "Terminer l’appel" : "End call"}
              >
                <PhoneOff className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <Button type="button" onClick={startCall} disabled={isBusy}>
              <Phone className="size-4" aria-hidden="true" />
              {locale === "fr" ? (isBusy ? "Connexion" : "Appeler") : (isBusy ? "Connecting" : "Call now")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
