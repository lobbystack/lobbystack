"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Toaster, toast } from "sonner"
import { ArrowRight, Check, ChevronDown, Phone, PhoneOff } from "lucide-react"
import { intlLocale, runtimeLocales, type RuntimeLocale } from "@lobbystack/shared"
import {
  AuraVoiceOrb,
  useWebVoiceCall,
  type WebVoiceCallEvent,
  type WebVoiceErrorKey,
  type WebVoiceWidgetStatus,
} from "@lobbystack/web-voice"

import { Button, buttonVariants } from "@/marketing/components/ui/button"
import { ButtonGroup } from "@/marketing/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/marketing/components/ui/dropdown-menu"
import { LanguageFlag } from "@/marketing/components/web-voice/LanguageFlag"
import { appSignupUrl } from "@/marketing/lib/app-links"
import type { Locale } from "@/marketing/i18n"

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
    language: "Language the AI speaks",
    connecting: "Connecting…",
    hangUp: "Hang up",
    prompt: "Want it answering your phone?",
    cta: "Set up LobbyStack free",
  },
  fr: {
    start: "Lancer l’appel",
    language: "Langue de l’IA",
    connecting: "Connexion…",
    hangUp: "Raccrocher",
    prompt: "Vous voulez qu’il réponde à votre téléphone ?",
    cta: "Configurer LobbyStack gratuitement",
  },
  es: {
    start: "Iniciar llamada",
    language: "Idioma de la IA",
    connecting: "Conectando…",
    hangUp: "Colgar",
    prompt: "¿Quiere que conteste su teléfono?",
    cta: "Configure LobbyStack gratis",
  },
  sr: {
    start: "Započni poziv",
    language: "Jezik AI asistenta",
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
    voiceLimitReached: "The AI receptionist is unavailable right now.",
    rateLimited: "You've reached the demo limit for now. Try again in an hour.",
    businessNotFound: "The demo isn't set up on this site yet.",
    unavailable: "The AI receptionist is unavailable right now.",
    generic: "Something went wrong while starting the call.",
  },
  fr: {
    microphoneBlocked: "Autorisez l’accès au microphone dans votre navigateur.",
    microphoneNotFound: "Branchez un microphone pour continuer.",
    microphoneInUse: "Fermez l’autre application qui utilise le microphone.",
    connectionDropped: "La connexion vocale a été interrompue.",
    rateLimited: "Vous avez atteint la limite de la démo. Réessayez dans une heure.",
    voiceLimitReached: "Le réceptionniste IA est indisponible pour le moment.",
    businessNotFound: "La démo n’est pas encore configurée sur ce site.",
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
    rateLimited: "Alcanzó el límite de la demo. Inténtelo de nuevo en una hora.",
    voiceLimitReached: "La recepcionista con IA no está disponible ahora.",
    businessNotFound: "La demo aún no está configurada en este sitio.",
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
    rateLimited: "Dostigli ste ograničenje demoa. Pokušajte ponovo za sat vremena.",
    voiceLimitReached: "AI recepcioner trenutno nije dostupan.",
    businessNotFound: "Demo još nije podešen na ovom sajtu.",
    generic: "Poziv nije mogao da počne. Pokušajte ponovo.",
  },
}

/** Each language named in itself, so a visitor finds theirs whatever language the page is in. */
function languageName(language: RuntimeLocale) {
  // Asked for the bare language: "sr-Latn" would add "(latinica)", and the page is Latin script already.
  const name = new Intl.DisplayNames([intlLocale(language)], { type: "language" }).of(language) ?? language
  return name.charAt(0).toLocaleUpperCase(intlLocale(language)) + name.slice(1)
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
  // The language the AI speaks starts as the page's own and is sent with the call.
  const [language, setLanguage] = useState<RuntimeLocale>(locale)
  const languageRef = useRef(language)
  languageRef.current = language
  const getStartPayload = useCallback(async () => ({ language: languageRef.current }), [])
  const languages = useMemo(() => runtimeLocales.map((code) => ({ code, label: languageName(code) })), [])
  const call = useWebVoiceCall({
    businessSlug,
    endpoint,
    getStartPayload,
    ...(widgetId ? { widgetId } : {}),
    ...(onEvent
      ? {
          onEvent: (event, properties) =>
            onEvent(landingEventName(event), properties),
        }
      : {}),
  })
  const { status, muted, errorKey, startCall, endCall, isCallActive, canHangUp } = call
  const errors = errorCopy[locale]
  // The line under the orb is easy to miss, so a failed start also says why in a toast.
  const errorMessage = errorKey ? (errors[errorKey] ?? errors.generic) : null
  useEffect(() => {
    if (status === "error" && errorMessage) toast.error(errorMessage)
  }, [status, errorKey, errorMessage])

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col items-center text-center">
      <Toaster position="bottom-center" richColors />
      <AuraVoiceOrb
        call={call}
        statusLabel={
          errorKey
            ? (errors[errorKey] ?? errors.generic)
            : statusLabels[locale][status]
        }
        buttonLabel={getButtonLabel(canHangUp ? "connected" : status, muted, locale)}
        pressMotion="subtle"
      >
        {/* Controls */}
        {status === "idle" || status === "error" ? (
          <div key="idle" className="swap-in absolute inset-x-0 top-1/2 z-20 mt-32 flex items-center justify-center">
            <ButtonGroup>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={startCall}
                className="cursor-pointer rounded-l-full border-border bg-background text-foreground shadow-sm hover:bg-muted"
              >
                <Phone className="size-4" aria-hidden="true" />
                {demoCopy[locale].start}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`${demoCopy[locale].language}: ${languageName(language)}`}
                      className="cursor-pointer rounded-r-full border-border bg-background px-2.5 text-foreground shadow-sm hover:bg-muted"
                    />
                  }
                >
                  <LanguageFlag language={language} />
                  <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-44">
                  <DropdownMenuGroup>
                    {languages.map(({ code, label }) => (
                      <DropdownMenuItem
                        key={code}
                        className="justify-between"
                        onClick={() => setLanguage(code)}
                      >
                        <span className="flex items-center gap-2.5">
                          <LanguageFlag language={code} />
                          {label}
                        </span>
                        {code === language ? <Check aria-hidden="true" /> : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
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
              className={buttonVariants({ size: "sm" })}
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
