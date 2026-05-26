import posthog from "posthog-js"

const DEFAULT_POSTHOG_HOST = "https://ts.lobbystack.com"
const DEFAULT_POSTHOG_UI_HOST = "https://us.posthog.com"
const SIGNUP_CTA_SELECTOR = "[data-ph-signup-cta]"

const isEnabled = import.meta.env.PUBLIC_POSTHOG_ENABLED === "true"
const projectKey = import.meta.env.PUBLIC_POSTHOG_KEY
const apiHost = import.meta.env.PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST
const uiHost = import.meta.env.PUBLIC_POSTHOG_UI_HOST || DEFAULT_POSTHOG_UI_HOST
const canCapture =
  typeof window !== "undefined" && isEnabled && Boolean(projectKey)

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

if (canCapture && projectKey) {
  posthog.init(projectKey, {
    api_host: apiHost,
    ui_host: uiHost,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: "if_capture_pageview",
    cross_subdomain_cookie: true,
    disable_session_recording: false,
    persistence: "localStorage+cookie",
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
      },
    },
  })

  window.document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return
    }

    const signupCta = event.target.closest(SIGNUP_CTA_SELECTOR)

    if (!(signupCta instanceof HTMLElement)) {
      return
    }

    captureLandingSignupCtaClick(getSignupCtaProperties(signupCta))
  })
}

export function captureLandingSignupCtaClick({
  action = "try_for_free",
  destination = "signup",
  label = "Try for free",
  plan,
  section,
}: LandingSignupCtaClickProperties) {
  if (!canCapture) {
    return
  }

  posthog.capture("landing.signup_cta_clicked", {
    action,
    destination,
    label,
    plan,
    section,
  })
}

export { posthog }
