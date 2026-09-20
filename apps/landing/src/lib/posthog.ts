import posthog from "posthog-js"

import {
  clearPostHogClientStorage,
  readCookieConsent,
} from "@/lib/cookie-consent"

const DEFAULT_POSTHOG_HOST = "https://ts.lobbystack.com"
const DEFAULT_POSTHOG_UI_HOST = "https://us.posthog.com"
const SIGNUP_CTA_SELECTOR = "[data-ph-signup-cta]"

const isEnabled = import.meta.env.PUBLIC_POSTHOG_ENABLED === "true"
const projectKey = import.meta.env.PUBLIC_POSTHOG_KEY
const apiHost = import.meta.env.PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST
const uiHost = import.meta.env.PUBLIC_POSTHOG_UI_HOST || DEFAULT_POSTHOG_UI_HOST
const canCapture =
  typeof window !== "undefined" && isEnabled && Boolean(projectKey)
let isInitialized = false
let isSignupCtaListenerAttached = false

export type ConsentState = "granted" | "declined" | "undecided"

/** Nothing stored yet means the visitor has not answered the banner. */
export function readConsentState(): ConsentState {
  const consent = readCookieConsent()

  if (!consent) return "undecided"
  return consent.analytics ? "granted" : "declined"
}

/**
 * Before the visitor answers the banner we keep everything in page memory, so
 * nothing is written to their device and no person profile is created. Session
 * recording and autocapture stay off: counting a visit is the only purpose.
 */
const anonymousConfig = {
  autocapture: false,
  capture_pageview: true,
  capture_pageleave: "if_capture_pageview",
  disable_session_recording: true,
  person_profiles: "identified_only",
  persistence: "memory",
} as const

/** Everything the visitor agreed to once they accept. */
const consentedConfig = {
  autocapture: true,
  capture_pageview: true,
  capture_pageleave: "if_capture_pageview",
  cross_subdomain_cookie: true,
  disable_session_recording: false,
  persistence: "localStorage+cookie",
  session_recording: {
    // Inputs and passwords are masked by the SDK defaults. Text is not, so mask
    // the values rendered back from them, such as the calculator results.
    maskTextSelector: ".ph-mask",
  },
} as const

const attachSignupCtaListener = () => {
  if (isSignupCtaListenerAttached) return
  isSignupCtaListenerAttached = true

  window.document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return

    const signupCta = event.target.closest(SIGNUP_CTA_SELECTOR)

    if (!(signupCta instanceof HTMLElement)) return

    captureLandingSignupCtaClick(getSignupCtaProperties(signupCta))
  })
}

const start = (consented: boolean) => {
  if (isInitialized) return

  posthog.init(projectKey!, {
    api_host: apiHost,
    ui_host: uiHost,
    defaults: "2026-05-30",
    ...(consented ? consentedConfig : anonymousConfig),
  })

  isInitialized = true
  attachSignupCtaListener()
}

type LandingSignupCtaClickProperties = {
  action?: string
  destination?: string
  label?: string
  plan?: string
  section: string
}

const getSignupCtaProperties = (
  element: HTMLElement
): LandingSignupCtaClickProperties => ({
  action: element.dataset.phCaptureAttributeAction,
  destination:
    element.dataset.phCaptureAttributeDestination ||
    element.getAttribute("href") ||
    "signup",
  label: element.dataset.phCaptureAttributeLabel || element.textContent?.trim(),
  plan: element.dataset.phCaptureAttributePlan,
  section: element.dataset.phCaptureAttributeSection || "unknown",
})

/** Called when the visitor accepts. Upgrades an anonymous session in place. */
export function initializePostHog() {
  if (!canCapture || !projectKey) return false

  if (!isInitialized) {
    start(true)
    return true
  }

  const client = posthog as typeof posthog & {
    has_opted_out_capturing?: () => boolean
    opt_in_capturing?: (options?: { captureEventName?: false }) => void
    startSessionRecording?: () => void
  }

  if (client.has_opted_out_capturing?.()) {
    client.opt_in_capturing?.({ captureEventName: false })
  }

  // Documented path for moving off memory persistence without reinitializing.
  // Autocapture only binds at init, so it starts on the next page load.
  posthog.set_config({ ...consentedConfig })
  client.startSessionRecording?.()

  return true
}

/** Called when the visitor declines. An explicit no stops collection entirely. */
export function disablePostHog() {
  if (canCapture && isInitialized) {
    const client = posthog as typeof posthog & {
      opt_out_capturing?: () => void
      stopSessionRecording?: () => void
    }

    client.stopSessionRecording?.()
    posthog.reset()
    client.opt_out_capturing?.()
  }

  clearPostHogClientStorage()
}

if (canCapture) {
  const consent = readConsentState()

  if (consent !== "declined") {
    start(consent === "granted")
  }
}

export function captureLandingSignupCtaClick({
  action = "try_for_free",
  destination = "signup",
  label = "Try for free",
  plan,
  section,
}: LandingSignupCtaClickProperties) {
  if (!canCapture || !isInitialized) return

  posthog.capture("landing.signup_cta_clicked", {
    action,
    destination,
    label,
    plan,
    section,
  })
}

export { posthog }
