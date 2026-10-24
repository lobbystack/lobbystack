"use client"

import { LobbyStackAuraVoiceDemo } from "@/marketing/components/web-voice/LobbyStackAuraVoiceDemo"
import { hasAnalyticsConsent } from "@/marketing/lib/cookie-consent"
import type { Locale } from "@/marketing/i18n"

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

  void import("@/marketing/lib/posthog").then(({ posthog }) => {
    posthog.capture(eventName, properties)
  })
}

function getEndpoint() {
  // A new name, so an old NEXT_PUBLIC_WEB_CALL_ENDPOINT from before GPT-Live can't override it.
  if (process.env.NEXT_PUBLIC_LIVE_CALL_ENDPOINT) {
    return process.env.NEXT_PUBLIC_LIVE_CALL_ENDPOINT
  }

  if (process.env.NODE_ENV === "development") {
    return DEV_WEB_CALL_ENDPOINT
  }

  return DEFAULT_WEB_CALL_ENDPOINT
}

function getBusinessSlug() {
  if (process.env.NEXT_PUBLIC_WEB_CALL_BUSINESS_SLUG) {
    return process.env.NEXT_PUBLIC_WEB_CALL_BUSINESS_SLUG
  }

  if (process.env.NODE_ENV === "development") {
    return DEV_BUSINESS_SLUG
  }

  return DEFAULT_BUSINESS_SLUG
}

export function LobbyStackHeroVoiceDemo({
  locale = "en",
}: {
  locale?: Locale
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
