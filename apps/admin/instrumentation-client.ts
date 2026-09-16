import posthog from "posthog-js";

import { sanitizeAnalyticsProperties } from "./src/lib/analytics-sanitize";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

/**
 * Next.js runs this module once per app launch. PostHog starts opted out and
 * capture is only enabled for an operator whose workspace has telemetry on, so
 * nothing is collected before that decision is made. Consent, session
 * recording, and identity are controlled by `ProductAnalytics`.
 */
export function initializeClientAnalytics(): void {
  if (!projectToken || posthog.__loaded) return;
  posthog.init(projectToken, {
    api_host: apiHost,
    ui_host: "https://us.posthog.com",
    defaults: "2026-05-30",
    autocapture: false,
    capture_exceptions: false,
    // Session recording is masked in the DOM before it leaves the browser, and
    // sensitive routes stop the recorder outright.
    session_recording: { maskTextSelector: ".ph-mask" },
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    capture_performance: { web_vitals: true, network_timing: false, web_vitals_attribution: false },
    opt_out_capturing_by_default: true,
    save_campaign_params: false,
    save_referrer: false,
    before_send: event => {
      if (!event) return null;
      if (posthog.has_opted_out_capturing()) return null;
      sanitizeAnalyticsProperties(event.properties);
      return event;
    },
  });
}

initializeClientAnalytics();
