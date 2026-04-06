import posthog from "posthog-js";

import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForOperator,
  redactTelemetryProperties,
  validateTelemetryEvent,
  type TelemetryProperties,
  type TelemetryEventName,
} from "@ai-receptionist/telemetry";

type IdentifyOperatorArgs = {
  userId: string;
  businessId?: string;
  deploymentMode: string;
};

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const DEPLOYMENT_MODE = import.meta.env.VITE_DEPLOYMENT_MODE ?? "development";
const LEGACY_WORKER_PROXY_HOST = "/ingest/posthog";
const MANAGED_POSTHOG_PROXY_HOST = "https://t.nontia.com";

function resolvePostHogHost(rawHost?: string): string | undefined {
  const host = rawHost?.trim();
  if (!host) {
    return undefined;
  }

  if (host === LEGACY_WORKER_PROXY_HOST) {
    return MANAGED_POSTHOG_PROXY_HOST;
  }

  return host;
}

const POSTHOG_HOST = resolvePostHogHost(import.meta.env.VITE_POSTHOG_HOST);
const POSTHOG_UI_HOST = import.meta.env.VITE_POSTHOG_UI_HOST ?? "https://us.posthog.com";

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

  const posthogHost = POSTHOG_HOST!;

  posthog.init(POSTHOG_KEY!, {
    api_host: posthogHost,
    ...(POSTHOG_UI_HOST ? { ui_host: POSTHOG_UI_HOST } : {}),
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    capture_exceptions: true,
    disable_session_recording: false,
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: ".ph-mask, [data-ph-mask-text]",
      blockSelector: ".ph-no-capture, [data-ph-no-capture]",
    },
  });

  hasInitialized = true;

  posthog.startExceptionAutocapture({
    capture_unhandled_errors: true,
    capture_unhandled_rejections: true,
    capture_console_errors: false,
  });

  if (!posthog.sessionRecordingStarted()) {
    posthog.startSessionRecording();
  }
}

function coerceProperties(
  properties?: TelemetryProperties,
): Record<
  string,
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>
  | { business: string }
> {
  if (!properties) {
    return {};
  }

  const coerced: Record<
    string,
    | string
    | number
    | boolean
    | null
    | Array<string | number | boolean | null>
    | { business: string }
  > = {};

  for (const [key, value] of Object.entries(properties)) {
    if (
      key === "$groups" &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof value.business === "string"
    ) {
      coerced[key] = { business: value.business };
      continue;
    }

    if (
      value === undefined ||
      (typeof value === "object" && value !== null && !Array.isArray(value))
    ) {
      continue;
    }

    coerced[key] = value;
  }

  return coerced;
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
        deploymentMode: args.deploymentMode,
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

  const nextProperties: TelemetryProperties = {
    ...properties,
    deploymentMode: DEPLOYMENT_MODE,
  };

  if (name.startsWith("web.") && typeof window !== "undefined" && !nextProperties.pathname) {
    nextProperties.pathname = window.location.pathname;
  }

  if (properties?.businessId && typeof properties.businessId === "string") {
    nextProperties.$groups = {
      business: getPostHogBusinessGroupKey(properties.businessId),
    };
  }

  const validation = validateTelemetryEvent({
    name,
    deploymentMode: DEPLOYMENT_MODE,
    ...(typeof nextProperties.businessId === "string"
      ? { businessId: nextProperties.businessId }
      : {}),
    ...(typeof nextProperties.conversationId === "string"
      ? { conversationId: nextProperties.conversationId }
      : {}),
    ...(typeof nextProperties.callId === "string"
      ? { callId: nextProperties.callId }
      : {}),
    ...(typeof nextProperties.messageId === "string"
      ? { messageId: nextProperties.messageId }
      : {}),
    ...(typeof nextProperties.appointmentId === "string"
      ? { appointmentId: nextProperties.appointmentId }
      : {}),
    ...(typeof nextProperties.channel === "string"
      ? { channel: nextProperties.channel }
      : {}),
    ...(typeof nextProperties.provider === "string"
      ? { provider: nextProperties.provider }
      : {}),
    ...(typeof nextProperties.model === "string"
      ? { model: nextProperties.model }
      : {}),
    properties: nextProperties,
  });
  if (!validation.ok && import.meta.env.DEV) {
    console.warn(
      `[analytics] Missing required properties for ${name}: ${validation.missing.join(", ")}`,
      nextProperties,
    );
  }

  posthog.capture(name, coerceProperties(nextProperties), {
    send_instantly: true,
  });
}

export function captureAnalyticsException(
  error: unknown,
  properties?: TelemetryProperties,
): void {
  if (!isAnalyticsEnabled()) {
    return;
  }

  const nextProperties: TelemetryProperties = redactTelemetryProperties({
    ...properties,
    deploymentMode: DEPLOYMENT_MODE,
    runtime: "web",
    ...(typeof window !== "undefined" && !properties?.pathname
      ? { pathname: window.location.pathname }
      : {}),
  });

  if (properties?.businessId && typeof properties.businessId === "string") {
    nextProperties.$groups = {
      business: getPostHogBusinessGroupKey(properties.businessId),
    };
  }

  posthog.captureException(error, coerceProperties(nextProperties));
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
