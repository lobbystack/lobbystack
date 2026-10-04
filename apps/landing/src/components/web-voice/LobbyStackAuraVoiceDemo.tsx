import { ArrowRight, Phone, PhoneOff } from "lucide-react"
import {
  AuraVoiceOrb,
  useWebVoiceCall,
  type WebVoiceCallEvent,
  type WebVoiceErrorKey,
  type WebVoiceWidgetStatus,
} from "@lobbystack/web-voice"

import { Button, buttonVariants } from "@/components/ui/button"
import { appSignupUrl } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n"

type LobbyStackAuraVoiceDemoProps = {
  locale?: Locale
  businessSlug: string
  endpoint: string
  widgetId?: string
  onEvent?: (eventName: string, properties?: Record<string, unknown>) => void
}

// Pill labels around the demo button, and the next step after a call ends.
const demoCopy = {
  en: {
    start: "Start call",
    connecting: "Connecting…",
    hangUp: "Hang up",
    prompt: "Want it answering your phone?",
    cta: "Set up LobbyStack free",
  },
  fr: {
    start: "Lancer l’appel",
    connecting: "Connexion…",
    hangUp: "Raccrocher",
    prompt: "Vous voulez qu’il réponde à votre téléphone ?",
    cta: "Configurer LobbyStack gratuitement",
  },
  es: {
    start: "Iniciar llamada",
    connecting: "Conectando…",
    hangUp: "Colgar",
    prompt: "¿Quiere que conteste su teléfono?",
    cta: "Configure LobbyStack gratis",
  },
  sr: {
    start: "Započni poziv",
    connecting: "Povezivanje…",
    hangUp: "Prekini",
    prompt: "Želite da se javlja na Vaš telefon?",
    cta: "Podesite LobbyStack besplatno",
  },
} satisfies Record<Locale, Record<string, string>>

// Accessible names for the round demo button, by call status.
const buttonLabels = {
  en: {
    connected: "End AI voice demo",
    connectedMuted: "End muted AI voice demo",
    ending: "Ending AI voice demo",
    requestingMicrophone: "Waiting for microphone permission",
    connecting: "Connecting AI voice demo",
    error: "Retry AI voice demo",
    idle: "Start AI voice demo",
  },
  fr: {
    connected: "Terminer la démo vocale",
    connectedMuted: "Terminer la démo vocale",
    ending: "Fin de la démo vocale",
    requestingMicrophone: "Autorisez l’accès au microphone",
    connecting: "Connexion à la démo vocale",
    error: "Réessayer la démo vocale",
    idle: "Démarrer la démo vocale",
  },
  es: {
    connected: "Finalizar la demo de voz con IA",
    connectedMuted: "Finalizar la demo de voz con IA silenciada",
    ending: "Finalizando la demo de voz con IA",
    requestingMicrophone: "Esperando el permiso del micrófono",
    connecting: "Conectando la demo de voz con IA",
    error: "Reintentar la demo de voz con IA",
    idle: "Iniciar la demo de voz con IA",
  },
  sr: {
    connected: "Završi AI glasovni demo",
    connectedMuted: "Završi utišani AI glasovni demo",
    ending: "Završavanje AI glasovnog demoa",
    requestingMicrophone: "Čeka se dozvola za mikrofon",
    connecting: "Povezivanje AI glasovnog demoa",
    error: "Ponovo pokreni AI glasovni demo",
    idle: "Pokreni AI glasovni demo",
  },
} satisfies Record<Locale, Record<string, string>>

function getButtonLabel(
  status: WebVoiceWidgetStatus,
  muted: boolean,
  locale: Locale
) {
  const labels = buttonLabels[locale]
  if (status === "connected") {
    return muted ? labels.connectedMuted : labels.connected
  }
  if (status === "ending") {
    return labels.ending
  }
  if (status === "requesting_microphone") {
    return labels.requestingMicrophone
  }
  if (status === "connecting") {
    return labels.connecting
  }
  if (status === "error") {
    return labels.error
  }
  return labels.idle
}

const statusLabels: Record<Locale, Record<WebVoiceWidgetStatus, string>> = {
  en: {
    idle: "Ready when you are",
    requesting_microphone: "Asking for microphone access",
    connecting: "Connecting to the AI receptionist",
    connected: "Live with the AI receptionist",
    ending: "Ending the call",
    ended: "Call ended",
    error: "Could not start the call",
  },
  fr: {
    idle: "Prêt pour votre appel",
    requesting_microphone: "Autorisez l’accès au microphone",
    connecting: "Connexion au réceptionniste IA",
    connected: "En ligne avec le réceptionniste IA",
    ending: "Fin de l’appel",
    ended: "Appel terminé",
    error: "Impossible de démarrer l’appel",
  },
  es: {
    idle: "Lista cuando usted quiera",
    requesting_microphone: "Solicitando acceso al micrófono",
    connecting: "Conectando con la recepcionista con IA",
    connected: "En línea con la recepcionista con IA",
    ending: "Finalizando la llamada",
    ended: "Llamada finalizada",
    error: "No se pudo iniciar la llamada",
  },
  sr: {
    idle: "Spremno kad i Vi",
    requesting_microphone: "Tražimo pristup mikrofonu",
    connecting: "Povezivanje sa AI recepcionerom",
    connected: "Uživo sa AI recepcionerom",
    ending: "Završavanje poziva",
    ended: "Poziv je završen",
    error: "Poziv nije mogao da počne",
  },
}

// Errors without their own line here show the generic one.
const errorCopy: Record<
  Locale,
  Partial<Record<WebVoiceErrorKey, string>> & { generic: string }
> = {
  en: {
    microphoneBlocked: "Microphone access was blocked.",
    microphoneNotFound: "No microphone was found on this device.",
    microphoneInUse: "The microphone is already in use by another app.",
    gatewayTimeout: "The call took too long to connect.",
    gatewayUnreachable: "This page can't reach LobbyStack to start the call.",
    connectionDropped: "The voice connection dropped.",
    browserNoMicrophone: "This browser does not support microphone calls.",
    browserNoWebRtc: "This browser does not support live voice calls.",
    unavailable: "The AI receptionist is unavailable right now.",
    generic: "Something went wrong while starting the call.",
  },
  fr: {
    microphoneBlocked: "Autorisez l’accès au microphone dans votre navigateur.",
    microphoneNotFound: "Branchez un microphone pour continuer.",
    microphoneInUse: "Fermez l’autre application qui utilise le microphone.",
    connectionDropped: "La connexion vocale a été interrompue.",
    generic: "Impossible de démarrer l’appel. Réessayez.",
  },
  es: {
    microphoneBlocked: "Permita el acceso al micrófono en su navegador.",
    microphoneNotFound: "Conecte un micrófono para continuar.",
    microphoneInUse: "Cierre la otra aplicación que está usando el micrófono.",
    gatewayTimeout: "La llamada tardó demasiado en conectarse.",
    gatewayUnreachable:
      "Esta página no puede conectar con LobbyStack para iniciar la llamada.",
    connectionDropped: "Se cortó la conexión de voz.",
    generic: "No se pudo iniciar la llamada. Inténtelo de nuevo.",
  },
  sr: {
    microphoneBlocked: "Dozvolite pristup mikrofonu u pregledaču.",
    microphoneNotFound: "Povežite mikrofon da biste nastavili.",
    microphoneInUse: "Zatvorite drugu aplikaciju koja koristi mikrofon.",
    gatewayTimeout: "Povezivanje poziva je trajalo predugo.",
    gatewayUnreachable:
      "Stranica ne može da se poveže sa LobbyStack servisom da bi započela poziv.",
    connectionDropped: "Glasovna veza je prekinuta.",
    generic: "Poziv nije mogao da počne. Pokušajte ponovo.",
  },
}

function landingEventName(event: WebVoiceCallEvent) {
  return event === "session_created"
    ? "landing.web_voice_session_created"
    : `landing.web_voice_call_${event}`
}

export function LobbyStackAuraVoiceDemo({
  locale = "en",
  businessSlug,
  endpoint,
  widgetId,
  onEvent,
}: LobbyStackAuraVoiceDemoProps) {
  const call = useWebVoiceCall({
    businessSlug,
    endpoint,
    ...(widgetId ? { widgetId } : {}),
    ...(onEvent
      ? {
          onEvent: (event, properties) =>
            onEvent(landingEventName(event), properties),
        }
      : {}),
  })
  const { status, muted, errorKey, startCall, endCall, isCallActive } = call
  const errors = errorCopy[locale]

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col items-center text-center">
      <AuraVoiceOrb
        call={call}
        statusLabel={
          errorKey
            ? (errors[errorKey] ?? errors.generic)
            : statusLabels[locale][status]
        }
        buttonLabel={getButtonLabel(status, muted, locale)}
        pressMotion="subtle"
      >
        {/* Controls */}
        {status === "idle" || status === "error" ? (
          <div key="idle" className="swap-in absolute inset-x-0 top-1/2 z-20 mt-32 flex items-center justify-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={startCall}
              className="cursor-pointer rounded-full border-border bg-background text-foreground shadow-sm hover:bg-muted"
            >
              <Phone className="size-4" aria-hidden="true" />
              {demoCopy[locale].start}
            </Button>
          </div>
        ) : status === "requesting_microphone" || status === "connecting" ? (
          <div key="connecting" className="swap-in absolute inset-x-0 top-1/2 z-20 mt-32 flex items-center justify-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              className="rounded-full border-border bg-background text-foreground shadow-sm disabled:opacity-100"
            >
              {demoCopy[locale].connecting}
            </Button>
          </div>
        ) : isCallActive ? (
          <div key="live" className="swap-in absolute inset-x-0 top-1/2 z-20 mt-32 flex items-center justify-center">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={endCall}
              className="cursor-pointer rounded-full"
            >
              <PhoneOff className="size-4" aria-hidden="true" />
              {demoCopy[locale].hangUp}
            </Button>
          </div>
        ) : status === "ended" ? (
          <div key="ended" className="swap-in absolute inset-x-0 top-1/2 z-20 mt-28 flex flex-col items-center gap-3 px-4">
            <p className="text-sm font-medium text-foreground">
              {demoCopy[locale].prompt}
            </p>
            <a
              href={appSignupUrl(locale)}
              className={cn(
                buttonVariants({ size: "sm" }),
                "rounded-full px-5"
              )}
              data-ph-signup-cta
              data-ph-capture-attribute-section="voice_demo_ended"
              data-ph-capture-attribute-action="try_for_free"
              data-ph-capture-attribute-destination={appSignupUrl(locale)}
            >
              {demoCopy[locale].cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </AuraVoiceOrb>
    </div>
  )
}
