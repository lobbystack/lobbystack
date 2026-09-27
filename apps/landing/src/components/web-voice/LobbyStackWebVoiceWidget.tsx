import { WebVoiceWidget } from "@/components/web-voice/WebVoiceWidget"
import { LobbyStackAuraVoiceDemo } from "@/components/web-voice/LobbyStackAuraVoiceDemo"
import { hasAnalyticsConsent } from "@/lib/cookie-consent"

// The app starts browser calls on GPT-Live; `pnpm dev` runs it on port 3000.
const DEFAULT_WEB_CALL_ENDPOINT = "https://app.lobbystack.com/api/voice/live/session"
const DEV_WEB_CALL_ENDPOINT = "http://localhost:3000/api/voice/live/session"
const DEFAULT_BUSINESS_SLUG = "lobbystack-mp35s9y1"
const DEV_BUSINESS_SLUG = "lobbystack-qa-motd3txq"

function capturePosthog(
  eventName: string,
  properties?: Record<string, unknown>
) {
  if (!hasAnalyticsConsent()) {
    return
  }

  void import("@/lib/posthog").then(({ posthog }) => {
    posthog.capture(eventName, properties)
  })
}

function getEndpoint() {
  // A new name, so an old PUBLIC_WEB_CALL_ENDPOINT from before GPT-Live
  // can't override it.
  if (import.meta.env.PUBLIC_LIVE_CALL_ENDPOINT) {
    return import.meta.env.PUBLIC_LIVE_CALL_ENDPOINT
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

export function LobbyStackWebVoiceWidget({
  locale = "en",
}: {
  locale?: "en" | "fr"
}) {
  return (
    <WebVoiceWidget
      locale={locale}
      businessSlug={getBusinessSlug()}
      endpoint={getEndpoint()}
      widgetId="lobbystack-landing"
      onEvent={capturePosthog}
    />
  )
}

export function LobbyStackHeroVoiceDemo({
  locale = "en",
}: {
  locale?: "en" | "fr"
}) {
  return (
    <LobbyStackAuraVoiceDemo
      businessSlug={getBusinessSlug()}
      endpoint={getEndpoint()}
      widgetId="lobbystack-landing"
      onEvent={capturePosthog}
      locale={locale}
    />
  )
}
