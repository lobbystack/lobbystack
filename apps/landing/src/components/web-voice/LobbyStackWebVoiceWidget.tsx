import { WebVoiceWidget } from "@/components/web-voice/WebVoiceWidget"
import { LobbyStackAuraVoiceDemo } from "@/components/web-voice/LobbyStackAuraVoiceDemo"
import { hasAnalyticsConsent } from "@/lib/cookie-consent"

const DEFAULT_WEB_CALL_ENDPOINT =
  "https://voice.lobbystack.com/web-call/sessions"
const DEV_WEB_CALL_ENDPOINT =
  "https://voice-dev.lobbystack.com/web-call/sessions"
const DEFAULT_BUSINESS_SLUG = "lobbystack-mp35s9y1"
const DEV_BUSINESS_SLUG = "lobbystack-qa-motd3txq"

function capturePosthog(eventName: string, properties?: Record<string, unknown>) {
  if (!hasAnalyticsConsent()) {
    return
  }

  void import("@/lib/posthog").then(({ posthog }) => {
    posthog.capture(eventName, properties)
  })
}

function getEndpoint() {
  if (import.meta.env.PUBLIC_WEB_CALL_ENDPOINT) {
    return import.meta.env.PUBLIC_WEB_CALL_ENDPOINT
  }

  if (import.meta.env.DEV) {
    return DEV_WEB_CALL_ENDPOINT
  }

  return DEFAULT_WEB_CALL_ENDPOINT
}

function getBusinessSlug() {
  if (import.meta.env.PUBLIC_WEB_CALL_BUSINESS_SLUG) {
    return import.meta.env.PUBLIC_WEB_CALL_BUSINESS_SLUG
  }

  if (import.meta.env.DEV) {
    return DEV_BUSINESS_SLUG
  }

  return DEFAULT_BUSINESS_SLUG
}

export function LobbyStackWebVoiceWidget() {
  return (
    <WebVoiceWidget
      businessSlug={getBusinessSlug()}
      endpoint={getEndpoint()}
      widgetId="lobbystack-landing"
      onEvent={capturePosthog}
    />
  )
}

export function LobbyStackHeroVoiceDemo() {
  return (
    <LobbyStackAuraVoiceDemo
      businessSlug={getBusinessSlug()}
      endpoint={getEndpoint()}
      widgetId="lobbystack-landing"
      onEvent={capturePosthog}
    />
  )
}
