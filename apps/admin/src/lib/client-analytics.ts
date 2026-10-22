import posthog from "posthog-js";

import { DEFAULT_POSTHOG_HOST } from "../../csp";
import { sanitizeAnalyticsProperties } from "./analytics-sanitize";
import { sendBrowserErrorsTo } from "./browser-error-reporting";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;

/**
 * Starts PostHog in the browser, once. `ProductAnalytics` calls this as it
 * loads, before any page renders. The website widget never loads either, so a
 * visitor on a business's site doesn't download PostHog. PostHog starts opted
 * out and capture is only enabled for an operator whose workspace has
 * telemetry on, so nothing is collected before that decision is made. Consent,
 * session recording, and identity are controlled by `ProductAnalytics`.
 */
export function initializeClientAnalytics(): void {
  if (typeof window === "undefined" || !projectToken) return;
  if (!posthog.__loaded) {
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
      // Read and write the cookie lobbystack.com sets once a visitor consents, so
      // the anonymous id from the landing site reaches identify() and is merged
      // into the operator. Cookies are named per project token, so both sites
      // must use the same one.
      persistence: "localStorage+cookie",
      cross_subdomain_cookie: true,
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
  sendBrowserErrorsTo(posthog);
}
