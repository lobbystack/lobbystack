import { maskString, redactOtelAttributes, redactSignedStorageUrls, shouldRedactKey } from "./redaction";

export type DeploymentMode =
  | "cloud"
  | "self_hosted_standard"
  | "development";

export const WEB_EVENT_NAMES = [
  "web.auth.login_succeeded",
  "web.auth.signup_succeeded",
  "web.workspace.business_switched",
  "web.page.home_viewed",
  "web.page.calls_viewed",
  "web.page.call_detail_viewed",
  "web.page.messages_viewed",
  "web.page.contacts_viewed",
  "web.page.analytics_viewed",
  "web.page.agent_viewed",
  "web.page.settings_viewed",
  "web.contacts.contact_opened",
  "web.messages.thread_opened",
  "web.messages.reply_sent",
  "web.agent.settings_saved",
  "web.onboarding.business_name_submitted",
  "web.onboarding.website_submitted",
  "web.onboarding.website_skipped",
  "web.onboarding.knowledge_uploaded",
  "web.onboarding.knowledge_skipped",
  "web.onboarding.greeting_submitted",
  "web.onboarding.number_claim_started",
  "web.onboarding.number_claim_completed",
  "web.onboarding.plan_selected",
  "web.onboarding.plan_checkout_started",
  "web.onboarding.attribution_submitted",
  "web.knowledge.upload_started",
  "web.knowledge.upload_completed",
  "web.integration.calendar_connect_started",
  "web.integration.calendar_connect_completed",
  "web.integration.calendar_connect_failed",
  "web.integration.calendar_disconnect_completed",
  "web.voice.follow_up_completed",
  "web.voice.test_call_started",
  "web.voice.test_call_connected",
  "web.voice.test_call_ended",
  "web.voice.test_call_error",
  "web.activation.first_call_completed",
  "web.activation.upgrade_prompt_shown",
  "web.activation.upgrade_prompt_clicked",
  "web.activation.abandon_intent",
  "web.onboarding.plan_checkout_completed",
] as const;

export const VOICE_EVENT_NAMES = [
  "voice.call_started",
  "voice.call_completed",
  "voice.short_call_waived",
  "voice.provider_cost_recorded",
  "voice.transfer_state_changed",
  "voice.transfer_requested",
  "voice.transfer_completed",
  "voice.snapshot_loaded",
  "voice.delegation_completed",
  "voice.call_latency_recorded",
] as const;

export const SMS_EVENT_NAMES = [
  "sms.inbound_received",
  "sms.delivery_accepted",
  "sms.delivery_failed",
  "sms.provider_cost_recorded",
  "conversation.automation_paused",
] as const;

export const APPOINTMENT_EVENT_NAMES = [
  "appointment.booked",
  "appointment.booking_failed",
  "appointment.rescheduled",
  "appointment.cancelled",
  "notification.delivery_failed",
] as const;

export const PROSPECT_DEMO_EVENT_NAMES = [
  "prospect_demo.viewed",
  "prospect_demo.call_started",
  "prospect_demo.call_completed",
  "prospect_demo.call_error",
  "prospect_demo.signup_clicked",
  "prospect_demo.claim_succeeded",
  "prospect_demo.claim_failed",
] as const;

export const KNOWLEDGE_EVENT_NAMES = [
  "knowledge.document_indexed",
  "knowledge.search_executed",
] as const;

export const AI_EVENT_NAMES = ["$ai_generation"] as const;

export const INTEGRATION_EVENT_NAMES = [
  "integration.calendar_connected",
  "integration.calendar_sync_failed",
] as const;

export const WORKFLOW_EVENT_NAMES = [
  "business.snapshot_refreshed",
  "workflow.started",
  "workflow.failed",
] as const;

export const BILLING_EVENT_NAMES = [
  "billing.subscription_started",
] as const;

export const OPERATIONS_EVENT_NAMES = [
  "ops.billing.usage_sync_failed",
  "ops.billing.usage_sync_recovered",
  "ops.billing.unit_economics_rollup_recorded",
  "ops.billing.webhook_unresolved",
  "ops.outbox.backlog_sample",
  "ops.outbox.flush_failed",
  "ops.service.health_check",
  "ops.service.health_check_failed",
] as const;

export const TELEMETRY_EVENT_NAMES = [
  ...WEB_EVENT_NAMES,
  ...VOICE_EVENT_NAMES,
  ...SMS_EVENT_NAMES,
  ...APPOINTMENT_EVENT_NAMES,
  ...PROSPECT_DEMO_EVENT_NAMES,
  ...KNOWLEDGE_EVENT_NAMES,
  ...AI_EVENT_NAMES,
  ...INTEGRATION_EVENT_NAMES,
  ...WORKFLOW_EVENT_NAMES,
  ...BILLING_EVENT_NAMES,
  ...OPERATIONS_EVENT_NAMES,
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

export type TelemetryTransport = "durable" | "browser";

function transportsFor<const Names extends ReadonlyArray<TelemetryEventName>>(
  names: Names,
  transports: ReadonlyArray<TelemetryTransport>,
): { [Name in Names[number]]: ReadonlyArray<TelemetryTransport> } {
  return Object.fromEntries(names.map((name) => [name, transports])) as {
    [Name in Names[number]]: ReadonlyArray<TelemetryTransport>;
  };
}

/** The only supported delivery path(s) for each registered product event. */
export const TELEMETRY_EVENT_TRANSPORT = {
  ...transportsFor(WEB_EVENT_NAMES, ["browser"]),
  ...transportsFor(VOICE_EVENT_NAMES, ["durable"]),
  ...transportsFor(SMS_EVENT_NAMES, ["durable"]),
  ...transportsFor(APPOINTMENT_EVENT_NAMES, ["durable"]),
  ...transportsFor(PROSPECT_DEMO_EVENT_NAMES, ["durable"]),
  ...transportsFor(KNOWLEDGE_EVENT_NAMES, ["durable"]),
  "$ai_generation": ["durable"],
  ...transportsFor(INTEGRATION_EVENT_NAMES, ["durable"]),
  ...transportsFor(WORKFLOW_EVENT_NAMES, ["durable"]),
  ...transportsFor(BILLING_EVENT_NAMES, ["durable"]),
  ...transportsFor(OPERATIONS_EVENT_NAMES, ["durable"]),
} satisfies Record<TelemetryEventName, ReadonlyArray<TelemetryTransport>>;

export type TelemetryScalar = string | number | boolean | null;
export type TelemetryValue =
  | TelemetryScalar
  | Array<TelemetryValue>
  | { [key: string]: TelemetryValue | undefined };

export type TelemetryProperties = Record<string, TelemetryValue | undefined>;

export type PostHogAiTracePropertiesInput = {
  traceId: string;
  model: string;
  provider: string;
  callId?: string;
  conversationId?: string;
  messageId?: string;
  sessionId?: string;
};

export type PostHogAiUsagePropertiesInput = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  textInputTokens?: number;
  audioInputTokens?: number;
  cachedInputTokens?: number;
  cachedTextInputTokens?: number;
  cachedAudioInputTokens?: number;
  textOutputTokens?: number;
  audioOutputTokens?: number;
  reasoningTokens?: number;
  totalCostUsd?: number;
};

export type PostHogAiGenerationPropertiesInput =
  PostHogAiTracePropertiesInput &
    PostHogAiUsagePropertiesInput & {
      latencyMs?: number;
      ttftMs?: number;
      isStreaming?: boolean;
      isError?: boolean;
      error?: string;
      toolNames?: string[];
      properties?: TelemetryProperties;
    };

export type TelemetryContext = {
  businessId?: string;
  conversationId?: string;
  callId?: string;
  messageId?: string;
  appointmentId?: string;
  channel?: string;
  provider?: string;
  model?: string;
};

export type TelemetryRequirementKey =
  | keyof TelemetryContext
  | "deploymentMode"
  | "pathname"
  | "countryCode"
  | "selectionMode"
  | "numberKind"
  | "section"
  | "contentType"
  | "providerStatus"
  | "setting"
  | "contactId"
  | "inboxItemId"
  | "hasMedia"
  | "serviceId"
  | "sourceChannel"
  | "staffId"
  | "workflowName"
  | "latencyBucket"
  | "toolName"
  | "backlogBucket"
  | "monthKey"
  | "plan"
  | "prospectDemoId"
  | "campaignId"
  | "endedBy";

export const TELEMETRY_REQUIRED_PROPERTIES_BY_EVENT = {
  "web.auth.login_succeeded": ["deploymentMode", "pathname"],
  "web.auth.signup_succeeded": ["deploymentMode", "pathname"],
  "web.workspace.business_switched": [
    "businessId",
    "deploymentMode",
    "previousBusinessId",
  ],
  "web.page.home_viewed": ["businessId", "deploymentMode", "pathname"],
  "web.page.calls_viewed": ["businessId", "deploymentMode", "pathname"],
  "web.page.call_detail_viewed": ["businessId", "deploymentMode", "pathname"],
  "web.page.messages_viewed": ["businessId", "deploymentMode", "pathname"],
  "web.page.contacts_viewed": ["businessId", "deploymentMode", "pathname"],
  "web.page.analytics_viewed": ["businessId", "deploymentMode", "pathname"],
  "web.page.agent_viewed": ["businessId", "deploymentMode", "pathname"],
  "web.page.settings_viewed": ["businessId", "deploymentMode", "pathname"],
  "web.contacts.contact_opened": ["businessId", "deploymentMode", "contactId"],
  "web.messages.thread_opened": [
    "businessId",
    "deploymentMode",
    "conversationId",
    "channel",
  ],
  "web.messages.reply_sent": [
    "businessId",
    "deploymentMode",
    "conversationId",
    "channel",
  ],
  "web.agent.settings_saved": ["businessId", "deploymentMode", "setting"],
  "web.onboarding.business_name_submitted": ["deploymentMode"],
  "web.onboarding.website_submitted": ["businessId", "deploymentMode"],
  "web.onboarding.website_skipped": ["businessId", "deploymentMode"],
  "web.onboarding.knowledge_uploaded": ["businessId", "deploymentMode"],
  "web.onboarding.knowledge_skipped": ["businessId", "deploymentMode"],
  "web.onboarding.greeting_submitted": ["businessId", "deploymentMode"],
  "web.onboarding.number_claim_started": [
    "businessId",
    "deploymentMode",
    "countryCode",
    "selectionMode",
    "numberKind",
  ],
  "web.onboarding.number_claim_completed": [
    "businessId",
    "deploymentMode",
    "countryCode",
    "selectionMode",
    "numberKind",
  ],
  "web.onboarding.plan_selected": ["businessId", "deploymentMode", "plan"],
  "web.onboarding.plan_checkout_started": ["businessId", "deploymentMode", "plan"],
  "web.onboarding.plan_checkout_completed": ["businessId", "deploymentMode", "plan"],
  "web.onboarding.attribution_submitted": ["businessId", "deploymentMode", "source"],
  "web.knowledge.upload_started": [
    "businessId",
    "deploymentMode",
    "section",
    "contentType",
  ],
  "web.knowledge.upload_completed": [
    "businessId",
    "deploymentMode",
    "section",
    "contentType",
  ],
  "web.integration.calendar_connect_started": [
    "businessId",
    "deploymentMode",
    "provider",
  ],
  "web.integration.calendar_connect_completed": [
    "businessId",
    "deploymentMode",
    "provider",
  ],
  "web.integration.calendar_connect_failed": [
    "businessId",
    "deploymentMode",
    "provider",
  ],
  "web.integration.calendar_disconnect_completed": [
    "businessId",
    "deploymentMode",
    "provider",
    "scope",
  ],
  "web.voice.follow_up_completed": [
    "businessId",
    "deploymentMode",
    "callId",
    "inboxItemId",
  ],
  "web.voice.test_call_started": ["businessId", "deploymentMode"],
  "web.voice.test_call_connected": ["businessId", "deploymentMode"],
  // endedBy: "caller" when the caller hung up, "agent" when the receptionist's
  // side closed the session (its endCall tool or a time limit).
  "web.voice.test_call_ended": ["businessId", "deploymentMode", "endedBy"],
  "web.voice.test_call_error": ["businessId", "deploymentMode"],
  "web.activation.first_call_completed": ["businessId", "deploymentMode", "transport"],
  "web.activation.upgrade_prompt_shown": ["businessId", "deploymentMode", "trigger"],
  "web.activation.upgrade_prompt_clicked": ["businessId", "deploymentMode", "trigger"],
  "web.activation.abandon_intent": ["businessId", "deploymentMode", "trigger"],
  "billing.subscription_started": ["businessId", "plan", "billingInterval", "previousPlan"],
  "voice.call_started": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
  ],
  "voice.call_completed": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
  ],
  "voice.short_call_waived": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
  ],
  "voice.provider_cost_recorded": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
  ],
  "voice.transfer_state_changed": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
  ],
  "voice.transfer_requested": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
  ],
  "voice.transfer_completed": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
  ],
  "voice.snapshot_loaded": ["businessId", "deploymentMode", "provider"],
  "voice.delegation_completed": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
    "agentMs",
    "totalMs",
    "failed",
  ],
  "voice.call_latency_recorded": [
    "businessId",
    "deploymentMode",
    "callId",
    "channel",
    "provider",
    "answerCount",
    "delegationCount",
  ],
  "sms.inbound_received": [
    "businessId",
    "deploymentMode",
    "conversationId",
    "messageId",
    "channel",
    "provider",
  ],
  "sms.delivery_accepted": [
    "businessId",
    "deploymentMode",
    "messageId",
    "channel",
    "provider",
    "providerStatus",
    "deliveryContext",
  ],
  "sms.delivery_failed": [
    "businessId",
    "deploymentMode",
    "messageId",
    "channel",
    "provider",
    "providerStatus",
    "deliveryContext",
  ],
  "sms.provider_cost_recorded": [
    "businessId",
    "deploymentMode",
    "conversationId",
    "messageId",
    "channel",
    "provider",
  ],
  "conversation.automation_paused": [
    "businessId",
    "deploymentMode",
    "conversationId",
    "channel",
  ],
  "appointment.booked": [
    "businessId",
    "deploymentMode",
    "appointmentId",
    "channel",
    "serviceId",
    "sourceChannel",
  ],
  "appointment.booking_failed": [
    "businessId",
    "deploymentMode",
    "reason",
  ],
  "appointment.rescheduled": ["businessId", "deploymentMode", "appointmentId", "source"],
  "appointment.cancelled": ["businessId", "deploymentMode", "appointmentId", "source"],
  "notification.delivery_failed": [
    "businessId",
    "deploymentMode",
    "kind",
  ],
  "prospect_demo.viewed": ["deploymentMode", "prospectDemoId"],
  "prospect_demo.call_started": ["deploymentMode", "prospectDemoId"],
  "prospect_demo.call_completed": ["deploymentMode", "prospectDemoId"],
  "prospect_demo.call_error": ["deploymentMode", "prospectDemoId"],
  "prospect_demo.signup_clicked": ["deploymentMode", "prospectDemoId"],
  "prospect_demo.claim_succeeded": ["deploymentMode", "prospectDemoId"],
  "prospect_demo.claim_failed": ["deploymentMode", "prospectDemoId"],
  "knowledge.document_indexed": ["businessId", "deploymentMode"],
  "knowledge.search_executed": ["businessId", "deploymentMode"],
  "$ai_generation": [],
  "integration.calendar_connected": [
    "businessId",
    "deploymentMode",
    "provider",
    "scope",
  ],
  "integration.calendar_sync_failed": [
    "businessId",
    "deploymentMode",
    "appointmentId",
    "provider",
  ],
  "business.snapshot_refreshed": ["businessId", "deploymentMode"],
  "workflow.started": ["deploymentMode", "workflowName", "scope"],
  "workflow.failed": ["deploymentMode", "workflowName", "scope"],
  "ops.billing.usage_sync_failed": [
    "businessId",
    "deploymentMode",
    "provider",
  ],
  "ops.billing.usage_sync_recovered": [
    "businessId",
    "deploymentMode",
    "provider",
  ],
  "ops.billing.unit_economics_rollup_recorded": [
    "businessId",
    "deploymentMode",
    "monthKey",
  ],
  "ops.billing.webhook_unresolved": ["deploymentMode", "provider"],
  "ops.outbox.backlog_sample": ["deploymentMode", "backlogBucket"],
  "ops.outbox.flush_failed": ["deploymentMode"],
  "ops.service.health_check": [
    "deploymentMode",
    "service",
    "status",
    "latencyMs",
  ],
  "ops.service.health_check_failed": [
    "deploymentMode",
    "service",
    "status",
    "latencyMs",
  ],
} satisfies Record<TelemetryEventName, ReadonlyArray<string>>;

export type TelemetryValidationInput = Partial<TelemetryContext> & {
  name: TelemetryEventName;
  deploymentMode?: DeploymentMode | string;
  properties?: TelemetryProperties;
};

export type TelemetryValidationResult = {
  ok: boolean;
  missing: Array<string>;
};

const SENSITIVE_URL_PARAMS = new Set([
  "customer_session_token",
  "email",
  "token",
]);
const SENSITIVE_URL_FRAGMENT_PARAMS = new Set(["prospect_demo_token"]);
const NESTED_URL_PARAMS = new Set(["returnTo"]);
const DEMO_PATH_TOKEN_PATTERN = /^(\/demo\/)[^/]+/i;
const REDACTED_VALUE = "[redacted]";

function hasUrlParam(value: string, params: Set<string>): boolean {
  return [...params].some((param) => new RegExp(`[?&]${param}=`).test(value));
}

export function redactSensitiveUrlValue(value: string): string {
  const storageRedacted = redactSignedStorageUrls(value);
  if (storageRedacted !== value) return storageRedacted;
  let embeddedRedacted = value.replace(
    /(\/demo\/)[a-z0-9-]+/gi,
    `$1${REDACTED_VALUE}`,
  );
  for (const param of SENSITIVE_URL_PARAMS) {
    embeddedRedacted = embeddedRedacted.replace(
      new RegExp(`([?&])${param}=[^&#\\s]*`, "g"),
      `$1${param}=${REDACTED_VALUE}`,
    );
  }
  for (const param of SENSITIVE_URL_FRAGMENT_PARAMS) {
    embeddedRedacted = embeddedRedacted.replace(
      new RegExp(`([#&])${param}=[^&\\s]*`, "g"),
      `$1${param}=${REDACTED_VALUE}`,
    );
  }
  const hasSensitiveParam = hasUrlParam(value, SENSITIVE_URL_PARAMS);
  const hasSensitiveFragmentParam = hasUrlParam(
    value.replace("#", "?"),
    SENSITIVE_URL_FRAGMENT_PARAMS,
  );
  const hasDemoPathToken = /\/demo\/[^/?#]+/i.test(value);
  const hasNestedUrlParam = hasUrlParam(value, NESTED_URL_PARAMS);
  if (
    !hasSensitiveParam &&
    !hasSensitiveFragmentParam &&
    !hasDemoPathToken &&
    !hasNestedUrlParam
  ) {
    return value;
  }

  const absolute = /^[a-z][a-z\d+\-.]*:/i.test(embeddedRedacted);
  if (!absolute && !embeddedRedacted.startsWith("/")) {
    return embeddedRedacted;
  }

  try {
    const url = new URL(
      embeddedRedacted,
      absolute ? undefined : "https://lobbystack.local",
    );
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
        url.searchParams.set(param, redactSensitiveUrlValue(nested));
      }
    }
    const hashParams = new URLSearchParams(url.hash.slice(1));
    for (const param of SENSITIVE_URL_FRAGMENT_PARAMS) {
      hashParams.delete(param);
    }
    const hash = hashParams.toString();
    url.hash = hash ? `#${hash}` : "";
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return embeddedRedacted;
  }
}

function redactValue(value: TelemetryValue | undefined): TelemetryValue | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === "string") {
    return redactSensitiveUrlValue(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => redactValue(entry))
      .filter((entry): entry is TelemetryValue => entry !== undefined);
  }

  const redactedEntries = Object.entries(value).map(([key, nestedValue]) => [
    key,
    shouldRedactKey(key) ? "[redacted]" : redactValue(nestedValue),
  ]);

  return Object.fromEntries(redactedEntries);
}

function sanitizeProperties(
  properties: TelemetryProperties,
  options?: { redactPhoneLikeStrings?: boolean },
): TelemetryProperties {
  const redacted: TelemetryProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) {
      continue;
    }

    if (shouldRedactKey(key)) {
      if (typeof value === "string" && key.toLowerCase().includes("phone")) {
        redacted[key] = maskString(value);
      } else {
        redacted[key] = "[redacted]";
      }
      continue;
    }

    if (
      options?.redactPhoneLikeStrings &&
      typeof value === "string" &&
      key.toLowerCase().includes("phone")
    ) {
      redacted[key] = maskString(value);
      continue;
    }

    redacted[key] = redactValue(value);
  }

  return redacted;
}

function hasPresentValue(
  value: TelemetryValue | DeploymentMode | string | undefined,
): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

export function redactTelemetryProperties(
  properties: TelemetryProperties,
): TelemetryProperties {
  return sanitizeProperties(properties, { redactPhoneLikeStrings: true });
}

export function buildPostHogAiTraceProperties(
  input: PostHogAiTracePropertiesInput,
): TelemetryProperties {
  return redactTelemetryProperties({
    traceId: input.traceId,
    model: input.model,
    provider: input.provider,
    $ai_trace_id: input.traceId,
    $ai_model: input.model,
    $ai_provider: input.provider,
    ...(input.sessionId
      ? {
          sessionId: input.sessionId,
          $ai_session_id: input.sessionId,
        }
      : {}),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.messageId
      ? {
          messageId: input.messageId,
          messageLinkKey: input.messageId,
        }
      : {}),
  });
}

export function buildPostHogAiGenerationProperties(
  input: PostHogAiGenerationPropertiesInput,
): TelemetryProperties {
  const latencySeconds =
    input.latencyMs !== undefined ? input.latencyMs / 1000 : undefined;
  const ttftSeconds = input.ttftMs !== undefined ? input.ttftMs / 1000 : undefined;

  return redactTelemetryProperties({
    ...buildPostHogAiTraceProperties(input),
    ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
    ...(input.inputTokens !== undefined
      ? { $ai_input_tokens: input.inputTokens }
      : {}),
    ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
    ...(input.outputTokens !== undefined
      ? { $ai_output_tokens: input.outputTokens }
      : {}),
    ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
    ...(input.totalTokens !== undefined
      ? { $ai_total_tokens: input.totalTokens }
      : {}),
    ...(input.totalCostUsd !== undefined ? { totalCostUsd: input.totalCostUsd } : {}),
    ...(input.totalCostUsd !== undefined
      ? { $ai_total_cost_usd: input.totalCostUsd }
      : {}),
    ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    ...(latencySeconds !== undefined ? { $ai_latency: latencySeconds } : {}),
    ...(input.ttftMs !== undefined ? { ttftMs: input.ttftMs } : {}),
    ...(ttftSeconds !== undefined
      ? { $ai_time_to_first_token: ttftSeconds }
      : {}),
    ...(input.isStreaming !== undefined ? { isStreaming: input.isStreaming } : {}),
    ...(input.isStreaming !== undefined ? { $ai_stream: input.isStreaming } : {}),
    ...(input.isError !== undefined ? { isError: input.isError } : {}),
    ...(input.isError !== undefined ? { $ai_is_error: input.isError } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.error ? { $ai_error: input.error } : {}),
    ...(input.toolNames?.length ? { toolNames: input.toolNames } : {}),
    ...(input.toolNames?.length ? { $ai_tools_called: input.toolNames } : {}),
    ...(input.cachedInputTokens !== undefined
      ? { cachedInputTokens: input.cachedInputTokens }
      : {}),
    ...(input.textInputTokens !== undefined
      ? { textInputTokens: input.textInputTokens }
      : {}),
    ...(input.audioInputTokens !== undefined
      ? { audioInputTokens: input.audioInputTokens }
      : {}),
    ...(input.cachedTextInputTokens !== undefined
      ? { cachedTextInputTokens: input.cachedTextInputTokens }
      : {}),
    ...(input.cachedAudioInputTokens !== undefined
      ? { cachedAudioInputTokens: input.cachedAudioInputTokens }
      : {}),
    ...(input.textOutputTokens !== undefined
      ? { textOutputTokens: input.textOutputTokens }
      : {}),
    ...(input.audioOutputTokens !== undefined
      ? { audioOutputTokens: input.audioOutputTokens }
      : {}),
    ...(input.reasoningTokens !== undefined
      ? { reasoningTokens: input.reasoningTokens }
      : {}),
    ...input.properties,
  });
}

export { redactOtelAttributes };

/**
 * The nearest-rank percentile of a set of latencies, rounded to whole
 * milliseconds. Returns undefined for an empty set.
 */
export function percentileMs(values: ReadonlyArray<number>, percentile: number): number | undefined {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return undefined;
  }
  const rank = Math.ceil((Math.min(100, Math.max(0, percentile)) / 100) * sorted.length);
  return Math.round(sorted[Math.max(0, rank - 1)]!);
}

/**
 * Buckets a tenant's publishable outbox backlog into stable ranges so the
 * durable `ops.outbox.backlog_sample` event stays an aggregate fact. A zero or
 * negative count collapses to `0`.
 */
export function bucketOutboxBacklog(backlog: number): string {
  if (!Number.isFinite(backlog) || backlog <= 0) {
    return "0";
  }
  if (backlog < 10) {
    return "1_9";
  }
  if (backlog < 100) {
    return "10_99";
  }
  if (backlog < 500) {
    return "100_499";
  }
  return "500_plus";
}

export function getPostHogDistinctIdForBusinessSystem(businessId: string): string {
  return `system:business:${businessId}`;
}

export function getPostHogBusinessGroupKey(businessId: string): string {
  return `business:${businessId}`;
}

export function getTelemetryRequiredProperties(
  eventName: TelemetryEventName,
): ReadonlyArray<string> {
  return TELEMETRY_REQUIRED_PROPERTIES_BY_EVENT[eventName];
}

export function validateTelemetryEvent(
  input: TelemetryValidationInput,
): TelemetryValidationResult {
  const requiredKeys = getTelemetryRequiredProperties(input.name);
  const properties = input.properties ?? {};
  const missing = requiredKeys.filter((key) => {
    if (key === "deploymentMode") {
      return !hasPresentValue(input.deploymentMode);
    }

    if (key in input && hasPresentValue(input[key as keyof TelemetryValidationInput])) {
      return false;
    }

    return !hasPresentValue(properties[key]);
  });

  return {
    ok: missing.length === 0,
    missing,
  };
}
