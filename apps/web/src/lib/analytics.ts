import posthog from "posthog-js";

import {
  buildAlertableExceptionTelemetryProperties,
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForOperator,
  redactTelemetryProperties,
  validateTelemetryEvent,
  type TelemetryProperties,
  type TelemetryEventName,
} from "@lobbystack/telemetry";

type IdentifyOperatorArgs = {
  userId: string;
  businessId?: string;
  deploymentMode: string;
};

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const DEPLOYMENT_MODE = import.meta.env.VITE_DEPLOYMENT_MODE ?? "development";
const LEGACY_WORKER_PROXY_HOST = "/ingest/posthog";
const MANAGED_POSTHOG_PROXY_HOST = "https://ts.lobbystack.com";

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
const POSTHOG_REQUEST_FLUSH_INTERVAL_MS = 1_000;
const SENSITIVE_URL_PARAMS = new Set(["customer_session_token", "token"]);
const NESTED_URL_PARAMS = new Set(["returnTo"]);
const DEMO_PATH_TOKEN_PATTERN = /^(\/demo\/)[^/]+/i;
const REDACTED_VALUE = "[redacted]";

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

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value);
}

function hasUrlParam(value: string, params: Set<string>): boolean {
  return [...params].some((param) =>
    new RegExp(`[?&]${param}=`).test(value),
  );
}

function redactSensitiveUrlParams(value: string): string {
  const hasSensitiveParam = hasUrlParam(value, SENSITIVE_URL_PARAMS);
  const hasDemoPathToken = /\/demo\/[^/?#]+/i.test(value);
  const hasNestedUrlParam = hasUrlParam(value, NESTED_URL_PARAMS);
  if (!hasSensitiveParam && !hasDemoPathToken && !hasNestedUrlParam) {
    return value;
  }

  try {
    const absolute = isAbsoluteUrl(value);
    const url = new URL(value, absolute ? undefined : "https://lobbystack.local");
    if (DEMO_PATH_TOKEN_PATTERN.test(url.pathname)) {
      url.pathname = url.pathname.replace(
        DEMO_PATH_TOKEN_PATTERN,
        `$1${REDACTED_VALUE}`,
      );
    }
    for (const param of SENSITIVE_URL_PARAMS) {
      url.searchParams.delete(param);
    }
    for (const param of NESTED_URL_PARAMS) {
      const nested = url.searchParams.get(param);
      if (nested) {
        url.searchParams.set(param, redactSensitiveUrlParams(nested));
      }
    }
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    let redacted = value.replace(DEMO_PATH_TOKEN_PATTERN, `$1${REDACTED_VALUE}`);
    for (const param of SENSITIVE_URL_PARAMS) {
      redacted = redacted.replace(
        new RegExp(`([?&])${param}=[^&#]*`, "g"),
        `$1${param}=${REDACTED_VALUE}`,
      );
    }
    return redacted;
  }
}

function redactSensitiveAnalyticsValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveUrlParams(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" ? redactSensitiveUrlParams(item) : item,
    );
  }

  return value;
}

function redactSensitiveAnalyticsProperties<T extends Record<string, unknown>>(
  properties: T | undefined,
): T | undefined {
  if (!properties) {
    return properties;
  }

  const nextProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    nextProperties[key] = SENSITIVE_URL_PARAMS.has(key)
      ? REDACTED_VALUE
      : redactSensitiveAnalyticsValue(value);
  }

  return nextProperties as T;
}

export function initializeAnalytics(): void {
  if (!isAnalyticsEnabled() || hasInitialized) {
    return;
  }

  const posthogHost = POSTHOG_HOST!;

  posthog.init(POSTHOG_KEY!, {
    api_host: posthogHost,
    ...(POSTHOG_UI_HOST ? { ui_host: POSTHOG_UI_HOST } : {}),
    defaults: "2026-01-30",
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    capture_exceptions: true,
    disable_session_recording: false,
    request_queue_config: {
      flush_interval_ms: POSTHOG_REQUEST_FLUSH_INTERVAL_MS,
    },
    before_send: (event) => {
      if (!event) {
        return event;
      }
      const nextEvent = {
        ...event,
        properties: redactSensitiveAnalyticsProperties(event.properties) ?? event.properties,
      };
      const redactedSet = redactSensitiveAnalyticsProperties(event.$set);
      const redactedSetOnce = redactSensitiveAnalyticsProperties(event.$set_once);
      if (redactedSet) {
        nextEvent.$set = redactedSet;
      } else {
        delete nextEvent.$set;
      }
      if (redactedSetOnce) {
        nextEvent.$set_once = redactedSetOnce;
      } else {
        delete nextEvent.$set_once;
      }
      return nextEvent;
    },
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: ".ph-mask, [data-ph-mask-text]",
      blockSelector: ".ph-no-capture, [data-ph-no-capture]",
      compress_events: true,
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
  const isScalarProperty = (
    candidate: unknown,
  ): candidate is string | number | boolean | null =>
    candidate === null ||
    typeof candidate === "string" ||
    typeof candidate === "number" ||
    typeof candidate === "boolean";

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

    if (Array.isArray(value)) {
      if (value.every(isScalarProperty)) {
        coerced[key] = value;
      }
      continue;
    }

    coerced[key] = value;
  }

  return coerced;
}

function normalizeException(error: unknown): {
  type: string;
  value: string;
  stack?: string;
} {
  if (error instanceof Error) {
    const normalized: {
      type: string;
      value: string;
      stack?: string;
    } = {
      type: error.name || "Error",
      value: error.message || "Unknown error",
    };
    if (error.stack) {
      normalized.stack = error.stack;
    }
    return normalized;
  }

  if (typeof error === "string") {
    return {
      type: "Error",
      value: error,
    };
  }

  try {
    return {
      type: "Error",
      value: JSON.stringify(error),
    };
  } catch {
    return {
      type: "Error",
      value: "Unknown error",
    };
  }
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

export function resetAnalyticsIdentity(): void {
  lastPageEventKey = null;
  identifiedUserId = null;
  identifiedBusinessId = null;

  if (!isAnalyticsEnabled()) {
    return;
  }

  posthog.reset();
}

export function setAnalyticsPersonProperties(properties: TelemetryProperties): void {
  if (!isAnalyticsEnabled()) {
    return;
  }

  posthog.people.set(coerceProperties(properties));
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

  const operation =
    typeof properties?.operation === "string" ? properties.operation : "web_exception";
  const normalized = normalizeException(error);
  const nextProperties: TelemetryProperties = redactTelemetryProperties({
    ...properties,
    ...buildAlertableExceptionTelemetryProperties({
      runtime: "web",
      service: "web",
      operation,
      alertable:
        typeof properties?.alertable === "boolean" ? properties.alertable : true,
      expected: typeof properties?.expected === "boolean" ? properties.expected : false,
      exceptionType: normalized.type,
      exceptionMessage: `${operation} failed (${normalized.type})`,
    }),
    deploymentMode: DEPLOYMENT_MODE,
    ...(typeof window !== "undefined" && !properties?.pathname
      ? { pathname: window.location.pathname }
      : {}),
  });

  if (properties?.businessId && typeof properties.businessId === "string") {
    nextProperties.$groups = {
      business: getPostHogBusinessGroupKey(properties.businessId),
    };
  }
  const errorToCapture =
    error instanceof Error
      ? error
      : new Error(normalized.value, {
          ...(normalized.stack ? { cause: normalized.stack } : {}),
        });

  posthog.captureException(errorToCapture, coerceProperties(nextProperties));
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
