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
  "web.onboarding.verify_phone_started",
  "web.onboarding.verify_phone_completed",
  "web.onboarding.website_submitted",
  "web.onboarding.website_skipped",
  "web.onboarding.number_claim_started",
  "web.onboarding.number_claim_completed",
  "web.knowledge.upload_started",
  "web.knowledge.upload_completed",
  "web.knowledge.preview_answer_requested",
  "web.integration.calendar_connect_started",
  "web.integration.calendar_connect_completed",
  "web.integration.calendar_connect_failed",
  "web.integration.calendar_disconnect_completed",
  "web.voice.follow_up_completed",
] as const;

export const VOICE_EVENT_NAMES = [
  "voice.call_started",
  "voice.call_completed",
  "voice.provider_cost_recorded",
  "voice.transfer_state_changed",
  "voice.transfer_requested",
  "voice.transfer_completed",
  "voice.snapshot_loaded",
  "voice.tool_invoked",
] as const;

export const SMS_EVENT_NAMES = [
  "sms.inbound_received",
  "sms.reply_generated",
  "sms.delivery_accepted",
  "sms.delivery_failed",
  "sms.provider_cost_recorded",
  "sms.automation_paused",
] as const;

export const APPOINTMENT_EVENT_NAMES = [
  "appointment.booked",
  "appointment.booking_failed",
  "appointment.confirmation_notification_failed",
] as const;

export const KNOWLEDGE_EVENT_NAMES = [
  "knowledge.document_indexed",
  "knowledge.search_executed",
] as const;

export const INTEGRATION_EVENT_NAMES = [
  "integration.calendar_connected",
  "integration.calendar_sync_failed",
] as const;

export const WORKFLOW_EVENT_NAMES = [
  "business.snapshot_refreshed",
  "workflow.started",
  "workflow.failed",
] as const;

export const OPERATIONS_EVENT_NAMES = [
  "ops.billing.usage_sync_failed",
  "ops.billing.usage_sync_recovered",
  "ops.billing.unit_economics_rollup_recorded",
  "ops.voice.heartbeat",
  "ops.voice.invalid_signature",
  "ops.voice.media_disconnect",
  "ops.voice.snapshot_cache_hit",
  "ops.voice.snapshot_cache_miss",
  "ops.voice.openai_realtime_error",
  "ops.voice.turn_completed",
  "ops.voice.turn_slow",
  "ops.voice.call_ended_by_ai",
  "ops.voice.tool_completed",
  "ops.voice.tool_failed",
  "ops.voice.recording_upload_failed",
  "ops.convex.heartbeat",
  "ops.convex.outbox_backlog_sample",
  "ops.convex.outbox_flush_failed",
  "ops.service.health_check",
  "ops.service.health_check_failed",
] as const;

export const TELEMETRY_EVENT_NAMES = [
  ...WEB_EVENT_NAMES,
  ...VOICE_EVENT_NAMES,
  ...SMS_EVENT_NAMES,
  ...APPOINTMENT_EVENT_NAMES,
  ...KNOWLEDGE_EVENT_NAMES,
  ...INTEGRATION_EVENT_NAMES,
  ...WORKFLOW_EVENT_NAMES,
  ...OPERATIONS_EVENT_NAMES,
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

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

export type PostHogAiSpanPropertiesInput = PostHogAiTracePropertiesInput & {
  spanName: string;
  inputState?: TelemetryProperties;
  outputState?: TelemetryProperties;
  latencyMs?: number;
  isError?: boolean;
  error?: string;
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

export type TelemetryEvent = TelemetryContext & {
  name: TelemetryEventName;
  occurredAt: string;
  deploymentMode: DeploymentMode;
  properties: TelemetryProperties;
};

export interface TelemetrySink {
  emit(event: TelemetryEvent): Promise<void>;
}

export const PROVIDER_ERROR_PROVIDERS = [
  "openai",
  "google",
  "twilio",
  "polar",
  "firecrawl",
  "unknown",
] as const;

export type ExternalProvider = (typeof PROVIDER_ERROR_PROVIDERS)[number];

export const PROVIDER_ERROR_KINDS = [
  "quota_exhausted",
  "auth_failed",
  "rate_limited",
  "provider_unavailable",
  "invalid_request",
  "unknown",
] as const;

export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

export type ProviderErrorClassification = {
  provider: ExternalProvider;
  kind: ProviderErrorKind;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  providerErrorStatus?: number;
};

export type AlertableExceptionTelemetryInput = {
  runtime: "web" | "convex" | "voice-gateway";
  service: string;
  operation: string;
  alertable?: boolean;
  expected?: boolean;
  provider?: ExternalProvider;
  exceptionType?: string;
  exceptionMessage?: string;
  exceptionLevel?: "fatal" | "error" | "warning" | "info";
};

export type ClassifyProviderErrorInput = {
  provider?: ExternalProvider | string;
  error?: unknown;
  code?: string;
  message?: string;
  status?: number;
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
  | "monthKey";

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
  "web.onboarding.verify_phone_started": [
    "businessId",
    "deploymentMode",
    "countryCode",
  ],
  "web.onboarding.verify_phone_completed": ["businessId", "deploymentMode"],
  "web.onboarding.website_submitted": ["businessId", "deploymentMode"],
  "web.onboarding.website_skipped": ["businessId", "deploymentMode"],
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
  "web.knowledge.preview_answer_requested": ["businessId", "deploymentMode"],
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
    "staffId",
  ],
  "web.voice.follow_up_completed": [
    "businessId",
    "deploymentMode",
    "callId",
    "inboxItemId",
  ],
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
  "voice.tool_invoked": [
    "businessId",
    "deploymentMode",
    "callId",
    "provider",
    "model",
  ],
  "sms.inbound_received": [
    "businessId",
    "deploymentMode",
    "conversationId",
    "messageId",
    "channel",
    "provider",
  ],
  "sms.reply_generated": [
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
    "conversationId",
    "messageId",
    "channel",
    "provider",
    "providerStatus",
  ],
  "sms.delivery_failed": [
    "businessId",
    "deploymentMode",
    "conversationId",
    "messageId",
    "channel",
    "provider",
    "providerStatus",
  ],
  "sms.provider_cost_recorded": [
    "businessId",
    "deploymentMode",
    "conversationId",
    "messageId",
    "channel",
    "provider",
  ],
  "sms.automation_paused": [
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
    "channel",
    "serviceId",
    "sourceChannel",
  ],
  "appointment.confirmation_notification_failed": [
    "businessId",
    "deploymentMode",
    "appointmentId",
    "channel",
  ],
  "knowledge.document_indexed": ["businessId", "deploymentMode"],
  "knowledge.search_executed": ["businessId", "deploymentMode"],
  "integration.calendar_connected": [
    "businessId",
    "deploymentMode",
    "provider",
    "staffId",
  ],
  "integration.calendar_sync_failed": [
    "businessId",
    "deploymentMode",
    "appointmentId",
    "provider",
  ],
  "business.snapshot_refreshed": ["businessId", "deploymentMode"],
  "workflow.started": ["businessId", "deploymentMode", "workflowName"],
  "workflow.failed": ["businessId", "deploymentMode", "workflowName"],
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
  "ops.voice.heartbeat": ["deploymentMode"],
  "ops.voice.invalid_signature": ["deploymentMode", "provider"],
  "ops.voice.media_disconnect": ["deploymentMode", "provider"],
  "ops.voice.snapshot_cache_hit": ["businessId", "deploymentMode"],
  "ops.voice.snapshot_cache_miss": ["businessId", "deploymentMode"],
  "ops.voice.openai_realtime_error": ["deploymentMode", "provider"],
  "ops.voice.turn_completed": [
    "businessId",
    "deploymentMode",
    "callId",
    "provider",
    "model",
    "latencyBucket",
  ],
  "ops.voice.turn_slow": [
    "businessId",
    "deploymentMode",
    "callId",
    "provider",
    "model",
    "latencyBucket",
  ],
  "ops.voice.call_ended_by_ai": [
    "businessId",
    "deploymentMode",
    "callId",
    "reason",
  ],
  "ops.voice.tool_completed": [
    "businessId",
    "deploymentMode",
    "callId",
    "provider",
    "model",
    "toolName",
    "latencyBucket",
  ],
  "ops.voice.tool_failed": [
    "businessId",
    "deploymentMode",
    "callId",
    "provider",
    "model",
    "toolName",
  ],
  "ops.voice.recording_upload_failed": ["deploymentMode", "callId"],
  "ops.convex.heartbeat": ["deploymentMode"],
  "ops.convex.outbox_backlog_sample": ["deploymentMode", "backlogBucket"],
  "ops.convex.outbox_flush_failed": ["deploymentMode", "backlogBucket"],
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

export class ConsoleSink implements TelemetrySink {
  async emit(event: TelemetryEvent): Promise<void> {
    console.log("[telemetry]", JSON.stringify(event));
  }
}

export class NoopSink implements TelemetrySink {
  async emit(_event: TelemetryEvent): Promise<void> {
    return;
  }
}

export type TelemetryFacade = {
  track(
    event: Omit<TelemetryEvent, "occurredAt" | "deploymentMode">,
  ): Promise<void>;
};

const EXACT_REDACTION_KEYS = new Set([
  "$ai_input",
  "$ai_output",
  "$ai_output_choices",
  "body",
  "content",
  "message",
  "messages",
  "name",
  "phone",
  "prompt",
  "prompts",
  "recordingUrl",
  "recording_url",
  "smsBody",
  "sms_body",
  "text",
  "toolArguments",
  "tool_arguments",
  "toolOutput",
  "tool_output",
  "toolResult",
  "tool_result",
  "transcript",
  "utterance",
  "utterances",
  "aiinput",
  "aioutput",
  "aioutputchoices",
  "assistantmessage",
  "assistantresponse",
  "tooloutput",
  "toolresult",
  "usermessage",
]);

const PARTIAL_REDACTION_KEYWORDS = [
  "address",
  "body",
  "caller",
  "contact",
  "customer",
  "email",
  "message",
  "name",
  "note",
  "outputchoice",
  "phone",
  "prompt",
  "recording",
  "sms",
  "text",
  "tool_output",
  "token",
  "toolarg",
  "tool_input",
  "transcript",
  "utterance",
  "assistant",
];

const SAFE_KEY_PATTERNS = [
  "cachedtokens",
  "cachedinputtokens",
  "charcount",
  "completiontokens",
  "costusd",
  "dimension",
  "embeddingtokens",
  "entrycount",
  "filename",
  "inputcharcount",
  "inputtokens",
  "messagelinkkey",
  "messagecount",
  "outputtokens",
  "outputcharcount",
  "prompttokens",
  "reasoningtokens",
  "spanname",
  "timetofirsttoken",
  "tokencount",
  "totaltokens",
  "traceid",
  "ttft",
  "toolname",
  "providername",
  "modelname",
  "exceptiontype",
  "httpstatuscode",
  "providererrorcode",
  "providererrorkind",
  "providererrorstatus",
  "sessionid",
  "workflowname",
];

const EXPECTED_CONVEX_FAILURE_MESSAGE_SNIPPETS = [
  "a billing contact email is required",
  "already exists",
  "already on your account",
  "ai sms add-on is only available",
  "calendar connection request expired",
  "calendar connection request is no longer authorized",
  "connect google calendar before choosing",
  "contact is blocked",
  "do not have access to this business",
  "feedback is limited",
  "feedback message is required",
  "invalid credentials",
  "invalid password",
  "invalid or expired email confirmation link",
  "invalidsecret",
  "knowledge storage limit reached",
  "new email is required",
  "no email is configured",
  "number provisioning limit reached",
  "onboarding is no longer available",
  "only free workspaces can start pro checkout",
  "reconnect google calendar before choosing",
  "requires admin access",
  "selected google calendar was not found",
  "selected phone number is no longer available",
  "verification code is invalid or expired",
  "verify your mobile number before choosing",
];

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function shouldRedactKey(key: string): boolean {
  const normalizedKey = normalizeKey(key);
  if (SAFE_KEY_PATTERNS.some((pattern) => normalizedKey.includes(pattern))) {
    return false;
  }
  if (EXACT_REDACTION_KEYS.has(key) || EXACT_REDACTION_KEYS.has(normalizedKey)) {
    return true;
  }
  return PARTIAL_REDACTION_KEYWORDS.some((keyword) =>
    normalizedKey.includes(keyword),
  );
}

function maskString(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `***${digits.slice(-4)}`;
  }
  if (value.length > 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return "[redacted]";
}

function redactValue(value: TelemetryValue | undefined): TelemetryValue | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === "string") {
    return value;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function getErrorSearchText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }
  if (typeof error === "string") {
    return error.toLowerCase();
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message.toLowerCase();
  }
  return "";
}

export function isExpectedConvexFailure(error: unknown): boolean {
  const searchText = getErrorSearchText(error);
  if (!searchText) {
    return false;
  }

  return EXPECTED_CONVEX_FAILURE_MESSAGE_SNIPPETS.some((snippet) =>
    searchText.includes(snippet),
  );
}

function normalizeExternalProvider(
  value: ExternalProvider | string | undefined,
): ExternalProvider {
  if (value && PROVIDER_ERROR_PROVIDERS.includes(value as ExternalProvider)) {
    return value as ExternalProvider;
  }
  return "unknown";
}

function readNestedRecord(
  source: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = source?.[key];
  return isRecord(value) ? value : undefined;
}

function readStringFromSources(
  sources: Array<Record<string, unknown> | undefined>,
  keys: string[],
): string | undefined {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
  }
  return undefined;
}

function readNumberFromSources(
  sources: Array<Record<string, unknown> | undefined>,
  keys: string[],
): number | undefined {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
  }
  return undefined;
}

function normalizeProviderErrorMessage(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 500 ? `${collapsed.slice(0, 497)}...` : collapsed;
}

function inferProviderErrorKind(input: {
  code?: string;
  message?: string;
  status?: number;
}): ProviderErrorKind {
  const code = input.code?.toLowerCase() ?? "";
  const message = input.message?.toLowerCase() ?? "";
  const combined = `${code} ${message}`;

  if (
    combined.includes("insufficient_quota") ||
    combined.includes("quota_exceeded") ||
    combined.includes("quota exceeded") ||
    combined.includes("credits") ||
    combined.includes("credit balance") ||
    combined.includes("billing hard limit")
  ) {
    return "quota_exhausted";
  }

  if (input.status === 401 || input.status === 403) {
    return "auth_failed";
  }

  if (
    code.includes("invalid_api_key") ||
    code.includes("authentication") ||
    code.includes("unauthorized") ||
    code.includes("permission_denied")
  ) {
    return "auth_failed";
  }

  if (input.status === 429 || code.includes("rate_limit") || code === "rate_limited") {
    return "rate_limited";
  }

  if (
    input.status !== undefined &&
    input.status >= 500 &&
    input.status <= 599
  ) {
    return "provider_unavailable";
  }

  if (
    combined.includes("econnreset") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound") ||
    combined.includes("etimedout") ||
    combined.includes("socket hang up") ||
    combined.includes("fetch failed") ||
    combined.includes("network") ||
    combined.includes("timeout")
  ) {
    return "provider_unavailable";
  }

  if (
    input.status !== undefined &&
    input.status >= 400 &&
    input.status <= 499
  ) {
    return "invalid_request";
  }

  if (
    code.includes("invalid_request") ||
    code.includes("bad_request") ||
    code.includes("validation")
  ) {
    return "invalid_request";
  }

  return "unknown";
}

export function classifyProviderError(
  input: ClassifyProviderErrorInput,
): ProviderErrorClassification {
  const root = isRecord(input.error) ? input.error : undefined;
  const nestedError = readNestedRecord(root, "error");
  const nestedResponse = readNestedRecord(root, "response");
  const nestedCause = readNestedRecord(root, "cause");
  const sources = [root, nestedError, nestedResponse, nestedCause];
  const code =
    input.code ??
    readStringFromSources(sources, [
      "code",
      "errorCode",
      "error_code",
      "type",
      "statusCode",
    ]);
  const message =
    input.message ??
    (input.error instanceof Error ? input.error.message : undefined) ??
    readStringFromSources(sources, [
      "message",
      "errorMessage",
      "error_message",
      "statusMessage",
      "statusText",
      "body",
    ]) ??
    (typeof input.error === "string" ? input.error : undefined);
  const status =
    input.status ??
    readNumberFromSources(sources, [
      "status",
      "statusCode",
      "status_code",
      "httpStatus",
      "httpStatusCode",
    ]);

  const kindInput = {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(status !== undefined ? { status } : {}),
  };
  const normalizedMessage = normalizeProviderErrorMessage(message);

  return {
    provider: normalizeExternalProvider(input.provider),
    kind: inferProviderErrorKind(kindInput),
    ...(code ? { providerErrorCode: code } : {}),
    ...(normalizedMessage ? { providerErrorMessage: normalizedMessage } : {}),
    ...(status !== undefined ? { providerErrorStatus: status } : {}),
  };
}

export function getProviderErrorExceptionType(kind: ProviderErrorKind): string {
  switch (kind) {
    case "quota_exhausted":
      return "ProviderQuotaExhaustedError";
    case "auth_failed":
      return "ProviderAuthFailedError";
    case "rate_limited":
      return "ProviderRateLimitedError";
    case "provider_unavailable":
      return "ProviderUnavailableError";
    case "invalid_request":
      return "ProviderInvalidRequestError";
    case "unknown":
    default:
      return "ProviderFailureError";
  }
}

export function buildProviderErrorTelemetryProperties(
  classification: ProviderErrorClassification,
): TelemetryProperties {
  return {
    provider: classification.provider,
    providerErrorKind: classification.kind,
    providerErrorCode: classification.providerErrorCode,
    providerErrorMessage: classification.providerErrorMessage,
    providerErrorStatus: classification.providerErrorStatus,
    $exception_type: getProviderErrorExceptionType(classification.kind),
    $exception_message:
      classification.providerErrorMessage ??
      `${classification.provider} provider failure (${classification.kind})`,
  };
}

export function buildAlertableExceptionTelemetryProperties(
  input: AlertableExceptionTelemetryInput,
): TelemetryProperties {
  const exceptionType = input.exceptionType ?? "ApplicationError";
  const exceptionMessage =
    input.exceptionMessage ?? `${input.service} ${input.operation} failed`;

  return {
    runtime: input.runtime,
    service: input.service,
    operation: input.operation,
    alertable: input.alertable ?? true,
    expected: input.expected ?? false,
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    $exception_level: input.exceptionLevel ?? "error",
    $exception_type: exceptionType,
    $exception_message: exceptionMessage,
  };
}

export function redactTelemetryProperties(
  properties: TelemetryProperties,
): TelemetryProperties {
  return sanitizeProperties(properties, { redactPhoneLikeStrings: true });
}

export function redactAiTraceProperties(
  properties: TelemetryProperties,
): TelemetryProperties {
  return sanitizeProperties(properties, { redactPhoneLikeStrings: true });
}

export function buildPostHogAiTraceProperties(
  input: PostHogAiTracePropertiesInput,
): TelemetryProperties {
  return redactAiTraceProperties({
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

  return redactAiTraceProperties({
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

export function buildPostHogAiSpanProperties(
  input: PostHogAiSpanPropertiesInput,
): TelemetryProperties {
  const latencySeconds =
    input.latencyMs !== undefined ? input.latencyMs / 1000 : undefined;

  return redactAiTraceProperties({
    ...buildPostHogAiTraceProperties(input),
    spanName: input.spanName,
    $ai_span_name: input.spanName,
    $ai_input_state: redactAiTraceProperties(input.inputState ?? {}),
    $ai_output_state: redactAiTraceProperties(input.outputState ?? {}),
    ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    ...(latencySeconds !== undefined ? { $ai_latency: latencySeconds } : {}),
    ...(input.isError !== undefined ? { isError: input.isError } : {}),
    ...(input.isError !== undefined ? { $ai_is_error: input.isError } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.error ? { $ai_error: input.error } : {}),
    ...input.properties,
  });
}

export function redactOtelAttributes(
  attributes: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean | undefined> {
  const sanitized: Record<string, string | number | boolean | undefined> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }

    if (shouldRedactKey(key)) {
      sanitized[key] =
        typeof value === "string" && key.toLowerCase().includes("phone")
          ? maskString(value)
          : "[redacted]";
      continue;
    }

    if (typeof value === "string" && key.toLowerCase().includes("phone")) {
      sanitized[key] = maskString(value);
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

export function bucketLatencyMs(latencyMs: number): string {
  if (latencyMs < 500) {
    return "under_500ms";
  }
  if (latencyMs < 1_000) {
    return "500ms_to_1s";
  }
  if (latencyMs < 2_500) {
    return "1s_to_2_5s";
  }
  if (latencyMs < 5_000) {
    return "2_5s_to_5s";
  }
  return "over_5s";
}

export function getPostHogDistinctIdForOperator(userId: string): string {
  return `user:${userId}`;
}

export function getPostHogDistinctIdForBusinessSystem(businessId: string): string {
  return `system:business:${businessId}`;
}

export function getPostHogBusinessGroupKey(businessId: string): string {
  return `business:${businessId}`;
}

export function isTelemetryEventName(value: string): value is TelemetryEventName {
  return TELEMETRY_EVENT_NAMES.includes(value as TelemetryEventName);
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

export function createTelemetryFacade(
  deploymentMode: DeploymentMode,
  sinks: Array<TelemetrySink>,
): TelemetryFacade {
  return {
    async track(event) {
      const validation = validateTelemetryEvent({
        name: event.name,
        deploymentMode,
        ...(event.businessId !== undefined ? { businessId: event.businessId } : {}),
        ...(event.conversationId !== undefined
          ? { conversationId: event.conversationId }
          : {}),
        ...(event.callId !== undefined ? { callId: event.callId } : {}),
        ...(event.messageId !== undefined ? { messageId: event.messageId } : {}),
        ...(event.appointmentId !== undefined
          ? { appointmentId: event.appointmentId }
          : {}),
        ...(event.channel !== undefined ? { channel: event.channel } : {}),
        ...(event.provider !== undefined ? { provider: event.provider } : {}),
        ...(event.model !== undefined ? { model: event.model } : {}),
        properties: event.properties,
      });
      if (!validation.ok && deploymentMode !== "cloud") {
        console.warn(
          `[telemetry] Missing required properties for ${event.name}: ${validation.missing.join(", ")}`,
        );
      }

      const payload: TelemetryEvent = {
        ...event,
        deploymentMode,
        occurredAt: new Date().toISOString(),
        properties: redactTelemetryProperties(event.properties),
      };

      await Promise.allSettled(sinks.map((sink) => sink.emit(payload)));
    },
  };
}
