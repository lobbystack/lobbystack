import posthog from "posthog-js";

import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForOperator,
  type TelemetryProperties,
  type TelemetryEventName,
} from "@ai-receptionist/telemetry";

type IdentifyOperatorArgs = {
  userId: string;
  businessId?: string;
  deploymentMode: string;
};

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

let hasInitialized = false;
let lastPageEventKey: string | null = null;
let identifiedUserId: string | null = null;
let identifiedBusinessId: string | null = null;

const PAGE_EVENT_BY_PATH = new Map<string, TelemetryEventName>([
  ["/", "web.page.home_viewed"],
  ["/calls", "web.page.calls_viewed"],
  ["/messages", "web.page.messages_viewed"],
  ["/contacts", "web.page.contacts_viewed"],
  ["/analytics", "web.page.analytics_viewed"],
]);

export function isAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY && POSTHOG_HOST);
}

export function initializeAnalytics(): void {
  if (!isAnalyticsEnabled() || hasInitialized) {
    return;
  }

  posthog.init(POSTHOG_KEY!, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
  });

  hasInitialized = true;
}

function coerceProperties(
  properties?: TelemetryProperties,
): Record<string, string | number | boolean | null | Array<string | number | boolean | null>> {
  if (!properties) {
    return {};
  }

  const entries = Object.entries(properties).flatMap(([key, value]) => {
    if (value === undefined || typeof value === "object" && value !== null && !Array.isArray(value)) {
      return [];
    }
    if (Array.isArray(value)) {
      return [[key, value]];
    }
    return [[key, value]];
  });

  return Object.fromEntries(entries);
}

export function identifyOperator(args: IdentifyOperatorArgs): void {
  if (!isAnalyticsEnabled()) {
    return;
  }

  const distinctId = getPostHogDistinctIdForOperator(args.userId);
  if (identifiedUserId !== distinctId) {
    posthog.identify(distinctId, {
      deploymentMode: args.deploymentMode,
      userId: args.userId,
    });
    identifiedUserId = distinctId;
  }

  if (args.businessId) {
    const groupKey = getPostHogBusinessGroupKey(args.businessId);
    if (identifiedBusinessId !== groupKey) {
      posthog.group("business", groupKey, {
        businessId: args.businessId,
      });
      identifiedBusinessId = groupKey;
    }
  }
}

export function captureAnalyticsEvent(
  name: TelemetryEventName,
  properties?: TelemetryProperties,
): void {
  if (!isAnalyticsEnabled()) {
    return;
  }

  posthog.capture(name, coerceProperties(properties), {
    send_instantly: true,
  });
}

function resolvePageEvent(pathname: string): TelemetryEventName | null {
  if (pathname.startsWith("/calls/")) {
    return "web.page.call_detail_viewed";
  }

  if (pathname.startsWith("/agent")) {
    return "web.page.agent_viewed";
  }

  if (pathname.startsWith("/settings")) {
    return "web.page.settings_viewed";
  }

  return PAGE_EVENT_BY_PATH.get(pathname) ?? null;
}

export function trackPageView(pathname: string, businessId?: string): void {
  const eventName = resolvePageEvent(pathname);
  if (!eventName) {
    return;
  }

  const eventKey = `${eventName}:${pathname}:${businessId ?? "none"}`;
  if (lastPageEventKey === eventKey) {
    return;
  }

  captureAnalyticsEvent(eventName, {
    businessId,
    pathname,
  });
  lastPageEventKey = eventKey;
}
