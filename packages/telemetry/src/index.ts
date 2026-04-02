import type { DeploymentMode } from "@ai-receptionist/shared";

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

export const TELEMETRY_EVENT_NAMES = [
  ...WEB_EVENT_NAMES,
  ...VOICE_EVENT_NAMES,
  ...SMS_EVENT_NAMES,
  ...APPOINTMENT_EVENT_NAMES,
  ...KNOWLEDGE_EVENT_NAMES,
  ...INTEGRATION_EVENT_NAMES,
  ...WORKFLOW_EVENT_NAMES,
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

export type TelemetryScalar = string | number | boolean | null;
export type TelemetryValue =
  | TelemetryScalar
  | Array<TelemetryScalar>
  | { [key: string]: TelemetryValue | undefined };

export type TelemetryProperties = Record<string, TelemetryValue | undefined>;

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
  | "workflowName";

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
  "transcript",
  "utterance",
  "utterances",
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
  "phone",
  "prompt",
  "recording",
  "sms",
  "text",
  "toolarg",
  "tool_input",
  "transcript",
  "utterance",
];

const SAFE_KEY_PATTERNS = ["toolname", "providername", "modelname"];

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
    return value.map((entry) =>
      entry === null ? entry : typeof entry === "string" ? entry : entry,
    );
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

export function redactAiTraceProperties(
  properties: TelemetryProperties,
): TelemetryProperties {
  return sanitizeProperties(properties, { redactPhoneLikeStrings: true });
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
